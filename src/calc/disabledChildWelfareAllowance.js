import { calcWelfareAllowanceLimitSelfYen, calcWelfareAllowanceLimitObligorYen } from "./allowances.js";

// N01-2 障害児福祉手当。特別児童扶養手当(N01-1)とは受給者・所得判定が異なる。
// 法17条（所得以外の資格）、20条（本人は超過）、21条（配偶者・生計維持者は以上）。
// https://www.mhlw.go.jp/web/t_doc?dataId=82090000&dataType=0&pageNo=1
// 施行令7条、8条（2条2項・4条・5条の準用／本人についての読替え）。
// https://www.mhlw.go.jp/web/t_doc?dataId=82091000&dataType=0
// R8年4月以降月額とR8年8月以降所得限度額。将来の確定額の意味ではない。
// https://www.city.funabashi.lg.jp/kenkou/shougaisha/004/03/p042516.html
const MONTHLY_YEN = 16560;
const ROLES = ["recipient", "spouse", "maintainer"];

/** 児福の判定に渡す金額・人数が0以上の安全な整数かを確認する。 */
function nonnegative(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(label + "は0以上の整数で指定してください。");
  return value;
}

/**
 * 給与のみの個人について施行令8条の判定所得（円）を作る。給与収入そのものは渡さない。
 * salaryIncomeYen は所得税法28条2項の給与所得（所得金額調整控除の適用前）。
 * 各入力は当人の前年のもの。用いた控除の金額も返す。
 * otherAllowedDeductionsYen は施行令5条2項に列挙されたもののうち、ここで別計上
 * していない適用額（住民税の配偶者特別控除額等）のみ。基礎控除・扶養控除等は禁止。
 * 本人の社会保険料は実控除額、本人自身の障害者控除は不可。家族の所得には
 * 一律8万円を適用し、本人自身も住民税の障害者控除の対象なら27万／40万円を控除。
 * @param {object} input 判定対象者の区分、前年の給与所得、個人別の法定控除の内訳。
 * @returns {object} 判定に用いる年間所得（円）と、給与・社保・障害等の控除額（円）。
 */
export function calculateWelfareSalaryAssessment({
  role, salaryIncomeYen, socialInsuranceDeductionYen = 0, ownTaxDisability = "none",
  ordinaryDisabledDependents = 0, specialDisabledDependents = 0, otherAllowedDeductionsYen = 0,
}) {
  if (!ROLES.includes(role) || !["none", "ordinary", "special"].includes(ownTaxDisability))
    throw new RangeError("本人・配偶者・生計維持者の区分と障害者控除の区分を指定してください。");
  nonnegative(salaryIncomeYen, "給与所得");
  nonnegative(socialInsuranceDeductionYen, "社会保険料控除額");
  nonnegative(ordinaryDisabledDependents, "障害者控除を受けた同一生計配偶者・扶養親族の数");
  nonnegative(specialDisabledDependents, "特別障害者控除を受けた同一生計配偶者・扶養親族の数");
  nonnegative(otherAllowedDeductionsYen, "その他の法定控除額");
  const recipient = role === "recipient";
  const salaryDeductionYen = Math.min(100000, salaryIncomeYen);
  const insuranceDeductionYen = recipient ? socialInsuranceDeductionYen : 80000;
  const disabilityDeductionYen = nonnegative(
    270000 * ordinaryDisabledDependents + 400000 * specialDisabledDependents +
      (recipient ? 0 : {none:0, ordinary:270000, special:400000}[ownTaxDisability]), "障害者控除計");
  const totalDeductions = nonnegative(salaryDeductionYen + insuranceDeductionYen + disabilityDeductionYen +
    otherAllowedDeductionsYen, "控除計");
  return {incomeYen:Math.max(0, salaryIncomeYen - totalDeductions), salaryDeductionYen,
    insuranceDeductionYen, disabilityDeductionYen, otherAllowedDeductionsYen};
}

/**
 * 本人・家族ごとに限度額への法定加算を行い、判定所得と照合する。
 * dependentCount は当人に係る「加算対象扶養親族等」の数。対象児童の人数や世帯人数ではない。
 * 老人扶養親族と70歳以上の同一生計配偶者を混同しない。後者は本人側だけの10万円加算。
 */
function individualCheck(record, role, id) {
  const {incomeYen, dependentCount, elderlyDependentCount = 0, elderlySpouseCount = 0,
    specifiedDependentCount = 0} = record;
  for (const [v, label] of [[incomeYen,"判定所得"], [dependentCount,"加算対象扶養親族等数"],
    [elderlyDependentCount,"老人扶養親族数"], [elderlySpouseCount,"70歳以上同一生計配偶者数"],
    [specifiedDependentCount,"特定扶養親族等数"]]) nonnegative(v, label);
  if (elderlySpouseCount > 1 || elderlyDependentCount + elderlySpouseCount + specifiedDependentCount > dependentCount)
    throw new RangeError("加算対象扶養親族等数とその内訳が一致しません。");
  const recipient = role === "recipient";
  const elderAddCount = elderlyDependentCount === dependentCount ? Math.max(0, elderlyDependentCount - 1) : elderlyDependentCount;
  const limitYen = nonnegative(recipient
    ? calcWelfareAllowanceLimitSelfYen(dependentCount) + (elderlyDependentCount + elderlySpouseCount) * 100000 +
      specifiedDependentCount * 250000
    : calcWelfareAllowanceLimitObligorYen(dependentCount) + elderAddCount * 60000, "所得限度額");
  return {role, id, incomeYen, dependentCount, limitYen, stopComparison:recipient ? ">" : ">=",
    passes:recipient ? incomeYen <= limitYen : incomeYen < limitYen};
}

/**
 * 対象児1人の障害児福祉手当を計算。所得以外の受給条件を満たすかは eligible に明示。
 * recipient は対象児本人、spouse はその児童自身の配偶者（本稿の子にはいない）。
 * maintainers は児童の生計を維持する者と認定／モデルで仮定した法21条の扶養義務者。
 * 両親の給与を合算せず、同居のみから対象・認定を推測しない。
 * 各人の incomeYen は手当所定の控除後所得であり、課税所得・給与収入ではない。
 * 支給額はR8公表値による12か月の静的年換算。転入・所得年度切替・被災特例等は対象外。
 * @param {object} input 所得外の受給条件、児童本人・配偶者・生計維持者の判定所得と扶養人数。
 * @returns {object} 個人別の比較結果・停止理由と、対象児1人の月額・年額（円）。
 */
export function calculateDisabledChildWelfareAllowance({eligible, recipient, maintainers, spouse = null}) {
  if (typeof eligible !== "boolean" || !recipient || !Array.isArray(maintainers))
    throw new TypeError("所得以外の受給条件、本人の所得判定、認定された生計維持者のリストが必要です。");
  const checks = [individualCheck(recipient, "recipient", recipient.id ?? "recipient")];
  if (spouse !== null) checks.push(individualCheck(spouse, "spouse", spouse.id ?? "spouse"));
  const ids = new Set(checks.map(c => c.id));
  if (ids.size !== checks.length) throw new RangeError("判定対象者が重複しています。");
  for (const m of maintainers) {
    if (!m || typeof m.id !== "string" || !m.id || ids.has(m.id))
      throw new RangeError("生計維持者には重複しない識別子が必要です。");
    ids.add(m.id);
    checks.push(individualCheck(m, "maintainer", m.id));
  }
  const failed = checks.filter(check => !check.passes);
  const incomeEligible = failed.length === 0, payable = eligible && incomeEligible;
  const reasons = [...(eligible ? [] : ["non-income-ineligible"]), ...failed.map(c => c.role + ":" + c.id)];
  const monthlyYen = payable ? MONTHLY_YEN : 0;
  return {incomeEligible, payable, monthlyYen, annualYen:monthlyYen * 12, checks, reasons};
}
