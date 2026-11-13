import { useEffect, useMemo, useState } from "react";

const TABLE_TITLE = "表A2　e-Gov法令検索による抽出結果と採否";
const DATA_SCHEMA = "2.1.0";
export const DATA_REVISION = "fca9515c851e547a870733e52e01f414b46ff0aa5be9e00e49bd5bbb273cdda7";

async function readLawData(response) {
  const text = await response.text();
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  const revision = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  if (revision !== DATA_REVISION) throw new Error("Mismatched law-screening revision");
  return validateLawData(JSON.parse(text));
}

function validateLawData(data) {
  const categories = data?.method?.exclusion_categories;
  if (data?.schema_version !== DATA_SCHEMA || !Array.isArray(data.laws) || !Array.isArray(categories) || categories.length === 0) {
    throw new Error("Incompatible law-screening data");
  }
  const categoryIds = new Set(categories.map((category) => category.id));
  const lawIds = new Set(data.laws.map((law) => law.law_id));
  if (categoryIds.size !== categories.length || lawIds.size !== data.laws.length || data.laws.some((law) =>
    !["candidate", "included", "excluded"].includes(law.screening?.status) ||
    (law.screening.status === "excluded" && !categoryIds.has(law.screening.exclusion_category_id))
  )) {
    throw new Error("Incomplete law-screening classification");
  }
  return data;
}

function screeningCategory(law) {
  if (["candidate", "included"].includes(law.screening?.status)) return "candidate";
  if (law.screening?.status === "excluded") return "excluded";
  return "pending";
}

function ScreeningStatus({ law }) {
  const category = screeningCategory(law);
  return (
    <span className={`research-status ${category}`}>
      {category === "candidate" ? "採用候補" : "除外"}
    </span>
  );
}

function ScreeningReason({ law }) {
  const reason = law.screening?.reason;
  return (
    <>
      <p>{reason || "法令ごとの理由は未記載です。"}</p>
      {law.screening?.discussion_point && <p className="research-discussion-point"><strong>検討事項：</strong>{law.screening.discussion_point}</p>}
    </>
  );
}

function ScreeningEvidence({ law }) {
  const evidence = law.screening?.evidence || [];
  return (
    <>
      {evidence.length > 0 && <details className="research-evidence-details">
        <summary>根拠条文・原文（{evidence.length}件）</summary>
        {evidence.map((item, index) => (
          <div className="research-evidence" key={`${item.article || "evidence"}-${index}`}>
            {item.article && <p>{item.article}</p>}
            {item.text && <p>{item.text}</p>}
            {item.source_url && <a href={item.source_url} target="_blank" rel="noreferrer">{item.article ? `${item.article}の原文` : "確認根拠の原文"}</a>}
          </div>
        ))}
      </details>}
      {evidence.length === 0 && <p>条文・確認根拠の記載はありません。</p>}
      {law.source_url && <p><a href={law.source_url} target="_blank" rel="noreferrer">法令原文（e-Gov）</a></p>}
    </>
  );
}

function LawGroupTable({ headingId, title, caption, rows }) {
  return (
    <section className="research-law-group" aria-labelledby={headingId}>
      <h3 id={headingId}>{title}（{rows.length}件）</h3>
      <div className="appendix-table-wrap research-law-table-wrap">
        <table className="appendix-table research-law-table">
          <caption>{caption}</caption>
          <thead>
            <tr>
              <th scope="col">法令ID</th>
              <th scope="col">法令名</th>
              <th scope="col">採否</th>
              <th scope="col">法令ごとの採否理由</th>
              <th scope="col">確認根拠（条文・原文リンク）</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((law) => (
              <tr key={law.law_id}>
                <th scope="row" className="appendix-mono">{law.law_id}</th>
                <td data-label="法令名">{law.law_title}{law.law_num && <small className="research-law-number">{law.law_num}</small>}</td>
                <td data-label="採否"><ScreeningStatus law={law} /></td>
                <td data-label="法令ごとの採否理由"><ScreeningReason law={law} /></td>
                <td data-label="確認根拠（条文・原文リンク）"><ScreeningEvidence law={law} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function LawScreeningTable({ data, dataUrl }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const normalizedQuery = query.trim().toLocaleLowerCase("ja-JP");
  const laws = useMemo(() => data.laws || [], [data.laws]);
  const exclusionCategories = useMemo(() => data.method?.exclusion_categories || [], [data.method?.exclusion_categories]);

  const statistics = useMemo(() => laws.reduce((counts, law) => {
    const category = screeningCategory(law);
    counts[category] += 1;
    return counts;
  }, { candidate: 0, excluded: 0, pending: 0 }), [laws]);

  const rows = useMemo(() => laws.filter((law) => {
    if (filter !== "all" && screeningCategory(law) !== filter) return false;
    const haystack = [
      law.law_id,
      law.law_num,
      law.law_title,
      ...(law.matched_keywords || []),
      law.screening?.id,
      law.screening?.effect,
      law.screening?.summary,
      law.screening?.reason,
      law.screening?.discussion_point,
      exclusionCategories.find((category) => category.id === law.screening?.exclusion_category_id)?.label,
      ...(law.screening?.evidence || []).flatMap((item) => [item.article, item.text]),
    ].filter(Boolean).join("\n").toLocaleLowerCase("ja-JP");
    return haystack.includes(normalizedQuery);
  }), [laws, filter, normalizedQuery, exclusionCategories]);

  const excludedGroups = exclusionCategories.map((category, index) => ({
    ...category,
    number: index + 1,
    rows: rows.filter((law) => screeningCategory(law) === "excluded" && law.screening?.exclusion_category_id === category.id),
  }));
  const candidates = rows.filter((law) => screeningCategory(law) === "candidate");

  return (
    <section id="law-screening" className="appendix-panel research-section" aria-labelledby="law-screening-title">
      <div className="appendix-section-head">
        <div>
          <p className="appendix-kicker">法令抽出の記録</p>
          <h2 id="law-screening-title">{TABLE_TITLE}</h2>
          <p>除外理由ごとに該当法令を示し、残った候補を個別に検討する。</p>
        </div>
        <a className="research-download" href={dataUrl} download>法令抽出・採否JSONをダウンロード</a>
      </div>
      <div className="municipal-method">
        <p>基準日：{data.research_as_of || "未記載"}。取得元：{data.source?.name || "e-Gov法令検索"}。</p>
        {data.method?.keywords && <p>検索語：{data.method.keywords.join("、")}。</p>}
        {data.method?.combination && <p>集計方法：{data.method.combination}。</p>}
        {data.method?.inclusion_criterion && <p>候補抽出基準：{data.method.inclusion_criterion}</p>}
      </div>
      <p className="research-note">抽出{laws.length}件、除外{statistics.excluded}件、候補{statistics.candidate}件{statistics.pending > 0 ? `、判定要確認${statistics.pending}件` : ""}。</p>
      <p className="research-note">{data.method?.candidate_note || "候補への収録は、モデル世帯の試算への採用を意味しない。"}</p>
      <div className="research-controls">
        <label>
          <span>法令・採否根拠を検索</span>
          <input type="search" value={query} placeholder="法令ID・法令名・法令番号・採否理由・検討事項・条文" onChange={(event) => setQuery(event.currentTarget.value)} />
        </label>
        <label>
          <span>採否の表示</span>
          <select value={filter} onChange={(event) => setFilter(event.currentTarget.value)}>
            <option value="all">全件</option>
            <option value="candidate">採用候補</option>
            <option value="excluded">除外のみ</option>
          </select>
        </label>
        <output aria-live="polite">{rows.length}件表示（全{laws.length}件）</output>
      </div>
      {excludedGroups.filter((group) => group.rows.length > 0).map((group) => <LawGroupTable
        key={group.id}
        headingId={`law-screening-exclusion-${group.id}`}
        title={`除外理由${group.number}：${group.label}`}
        caption={`除外理由${group.number}に該当する法令`}
        rows={group.rows}
      />)}
      {candidates.length > 0 && <LawGroupTable headingId="law-screening-candidates" title="残った候補の個別検討" caption="候補法令の個別検討" rows={candidates} />}
      {rows.length === 0 && <p role="status">該当する法令はありません。</p>}
    </section>
  );
}

export default function ResearchDataAppendix() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const base = process.env.PUBLIC_URL || ".";
  const dataUrl = `${base}/data/research/egov-law-screening.json?v=${DATA_REVISION}`;

  useEffect(() => {
    const controller = new AbortController();
    fetch(dataUrl, { signal: controller.signal, cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(`law screening: ${response.status}`);
        return readLawData(response);
      })
      .then(setData)
      .catch((cause) => {
        if (cause.name !== "AbortError") setError(true);
      });
    return () => controller.abort();
  }, [dataUrl]);

  if (error) {
    return <section id="law-screening" className="appendix-panel" role="alert"><div className="appendix-empty">法令抽出資料を読み込めませんでした。ページを再読み込みしてください。</div></section>;
  }
  if (!data) {
    return <section id="law-screening" className="appendix-panel" role="status"><div className="appendix-empty">法令抽出資料を読み込んでいます。</div></section>;
  }
  return <LawScreeningTable data={data} dataUrl={dataUrl} />;
}
