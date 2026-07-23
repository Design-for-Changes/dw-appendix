import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const load = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const tables = {
  emp: load("public/data/emp_deduction.json"),
  basicIT: load("public/data/basic_it.json"),
  basicLT: load("public/data/basic_lt.json"),
  socialU40: load("public/data/social_u40.json"),
  socialO40: load("public/data/social_o40.json"),
  configs: Object.fromEntries([
    ["spouseDeductionITCfg", "spouse_deduction_it.json"],
    ["spouseDeductionLTCfg", "spouse_deduction_lt.json"],
    ["spouseSpecialDeductionITCfg", "spouse_special_deduction_it.json"],
    ["spouseSpecialDeductionLTCfg", "spouse_special_deduction_lt.json"],
    ["dependentDeductionCfg", "dependent_deduction.json"],
    ["specialKinDeductionITCfg", "special_kin_deduction_it.json"],
    ["specialKinDeductionLTCfg", "special_kin_deduction_lt.json"],
    ["widowDeductionCfg", "widow_deduction.json"],
    ["singleParentDeductionCfg", "single_parent_deduction.json"],
    ["workingStudentDeductionCfg", "working_student_deduction.json"],
    ["disabilityDeductionCfg", "disability_deduction.json"],
  ].map(([key, file]) => [key, load(path.join("src/config", file))])),
};
const core = await import(pathToFileURL(path.resolve("src/calc/computePoint.js")).href);
const fixture = load("fixtures/cases.json");
const fail = [];
const close = (a, b, tolerance, label) => {
  if (Math.abs(Number(a) - Number(b)) > tolerance) fail.push(`${label}: core=${a}, oracle=${b}`);
};

function point(caseId, salary) {
  const c = fixture.cases.find((row) => row.id === caseId);
  return core.computeSeries({
    household: core.buildHousehold(c.household),
    scenario: c.scenario,
    tables,
    sweep: { min: salary, max: salary, step: 1 },
  })[0];
}

const p1 = point("P1", 900);
const head = p1.breakdown.rows.find((row) => row.who === "世帯主");
const social = head.socialInsuranceBreakdown;
close(social.healthWan, 900 * 0.0985 / 2, 1e-9, "health");
close(social.careWan, 900 * 0.0162 / 2, 1e-9, "care");
close(social.childSupportContributionWan, 900 * 0.0023 / 2, 1e-9, "support");
close(social.pensionWan, 780 * 0.183 / 2, 1e-9, "pension cap");
close(social.employmentWan, 900 * 0.005, 1e-9, "employment");
close(head.employmentIncomeBaseDeductionWan, 195, 1e-9, "employment income deduction cap");
close(head.incomeAdjustmentDeductionWan, 5, 1e-9, "income adjustment deduction");

const taxHead = p1.breakdown.tax.byWho.find((row) => row.who === "世帯主");
const incomeTax = taxHead.incomeTax;
close(taxHead.deductions.basicITWan, 62, 1e-9, "R8 income-tax basic deduction");
close(taxHead.deductions.basicLTWan, 43, 1e-9, "resident-tax basic deduction");
const taxableYen = Math.floor(incomeTax.taxableYen / 1000) * 1000;
const taxBands = [
  [1950000, 0.05, 0],
  [3300000, 0.1, 97500],
  [6950000, 0.2, 427500],
  [9000000, 0.23, 636000],
  [18000000, 0.33, 1536000],
  [40000000, 0.4, 2796000],
  [Infinity, 0.45, 4796000],
];
const taxBand = taxBands.find(([max]) => taxableYen <= max);
close(incomeTax.taxYen, Math.max(0, taxableYen * taxBand[1] - taxBand[2]), 1, "income tax");

const n04 = p1.breakdown.programs.n04;
const class1 = Math.ceil(((45520 + 45520 + 45060) * 0.75) / 10) * 10;
const needOracle =
  class1 + 44730 + 1500 * 3 + 4240 * 5 / 12 + 23270 / 12 +
  26810 + 10190 + 3400 + 56000;
close(n04.need.monthlyNeedYen, needOracle, 1e-6, "N04 monthly need P1");
close(n04.judgment.ratio, n04.judgment.monthlyMeasuredIncomeYen / needOracle, 1e-12, "N04 ratio P1");
const expectedClass = n04.judgment.ratio < 1.5 ? "第1区分" : n04.judgment.ratio < 2.5 ? "第2区分" : "第3区分";
if (n04.supportClass !== expectedClass) fail.push(`N04 class: ${n04.supportClass} != ${expectedClass}`);

const beforeTcca = point("P1", 781);
if (beforeTcca.breakdown.programs.tcca.monthlyYen !== 58450) fail.push("R8 TCCA grade 1 monthly amount");
const beforeWelfare = point("P1", 927);
if (beforeWelfare.breakdown.programs.welfareAllowance.monthlyYen !== 16560) fail.push("R8 welfare child monthly amount");

if (fail.length) {
  console.error(fail.join("\n"));
  process.exit(1);
}
console.log("✓ independent oracle checks passed");
