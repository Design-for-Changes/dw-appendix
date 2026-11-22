import { normalizeScenario, toNumber, roundWan } from "./numeric.js";
import { CALCULATION_SOURCES } from "./calculationSources.js";
import { salaryIncomeBeforeAdjustmentYen } from "./employmentIncome.js";

/**
 * 令和8年分の年末確定給与所得控除を、年末調整表の端数処理も含めて求める。
 * @remarks 所得税法別表第五・国税庁No.1410。単位: 万円/年。給与660万円未満は法定表の給与所得額を用いる。
 */
export function calcEmploymentIncomeDeductionR8FinalWan(salaryWan) {
  const salaryYen = Math.max(0, Math.round(toNumber(salaryWan, 0) * 10000));
  return (salaryYen - salaryIncomeBeforeAdjustmentYen(salaryYen, 2026)) / 10000;
}

/**
 * 令和8年分（12月1日施行の年末確定税）の基礎控除を丸め前の合計所得で選ぶ。
 * @remarks 国税庁No.1199。単位: 万円/年。上端は以下、翌帯は超。
 */
export function calcBasicIncomeTaxDeductionR8FinalWan(totalIncomeWan) {
  const yen = Math.round(Math.max(0, toNumber(totalIncomeWan, 0)) * 10000);
  if (yen <= 4890000) return 104;
  if (yen <= 6550000) return 67;
  if (yen <= 23500000) return 62;
  if (yen <= 24000000) return 48;
  if (yen <= 24500000) return 32;
  if (yen <= 25000000) return 16;
  return 0;
}

/**
 * 対象者の給与850万円超部分へ所得金額調整控除を適用する。
 * @remarks 税・所得金額調整控除。単位: 万円/年。給与上限1000、控除上限15。式・境界条件・丸めは移動前の実装を維持。
 * @param {number} salaryWan 万円（年額。補助値は呼出側の定義に従う）
 * @param {*} eligible 判定対象・区分または補助値（呼出側の定義に従う）
 * @returns {*} number。単位: 万円/年。給与上限1000、控除上限15
 */
export function calcIncomeAdjustmentDeductionWan(salaryWan, eligible) {
  const t = toNumber(salaryWan, 0);
  if (!eligible) return 0;
  if (t <= 850) return 0;
  const capped = Math.min(1000, t);
  return Math.min(15, Math.max(0, (capped - 850) * 0.1));
}

/**
 * 給与所得控除の表採用値に、対応する所得帯・式・調整控除の説明を付ける。
 * @remarks 税・給与所得控除。単位: 万円/年。説明用丸めはroundWan。式・境界条件・丸めは移動前の実装を維持。
 * @param {number} salaryWan 万円（年額。補助値は呼出側の定義に従う）
 * @param {string} scenarioKey 年度キー（s1/s2/s3または旧別名）
 * @param {number} tableWan 万円（年額。補助値は呼出側の定義に従う）
 * @param {number} incomeAdjustmentWan 万円（年額。補助値は呼出側の定義に従う）
 * @returns {*} 説明オブジェクト。単位: 万円/年。説明用丸めはroundWan
 */
export function describeEmploymentIncomeDeduction(salaryWan, scenarioKey, tableWan, incomeAdjustmentWan) {
  const s = Math.max(0, toNumber(salaryWan, 0));
  const skey = normalizeScenario(scenarioKey);
  const baseWan = toNumber(tableWan, 0);
  const minByScenario = {
    s1: { amountWan: 55, upperWan: 162, bracketLabel: "162万円以下" },
    s2: { amountWan: 65, upperWan: 190, bracketLabel: "190万円以下" },
    s3: { amountWan: 74, upperWan: 220, bracketLabel: "220万円以下" },
    s4: { amountWan: 74, upperWan: 220, bracketLabel: "220万円以下（年末調整表の端数処理あり）" },
  };
  const min = minByScenario[skey] || minByScenario.s2;
  let detail;
  if (s <= 0) {
    detail = {
      bracketLabel: "0円",
      rate: 0,
      interceptWan: 0,
      capWan: null,
      isCapped: false,
      formula: "給与収入0のため給与所得控除0",
      formulaValueWan: 0,
    };
  } else if (s <= min.upperWan) {
    detail = {
      bracketLabel: min.bracketLabel,
      rate: 0,
      interceptWan: min.amountWan,
      capWan: null,
      isCapped: false,
      formula: `${min.amountWan}万円(最低保障)`,
      formulaValueWan: min.amountWan,
    };
  } else if (s <= 180) {
    detail = {
      bracketLabel: "162万円超180万円以下",
      rate: 0.4,
      interceptWan: -10,
      capWan: null,
      isCapped: false,
      formula: "収入×0.40 − 10万円",
      formulaValueWan: roundWan(s * 0.4 - 10, 4),
    };
  } else if (s < 360) {
    detail = {
      bracketLabel: "180万円超360万円未満",
      rate: 0.3,
      interceptWan: 8,
      capWan: null,
      isCapped: false,
      formula: "収入×0.30 + 8万円",
      formulaValueWan: roundWan(s * 0.3 + 8, 4),
    };
  } else if (s < 660) {
    detail = {
      bracketLabel: "360万円以上660万円未満",
      rate: 0.2,
      interceptWan: 44,
      capWan: null,
      isCapped: false,
      formula: "収入×0.20 + 44万円",
      formulaValueWan: roundWan(s * 0.2 + 44, 4),
    };
  } else if (s <= 850) {
    detail = {
      bracketLabel: "660万円以上850万円以下",
      rate: 0.1,
      interceptWan: 110,
      capWan: 195,
      isCapped: false,
      formula: "収入×0.10 + 110万円",
      formulaValueWan: roundWan(s * 0.1 + 110, 4),
    };
  } else {
    detail = {
      bracketLabel: "850万円超",
      rate: 0.1,
      interceptWan: 110,
      capWan: 195,
      isCapped: true,
      rawFormulaWan: roundWan(s * 0.1 + 110, 4),
      formula: "min(195万円, 収入×0.10 + 110万円)",
      formulaValueWan: 195,
    };
  }
  return {
    ...detail,
    salaryWan: s,
    roundedSalaryWan: skey === "s4" ? null : Math.round(s),
    calculationMethod: skey === "s4" ? "令和8年分給与所得法定表から所得金額を計算（万円単位に丸めない）" : "旧万円刻みテーブル参照",
    tableValueWan: baseWan,
    incomeAdjustmentDeductionWan: toNumber(incomeAdjustmentWan, 0),
    incomeAdjustmentFormula:
      toNumber(incomeAdjustmentWan, 0) > 0
        ? `(${roundWan(s, 4)}万 − 850万) × 10%（上限15万）`
        : "適用なし",
    totalDeductionWan: baseWan + toNumber(incomeAdjustmentWan, 0),
    employmentIncomeWan: Math.max(0, s - baseWan - toNumber(incomeAdjustmentWan, 0)),
    source: skey === "s4" ? CALCULATION_SOURCES.employmentIncomeR8Final : CALCULATION_SOURCES.incomeTax,
  };
}

/**
 * 年度と所得帯に対応する基礎控除の説明と表採用値をまとめる。
 * @remarks 税・基礎控除。単位: 万円/年。式・境界条件・丸めは移動前の実装を維持。
 * @param {*} kind 判定対象・区分または補助値（呼出側の定義に従う）
 * @param {string} scenarioKey 年度キー（s1/s2/s3または旧別名）
 * @param {number} totalIncomeWan 万円（年額。補助値は呼出側の定義に従う）
 * @param {number} amountWan 万円（年額。補助値は呼出側の定義に従う）
 * @returns {*} 説明オブジェクト。単位: 万円/年
 */
export function describeBasicDeduction(kind, scenarioKey, totalIncomeWan, amountWan) {
  const income = Math.max(0, toNumber(totalIncomeWan, 0));
  const skey = normalizeScenario(scenarioKey);
  const valueWan = toNumber(amountWan, 0);
  const incomeTaxBands = {
    s1: [
      { maxWan: 2400, amountWan: 48, label: "2400万円以下" },
      { maxWan: 2450, amountWan: 32, label: "2400万円超2450万円以下" },
      { maxWan: 2500, amountWan: 16, label: "2450万円超2500万円以下" },
      { maxWan: Infinity, amountWan: 0, label: "2500万円超" },
    ],
    s2: [
      { maxWan: 132, amountWan: 95, label: "132万円以下" },
      { maxWan: 336, amountWan: 88, label: "132万円超336万円以下" },
      { maxWan: 489, amountWan: 68, label: "336万円超489万円以下" },
      { maxWan: 655, amountWan: 63, label: "489万円超655万円以下" },
      { maxWan: 2350, amountWan: 58, label: "655万円超2350万円以下" },
      { maxWan: 2400, amountWan: 48, label: "2350万円超2400万円以下" },
      { maxWan: 2450, amountWan: 32, label: "2400万円超2450万円以下" },
      { maxWan: 2500, amountWan: 16, label: "2450万円超2500万円以下" },
      { maxWan: Infinity, amountWan: 0, label: "2500万円超" },
    ],
    s3: [
      { maxWan: 489, amountWan: 104, label: "489万円以下" },
      { maxWan: 655, amountWan: 67, label: "489万円超655万円以下" },
      { maxWan: 2350, amountWan: 62, label: "655万円超2350万円以下" },
      { maxWan: 2400, amountWan: 48, label: "2350万円超2400万円以下" },
      { maxWan: 2450, amountWan: 32, label: "2400万円超2450万円以下" },
      { maxWan: 2500, amountWan: 16, label: "2450万円超2500万円以下" },
      { maxWan: Infinity, amountWan: 0, label: "2500万円超" },
    ],
  };
  const residentBands = [
    { maxWan: 2400, amountWan: 43, label: "2400万円以下" },
    { maxWan: 2450, amountWan: 29, label: "2400万円超2450万円以下" },
    { maxWan: 2500, amountWan: 15, label: "2450万円超2500万円以下" },
    { maxWan: Infinity, amountWan: 0, label: "2500万円超" },
  ];
  const bands = kind === "it" ? incomeTaxBands[skey === "s4" ? "s3" : skey] || incomeTaxBands.s2 : residentBands;
  const band = bands.find((b) => income <= b.maxWan) || bands[bands.length - 1];
  return {
    kind,
    scenario: kind === "it" ? skey : "common",
    totalIncomeWan: income,
    bracketLabel: band.label,
    upperIncomeWan: Number.isFinite(band.maxWan) ? band.maxWan : null,
    deductionWan: valueWan,
    formulaValueWan: band.amountWan,
    formula: `合計所得金額 ${band.label} → 基礎控除 ${band.amountWan}万円`,
    source: kind === "it" ? (skey === "s4" ? CALCULATION_SOURCES.basicDeductionR8Final : CALCULATION_SOURCES.incomeTax) : CALCULATION_SOURCES.residentTax,
  };
}
