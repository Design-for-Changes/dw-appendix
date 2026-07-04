// Generate social insurance JSON tables used by DeductionGraph fixed graphs.
//
// Output:
// - public/data/social_u40.json
// - public/data/social_o40.json
//
// Notes:
// - x axis is annual salary in "万円/年" (0..3000, step=1).
// - Apply the "fixed amount up to annual income bands -> rate calc from 100万円/年" rule
//   for S1/S2/S3. The fixed amounts are interpreted as *annual* employee
//   contributions (yen).
// - Store yen-rounded values in 万円. Avoid 0.1万円 rounding because it creates
//   visual sawtooth artifacts in the appendix disposable-income curve.
//
// Usage:
//   node scripts/gen_social_json.js

const fs = require("fs");
const path = require("path");

const WAN = 10000;

const SH_FIXED_MONTHLY = {
  // [~75.6万, 75.7~87.6万, 87.6~99.6万]
  s1: {
    u40: [131354, 137342, 143330],
    o40: [136922, 143870, 150818],
  },
  s2: {
    u40: [131111, 137057, 143003],
    o40: [136644, 143544, 150444],
  },
  s3: {
    u40: [132152, 137750, 143798],
    o40: [137339, 144360, 151380],
  },
};
const toWanFromRoundedYen = (yen) => Math.round(Number(yen) || 0) / WAN;

// Upper-band rules (annual, employee contributions in yen).
// - 762万円以上1626万円以下: income * rate + 713,700 yen
// - 1627万円以上: income * 0.0055 + intercept
// NOTE: x axis is in 万円 so boundaries align exactly at x=762/1626/1627.
// Base-rate rule (user spec):
// - From UPPER_START (762万円) the 厚年本人負担(9.15%) portion is capped and treated as a fixed yen amount.
// - Therefore, below that band (>=100万円 and <UPPER_START), we approximate with
//   (upperRate + 0.0915) as the all-in rate.
const UPPER_START_YEN = 762 * WAN;
const SH_UPPER_762_1626 = {
  s1: { u40: 0.05265, o40: 0.06065 },
  s2: { u40: 0.0523, o40: 0.06025 },
  s3: { u40: 0.05315, o40: 0.06125 },
};
const SH_UPPER_1627_PLUS = {
  // slope is common 0.0055; intercept differs by scenario/age
  slope: 0.0055,
  intercept: {
    s1: { u40: 1546032, o40: 1679472 },
    s2: { u40: 1540194, o40: 1672800 },
    s3: { u40: 1554372, o40: 1689480 },
  },
};

function getSocialEmpYen(annualIncomeYen, scenarioKey, age) {
  const income = Math.max(0, Number(annualIncomeYen) || 0);
  if (income <= 0) return 0;

  const ageKey = age >= 40 ? "o40" : "u40";
  const fixed = SH_FIXED_MONTHLY?.[scenarioKey]?.[ageKey];
  const upperRate = SH_UPPER_762_1626?.[scenarioKey]?.[ageKey];
  const upperIntercept = SH_UPPER_1627_PLUS?.intercept?.[scenarioKey]?.[ageKey];

  if (!Array.isArray(fixed) || fixed.length < 3) return 0;
  if (!Number.isFinite(upperRate) || !Number.isFinite(upperIntercept)) return 0;

  if (income <= 756000) return fixed[0];
  if (income <= 876000) return fixed[1];
  if (income < 1000000) return fixed[2];

  // Upper band rules
  if (income >= UPPER_START_YEN && income <= 16260000) return income * upperRate + 713700;
  if (income >= 16270000) return income * SH_UPPER_1627_PLUS.slope + upperIntercept;

  // Default linear approximation (>=100万円):
  // Use "upperRate + 0.0915" so the formula is consistent with the user's
  // "rate drops by 0.0915 when the fixed 713,700 yen portion starts" spec.
  return income * (upperRate + 0.0915);
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
