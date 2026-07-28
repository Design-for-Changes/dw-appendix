#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const API_BASE = "https://laws.e-gov.go.jp/api/2";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_AS_OF = "2026-06-30";
const DEFAULT_OUTPUT = path.join(ROOT, "public", "data", "research", "egov-law-screening.json");
const KEYWORDS = ["障害者", "障害児", "特別支援学校"];
const CONCURRENCY = 6;

const INCLUDED_LAWS = new Map([
  [
    "特別児童扶養手当等の支給に関する法律",
    {
      id: "N01",
      effect: "現金給付",
      summary: "特別児童扶養手当・障害児福祉手当の支給",
    },
  ],
  [
    "障害者の日常生活及び社会生活を総合的に支援するための法律",
    {
      id: "N02",
      effect: "現物給付",
      summary: "自立支援医療・補装具費・障害福祉サービス等",
    },
  ],
  [
    "児童福祉法",
    {
      id: "N03",
      effect: "現物給付",
      summary: "障害児通所支援・障害児入所支援等",
    },
  ],
  [
    "特別支援学校への就学奨励に関する法律",
    {
      id: "N04",
      effect: "実費補填",
      summary: "特別支援教育就学奨励費",
    },
  ],
  [
    "所得税法",
    {
      id: "N05",
      effect: "税制",
      summary: "障害者控除・特別障害者控除・同居特別障害者加算",
    },
  ],
  [
    "地方税法",
    {
      id: "N06",
      effect: "税制",
      summary: "住民税の障害者控除、非課税限度額判定",
    },
  ],
  [
    "租税特別措置法",
    {
      id: "N07",
      effect: "税制",
      summary: "障害者等の少額貯蓄利子非課税（マル優）等",
    },
  ],
  [
    "相続税法",
    {
      id: "N08",
      effect: "税制",
      summary: "相続税の障害者控除、特定障害者扶養信託の贈与税非課税",
    },
  ],
]);

function readArg(name, fallback) {
  const prefix = `--${name}=`;
  const value = process.argv.find((arg) => arg.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJSON(url, attempt = 1) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "dw-appendix research data collector (https://github.com/Design-for-Changes/dw-appendix)",
    },
  });
  if (response.ok) return response.json();
  if (attempt < 4 && (response.status === 429 || response.status >= 500)) {
    await sleep(500 * 2 ** (attempt - 1));
    return fetchJSON(url, attempt + 1);
  }
  throw new Error(`${response.status} ${response.statusText}: ${url}`);
}

function keywordURL(keyword, asOf, offset) {
  const url = new URL(`${API_BASE}/keyword`);
  url.searchParams.set("keyword", keyword);
  url.searchParams.set("law_type", "Act");
  url.searchParams.set("asof", asOf);
  url.searchParams.set("limit", "1000");
  url.searchParams.set("offset", String(offset));
  url.searchParams.set("sentence_text_size", "300");
  url.searchParams.set("response_format", "json");
  return url;
}

async function fetchKeyword(keyword, asOf) {
  const items = [];
  let offset = 0;
  let totalCount = null;
  do {
    const data = await fetchJSON(keywordURL(keyword, asOf, offset));
    totalCount ??= data.total_count;
    items.push(...(data.items || []));
    offset = data.next_offset;
  } while (offset !== null && offset !== undefined);
  return { keyword, total_count: totalCount, items };
}

function collectStrings(value, rows = []) {
  if (typeof value === "string") rows.push(value);
  else if (Array.isArray(value)) value.forEach((item) => collectStrings(item, rows));
  else if (value && typeof value === "object") Object.values(value).forEach((item) => collectStrings(item, rows));
  return rows;
}

function mainProvisionURL(revisionId) {
  const url = new URL(`${API_BASE}/law_data/${encodeURIComponent(revisionId)}`);
  url.searchParams.set("elm", "MainProvision");
  url.searchParams.set("response_format", "json");
  url.searchParams.set("law_full_text_format", "json");
  url.searchParams.set("json_format", "light");
  url.searchParams.set("omit_amendment_suppl_provision", "true");
  return url;
}

async function mapLimit(values, limit, mapper) {
  const results = new Array(values.length);
  let next = 0;
  async function worker() {
    while (next < values.length) {
      const index = next;
      next += 1;
      results[index] = await mapper(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker));
  return results;
}

function stripHighlight(text) {
  return String(text || "").replace(/<\/?[^>]+>/g, "");
}

function mergeKeywordResults(results) {
  const laws = new Map();
  for (const result of results) {
    for (const item of result.items) {
      const lawId = item.law_info.law_id;
      const existing = laws.get(lawId) || {
        law_info: item.law_info,
        revision_info: item.revision_info,
        api_hits: {},
      };
      const hits = existing.api_hits[result.keyword] || [];
      for (const sentence of item.sentences || []) {
        hits.push({
          position: sentence.position,
          text: stripHighlight(sentence.text),
        });
      }
      existing.api_hits[result.keyword] = hits;
      laws.set(lawId, existing);
    }
  }
  return [...laws.values()];
}

function uniqueHits(hits) {
  const seen = new Set();
  return hits.filter((hit) => {
    const key = `${hit.position}\u0000${hit.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildScreening(lawTitle) {
  const included = INCLUDED_LAWS.get(lawTitle);
  if (included) {
    return {
      status: "included",
      reason_code: "direct_household_disposable_income_effect",
      reason: "障害を要件として、障害児世帯の給付・負担・控除等に直接作用する規定を含む。",
      ...included,
    };
  }
  return {
    status: "excluded",
    reason_code: "no_direct_household_disposable_income_effect_identified",
    reason:
      "本則に検索語を含むが、障害を要件として障害児世帯の可処分所得に直接作用する給付・負担・控除等には該当しない。",
  };
}

async function main() {
  const asOf = readArg("asof", DEFAULT_AS_OF);
  const output = path.resolve(readArg("output", DEFAULT_OUTPUT));
  console.log(`e-Gov keyword search: ${KEYWORDS.join(", ")} (as of ${asOf})`);

  const queryResults = [];
  for (const keyword of KEYWORDS) {
    const result = await fetchKeyword(keyword, asOf);
    queryResults.push(result);
    console.log(`  ${keyword}: ${result.total_count} hit positions`);
  }

  const candidates = mergeKeywordResults(queryResults);
  console.log(`  candidate laws before MainProvision check: ${candidates.length}`);

  const checked = await mapLimit(candidates, CONCURRENCY, async (candidate, index) => {
    const revisionId = candidate.revision_info.law_revision_id;
    const data = await fetchJSON(mainProvisionURL(revisionId));
    const mainText = collectStrings(data.law_full_text).join("\n");
    const matchedKeywords = KEYWORDS.filter((keyword) => mainText.includes(keyword));
    if ((index + 1) % 25 === 0 || index + 1 === candidates.length) {
      console.log(`  MainProvision checked: ${index + 1}/${candidates.length}`);
    }
    return { ...candidate, matchedKeywords };
  });

  const laws = checked
    .filter((candidate) => candidate.matchedKeywords.length)
    .map((candidate) => {
      const { law_info: lawInfo, revision_info: revisionInfo } = candidate;
      const hits = Object.fromEntries(
        candidate.matchedKeywords.map((keyword) => [
          keyword,
          uniqueHits(candidate.api_hits[keyword] || []).slice(0, 5),
        ])
      );
      return {
        law_id: lawInfo.law_id,
        law_num: lawInfo.law_num,
        law_title: revisionInfo.law_title,
        promulgation_date: lawInfo.promulgation_date,
        law_revision_id: revisionInfo.law_revision_id,
        revision_updated_at: revisionInfo.updated,
        matched_keywords: candidate.matchedKeywords,
        hit_evidence: hits,
        screening: buildScreening(revisionInfo.law_title),
        source_url: `https://laws.e-gov.go.jp/law/${lawInfo.law_id}`,
      };
    })
    .sort((a, b) => a.law_id.localeCompare(b.law_id, "ja"));

  const includedCount = laws.filter((law) => law.screening.status === "included").length;
  const payload = {
    schema_version: "1.0.0",
    title: "e-Gov法令検索による抽出母集団と採否",
    research_as_of: asOf,
    retrieved_at: new Date().toISOString(),
    source: {
      name: "e-Gov法令検索 法令API Version 2",
      api_base: API_BASE,
      documentation_url: "https://laws.e-gov.go.jp/api/2/redoc/",
    },
    method: {
      law_type: "Act",
      scope: "MainProvision",
      keywords: KEYWORDS,
      combination: "各検索語による結果の法令ID単位の和集合",
      inclusion_criterion:
        "障害を要件として、障害児世帯の手当・給付、利用者負担、控除・減免等、可処分所得に直接作用しうる規定を含む法律。",
      exclusion_criterion:
        "検索語を含んでも、障害児世帯の可処分所得に直接作用しない規定、または障害の有無を要件としない普遍的制度。",
      reconstruction_note:
        "検索母集団はe-Gov法令APIから再取得した。記載された3語を本則に対して適用した結果は186件である。8件の採用結果と概要は論文正本からサルベージし、その他は同一の除外基準で記録した。",
    },
    counts: {
      total_laws: laws.length,
      included_laws: includedCount,
      excluded_laws: laws.length - includedCount,
    },
    query_statistics: queryResults.map((result) => ({
      keyword: result.keyword,
      api_hit_positions: result.total_count,
    })),
    laws,
  };

  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`  MainProvision law union: ${laws.length}`);
  console.log(`  included: ${includedCount}`);
  console.log(`  wrote: ${output}`);

  if (laws.length !== 186) {
    console.warn(`WARNING: expected 186 laws, got ${laws.length}.`);
    process.exitCode = 2;
  }
  if (includedCount !== INCLUDED_LAWS.size) {
    console.warn(`WARNING: included count is ${includedCount}, expected ${INCLUDED_LAWS.size}.`);
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
