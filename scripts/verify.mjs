#!/usr/bin/env node
/**
 * verify.mjs — 回帰検証ハーネス
 *
 * 役割：計算コア（src/calc/computePoint.js）を回して給与掃引の系列を作り、
 * fixtures/cases.json の期待崖（status=baseline_confirmed のみ）と自動照合する。
 *
 * 前提となる計算コアのインターフェース（第1タスク＝計算コア抽出で用意する）：
 *   import { computeSeries, buildHousehold } from "../src/calc/computePoint.js"
 *
 *   buildHousehold(caseHousehold) -> household
 *     cases.json の household（正規化形）を、コアが受け取る内部形へ変換する。
 *
 *   computeSeries({ household, scenario, tables, sweep? }) -> Array<{ x, disposable, ... }>
 *     x は世帯主の給与（万円）。disposable は可処分所得（万円）。
 *     tables は public/data の静的JSON群（下でNode側から読み込んで注入する）。
 *     ※ React/DOM に一切依存しない純粋関数であること。
 *
 * 計算コアが未抽出（＝第1タスク未完）の場合は、SKIP して exit 0（初期コミットのCIを緑にするため）。
 * コアがある場合、baseline_confirmed のケースが一つでも不一致なら exit 1。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const CORE_PATH = path.join(ROOT, "src", "calc", "computePoint.js");
const CASES_PATH = path.join(ROOT, "fixtures", "cases.json");
const DATA_DIR = path.join(ROOT, "public", "data");
const CONFIG_DIR = path.join(ROOT, "src", "config");

function loadJSON(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function loadTables() {
  // useStaticTables.js が実行時にfetchするのと同じ静的テーブルをNode側で読み込む
  return {
    emp: loadJSON(path.join(DATA_DIR, "emp_deduction.json")),
    basicIT: loadJSON(path.join(DATA_DIR, "basic_it.json")),
    basicLT: loadJSON(path.join(DATA_DIR, "basic_lt.json")),
    socialU40: loadJSON(path.join(DATA_DIR, "social_u40.json")),
    socialO40: loadJSON(path.join(DATA_DIR, "social_o40.json")),
    configs: {
      spouseDeductionITCfg: loadJSON(path.join(CONFIG_DIR, "spouse_deduction_it.json")),
      spouseDeductionLTCfg: loadJSON(path.join(CONFIG_DIR, "spouse_deduction_lt.json")),
      spouseSpecialDeductionITCfg: loadJSON(path.join(CONFIG_DIR, "spouse_special_deduction_it.json")),
      spouseSpecialDeductionLTCfg: loadJSON(path.join(CONFIG_DIR, "spouse_special_deduction_lt.json")),
      dependentDeductionCfg: loadJSON(path.join(CONFIG_DIR, "dependent_deduction.json")),
      specialKinDeductionITCfg: loadJSON(path.join(CONFIG_DIR, "special_kin_deduction_it.json")),
      specialKinDeductionLTCfg: loadJSON(path.join(CONFIG_DIR, "special_kin_deduction_lt.json")),
      widowDeductionCfg: loadJSON(path.join(CONFIG_DIR, "widow_deduction.json")),
      singleParentDeductionCfg: loadJSON(path.join(CONFIG_DIR, "single_parent_deduction.json")),
      workingStudentDeductionCfg: loadJSON(path.join(CONFIG_DIR, "working_student_deduction.json")),
      disabilityDeductionCfg: loadJSON(path.join(CONFIG_DIR, "disability_deduction.json")),
    },
  };
}

/**
 * 系列から「下向きの崖」を検出する。
 * 隣接ステップで disposable が minDrop 万円以上落ちる点を崖とみなす。
 */
function detectCliffs(series, minDropManyen = 3) {
  const out = [];
  for (let i = 1; i < series.length; i++) {
    const prev = Number(series[i - 1]?.disposable);
    const cur = Number(series[i]?.disposable);
    if (!Number.isFinite(prev) || !Number.isFinite(cur)) continue;
    const delta = cur - prev;
    if (delta <= -minDropManyen) {
      out.push({ salaryManyen: Number(series[i]?.x), dropManyen: Math.round(delta * 10) / 10 });
    }
  }
  return out;
}

function matchCliff(expected, detected, tol) {
  // 期待崖に最も近い検出崖を探し、salary/drop がともに許容内か
  let best = null;
  let bestDist = Infinity;
  for (const d of detected) {
    const ds = Math.abs(d.salaryManyen - expected.salaryManyen);
    if (ds < bestDist) { bestDist = ds; best = d; }
  }
  if (!best) return { ok: false, reason: "対応する崖が検出されなかった", detected: null };
  const salaryOk = Math.abs(best.salaryManyen - expected.salaryManyen) <= tol.salaryTolManyen;
  const dropOk = Math.abs(best.dropManyen - expected.dropManyen) <= tol.dropTolManyen;
  return { ok: salaryOk && dropOk, salaryOk, dropOk, detected: best };
}

function findUnexpectedCliffs(detected, expectedCliffs, tol) {
  return detected.filter((d) => {
    return !expectedCliffs.some((exp) => {
      return Math.abs(d.salaryManyen - exp.salaryManyen) <= tol.salaryTolManyen;
    });
  });
}

async function main() {
  const cases = loadJSON(CASES_PATH);
  const tol = cases.tolerance || { salaryTolManyen: 1, dropTolManyen: 1.0 };

  if (!fs.existsSync(CORE_PATH)) {
    console.error("✗ 計算コア（src/calc/computePoint.js）がありません。");
    process.exit(1);
  }

  let core;
  try {
    core = await import(pathToFileURL(CORE_PATH).href);
  } catch (e) {
    console.error("✗ 計算コアの読み込みに失敗:", e?.message || e);
    process.exit(1);
  }
  if (typeof core.computeSeries !== "function" || typeof core.buildHousehold !== "function") {
    console.error("✗ 計算コアが必要な関数（computeSeries / buildHousehold）をexportしていません。");
    console.error("  buildHousehold と computeSeries をexportしてください。");
    process.exit(1);
  }

  const tables = loadTables();
  let failed = 0;
  let checked = 0;

  for (const c of cases.cases) {
    if (c.status !== "baseline_confirmed") {
      console.log(`⏭  ${c.id} (${c.label}) — status=${c.status}、スキップ`);
      continue;
    }
    checked++;
    let series;
    try {
      const household = core.buildHousehold(c.household);
      series = core.computeSeries({ household, scenario: c.scenario, tables });
    } catch (e) {
      console.error(`✗ ${c.id} (${c.label}) — computeSeries が例外:`, e?.message || e);
      failed++;
      continue;
    }
    const minDropManyen = Number.isFinite(Number(c.expected?.minDropManyen))
      ? Number(c.expected.minDropManyen)
      : 3;
    const detected = detectCliffs(series, minDropManyen);
    const expectedCliffs = (c.expected?.cliffs || []).filter((exp) =>
      exp?.positionExact !== false &&
      exp?.salaryManyen !== null &&
      exp?.salaryManyen !== undefined &&
      Number.isFinite(Number(exp?.salaryManyen))
    );
    const skipped = (c.expected?.cliffs || []).length - expectedCliffs.length;
    const results = expectedCliffs.map((exp) => ({ exp, res: matchCliff(exp, detected, tol) }));
    const unexpectedCliffs = c.expected?.assert_no_downward_cliff
      ? findUnexpectedCliffs(detected, expectedCliffs, tol)
      : [];
    const allOk = results.every((r) => r.res.ok) && unexpectedCliffs.length === 0;
    if (allOk) {
      const suffix = skipped > 0 ? `（${skipped}件は期待位置未確定のためスキップ）` : "";
      console.log(`✓ ${c.id} (${c.label}) — 期待崖 ${results.length}件すべて一致${suffix}`);
    } else {
      failed++;
      console.error(`✗ ${c.id} (${c.label}) — 不一致:`);
      for (const { exp, res } of results) {
        if (res.ok) continue;
        const det = res.detected ? `検出=給与${res.detected.salaryManyen}万/落差${res.detected.dropManyen}万` : "検出なし";
        console.error(`   - ${exp.name}: 期待=給与${exp.salaryManyen}万/落差${exp.dropManyen}万 / ${det}`);
      }
      for (const d of unexpectedCliffs) {
        console.error(`   - unexpected_cliff: 期待外の下向き崖 検出=給与${d.salaryManyen}万/落差${d.dropManyen}万`);
      }
    }
  }

  console.log(`\n— 検証: ${checked}件中 ${checked - failed}件一致、${failed}件不一致 —`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("verify.mjs 実行エラー:", e);
  process.exit(1);
});
