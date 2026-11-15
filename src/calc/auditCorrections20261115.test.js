import { calcTccaComputedLocal, calcWelfareAllowanceLimitSelfYen, calcChildSupportMonthlyYen, calcBasicDisabilityPensionYenFor } from "./allowances.js";
import { getIncomeTaxParts, getResidentTaxParts } from "./taxes.js";
import { calcEmploymentIncomeDeductionR8FinalWan, calcBasicIncomeTaxDeductionR8FinalWan } from "./taxDescriptions.js";
import { buildHousehold, createContext } from "./household.js";
import { computeSeries, calcServiceAssessmentLevyYen, getChildDayServiceCapYen } from "./computePoint.js";
import { calcSpouseDeductionFromRows, calcSpouseSpecialDeductionFromRows, getDisabilityDeductionForTaxpayerWan } from "./deductions.js";
import emp from "../../public/data/emp_deduction.json";
import basicIT from "../../public/data/basic_it.json";
import basicLT from "../../public/data/basic_lt.json";
import dependentDeductionCfg from "../config/dependent_deduction.json";
import spouseDeductionITCfg from "../config/spouse_deduction_it.json";
import spouseDeductionLTCfg from "../config/spouse_deduction_lt.json";
import spouseSpecialDeductionITCfg from "../config/spouse_special_deduction_it.json";
import spouseSpecialDeductionLTCfg from "../config/spouse_special_deduction_lt.json";
import specialKinDeductionITCfg from "../config/special_kin_deduction_it.json";
import specialKinDeductionLTCfg from "../config/special_kin_deduction_lt.json";
import disabilityDeductionCfg from "../config/disability_deduction.json";
import workingStudentDeductionCfg from "../config/working_student_deduction.json";
import widowDeductionCfg from "../config/widow_deduction.json";
import singleParentDeductionCfg from "../config/single_parent_deduction.json";

const tables = { emp, basicIT, basicLT, configs: { dependentDeductionCfg, spouseDeductionITCfg, spouseDeductionLTCfg, spouseSpecialDeductionITCfg, spouseSpecialDeductionLTCfg, specialKinDeductionITCfg, specialKinDeductionLTCfg, disabilityDeductionCfg, workingStudentDeductionCfg, widowDeductionCfg, singleParentDeductionCfg } };
const point = (household, x = 700, scenario = "s4") => computeSeries({ household, scenario, tables, sweep: { min: x, max: x, step: 1 } })[0];
const child = (extra = {}) => ({ age: 7, disabled: true, ...extra });
const context = (household = {}, scenario = "s4") => createContext({ household: buildHousehold(household), scenario, tables });

test.each([-1, 0, 1])("特児本人は限度額以上で停止（差%d円）", (delta) => {
  const ctx = context({}, "s3");
  const rows = [{ who: "世帯主", totalIncomeWan: (4976000 + 180000 + delta) / 10000 }, { who: "子ども1", age: 7, totalIncomeWan: 0, tccaGrade: "1" }];
  const result = calcTccaComputedLocal(ctx, rows, 0);
  expect(result.head.adjustedYen).toBe(4976000 + delta);
  expect(result.totalMonthlyYen).toBe(delta < 0 ? 58450 : 0);
});

test.each([-1, 0, 1])("特児配偶者は限度額以上で停止（差%d円）", (delta) => {
  const ctx = context({ spouseEnabled: true }, "s3");
  const rows = [{ who: "世帯主", totalIncomeWan: 0 }, { who: "配偶者", totalIncomeWan: (6536000 + 180000 + delta) / 10000 }, { who: "子ども1", age: 7, totalIncomeWan: 0, tccaGrade: "1" }];
  const result = calcTccaComputedLocal(ctx, rows, 0);
  expect(result.familyMaxAdjustedYen).toBe(6536000 + delta);
  expect(result.totalMonthlyYen).toBe(delta < 0 ? 58450 : 0);
});

test.each([-1, 0, 1])("障害児福祉手当本人は限度額を超えると停止（差%d円）", (delta) => {
  const result = point({ children: [child({ childWelfareAllowance: true, otherIncomeWan: (3758000 + delta) / 10000 })] }, 0, "s3");
  expect(calcWelfareAllowanceLimitSelfYen(0)).toBe(3758000);
  expect(result.breakdown.programs.welfareAllowance.recipients[0].monthlyYen).toBe(delta <= 0 ? 16560 : 0);
});

test.each([-1, 0, 1])("障害児福祉手当扶養義務者は限度額以上で停止（差%d円）", (delta) => {
  const result = point({ head: { otherIncomeWan: (6536000 + 450000 + delta) / 10000 }, children: [child({ childWelfareAllowance: true })] }, 0, "s3");
  expect(result.breakdown.programs.welfareAllowance.obligorMaxAdjustedIncomeYen).toBe(6536000 + delta);
  expect(result.breakdown.programs.welfareAllowance.monthlyYen).toBe(delta < 0 ? 16560 : 0);
});

test("R8児童扶養手当の原典計算例・10円丸め・扶養4人上限", () => {
  expect(calcChildSupportMonthlyYen({ incomeYen: 1220000, fuyoCount: 1, childrenCount: 1 })).toBe(44080);
  expect(calcChildSupportMonthlyYen({ incomeYen: 1069999, fuyoCount: 1, childrenCount: 1 })).toBe(48050);
  expect(calcChildSupportMonthlyYen({ incomeYen: 1070000, fuyoCount: 1, childrenCount: 1 })).toBe(48040);
  expect(calcChildSupportMonthlyYen({ incomeYen: 3599999, fuyoCount: 4, childrenCount: 2 })).toBe(11340 + 5680);
  expect(calcChildSupportMonthlyYen({ incomeYen: 3600000, fuyoCount: 4, childrenCount: 2 })).toBe(0);
});

test("R8障害基礎年金の1級・2級・子加算", () => {
  const ctx = context({ head: { disabled: true, basicDisabilityPensionGrade: "1" }, children: [child(), child(), child()] });
  expect(calcBasicDisabilityPensionYenFor(ctx, "世帯主", 0)).toBe(1059125 + 243800 * 2 + 81300);
  ctx.head.basicDisabilityPensionGrade = "2";
  expect(calcBasicDisabilityPensionYenFor(ctx, "世帯主", 0)).toBe(847300 + 243800 * 2 + 81300);
});

test.each([135, 134.9999])("障害者本人合計所得%s万円以下は住民税・森林環境税非課税", (income) => {
  const tax = getResidentTaxParts(100, { totalIncomeWan: income, disabled: true, dependentCount: 0, personalDeductionDifferenceWan: 6 });
  expect(tax.totalWan).toBe(0);
  expect(tax.forestEnvironmentTaxYen).toBe(0);
});

test("135万円超では本人非課税特例が消え、所得割ゼロでも均等割等は残り得る", () => {
  expect(getResidentTaxParts(100, { totalIncomeWan: 135.0001, disabled: true, personalDeductionDifferenceWan: 6 }).exemption.personExempt).toBe(false);
  const tax = getResidentTaxParts(0, { totalIncomeWan: 60, dependentCount: 0, personalDeductionDifferenceWan: 5 });
  expect(tax.incomeLevyYen).toBe(0);
  expect(tax.perCapitaYen).toBe(4000);
  expect(tax.forestEnvironmentTaxYen).toBe(1000);
  expect(tax.totalWan).toBe(0.5);
});

test("調整控除の200万円前後・所得割の市県別100円切捨て", () => {
  expect(getResidentTaxParts(100, { totalIncomeWan: 200, personalDeductionDifferenceWan: 32 }).adjustmentDeductionYen).toBe(16000);
  const high = getResidentTaxParts(300, { totalIncomeWan: 400, personalDeductionDifferenceWan: 32 });
  expect(high.adjustmentDeductionYen).toBe(2500);
  expect(high.incomeLevyYen).toBe(297500);
});

test("新S4のみ復興特別所得税と年税額100円未満切捨て", () => {
  const tax = getIncomeTaxParts(700, { includeReconstruction: true });
  expect(tax.baseTaxYen).toBe(974000);
  expect(tax.reconstructionSpecialIncomeTaxYen).toBe(20454);
  expect(tax.taxYen).toBe(994400);
  expect(getIncomeTaxParts(700).taxYen).toBe(974000);
  expect(getIncomeTaxParts(195).rate).toBe(0.1);
  expect(getIncomeTaxParts(330).rate).toBe(0.2);
});

test("R8給与所得表の219.1万円・220万円・221万円", () => {
  expect(219.1 - calcEmploymentIncomeDeductionR8FinalWan(219.1)).toBeCloseTo(145.1, 8);
  expect(219.3 - calcEmploymentIncomeDeductionR8FinalWan(219.3)).toBeCloseTo(145.3, 8);
  expect(220 - calcEmploymentIncomeDeductionR8FinalWan(220)).toBeCloseTo(146, 8);
  expect(221 - calcEmploymentIncomeDeductionR8FinalWan(221)).toBeCloseTo(146.56, 8);
  // 国税庁「令和8年分 所得税の税額表等」給与所得速算表の公表例。
  expect(581.25 - calcEmploymentIncomeDeductionR8FinalWan(581.25)).toBeCloseTo(420.96, 8);
});

test("R8基礎控除は所得を万円に四捨五入せず境界判定", () => {
  expect(calcBasicIncomeTaxDeductionR8FinalWan(489)).toBe(104);
  expect(calcBasicIncomeTaxDeductionR8FinalWan(489.0001)).toBe(67);
  expect(calcBasicIncomeTaxDeductionR8FinalWan(655)).toBe(67);
  expect(calcBasicIncomeTaxDeductionR8FinalWan(655.0001)).toBe(62);
});

test("S4のみ税扶養所得要件62万円、旧設定JSON58万円は維持", () => {
  expect(context().dependentDeductionCfg.dependent_total_income_max_wan).toBe(62);
  expect(context({}, "s3").dependentDeductionCfg.dependent_total_income_max_wan).toBe(58);
  expect(dependentDeductionCfg.dependent_total_income_max_wan).toBe(58);
});

test("S4配偶者控除は62万円以下・900万円超の1円を落とさない", () => {
  const ctx = context({ spouseEnabled: true });
  const rows = [{ who: "世帯主", totalIncomeWan: 900.0001 }, { who: "配偶者", totalIncomeWan: 62 }];
  expect(calcSpouseDeductionFromRows(ctx, ctx.spouseDeductionITCfg, rows)).toBe(26);
  rows[1].totalIncomeWan = 62.0001;
  expect(calcSpouseDeductionFromRows(ctx, ctx.spouseDeductionITCfg, rows)).toBe(0);
  expect(calcSpouseSpecialDeductionFromRows(ctx, ctx.spouseSpecialDeductionITCfg, 0, rows)).toBe(26);
});

test("扶養外の同居配偶者本人には同居特別75万円でなく本人特別40万円", () => {
  const ctx = context({ spouseEnabled: true, spouse: { disabled: true, disabilityKind: "special" } });
  const rows = [{ who: "世帯主", totalIncomeWan: 500 }, { who: "配偶者", totalIncomeWan: 200, disabled: true }];
  expect(getDisabilityDeductionForTaxpayerWan(ctx, rows[1], "it", rows)).toBe(40);
  expect(getDisabilityDeductionForTaxpayerWan(ctx, rows[1], "lt", rows)).toBe(30);
});

test("通所判定だけ年少扶養19,800円・16～18歳7,200円を控除", () => {
  expect(calcServiceAssessmentLevyYen(350000, [7, 16, 19])).toBe(323000);
  expect(calcServiceAssessmentLevyYen(10000, [7])).toBe(0);
  const result = point({ children: [child()] }, 900);
  expect(result.breakdown.programs.service.taxCollectionHouseholdLevySumWan - result.breakdown.programs.service.householdLevySumWan).toBeCloseTo(1.98, 9);
});

test.each([[279999, 4600], [280000, 37200], [280001, 37200]])("通所判定所得割%d円の上限は%d円", (levy, cap) => {
  expect(getChildDayServiceCapYen(levy, true)).toBe(cap);
  expect(getChildDayServiceCapYen(levy, false)).toBe(0);
});

test("所得割0でも均等割課税なら通所は非課税区分にしない", () => {
  const result = point({ spouseEnabled: true, children: [child({ specialDisabled: true })] }, 211);
  expect(result.breakdown.tax.byWho[0].residentTax.incomeLevyYen).toBe(0);
  expect(result.breakdown.tax.byWho[0].residentTax.perCapitaYen).toBe(4000);
  expect(result.breakdown.programs.service.details[0].type).toBe("一般1");
  expect(result.breakdown.programs.service.monthlyTotalYen).toBe(4600);
});

test.each([[1000, 2000, 3000], [3000, 3000, 4600], [10406, 10406, 4600]])("児童別R %d＋%dを先に合算して一般1上限（%d円）", (r1, r2, charge) => {
  const result = point({ children: [child(), child()], programs: { serviceUse: { schemaVersion: 1, monthlyBurdenBeforeCapByChildYen: [r1, r2], months: 12 } } }, 700);
  expect(result.breakdown.programs.service.monthlyTotalYen).toBe(charge);
  expect(result.breakdown.programs.service.calculation.method).toBe("sumChildRThenHouseholdCap");
});

test("一般2でも兄弟Rを先に合算し、同じ利用条件を所得間で保持", () => {
  const household = { children: [child(), child()], programs: { serviceUse: { schemaVersion: 1, monthlyBurdenBeforeCapByChildYen: [10406, 10406], months: 12 } } };
  const low = point(household, 700), high = point(household, 1500);
  expect(high.breakdown.programs.service.monthlyTotalYen).toBe(20812);
  expect(low.breakdown.programs.service.use.monthlyBurdenBeforeCapByChildYen).toEqual(high.breakdown.programs.service.use.monthlyBurdenBeforeCapByChildYen);
});

test("通所明示入力は非利用・無償化児を区別し、欠落Rを拒否", () => {
  const result = point({ children: [child({ age: 4 }), child()], programs: { serviceUse: { schemaVersion: 1, monthlyBurdenBeforeCapByChildYen: [37200, 1000], months: 6 } } }, 1500);
  expect(result.service).toBe(0.6);
  expect(() => point({ children: [child()], programs: { serviceUse: { schemaVersion: 1, monthlyBurdenBeforeCapByChildYen: [] } } })).toThrow(RangeError);
});

test("明示N04プロフィールを無効化して教育実費を黙って0円にしない", () => {
  expect(() => buildHousehold({ programs: { n04: false, n04EducationProfile: { schemaVersion: 1 } } })).toThrow(/requires programs.n04=true/);
});
