import { toNumber } from "./numeric.js";

/**
 * 万円を円へ変換し、課税所得の1000円未満を切り捨てる。
 * @remarks 税・端数処理。単位: 円/年。円へのfloor後1000円単位floor。式・境界条件・丸めは移動前の実装を維持。
 * @param {number} taxableWan 万円（年額。補助値は呼出側の定義に従う）
 * @returns {*} number。単位: 円/年。円へのfloor後1000円単位floor
 */
export function floorTaxableWanToThousandYen(taxableWan) {
  const yen = Math.max(0, Math.floor(toNumber(taxableWan, 0) * 10000));
  return Math.floor(yen / 1000) * 1000;
}

export const INCOME_TAX_BANDS = [
  { max: 1950000, rate: 0.05, deductionYen: 0 },
  { max: 3300000, rate: 0.1, deductionYen: 97500 },
  { max: 6950000, rate: 0.2, deductionYen: 427500 },
  { max: 9000000, rate: 0.23, deductionYen: 636000 },
  { max: 18000000, rate: 0.33, deductionYen: 1536000 },
  { max: 40000000, rate: 0.4, deductionYen: 2796000 },
  { max: Infinity, rate: 0.45, deductionYen: 4796000 },
];

/**
 * 1000円単位課税所得へ所得税速算表を適用し、税額と説明用内訳を返す。
 * @remarks 所得税。単位: 円/年と万円/年。旧呼出しは基準所得税のみ。includeReconstruction指定時は復興税2.1%を含む年調年税額（100円未満切捨て）。
 * @param {number} taxableWan 万円（年額。補助値は呼出側の定義に従う）
 * @returns {*} 税率・税額・速算控除のオブジェクト。単位: 円/年と万円/年。税額はMath.round
 */
export function getIncomeTaxParts(taxableWan, options = {}) {
  const taxableYen = floorTaxableWanToThousandYen(taxableWan);
  const band = INCOME_TAX_BANDS.find((b) => taxableYen < b.max) || INCOME_TAX_BANDS[INCOME_TAX_BANDS.length - 1];
  const rawTaxYen = taxableYen * band.rate - band.deductionYen;
  const baseTaxYen = Math.max(0, Math.floor(rawTaxYen));
  const reconstructionSpecialIncomeTaxYen = options.includeReconstruction ? Math.floor(baseTaxYen * 0.021) : 0;
  const taxYen = options.includeReconstruction
    ? Math.floor((baseTaxYen + reconstructionSpecialIncomeTaxYen) / 100) * 100
    : Math.max(0, Math.round(rawTaxYen));
  return {
    taxableWan: taxableYen / 10000,
    taxableYen,
    rate: band.rate,
    deductionYen: band.deductionYen,
    rawTaxYen,
    baseTaxYen,
    reconstructionSpecialIncomeTaxYen,
    includesReconstruction: Boolean(options.includeReconstruction),
    taxYen,
    taxWan: taxYen / 10000,
  };
}

/**
 * 住民税の所得割・調整控除・均等割と市県内訳を現行実装式で求める。
 * @remarks 住民税。単位: 円/年と万円/年。所得コンテキストで非課税を判定。人的控除差指定時は法定調整控除・市県別100円未満切捨て。森林環境税は別内訳。
 * @param {number} taxableWan 万円（年額。補助値は呼出側の定義に従う）
 * @returns {*} 所得割・均等割・totalWan等。単位: 円/年と万円/年。税額と市町村分にMath.round
 */
export function getResidentTaxParts(taxableWan, options = {}) {
  const taxableYen = floorTaxableWanToThousandYen(taxableWan);
  const rate = 0.1;
  const rawIncomeLevyYen = taxableYen * rate;
  const hasIncomeContext = Number.isFinite(options.totalIncomeWan);
  const incomeYen = hasIncomeContext ? Math.round(options.totalIncomeWan * 10000) : null;
  const dependentCount = Math.max(0, Math.trunc(toNumber(options.dependentCount, 0)));
  const personExempt = hasIncomeContext && incomeYen <= 1350000 &&
    (options.disabled || options.minor || options.widow || options.singleParent);
  const perCapitaExemptionThresholdYen = dependentCount ? 350000 * (dependentCount + 1) + 310000 : 450000;
  const incomeLevyExemptionThresholdYen = dependentCount ? 350000 * (dependentCount + 1) + 420000 : 450000;
  const perCapitaExempt = personExempt || (hasIncomeContext && incomeYen <= perCapitaExemptionThresholdYen);
  const incomeLevyExempt = personExempt || (hasIncomeContext && incomeYen <= incomeLevyExemptionThresholdYen);
  let adjustmentDeductionYen = rawIncomeLevyYen > 0 ? 5000 : 0;
  if (Number.isFinite(options.personalDeductionDifferenceWan)) {
    const differenceYen = Math.max(0, Math.round(options.personalDeductionDifferenceWan * 10000));
    adjustmentDeductionYen = incomeYen > 25000000 ? 0 : taxableYen <= 2000000
      ? Math.min(differenceYen, taxableYen) * 0.05
      : Math.max(2500, (differenceYen - (taxableYen - 2000000)) * 0.05);
  }
  if (incomeLevyExempt) adjustmentDeductionYen = 0;
  const exactComponents = Number.isFinite(options.personalDeductionDifferenceWan);
  const postAdjustmentYen = Math.max(0, rawIncomeLevyYen - adjustmentDeductionYen);
  const municipalIncomeLevyYen = incomeLevyExempt ? 0 : exactComponents
    ? Math.floor((taxableYen * 0.06 - adjustmentDeductionYen * 0.6) / 100) * 100
    : Math.max(0, Math.round(postAdjustmentYen * 0.6));
  const prefecturalIncomeLevyYen = incomeLevyExempt ? 0 : exactComponents
    ? Math.floor((taxableYen * 0.04 - adjustmentDeductionYen * 0.4) / 100) * 100
    : Math.max(0, Math.round(postAdjustmentYen) - municipalIncomeLevyYen);
  const incomeLevyYen = Math.max(0, municipalIncomeLevyYen) + Math.max(0, prefecturalIncomeLevyYen);
  const chargedFlatLevy = hasIncomeContext ? !perCapitaExempt : incomeLevyYen > 0;
  const perCapitaYen = chargedFlatLevy ? 4000 : 0;
  const forestEnvironmentTaxYen = chargedFlatLevy ? 1000 : 0;
  const incomeLevyWan = incomeLevyYen / 10000;
  return {
    taxableWan: taxableYen / 10000,
    taxableYen,
    rate,
    rawIncomeLevyYen,
    adjustmentDeductionYen,
    incomeLevyYen,
    incomeLevyWan,
    municipalIncomeLevyYen,
    municipalIncomeLevyWan: municipalIncomeLevyYen / 10000,
    prefecturalIncomeLevyYen,
    prefecturalIncomeLevyWan: prefecturalIncomeLevyYen / 10000,
    adjustmentDeductionWan: adjustmentDeductionYen / 10000,
    perCapitaYen,
    perCapitaWan: perCapitaYen / 10000,
    forestEnvironmentTaxYen,
    forestEnvironmentTaxWan: forestEnvironmentTaxYen / 10000,
    exemption: { hasIncomeContext, personExempt: Boolean(personExempt), perCapitaExempt: Boolean(perCapitaExempt), incomeLevyExempt: Boolean(incomeLevyExempt), perCapitaExemptionThresholdYen, incomeLevyExemptionThresholdYen, dependentCount },
    personalDeductionDifferenceWan: options.personalDeductionDifferenceWan ?? null,
    totalWan: incomeLevyWan + (perCapitaYen + forestEnvironmentTaxYen) / 10000,
  };
}
