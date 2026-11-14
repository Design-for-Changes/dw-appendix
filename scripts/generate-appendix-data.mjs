#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { buildHousehold, computeSeries } from "../src/calc/computePoint.js";
import { explainCliffCauses } from "../src/calc/cliffCauseAnalysis.js";
import { computeOptimalModel } from "../src/calc/optimalModel.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_DIR = path.join(ROOT, "public", "generated", "appendix");
const DETAILS_DIR = path.join(OUTPUT_DIR, "details");
const X_MIN = 200;
const X_MAX = 1500;
const CHUNK_SIZE = 25;

const DISPLAY_CASES = [
  {
    fixtureId: "P1",
    id: "case1",
    label: "ケース1",
    shortLabel: "子1人",
    description: "7歳・特児1級・特別障害・障害児福祉手当あり",
    color: "#2358a6",
  },
  {
    fixtureId: "P2",
    id: "case2",
    label: "ケース2",
    shortLabel: "子2人・混合",
    description: "11歳1級特別＋7歳2級一般。福祉手当・重心医療費助成・就学奨励費は1人分",
    color: "#8f3d67",
  },
  {
    fixtureId: "P3",
    id: "case3",
    label: "ケース3",
    shortLabel: "子2人・重複",
    description: "11歳・7歳とも特児1級・特別障害。福祉手当・重心医療費助成・就学奨励費は2人分",
    color: "#2f6f5e",
  },
];

/** UTF-8 JSONを読み込む。金額の単位は変換せず原データのまま返す。 */
function loadJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

/** 計算コアへ渡す税額表・社会保険料表・控除設定を読み込む。 */
function loadTables() {
  const dataDir = path.join(ROOT, "public", "data");
  const configDir = path.join(ROOT, "src", "config");
  return {
    emp: loadJSON(path.join(dataDir, "emp_deduction.json")),
    basicIT: loadJSON(path.join(dataDir, "basic_it.json")),
    basicLT: loadJSON(path.join(dataDir, "basic_lt.json")),
    socialU40: loadJSON(path.join(dataDir, "social_u40.json")),
    socialO40: loadJSON(path.join(dataDir, "social_o40.json")),
    configs: {
      spouseDeductionITCfg: loadJSON(path.join(configDir, "spouse_deduction_it.json")),
      spouseDeductionLTCfg: loadJSON(path.join(configDir, "spouse_deduction_lt.json")),
      spouseSpecialDeductionITCfg: loadJSON(path.join(configDir, "spouse_special_deduction_it.json")),
      spouseSpecialDeductionLTCfg: loadJSON(path.join(configDir, "spouse_special_deduction_lt.json")),
      dependentDeductionCfg: loadJSON(path.join(configDir, "dependent_deduction.json")),
      specialKinDeductionITCfg: loadJSON(path.join(configDir, "special_kin_deduction_it.json")),
      specialKinDeductionLTCfg: loadJSON(path.join(configDir, "special_kin_deduction_lt.json")),
      widowDeductionCfg: loadJSON(path.join(configDir, "widow_deduction.json")),
      singleParentDeductionCfg: loadJSON(path.join(configDir, "single_parent_deduction.json")),
      workingStudentDeductionCfg: loadJSON(path.join(configDir, "working_student_deduction.json")),
      disabilityDeductionCfg: loadJSON(path.join(configDir, "disability_deduction.json")),
    },
  };
}

/** 給与点から低下判定用の年間可処分所得（万円）を取り出す。 */
function pointY(point) {
  return Number(point?.cliffDisposable ?? point?.disposable);
}

/** Q/R参照点を給与収入xと可処分所得（いずれも万円）のみに圧縮する。 */
function trimPoint(point) {
  return point ? { x: Number(point.x), disposable: Number(point.disposable) } : null;
}

/**
 * 隣接給与点で指定額以上低下した点と、その直前水準へ戻るR点を抽出する。
 * 金額は万円。この表示用一覧は税制による低下も含み、論文の制度選別とは別である。
 * @param {Array<object>} series 1万円刻みの現行制度系列
 * @param {number} minDropManyen 表示する下落幅の下限（万円）
 * @returns {Array<object>} 下落・原因・Q点・回復R点・探索上限での未回復差額
 */
function detectCliffs(series, minDropManyen) {
  const rows = [];
  /** 下落後の所得以下となる直前側の最も近いQ点を探す。 */
  const findQ = (index, yAfter) => {
    for (let i = index - 1; i >= 0; i -= 1) {
      if (pointY(series[i]) <= yAfter) return series[i];
    }
    return null;
  };
  /** 下落前の所得以上となる後方の最初のR点を探す。見つからなければnull。 */
  const findR = (index, yBefore) => {
    for (let i = index + 1; i < series.length; i += 1) {
      if (pointY(series[i]) >= yBefore) return series[i];
    }
    return null;
  };

  for (let i = 1; i < series.length; i += 1) {
    const previous = series[i - 1];
    const current = series[i];
    const delta = pointY(current) - pointY(previous);
    if (delta > -Number(minDropManyen || 3)) continue;
    const yBefore = pointY(previous);
    const yAfter = pointY(current);
    const q = findQ(i, yAfter);
    const r = findR(i, yBefore);
    const yAtMax = pointY(series[series.length - 1]);
    rows.push({
      index: rows.length + 1,
      x: Number(current.x),
      yBefore,
      yAfter,
      drop: delta,
      causes: explainCliffCauses(previous, current),
      q: trimPoint(q),
      r: trimPoint(r),
      unrecoveredShortfall: r ? 0 : Math.max(0, yBefore - yAtMax),
    });
  }
  return rows;
}

/** 表示用データをJSON化しgzip圧縮して保存する（計算値は変更しない）。 */
function writeGzipJSON(filePath, value) {
  fs.writeFileSync(filePath, gzipSync(`${JSON.stringify(value)}\n`, { level: 9 }));
}

/** 計算内訳から表示に必要な項目を選ぶ。円・万円の単位と金額は元のまま保持する。 */
function compactBreakdown(breakdown) {
  const rows = (breakdown.rows || []).map((row) => {
    const social = row.socialInsuranceBreakdown || {};
    return {
      who: row.who,
      disabled: row.disabled,
      disabilityKind: row.disabilityKind,
      salaryWan: row.salaryWan,
      employmentIncomeWan: row.employmentIncomeWan,
      employmentIncomeBaseDeductionWan: row.employmentIncomeBaseDeductionWan,
      incomeAdjustmentDeductionWan: row.incomeAdjustmentDeductionWan,
      employmentIncomeDeductionWan: row.employmentIncomeDeductionWan,
      employmentIncomeDeductionDetail: row.employmentIncomeDeductionDetail,
      socialInsuranceWan: row.socialInsuranceWan,
      socialInsuranceBreakdown: {
        healthWan: social.healthWan,
        careWan: social.careWan,
        childSupportContributionWan: social.childSupportContributionWan,
        pensionWan: social.pensionWan,
        employmentWan: social.employmentWan,
        components: { formulas: social.components?.formulas },
        sources: social.sources,
      },
    };
  });
  const taxByWho = (breakdown.tax?.byWho || []).map((row) => ({
    who: row.who,
    deductions: {
      basicITWan: row.deductions?.basicITWan,
      basicLTWan: row.deductions?.basicLTWan,
      basicITDetail: { formula: row.deductions?.basicITDetail?.formula },
      basicLTDetail: { formula: row.deductions?.basicLTDetail?.formula },
      workingStudentITWan: row.deductions?.workingStudentITWan,
      workingStudentLTWan: row.deductions?.workingStudentLTWan,
      disabilityITWan: row.deductions?.disabilityITWan,
      disabilityLTWan: row.deductions?.disabilityLTWan,
    },
    incomeTax: {
      taxableWan: row.incomeTax?.taxableWan,
      taxWan: row.incomeTax?.taxWan,
      formula: row.incomeTax?.formula,
      source: row.incomeTax?.source,
    },
    residentTax: {
      taxableWan: row.residentTax?.taxableWan,
      computedTaxWan: row.residentTax?.computedTaxWan,
      formula: row.residentTax?.formula,
      source: row.residentTax?.source,
    },
  }));
  const programs = breakdown.programs || {};
  const tcca = programs.tcca || {};
  const welfare = programs.welfareAllowance || {};
  const service = programs.service || {};

  return {
    salaryWan: breakdown.salaryWan,
    rows,
    deductions: breakdown.deductions,
    tax: { byWho: taxByWho },
    takeHome: { takeHomeWan: breakdown.takeHome?.takeHomeWan },
    programs: {
      tcca: {
        source: tcca.source,
        fuyoCount: tcca.fuyoCount,
        head: {
          judgmentIncome: {
            deductions: tcca.head?.judgmentIncome?.deductions,
            deductionSumWan: tcca.head?.judgmentIncome?.deductionSumWan,
          },
        },
        headAdjustedIncomeYen: tcca.headAdjustedIncomeYen,
        headLimitYen: tcca.headLimitYen,
        familyMaxAdjustedIncomeYen: tcca.familyMaxAdjustedIncomeYen,
        familyLimitYen: tcca.familyLimitYen,
        eligible: tcca.eligible,
        monthlyYen: tcca.monthlyYen,
        annualWan: tcca.annualWan,
        formulas: tcca.formulas,
      },
      welfareAllowance: {
        source: welfare.source,
        fuyoCount: welfare.fuyoCount,
        obligorJudgmentIncomeDetails: (welfare.obligorJudgmentIncomeDetails || []).map((detail) => ({
          adjustedYen: detail.adjustedYen,
          deductionSumWan: detail.deductionSumWan,
          deductions: detail.deductions,
        })),
        obligorMaxAdjustedIncomeYen: welfare.obligorMaxAdjustedIncomeYen,
        obligorLimitYen: welfare.obligorLimitYen,
        obligorOk: welfare.obligorOk,
        recipients: welfare.recipients,
        monthlyYen: welfare.monthlyYen,
        annualWan: welfare.annualWan,
        formulas: welfare.formulas,
      },
      service: {
        confidence: service.confidence,
        householdLevySumWan: service.householdLevySumWan,
        details: (service.details || []).map((detail) => ({
          who: detail.who,
          monthlyUpperYen: detail.monthlyUpperYen,
          confidence: detail.confidence,
          formula: detail.formula,
          sources: detail.sources,
        })),
        monthlyTotalYen: service.monthlyTotalYen,
        annualWan: service.annualWan,
        calculation: service.calculation,
      },
      m01: programs.m01,
      n04: programs.n04,
    },
    allowance: breakdown.allowance,
    costBurden: breakdown.costBurden,
    disposable: breakdown.disposable,
  };
}

const fixtures = loadJSON(path.join(ROOT, "fixtures", "cases.json"));
const tables = loadTables();
fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
fs.mkdirSync(DETAILS_DIR, { recursive: true });

const cases = DISPLAY_CASES.map((displayCase) => {
  const fixture = fixtures.cases.find((candidate) => candidate.id === displayCase.fixtureId);
  if (!fixture) throw new Error(`fixture ${displayCase.fixtureId} not found`);
  const series = computeSeries({
    household: buildHousehold(fixture.household),
    scenario: fixture.scenario,
    tables,
    sweep: { min: X_MIN, max: X_MAX, step: 1 },
  });
  const optimalModel = computeOptimalModel(series, fixture.household);

  for (let start = X_MIN; start <= X_MAX; start += CHUNK_SIZE) {
    const end = Math.min(X_MAX, start + CHUNK_SIZE - 1);
    const points = series
      .filter((point) => point.x >= start && point.x <= end)
      .map((point) => ({ x: Number(point.x), breakdown: compactBreakdown(point.breakdown) }));
    writeGzipJSON(path.join(DETAILS_DIR, `${displayCase.id}-${start}.json.gz`), {
      schemaVersion: 1,
      caseId: displayCase.id,
      range: { min: start, max: end, step: 1 },
      points,
    });
  }

  return {
    ...displayCase,
    scenario: fixture.scenario,
    minDropManyen: fixture.expected?.minDropManyen || 3,
    household: fixture.household,
    series: series.map((point) => ({
      x: Number(point.x),
      disposable: Number(point.disposable),
    })),
    cliffs: detectCliffs(series, fixture.expected?.minDropManyen),
    optimalModel,
  };
});

writeGzipJSON(path.join(OUTPUT_DIR, "summary.json.gz"), {
  schemaVersion: 1,
  range: { min: X_MIN, max: X_MAX, step: 1 },
  detailChunkSize: CHUNK_SIZE,
  cases,
});

console.log(`✓ appendix display data: ${cases.length} cases, ${X_MAX - X_MIN + 1} points each`);
