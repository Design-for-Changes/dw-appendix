// Generate social insurance JSON tables used by DeductionGraph fixed graphs.
//
// Output:
// - public/data/social_u40.json
// - public/data/social_o40.json
//
// Notes:
// - x axis is annual salary in "万円/年" (0..3000, step=1).
// - Store yen-rounded values in 万円. Avoid 0.1万円 rounding because it creates
//   visual sawtooth artifacts in the appendix disposable-income curve.
//
// Usage:
//   node scripts/gen_social_json.js

const fs = require("fs");
const path = require("path");

const WAN = 10000;

const toWanFromRoundedYen = (yen) => Math.round(Number(yen) || 0) / WAN;

// Annual-salary approximation of the employee contribution.
// Health/care/support and pension use the official employee half-rates. Once
// salary reaches the upper grade threshold, the maximum standard remuneration
// is used. Employment insurance is charged on the full salary without this cap.
const SOCIAL_RATE_RULES = {
  // Tokyo, R6. Employment insurance: general business, employee share.
  s1: { health: 0.0998 / 2, care: 0.016 / 2, support: 0, pension: 0.183 / 2, employment: 0.006 },
  // Tokyo, R7. Employment insurance: general business, employee share.
  s2: { health: 0.0991 / 2, care: 0.0159 / 2, support: 0, pension: 0.183 / 2, employment: 0.0055 },
  // Tokyo, R8. Child/family support starts in R8.
  s3: { health: 0.0985 / 2, care: 0.0162 / 2, support: 0.0023 / 2, pension: 0.183 / 2, employment: 0.005 },
};
const HEALTH_CAP_THRESHOLD_YEN = 1626 * WAN;
const HEALTH_MAX_STANDARD_ANNUAL_YEN = 1668 * WAN;
const PENSION_CAP_THRESHOLD_YEN = 762 * WAN;
const PENSION_MAX_STANDARD_ANNUAL_YEN = 780 * WAN;

function getSocialComponentsYen(annualIncomeYen, scenarioKey, age) {
  const income = Math.max(0, Number(annualIncomeYen) || 0);
  const rates = SOCIAL_RATE_RULES[scenarioKey];
  if (!rates) return null;
  const healthBasis = income >= HEALTH_CAP_THRESHOLD_YEN ? HEALTH_MAX_STANDARD_ANNUAL_YEN : income;
  const pensionBasis = income >= PENSION_CAP_THRESHOLD_YEN ? PENSION_MAX_STANDARD_ANNUAL_YEN : income;
  const careRate = age >= 40 ? rates.care : 0;
  return {
    health: healthBasis * rates.health,
    care: healthBasis * careRate,
    support: healthBasis * rates.support,
    pension: pensionBasis * rates.pension,
    employment: income * rates.employment,
  };
}

function getSocialEmpYen(annualIncomeYen, scenarioKey, age) {
  const income = Math.max(0, Number(annualIncomeYen) || 0);
  if (income <= 0) return 0;

  const components = getSocialComponentsYen(income, scenarioKey, age);
  if (!components) return 0;
  return Object.values(components).reduce((sum, value) => sum + value, 0);
}

function genRows(age) {
  const out = [];
  for (let x = 0; x <= 3000; x += 1) {
    const incomeYen = x * WAN;
    out.push({
      x,
      social_s1: toWanFromRoundedYen(getSocialEmpYen(incomeYen, "s1", age)),
      social_s2: toWanFromRoundedYen(getSocialEmpYen(incomeYen, "s2", age)),
      social_s3: toWanFromRoundedYen(getSocialEmpYen(incomeYen, "s3", age)),
    });
  }
  return out;
}

function main() {
  const root = path.join(__dirname, "..");
  const outDir = path.join(root, "public", "data");

  const u40 = genRows(39);
  const o40 = genRows(40);

  fs.writeFileSync(path.join(outDir, "social_u40.json"), JSON.stringify(u40));
  fs.writeFileSync(path.join(outDir, "social_o40.json"), JSON.stringify(o40));

  // eslint-disable-next-line no-console
  console.log("Wrote social_u40.json and social_o40.json");
}

main();
