#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { buildHousehold, computeSeries } from "../src/calc/computePoint.js";
import { explainCliffCauses } from "../src/calc/cliffCauseAnalysis.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_DIR = path.join(ROOT, "public", "generated", "appendix");
const DETAILS_DIR = path.join(OUTPUT_DIR, "details");
const X_MIN = 200;
const X_MAX = 1500;
const CHUNK_SIZE = 25;
const OPTIMAL_MODEL = {
  lowerRatio: 1.5,
  upperRatio: 2.5,
  burdenRate: 0.1,
  supportMultiplier: 2.18,
  careNeedMonthlyYen: 16100,
};

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

function loadJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

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

function pointY(point) {
  return Number(point?.cliffDisposable ?? point?.disposable);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value)));
}

function trimPoint(point) {
  return point ? { x: Number(point.x), disposable: Number(point.disposable) } : null;
}

function detectCliffs(series, minDropManyen) {
  const rows = [];
  const findQ = (index, yAfter) => {
    for (let i = index - 1; i >= 0; i -= 1) {
      if (pointY(series[i]) <= yAfter) return series[i];
    }
    return null;
  };
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

function writeGzipJSON(filePath, value) {
  fs.writeFileSync(filePath, gzipSync(`${JSON.stringify(value)}\n`, { level: 9 }));
}

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
  const referenceN04 = series[0]?.breakdown?.programs?.n04 || {};
  const disabilityNeedAnnualWan =
    Number(referenceN04.need?.disabilityAdditionYen || 0) * 12 / 10000;
  const careNeedCount = (fixture.household?.children || [])
    .filter((child) => Boolean(child.childWelfareAllowance)).length;
  const careNeedAnnualWan =
    careNeedCount * OPTIMAL_MODEL.careNeedMonthlyYen * 12 / 10000;
  const additionalNeedAnnualWan =
    disabilityNeedAnnualWan + careNeedAnnualWan;
  const currentNeedAnnualWan =
    Number(referenceN04.judgment?.monthlyNeedYen || 0) * 12 / 10000;
  const baseNeedAnnualWan =
    currentNeedAnnualWan - disabilityNeedAnnualWan;
  const needAnnualWan =
    baseNeedAnnualWan + additionalNeedAnnualWan;
  const baseSupportWan =
    OPTIMAL_MODEL.supportMultiplier * additionalNeedAnnualWan;
  const maxCurrentBurdenWan = Math.max(
    ...series.map((point) => {
      const disposable = point.breakdown?.disposable || {};
      return (
        Number(disposable.medicalCostBurdenWan || 0) +
        Number(disposable.serviceFeeWan || 0) +
        Number(disposable.educationCostBurdenWan || 0)
      );
    })
  );
  const maxExistingExpenseReliefWan = Math.max(
    ...series.map((point) =>
      Number(point.breakdown?.programs?.n04?.educationCostReliefWan || 0)
    )
  );
  const plannedExpenseWan =
    maxCurrentBurdenWan + maxExistingExpenseReliefWan;
  const additionalExpenseWan = 0;
  const eligibleExpenseWan =
    plannedExpenseWan + additionalExpenseWan;
  const rawOptimalSeries = series.map((point) => {
    const programs = point.breakdown?.programs || {};
    const n04 = programs.n04 || {};
    const allowance = point.breakdown?.allowance || {};
    const disposable = point.breakdown?.disposable || {};
    const currentDirectSupportWan =
      Number(allowance.tccaWan || 0) + Number(allowance.welfareAllowanceWan || 0);
    const otherCashSupportWan = Math.max(
      0,
      Number(allowance.totalWan || 0) - currentDirectSupportWan
    );
    const takeHomeWan = Number(point.breakdown?.takeHome?.takeHomeWan || 0);
    const preSupportResourcesWan = takeHomeWan + otherCashSupportWan;
    const supportRatio =
      needAnnualWan > 0 ? preSupportResourcesWan / needAnnualWan : Infinity;
    const supportTransition = Number.isFinite(supportRatio)
      ? clamp(
          (supportRatio - OPTIMAL_MODEL.lowerRatio) /
            (OPTIMAL_MODEL.upperRatio - OPTIMAL_MODEL.lowerRatio),
          0,
          1
        )
      : 1;
    const directSupportWan = baseSupportWan * (1 - supportTransition);
    const postSupportResourcesWan = preSupportResourcesWan + directSupportWan;
    const burdenRatio =
      needAnnualWan > 0 ? postSupportResourcesWan / needAnnualWan : Infinity;
    const burdenTransition = Number.isFinite(burdenRatio)
      ? clamp(
          (burdenRatio - OPTIMAL_MODEL.lowerRatio) /
            (OPTIMAL_MODEL.upperRatio - OPTIMAL_MODEL.lowerRatio),
          0,
          1
        )
      : 1;
    const burdenCapWan =
      OPTIMAL_MODEL.burdenRate * needAnnualWan * burdenTransition;
    const referenceBalanceWan = directSupportWan - burdenCapWan;
    const existingExpenseReliefWan = Number(n04.educationCostReliefWan || 0);
    const currentBurdenWan =
      Number(disposable.medicalCostBurdenWan || 0) +
      Number(disposable.serviceFeeWan || 0) +
      Number(disposable.educationCostBurdenWan || 0);
    const currentBalanceWan =
      currentDirectSupportWan + existingExpenseReliefWan - currentBurdenWan;
    const modelBurdenWan = Math.min(eligibleExpenseWan, burdenCapWan);
    const rawModelBalanceWan = directSupportWan - modelBurdenWan;
    return {
      x: Number(point.x),
      needAnnualWan,
      baseNeedAnnualWan,
      disabilityNeedAnnualWan,
      careNeedAnnualWan,
      additionalNeedAnnualWan,
      preSupportResourcesWan,
      supportRatio,
      supportTransition,
      directSupportWan,
      postSupportResourcesWan,
      burdenRatio,
      burdenTransition,
      burdenCapWan,
      referenceBalanceWan,
      rawModelBalanceWan,
      currentBalanceWan,
      currentDirectSupportWan,
      otherCashSupportWan,
      existingExpenseReliefWan,
      currentBurdenWan,
      plannedExpenseWan,
      additionalExpenseWan,
      eligibleExpenseWan,
      modelBurdenWan,
      refundWan: Math.max(0, eligibleExpenseWan - modelBurdenWan),
      disposableFloorWan:
        postSupportResourcesWan - burdenCapWan,
      takeHomeWan,
      currentDisposableWan: Number(disposable.disposableWan || 0),
    };
  });
  const optimalSeries = rawOptimalSeries.map((point) => {
    const balanceWan = point.rawModelBalanceWan;
    return {
      ...point,
      balanceWan,
      adjustmentWan: balanceWan - point.currentBalanceWan,
      optimalDisposableWan:
        point.takeHomeWan + point.otherCashSupportWan + balanceWan,
    };
  });

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
    optimalModel: {
      ...OPTIMAL_MODEL,
      baseSupportWan,
      baseNeedAnnualWan,
      disabilityNeedAnnualWan,
      careNeedCount,
      careNeedAnnualWan,
      additionalNeedAnnualWan,
      needAnnualWan,
      plannedExpenseWan,
      additionalExpenseWan,
      eligibleExpenseWan,
      series: optimalSeries,
    },
  };
});

writeGzipJSON(path.join(OUTPUT_DIR, "summary.json.gz"), {
  schemaVersion: 1,
  range: { min: X_MIN, max: X_MAX, step: 1 },
  detailChunkSize: CHUNK_SIZE,
  cases,
});

console.log(`✓ appendix display data: ${cases.length} cases, ${X_MAX - X_MIN + 1} points each`);
