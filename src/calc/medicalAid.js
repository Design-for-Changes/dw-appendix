import { toNumber } from "./numeric.js";
import { CALCULATION_SOURCES } from "./calculationSources.js";

export const M01_KENSHIN_ANNUAL_YEN_DEFAULT = 149531;

export const M01_KENSHIN_ANNUAL_YEN_RANGE = { min: 149531, max: 167929 };

export const M01_LEVY_CUTOFF_YEN = 235000;

export const M01_INCOME_LIMIT_SOURCE = {
  title: "東金市 重度心身障害者医療費の助成",
  url: "https://www.city.togane.chiba.jp/0000000878.html",
  archivePath: "./sources/togane-severe-disability-medical-aid.png",
  section: "対象外要件（基準世帯の市民税所得割23万5千円以上）",
};

/**
 * 市町村民税所得割と代表年額から医療費助成と自己負担の内訳を求める。
 * @remarks M01 医療費助成。単位: 所得割基準=円/年、年額=万円。基準未満で対象。式・境界条件・丸めは移動前の実装を維持。
 * @param {object} ctx 世帯・制度設定または計算条件
 * @param {number} householdLevySumWan 万円（年額。補助値は呼出側の定義に従う）
 * @returns {*} 対象判定・年額・出典のオブジェクト。単位: 所得割基準=円/年、年額=万円。基準未満で対象
 */
export function calcM01Detail(ctx, householdLevySumWan) {
  if (!ctx.programs?.m01) {
    return {
      enabled: false,
      status: "対象外",
      householdLevyWan: toNumber(householdLevySumWan, 0),
      cutoffWan: M01_LEVY_CUTOFF_YEN / 10000,
      eligible: false,
      count: 0,
      annualWan: 0,
      confidence: "representative",
    };
  }
  const configured = toNumber(ctx.programs?.m01AnnualYen, M01_KENSHIN_ANNUAL_YEN_DEFAULT);
  const annualYenPerRecipient = Math.min(
    M01_KENSHIN_ANNUAL_YEN_RANGE.max,
    Math.max(M01_KENSHIN_ANNUAL_YEN_RANGE.min, configured)
  );
  const householdLevyYen = toNumber(householdLevySumWan, 0) * 10000;
  const eligible = householdLevyYen < M01_LEVY_CUTOFF_YEN;
  const count = Math.max(1, Math.trunc(toNumber(ctx.programs?.m01Count, 1)));
  const annualWan = eligible ? (annualYenPerRecipient * count) / 10000 : 0;
  return {
    enabled: true,
    status: eligible ? "該当" : "非該当",
    householdLevyWan: toNumber(householdLevySumWan, 0),
    cutoffWan: M01_LEVY_CUTOFF_YEN / 10000,
    eligible,
    count,
    annualYenPerRecipient,
    annualWan,
    fullReliefWan: (annualYenPerRecipient * count) / 10000,
    medicalCostBurdenWan: eligible ? 0 : (annualYenPerRecipient * count) / 10000,
    sensitivityRangeWan: {
      min: (M01_KENSHIN_ANNUAL_YEN_RANGE.min * count) / 10000,
      max: (M01_KENSHIN_ANNUAL_YEN_RANGE.max * count) / 10000,
    },
    judgment: {
      householdLevyWan: toNumber(householdLevySumWan, 0),
      householdLevyYen,
      cutoffYen: M01_LEVY_CUTOFF_YEN,
      eligible,
      comparisonOperator: "<",
      assessmentUnit: "医療保険単位の世帯",
      taxBasis: "市町村民税所得割",
      levyFormula: "（A6 − 均等割）× 60%（市町村分合計）",
      cutoffFormula: `固定基準額（市町村民税所得割 ${M01_LEVY_CUTOFF_YEN.toLocaleString("ja-JP")}円）`,
      formula: `${Math.round(householdLevyYen).toLocaleString("ja-JP")}円 < ${M01_LEVY_CUTOFF_YEN.toLocaleString("ja-JP")}円`,
      source: M01_INCOME_LIMIT_SOURCE,
    },
    amountFormula: {
      annualYenPerRecipient,
      count,
      annualWan,
      fullReliefWan: (annualYenPerRecipient * count) / 10000,
      medicalCostBurdenWan: eligible ? 0 : (annualYenPerRecipient * count) / 10000,
      formula: `${annualYenPerRecipient.toLocaleString("ja-JP")}円 × ${count}人`,
      source: CALCULATION_SOURCES.medicalRepresentative,
    },
    confidence: "representative",
  };
}
