import { normalizeScenario, toNumber, roundWan } from "./numeric.js";
import { CALCULATION_SOURCES } from "./calculationSources.js";

export const SOCIAL_RATE_RULES = {
  s1: { health: 0.0998 / 2, care: 0.016 / 2, support: 0, pension: 0.183 / 2, employment: 0.006 },
  s2: { health: 0.0991 / 2, care: 0.0159 / 2, support: 0, pension: 0.183 / 2, employment: 0.0055 },
  s3: { health: 0.0985 / 2, care: 0.0162 / 2, support: 0.0023 / 2, pension: 0.183 / 2, employment: 0.005 },
};

export const HEALTH_CAP_THRESHOLD_WAN = 1626;

export const HEALTH_MAX_STANDARD_ANNUAL_WAN = 1668;

export const PENSION_CAP_THRESHOLD_WAN = 762;

export const PENSION_MAX_STANDARD_ANNUAL_WAN = 780;

/**
 * 年度別本人負担率と年齢・上限を適用し、社会保険料の成分と合計を求める。
 * @remarks 社会保険料。単位: 万円/年。年収基礎の近似、成分は円丸めしない。式・境界条件・丸めは移動前の実装を維持。
 * @param {number} salaryWan 万円（年額。補助値は呼出側の定義に従う）
 * @param {number} age 年齢（歳）
 * @param {string} scenarioKey 年度キー（s1/s2/s3または旧別名）
 * @returns {*} 成分・率・式・totalWanのオブジェクト。単位: 万円/年。年収基礎の近似、成分は円丸めしない
 */
export function calculateSocialInsuranceComponents(salaryWan, age, scenarioKey) {
  const salary = Math.max(0, toNumber(salaryWan, 0));
  const rates = SOCIAL_RATE_RULES[normalizeScenario(scenarioKey)] || SOCIAL_RATE_RULES.s2;
  const healthBasisWan = salary >= HEALTH_CAP_THRESHOLD_WAN ? HEALTH_MAX_STANDARD_ANNUAL_WAN : salary;
  const pensionBasisWan = salary >= PENSION_CAP_THRESHOLD_WAN ? PENSION_MAX_STANDARD_ANNUAL_WAN : salary;
  const careRate = toNumber(age, 0) >= 40 ? rates.care : 0;
  const healthWan = healthBasisWan * rates.health;
  const careWan = healthBasisWan * careRate;
  const childSupportContributionWan = healthBasisWan * rates.support;
  const pensionWan = pensionBasisWan * rates.pension;
  const employmentWan = salary * rates.employment;
/**
   * 小数の料率を百分率の説明文字列へ変換する。
   * @remarks 社会保険料・表示。単位: %（小数4桁丸め）。式・境界条件・丸めは移動前の実装を維持。
   * @param {*} rate 判定対象・区分または補助値（呼出側の定義に従う）
   * @returns {*} string。単位: %（小数4桁丸め）
   */
  const percent = (rate) => `${roundWan(rate * 100, 4)}%`;
  return {
    salaryWan: salary,
    healthBasisWan,
    pensionBasisWan,
    rates: { ...rates, care: careRate },
    healthWan,
    careWan,
    childSupportContributionWan,
    pensionWan,
    employmentWan,
    formulas: {
      health: `${roundWan(healthBasisWan, 4)}万 × ${percent(rates.health * 2)} ÷ 2`,
      care: careRate > 0
        ? `${roundWan(healthBasisWan, 4)}万 × ${percent(careRate * 2)} ÷ 2`
        : "40歳未満のため適用なし",
      support: `${roundWan(healthBasisWan, 4)}万 × ${percent(rates.support * 2)} ÷ 2`,
      pension: `${roundWan(pensionBasisWan, 4)}万 × ${percent(rates.pension * 2)} ÷ 2`,
      employment: `${roundWan(salary, 4)}万 × ${percent(rates.employment)}`,
      total: "B2a ＋ B2b ＋ B2c ＋ B2d ＋ B2e",
    },
    totalWan: healthWan + careWan + childSupportContributionWan + pensionWan + employmentWan,
  };
}

/**
 * 社会保険料と被扶養扱いの計算条件・内訳の説明を構築する。
 * @remarks 社会保険料。単位: 万円/年。130万円以下の被扶養扱いを維持。式・境界条件・丸めは移動前の実装を維持。
 * @param {number} salaryWan 万円（年額。補助値は呼出側の定義に従う）
 * @param {number} age 年齢（歳）
 * @param {string} scenarioKey 年度キー（s1/s2/s3または旧別名）
 * @param {number} totalWan 万円（年額。補助値は呼出側の定義に従う）
 * @param {*} exemptSocial 判定対象・区分または補助値（呼出側の定義に従う）
 * @returns {*} 説明オブジェクト。単位: 万円/年。130万円以下の被扶養扱いを維持
 */
export function describeSocialInsuranceDeduction(salaryWan, age, scenarioKey, totalWan, exemptSocial) {
  const s = Math.max(0, toNumber(salaryWan, 0));
  const incomeYen = Math.round(s * 10000);
  const skey = normalizeScenario(scenarioKey);
  const ageKey = toNumber(age, 0) >= 40 ? "o40" : "u40";
  const components = calculateSocialInsuranceComponents(s, age, skey);
  const base = {
    salaryWan: s,
    roundedSalaryWan: Math.round(s),
    age: toNumber(age, 0),
    ageBand: ageKey,
    scenario: skey,
    totalWan: toNumber(totalWan, 0),
    source: "social_u40/social_o40 generated from bracket formulas",
    approximation: "年収を算定基礎とする率ベース近似（賞与なし）",
    components,
  };
  if (exemptSocial) {
    return { ...base, bracketLabel: "130万円以下・被扶養扱い", rate: 0, interceptYen: 0, fixedAnnualYen: 0, formula: "130万円以下の被扶養扱いで0" };
  }
  if (incomeYen <= 0) {
    return { ...base, bracketLabel: "0円", rate: 0, interceptYen: 0, fixedAnnualYen: 0, formula: "給与収入0のため社会保険料0" };
  }
  const bracketLabel =
    s >= HEALTH_CAP_THRESHOLD_WAN
      ? "健康保険等・厚生年金とも上限到達"
      : s >= PENSION_CAP_THRESHOLD_WAN
        ? "厚生年金の上限到達"
        : "各制度の本人負担率を適用";
  return {
    ...base,
    bracketLabel,
    rate: null,
    interceptYen: null,
    fixedAnnualYen: null,
    formula: "健保 + 介護 + 子ども・子育て支援金 + 厚生年金 + 雇用保険",
  };
}
