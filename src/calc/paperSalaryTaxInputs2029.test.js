import { basicIncomeTaxDeduction2029Yen, calculatePaperSalaryTaxInputs2029, PAPER_SALARY_POLICY_2029 } from "./paperSalaryTaxInputs2029";

const salary = (annualSalaryYen, eligibleForIncomeAdjustment = false) =>
  calculatePaperSalaryTaxInputs2029({ annualSalaryYen, eligibleForIncomeAdjustment });

// 別表第五（令和8年3月31日 法律12号、衆議院「制定法律」掲載の表）。
// 納税者1人分。同法のR8・R9限りの給与所得計算の特例とは区別する。
test.each([
  [0,0], [690000,0], [690999,0], [691000,1000], [691001,1001], [1400000,710000],
  [2025999,1335999], [2026000,1336000], [2027999,1336000],
  [2028000,1338000], [2031999,1338000], [2032000,1342000], [2035999,1342000],
  [2036000,1345200], [2039999,1345200], [2040000,1348000],
  [2188000,1451600], [2191000,1451600], [2192000,1454400],
  [3599999,2437200], [3600000,2440000], [6599999,4836800], [6600000,4840000],
  [6600001,4840000], [8499999,6549999], [8500000,6550000], [15000000,13050000],
])("給与収入 %i → 所得金額調整前 %i 円", (gross, income) => {
  expect(salary(gross)).toMatchObject({
    policyId: PAPER_SALARY_POLICY_2029.id,
    salaryIncomeBeforeAdjustmentYen: income, incomeAdjustmentDeductionYen: 0, salaryIncomeYen: income,
  });
});

test.each([
  [8500000,6550000,0,6550000], [8500001,6550001,1,6550000], [9000000,7050000,50000,7000000],
  [10000000,8050000,150000,7900000], [10000001,8050001,150000,7900001], [15000000,13050000,150000,12900000],
])("所得金額調整控除：該当者の年収 %i 円", (gross, before, adj, after) => {
  expect(salary(gross, true)).toMatchObject({
    salaryIncomeBeforeAdjustmentYen: before, incomeAdjustmentDeductionYen: adj, salaryIncomeYen: after,
  });
});

// No.1199「令和10年分以後」。役割・配偶者所得・社会保険料を控除判定の入力にしない。
test.each([
  [0,990000], [1320000,990000], [1320001,620000], [3000000,620000], [4890000,620000], [6550000,620000],
  [23500000,620000], [23500001,480000], [24000000,480000], [24000001,320000],
  [24500000,320000], [24500001,160000], [25000000,160000], [25000001,0],
])("合計所得 %i → 所得税の基礎控除 %i 円", (income, deduction) => {
  expect(basicIncomeTaxDeduction2029Yen(income)).toBe(deduction);
});
test("年収201万円と201万1円で基礎控除の判定は給与所得を通じて変わる", () => {
  expect(salary(2010000).basicIncomeTaxDeductionYen).toBe(990000);
  expect(salary(2010001).basicIncomeTaxDeductionYen).toBe(620000);
});
test.each([-1, 0.5, undefined, null, "0", Number.NaN, 15000001])("不正給与 %p は拒否", gross => {
  expect(() => salary(gross)).toThrow();
});
test("所得金額調整控除の該当、合計所得の未設定をゼロと誤認しない", () => {
  expect(() => calculatePaperSalaryTaxInputs2029({annualSalaryYen: 10000000})).toThrow();
  expect(() => basicIncomeTaxDeduction2029Yen(null)).toThrow();
});
