import { childOrDisabilityIncomeAdjustmentYen } from "./employmentIncome.js";

/** 給与所得・所得金額調整控除・基礎控除の計算に用いる公布法とその出典。 */
export const PAPER_SALARY_POLICY_2029 = Object.freeze({
  id: "JP-salary-R10on-as-enacted-20261122",
  comparisonYear: 2029,
  asOf: "2026-11-22",
  salarySource: "https://www.shugiin.go.jp/internet/itdb_housei.nsf/html/housei/22120260331012.htm",
  adjustmentSource: "https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1411.htm",
  basicSource: "https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1199.htm",
  caveat: "令和8年法律第12号による令和10年分以後の規定。将来の物価等に伴う見直しは織り込まない。",
});

// 所得税法別表第五（令和8年法律第12号）。R8・R9の最低保障額74万円の
// 特例は用いない。本則の表も690,001円から直ちに所得が生じるわけではなく、
// 2,026,000～2,035,999円にも4,000円刻みの通常式と異なる3階級がある。
/** 年間の額面給与から所得金額調整控除前の給与所得を別表第五により整数円で算出する。 */
function beforeAdjustmentYen(salaryYen) {
  if (salaryYen < 691000) return 0;
  if (salaryYen < 2026000) return salaryYen - 690000;
  if (salaryYen < 2028000) return 1336000;
  if (salaryYen < 2032000) return 1338000;
  if (salaryYen < 2036000) return 1342000;
  if (salaryYen < 3600000) return Math.floor(salaryYen / 4000) * 2800 - 80000;
  if (salaryYen < 6600000) return Math.floor(salaryYen / 4000) * 3200 - 440000;
  if (salaryYen < 8500000) return Math.floor(salaryYen * 9 / 10) - 1100000;
  return salaryYen - 1950000;
}

/**
 * 所得税の基礎控除（円）。個人住民税の基礎控除ではない。
 * 国税庁No.1199の「令和10年分以後」列。所得は社会保険料等を引く前。
 */
export function basicIncomeTaxDeduction2029Yen(totalIncomeYen) {
  if (!Number.isSafeInteger(totalIncomeYen) || totalIncomeYen < 0) {
    throw new RangeError("合計所得金額は0以上の整数円で指定してください。");
  }
  if (totalIncomeYen <= 1320000) return 990000;
  if (totalIncomeYen <= 23500000) return 620000;
  if (totalIncomeYen <= 24000000) return 480000;
  if (totalIncomeYen <= 24500000) return 320000;
  if (totalIncomeYen <= 25000000) return 160000;
  return 0;
}

/**
 * 一人分の給与収入 → 給与所得 → 所得税の基礎控除。すべて円／年。
 * 本稿の給与のみ・国内居住者・各人の給与上限1,500万円に限定する。
 * 障害者等又は子（23歳未満の扶養親族）による所得金額調整控除の
 * 資格は呼出元が明示する。この控除は扶養控除の帰属とは別判定。
 * 給与0円でも入力としては有効。世帯の原点除外はこの個人計算の責務ではない。
 */
export function calculatePaperSalaryTaxInputs2029({ annualSalaryYen, eligibleForIncomeAdjustment } = {}) {
  if (!Number.isSafeInteger(annualSalaryYen) || annualSalaryYen < 0 || annualSalaryYen > 15000000 ||
      typeof eligibleForIncomeAdjustment !== "boolean") {
    throw new RangeError("給与は0～1,500万円の整数円、所得金額調整控除の該当は真偽値で指定してください。");
  }
  const salaryIncomeBeforeAdjustmentYen = beforeAdjustmentYen(annualSalaryYen);
  const incomeAdjustmentDeductionYen = childOrDisabilityIncomeAdjustmentYen(annualSalaryYen, eligibleForIncomeAdjustment);
  const salaryIncomeYen = salaryIncomeBeforeAdjustmentYen - incomeAdjustmentDeductionYen;
  return {
    policyId: PAPER_SALARY_POLICY_2029.id, annualSalaryYen, salaryIncomeBeforeAdjustmentYen,
    incomeAdjustmentDeductionYen, salaryIncomeYen,
    basicIncomeTaxDeductionYen: basicIncomeTaxDeduction2029Yen(salaryIncomeYen),
  };
}
