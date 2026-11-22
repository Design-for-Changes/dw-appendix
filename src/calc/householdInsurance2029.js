import { employeeGradesFromAnnualPay } from "./revisionPayroll.js";
import { employeeInsurance2029 as policy } from "../config/employeeInsurance2029.js";

const MONTHS = 12, BPS = 10000, MAX_ANNUAL_YEN = 15000000;

/** 給与天引き・端数特約なし。整数分数のまま50銭以下を切り捨て、50銭超を切り上げる。 */
function employeeDeduction(numerator, denominator) {
  const whole = Math.floor(numerator / denominator);
  return whole + Number(2 * (numerator % denominator) > denominator);
}

/** 給与入力は万円ではなく額面の円。欠損を無職と見なさない。 */
function checkAnnualPay(yen) {
  if (!Number.isSafeInteger(yen) || yen < 0 || yen > MAX_ANNUAL_YEN)
    throw new RangeError("各人の給与年収は0～15,000,000円の整数で指定してください。");
}

/** 45歳・協会けんぽ千葉・一般の事業・通常折半。月額の本人負担を年換算する。 */
function insuredPerson(annualYen) {
  // 旧年度と共有するのは健保の等級表だけ。旧年度の厚年32級上限・率・加入判定は使わない。
  const {healthGrade, healthStandardYen} = employeeGradesFromAnnualPay(annualYen);
  // 健保4級～38級に対応する厚年1級～35級。上下端以外の報酬帯は共通。
  const pensionGrade = Math.min(35, Math.max(1, healthGrade - 3));
  const pensionStandardYen = Math.min(750000, Math.max(88000, healthStandardYen));
  const healthCareSupportYen = employeeDeduction(
    healthStandardYen * (policy.healthBps + policy.careBps + policy.childSupportBps), 2 * BPS);
  const pensionYen = employeeDeduction(pensionStandardYen * policy.pensionBps, 2 * BPS);
  // 雇用保険は標準報酬でなく実際の賃金。年収/12を先に丸めず、本人率を掛けた月額を丸める。
  const employmentYen = employeeDeduction(annualYen * policy.employeeEmploymentBps, MONTHS * BPS);
  const totalYen = healthCareSupportYen + pensionYen + employmentYen;
  return {
    status:"employee", annualPayYen:annualYen, healthGrade, healthStandardYen, pensionGrade, pensionStandardYen,
    monthly:{healthCareSupportYen, pensionYen, employmentYen, totalYen},
    annual:{healthCareSupportYen:MONTHS*healthCareSupportYen, pensionYen:MONTHS*pensionYen,
      employmentYen:MONTHS*employmentYen, totalYen:MONTHS*totalYen},
  };
}

/** 配偶者の被扶養者かつ国民年金第3号とする給与ゼロの親。等級なしと負担ゼロを区別する。 */
function dependentPerson() {
  const zero = {healthCareSupportYen:0, pensionYen:0, employmentYen:0, totalYen:0};
  return {status:"dependent", annualPayYen:0, healthGrade:null, healthStandardYen:null,
    pensionGrade:null, pensionStandardYen:null, monthly:{...zero}, annual:{...zero}};
}

/**
 * 両者に同一の仮定を適用する。給与が正＝就労し賃金以外の加入要件は充足、ゼロ＝非就労。
 * 最低賃金から労働時間を推計したり、この研究上の条件を個人の資格認定に使ったりしない。
 * 賞与・通勤費・他の報酬なし、給与年収を12等分、昇給なし。原点だけは計算しない。
 * @param {object} input headAnnualYen, spouseAnnualYen：各人の年間給与収入（円）。
 * @returns {object} 親別の加入区分・等級・本人負担（月額・年額）、世帯年額及び採用料率の出典。
 */
export function calculateHouseholdInsurance2029({headAnnualYen, spouseAnnualYen} = {}) {
  checkAnnualPay(headAnnualYen);
  checkAnnualPay(spouseAnnualYen);
  if (headAnnualYen === 0 && spouseAnnualYen === 0)
    return {status:"excluded", reason:"both-nonworking", head:null, spouse:null, totalYen:null, policy};
  const head = headAnnualYen > 0 ? insuredPerson(headAnnualYen) : dependentPerson();
  const spouse = spouseAnnualYen > 0 ? insuredPerson(spouseAnnualYen) : dependentPerson();
  return {status:"calculated", head, spouse, totalYen:head.annual.totalYen+spouse.annual.totalYen, policy};
}
