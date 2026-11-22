import { salaryIncomeBeforeAdjustmentYen, childOrDisabilityIncomeAdjustmentYen } from "./employmentIncome.js";
import { calcEmploymentIncomeDeductionR8FinalWan } from "./taxDescriptions.js";

// 国税庁原表の給与→所得（円）の組。期待値を被検関数から生成しない。
// https://www.nta.go.jp/publication/pamph/gensen/nencho2025/pdf/114.pdf
// https://www.nta.go.jp/publication/pamph/gensen/nencho2026/pdf/114.pdf
const yearSpecific = [
  [2025, 650999, 0], [2025, 651000, 1000], [2025, 1899999, 1249999],
  [2025, 1900000, 1250000], [2025, 1903999, 1250000], [2025, 1904000, 1252800],
  [2026, 740999, 0], [2026, 741000, 1000], [2026, 2190999, 1450999],
  [2026, 2191000, 1451000], [2026, 2192999, 1451000], [2026, 2193000, 1453000],
  [2026, 2195999, 1453000], [2026, 2196000, 1456000], [2026, 2199999, 1456000],
];
test.each(yearSpecific)("年分%i・給与%i円 → 所得%i円", (year, salary, expected) => {
  expect(salaryIncomeBeforeAdjustmentYen(salary, year)).toBe(expected);
});
describe.each([2025, 2026])("%i年分（共通の区間）", year => {
  test.each([
    [0, 0], [2200000, 1460000], [2203999, 1460000], [2204000, 1462800],
    [2210000, 1465600], [3599999, 2437200], [3600000, 2440000],
    [5310000, 3806400], [6599999, 4836800], [6600000, 4840000],
    [6600001, 4840000], [6600006, 4840005], [8499999, 6549999],
    [8500000, 6550000], [15000000, 13050000],
  ])("給与%i円 → 所得%i円", (salary, expected) => {
    expect(salaryIncomeBeforeAdjustmentYen(salary, year)).toBe(expected);
  });
});
test("既存画面用の万円インターフェースにも整数円の控除額が渡る", () => {
  expect(calcEmploymentIncomeDeductionR8FinalWan(660.0001)).toBe(1760001 / 10000);
});
test.each([
  [8499999, true, 0], [8500000, true, 0], [8500001, true, 1], [8500011, true, 2],
  [9000001, true, 50001], [9999999, true, 150000], [10000000, true, 150000],
  [10000001, true, 150000], [10000000, false, 0],
])("給与%i円・適用%s → 所得金額調整控除%i円", (salary, eligible, expected) => {
  expect(childOrDisabilityIncomeAdjustmentYen(salary, eligible)).toBe(expected);
});
test("未設定を給与ゼロや適用なしに読み替えない", () => {
  for (const value of [null, undefined, "0", NaN, -1, 100.5, Infinity]) {
    expect(() => salaryIncomeBeforeAdjustmentYen(value, 2026)).toThrow(RangeError);
  }
  expect(() => salaryIncomeBeforeAdjustmentYen(0, undefined)).toThrow(RangeError);
  expect(() => salaryIncomeBeforeAdjustmentYen(0, 2024)).toThrow(RangeError);
  expect(() => childOrDisabilityIncomeAdjustmentYen(9000000, undefined)).toThrow(RangeError);
});
