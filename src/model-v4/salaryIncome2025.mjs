/** 2025 taxable salary -> salary income before income-amount adjustment.
 * NTA 2025 Q17 / Funabashi FY2026 salary table. No tax or allowance deductions.
 */
export function salaryIncomeBeforeAdjustment2025(salaryYen) {
  if (!Number.isSafeInteger(salaryYen) || salaryYen < 0) throw new TypeError("Nonnegative safe integer salary required");
  let beforeAdjustmentYen;
  if (salaryYen <= 650999) beforeAdjustmentYen = 0;
  else if (salaryYen < 1900000) beforeAdjustmentYen = salaryYen - 650000;
  else if (salaryYen < 3600000) beforeAdjustmentYen = Math.floor(salaryYen / 4000) * 2800 - 80000;
  else if (salaryYen < 6600000) beforeAdjustmentYen = Math.floor(salaryYen / 4000) * 3200 - 440000;
  else if (salaryYen < 8500000) {
    beforeAdjustmentYen = Math.floor(salaryYen * 9 / 10) - 1100000;
  } else beforeAdjustmentYen = salaryYen - 1950000;
  return beforeAdjustmentYen;
}
