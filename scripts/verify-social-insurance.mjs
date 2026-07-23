import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildHousehold,
  calculateSocialInsuranceComponents,
  computeSeries,
} from "../src/calc/computePoint.js";

const EPSILON = 1e-9;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadJSON(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
}

function assertClose(label, actual, expected) {
  if (Math.abs(actual - expected) > EPSILON) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

const r7Age45At600 = calculateSocialInsuranceComponents(600, 45, "S2_R7");
assertClose("R7 age45 salary600 total", r7Age45At600.totalWan, 92.7);

const r7Age45At900 = calculateSocialInsuranceComponents(900, 45, "S2_R7");
assertClose("R7 salary900 health", r7Age45At900.healthWan, 44.595);
assertClose("R7 salary900 care", r7Age45At900.careWan, 7.155);
assertClose("R7 salary900 support", r7Age45At900.childSupportContributionWan, 0);
assertClose("R7 salary900 pension cap", r7Age45At900.pensionWan, 71.37);
assertClose("R7 salary900 employment", r7Age45At900.employmentWan, 4.95);
assertClose("R7 age45 salary900 total", r7Age45At900.totalWan, 128.07);

const r8Age45At900 = calculateSocialInsuranceComponents(900, 45, "S3_R8_R9");
assertClose("R8 salary900 health", r8Age45At900.healthWan, 44.325);
assertClose("R8 salary900 care", r8Age45At900.careWan, 7.29);
assertClose("R8 salary900 support", r8Age45At900.childSupportContributionWan, 1.035);
assertClose("R8 salary900 pension cap", r8Age45At900.pensionWan, 71.37);
assertClose("R8 salary900 employment", r8Age45At900.employmentWan, 4.5);
assertClose("R8 age45 salary900 total", r8Age45At900.totalWan, 128.52);

const r8Age45At200 = calculateSocialInsuranceComponents(200, 45, "S3_R8_R9");
assertClose("R8 age45 salary200 total", r8Age45At200.totalWan, 31);

const r8Age45At1400 = calculateSocialInsuranceComponents(1400, 45, "S3_R8_R9");
assertClose("R8 age45 salary1400 total", r8Age45At1400.totalWan, 160.27);

let previous = -Infinity;
for (let salary = 200; salary <= 1400; salary += 1) {
  const actual = calculateSocialInsuranceComponents(salary, 45, "S3_R8_R9").totalWan;
  if (actual + EPSILON < previous) {
    throw new Error(`R8 social insurance is not monotonic at ${salary}: ${actual} < ${previous}`);
  }
  previous = actual;
}

const tables = {
  emp: loadJSON("public/data/emp_deduction.json"),
  basicIT: loadJSON("public/data/basic_it.json"),
  basicLT: loadJSON("public/data/basic_lt.json"),
  socialU40: loadJSON("public/data/social_u40.json"),
  socialO40: loadJSON("public/data/social_o40.json"),
  configs: {
    spouseDeductionITCfg: loadJSON("src/config/spouse_deduction_it.json"),
    spouseDeductionLTCfg: loadJSON("src/config/spouse_deduction_lt.json"),
    spouseSpecialDeductionITCfg: loadJSON("src/config/spouse_special_deduction_it.json"),
    spouseSpecialDeductionLTCfg: loadJSON("src/config/spouse_special_deduction_lt.json"),
    dependentDeductionCfg: loadJSON("src/config/dependent_deduction.json"),
    specialKinDeductionITCfg: loadJSON("src/config/special_kin_deduction_it.json"),
    specialKinDeductionLTCfg: loadJSON("src/config/special_kin_deduction_lt.json"),
    widowDeductionCfg: loadJSON("src/config/widow_deduction.json"),
    singleParentDeductionCfg: loadJSON("src/config/single_parent_deduction.json"),
    workingStudentDeductionCfg: loadJSON("src/config/working_student_deduction.json"),
    disabilityDeductionCfg: loadJSON("src/config/disability_deduction.json"),
  },
};
const series = computeSeries({
  household: buildHousehold({
    spouseEnabled: false,
    head: { age: 45 },
    children: [],
  }),
  scenario: "S3_R8_R9",
  tables,
  sweep: { min: 900, max: 900, step: 1 },
});
const displayedBreakdown = series[0]?.breakdown?.rows?.find((row) => row.who === "世帯主")
  ?.socialInsuranceBreakdown;
assertClose("breakdown salary900 health", displayedBreakdown?.healthWan, 44.325);
assertClose("breakdown salary900 care", displayedBreakdown?.careWan, 7.29);
assertClose("breakdown salary900 support", displayedBreakdown?.childSupportContributionWan, 1.035);
assertClose("breakdown salary900 pension", displayedBreakdown?.pensionWan, 71.37);
assertClose("breakdown salary900 employment", displayedBreakdown?.employmentWan, 4.5);
assertClose("breakdown salary900 total", displayedBreakdown?.totalWan, 128.52);

for (let salary = 200; salary <= 1400; salary += 1) {
  const tableRow = tables.socialO40.find((row) => row.x === salary);
  const formula = calculateSocialInsuranceComponents(salary, 45, "S3_R8_R9");
  assertClose(`R8 social table/formula salary${salary}`, tableRow?.social_s3, formula.totalWan);
}

console.log("✓ social insurance formula checks passed");
