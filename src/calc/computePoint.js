import { rowAtKeyInt, interpTableValue } from "../pages/disabilityWelfare/utils.js";

const DEFAULT_SWEEP = { min: 1, max: 1500, step: 1 };

function normalizeScenario(scenario) {
  const s = String(scenario || "s2");
  if (s === "S1_R6") return "s1";
  if (s === "S2_R7") return "s2";
  if (s === "S3_R8_R9") return "s3";
  return ["s1", "s2", "s3"].includes(s) ? s : "s2";
}

function toNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function buildHousehold(caseHousehold = {}) {
  const headInput = caseHousehold.head || {};
  const spouseInput = caseHousehold.spouse || {};
  const childrenInput = Array.isArray(caseHousehold.children) ? caseHousehold.children : [];

  const head = {
    age: toNumber(headInput.age, 40),
    salaryWan: toNumber(headInput.salaryWan, 0),
    disabled: Boolean(headInput.disabled),
    disabilityKind: headInput.disabilityKind || (headInput.specialDisabled ? "special" : "disabled"),
    tokubetsuAllowance: Boolean(headInput.tokubetsuAllowance),
    childWelfareAllowance: Boolean(headInput.childWelfareAllowance),
    basicDisabilityPensionGrade: String(headInput.basicDisabilityPensionGrade || "none"),
    basicDisabilityPensionPre20: Boolean(headInput.basicDisabilityPensionPre20),
    otherIncomeWan: toNumber(headInput.otherIncomeWan, 0),
    widowWan: toNumber(headInput.widowWan, 0),
    singleParentWan: toNumber(headInput.singleParentWan, 0),
    workingStudentWan: toNumber(headInput.workingStudentWan, 0),
    otherDedWan: toNumber(headInput.otherDedWan, 0),
  };

  const spouse = {
    age: toNumber(spouseInput.age, 40),
    salaryWan: toNumber(spouseInput.salaryWan, 0),
    otherIncomeWan: toNumber(spouseInput.otherIncomeWan, 0),
    workingStudentWan: toNumber(spouseInput.workingStudentWan, 0),
    disabled: Boolean(spouseInput.disabled),
    disabilityKind: spouseInput.disabilityKind || (spouseInput.specialDisabled ? "special" : "disabled"),
    tokubetsuAllowance: Boolean(spouseInput.tokubetsuAllowance),
    childWelfareAllowance: Boolean(spouseInput.childWelfareAllowance),
    basicDisabilityPensionGrade: String(spouseInput.basicDisabilityPensionGrade || "none"),
    basicDisabilityPensionPre20: Boolean(spouseInput.basicDisabilityPensionPre20),
  };

  const children = childrenInput.map((c, i) => ({
    id: c.id || `fixture_child_${i + 1}`,
    age: toNumber(c.age, 0),
    cohabit: c.cohabit !== false,
    disabled: Boolean(c.disabled),
    specialDisabled: Boolean(c.specialDisabled),
    tccaGrade: String(c.tccaGrade || "not"),
    childWelfareAllowance: Boolean(c.childWelfareAllowance),
    tokubetsuAllowance: Boolean(c.tokubetsuAllowance),
    workingStudent: Boolean(c.workingStudent),
    salaryWan: toNumber(c.salaryWan, 0),
    otherIncomeWan: toNumber(c.otherIncomeWan, 0),
  }));

  return {
    head,
    spouseEnabled: Boolean(caseHousehold.spouseEnabled),
    spouse,
    children,
  };
}

function getConfig(tables, key) {
  return tables?.configs?.[key] || tables?.[key] || {};
}

function getRequiredTables(tables = {}) {
  return {
    empStatic: tables.emp || tables.empStatic || [],
    basicITStatic: tables.basicIT || tables.basicITStatic || [],
    basicLTStatic: tables.basicLT || tables.basicLTStatic || [],
    socialU40Static: tables.socialU40 || tables.socialU40Static || [],
    socialO40Static: tables.socialO40 || tables.socialO40Static || [],
    taxTableStatic: tables.taxTable || tables.taxTableStatic || [],
    dependentDeductionCfg: getConfig(tables, "dependentDeductionCfg"),
    spouseDeductionITCfg: getConfig(tables, "spouseDeductionITCfg"),
    spouseDeductionLTCfg: getConfig(tables, "spouseDeductionLTCfg"),
    spouseSpecialDeductionITCfg: getConfig(tables, "spouseSpecialDeductionITCfg"),
    spouseSpecialDeductionLTCfg: getConfig(tables, "spouseSpecialDeductionLTCfg"),
    specialKinDeductionITCfg: getConfig(tables, "specialKinDeductionITCfg"),
    specialKinDeductionLTCfg: getConfig(tables, "specialKinDeductionLTCfg"),
    widowDeductionCfg: getConfig(tables, "widowDeductionCfg"),
    singleParentDeductionCfg: getConfig(tables, "singleParentDeductionCfg"),
    workingStudentDeductionCfg: getConfig(tables, "workingStudentDeductionCfg"),
    disabilityDeductionCfg: getConfig(tables, "disabilityDeductionCfg"),
  };
}

export function computeSeries({ household, scenario = "s2", tables, sweep } = {}) {
  const normalized = buildHousehold(household || {});
  const ctx = createContext({ household: normalized, scenario, tables });
  const range = { ...DEFAULT_SWEEP, ...(sweep || {}) };
  const min = toNumber(range.min, DEFAULT_SWEEP.min);
  const max = toNumber(range.max, DEFAULT_SWEEP.max);
  const step = Math.max(1, toNumber(range.step, DEFAULT_SWEEP.step));
  const out = [];
  for (let x = min; x <= max; x += step) out.push(computePoint(ctx, x));
  return out;
}

function createContext({ household, scenario, tables }) {
  const configs = getRequiredTables(tables);
  const skey = normalizeScenario(scenario);
  return {
    ...configs,
    ...household,
    skey,
    empKey: `emp_${skey}`,
    basicITKey: `basicIT_${skey}`,
    socialKey: `social_${skey}`,
    wsAmtIT: toNumber(configs.workingStudentDeductionCfg?.amount_it_wan, 0),
    wsAmtLT: toNumber(configs.workingStudentDeductionCfg?.amount_lt_wan, 0),
  };
}

function calcIncomeAdjustmentDeductionWan(salaryWan, eligible) {
  const t = toNumber(salaryWan, 0);
  if (!eligible) return 0;
  if (t <= 850) return 0;
  const capped = Math.min(1000, t);
  return Math.min(15, Math.max(0, (capped - 850) * 0.1));
}

function calcOne(ctx, age, salaryWan, otherIncomeWan, opts = {}) {
  const s = Math.max(0, toNumber(salaryWan, 0));
  const o = Math.max(0, toNumber(otherIncomeWan, 0));
  const r = rowAtKeyInt(ctx.empStatic, "x", Math.round(s));
  const empBaseWan = toNumber(r?.[ctx.empKey], 0);
  const incomeAdjWan = toNumber(opts?.incomeAdjWan, 0);
  const empWan = empBaseWan + incomeAdjWan;
  const incomeWan = Math.max(0, s - empWan);
  const totalIncomeWan = incomeWan + o;

  const exemptSocial = Boolean(opts?.exemptSocialUnder130) && s <= 130;
  const socArr = toNumber(age, 0) >= 40 ? ctx.socialO40Static : ctx.socialU40Static;
  const socRow = rowAtKeyInt(socArr, "x", Math.round(s));
  const socialWan = exemptSocial ? 0 : toNumber(socRow?.[ctx.socialKey], 0);

  const basicITRow = rowAtKeyInt(ctx.basicITStatic, "income_axis", Math.round(totalIncomeWan));
  const basicLTRow = rowAtKeyInt(ctx.basicLTStatic, "income_axis", Math.round(totalIncomeWan));
  const basicITWan = toNumber(basicITRow?.[ctx.basicITKey], 0);
  const basicLTWan = toNumber(basicLTRow?.basicLT_common, 0);

  return {
    salaryWan: s,
    empWan,
    empBaseWan,
    incomeAdjWan,
    incomeWan,
    otherIncomeWan: o,
    totalIncomeWan,
    socialWan,
    basicITWan,
    basicLTWan,
  };
}

function buildRows(ctx, headSalaryWan) {
  const { head, spouse, spouseEnabled, children } = ctx;
  const rows = [];
  rows.push({
    who: "世帯主",
    age: head.age,
    workingStudent: Boolean(head.workingStudentWan),
    disabled: Boolean(head.disabled),
    tccaSpecial: Boolean(head.disabled) && head.disabilityKind === "special",
    cohabit: true,
    otherDedWan: toNumber(head.otherDedWan, 0),
    widowWan: toNumber(head.widowWan, 0),
    singleParentWan: toNumber(head.singleParentWan, 0),
    tccaDisWan: head.disabled ? (head.disabilityKind === "special" ? 40 : 27) : 0,
    welfareDisWan: head.disabled ? (head.disabilityKind === "special" ? 40 : 27) : 0,
    ...calcOne(ctx, head.age, headSalaryWan, head.otherIncomeWan, { exemptSocialUnder130: false, incomeAdjWan: 0 }),
  });
  if (spouseEnabled) {
    rows.push({
      who: "配偶者",
      age: spouse.age,
      workingStudent: Boolean(spouse.workingStudentWan),
      disabled: Boolean(spouse.disabled),
      tccaSpecial: Boolean(spouse.disabled) && spouse.disabilityKind === "special",
      cohabit: true,
      tccaDisWan: spouse.disabled ? (spouse.disabilityKind === "special" ? 40 : 27) : 0,
      welfareDisWan: spouse.disabled ? (spouse.disabilityKind === "special" ? 40 : 27) : 0,
      ...calcOne(ctx, spouse.age, spouse.salaryWan, spouse.otherIncomeWan, { exemptSocialUnder130: true, incomeAdjWan: 0 }),
    });
  }
  children.forEach((c, i) =>
    rows.push({
      who: `子ども${i + 1}`,
      age: c.age,
      workingStudent: Boolean(c.workingStudent),
      disabled: Boolean(c.disabled),
      tccaSpecial: Boolean(c.disabled) && Boolean(c.specialDisabled),
      cohabit: c?.cohabit !== false,
      tccaGrade: String(c?.tccaGrade || "not"),
      tccaDisWan: c.disabled ? (c.specialDisabled ? 40 : 27) : 0,
      welfareDisWan: c.disabled ? (c.specialDisabled ? 40 : 27) : 0,
      ...calcOne(ctx, c.age, c.salaryWan, c.otherIncomeWan, { exemptSocialUnder130: true, incomeAdjWan: 0 }),
    })
  );

  const childDepMaxWan = 58;
  const dependentChildren = rows.filter(
    (r) => String(r?.who || "").startsWith("子ども") && toNumber(r?.totalIncomeWan, 0) <= childDepMaxWan
  );
  const hasDependentUnder23 = dependentChildren.some((r) => toNumber(r?.age, 0) < 23);
  const hasDependentSpecialDisabled = dependentChildren.some((r) => Boolean(r?.tccaSpecial));
  const headIsSpecialDisabled = Boolean(head.disabled) && head.disabilityKind === "special";
  const spouseIsSpecialDisabled = Boolean(spouseEnabled && spouse.disabled) && spouse.disabilityKind === "special";
  const headEligible = headIsSpecialDisabled || spouseIsSpecialDisabled || hasDependentUnder23 || hasDependentSpecialDisabled;
  const spouseEligible = spouseIsSpecialDisabled || headIsSpecialDisabled || hasDependentUnder23 || hasDependentSpecialDisabled;

  const headAdjWan = calcIncomeAdjustmentDeductionWan(headSalaryWan, headEligible);
  const spouseAdjWan = spouseEnabled ? calcIncomeAdjustmentDeductionWan(spouse.salaryWan, spouseEligible) : 0;

  if (headAdjWan > 0) {
    const idx = rows.findIndex((r) => r.who === "世帯主");
    if (idx >= 0) {
      rows[idx] = {
        ...rows[idx],
        ...calcOne(ctx, head.age, headSalaryWan, head.otherIncomeWan, {
          exemptSocialUnder130: false,
          incomeAdjWan: headAdjWan,
        }),
      };
    }
  }
  if (spouseEnabled && spouseAdjWan > 0) {
    const idx = rows.findIndex((r) => r.who === "配偶者");
    if (idx >= 0) {
      rows[idx] = {
        ...rows[idx],
        ...calcOne(ctx, spouse.age, spouse.salaryWan, spouse.otherIncomeWan, {
          exemptSocialUnder130: true,
          incomeAdjWan: spouseAdjWan,
        }),
      };
    }
  }
  return rows;
}

function amountByBands(bands, total) {
  const b = bands.find((x) => total >= toNumber(x.min_wan, 0) && total <= toNumber(x.max_wan, 0));
  return toNumber(b?.amount_wan, 0);
}

function calcDependentDeductionFromRows(ctx, rows) {
  const maxIncome = toNumber(ctx.dependentDeductionCfg?.dependent_total_income_max_wan, 0);
  const bands = Array.isArray(ctx.dependentDeductionCfg?.bands) ? ctx.dependentDeductionCfg.bands : [];
  let it = 0;
  let lt = 0;
  for (const r of rows) {
    if (!String(r?.who || "").startsWith("子ども")) continue;
    const age = toNumber(r?.age, 0);
    const total = toNumber(r?.totalIncomeWan, 0);
    if (total > maxIncome) continue;
    for (const b of bands) {
      const ranges = Array.isArray(b?.age_ranges) ? b.age_ranges : [];
      const ok = ranges.some((x) => age >= toNumber(x.min_age, 0) && age <= toNumber(x.max_age, 0));
      if (!ok) continue;
      it += toNumber(b.amount_it_wan, 0);
      lt += toNumber(b.amount_lt_wan, 0);
      break;
    }
  }
  return { itWan: it, ltWan: lt };
}

function calcSpecialKinDeductionFromRows(ctx, rows) {
  const maxDepIncome = toNumber(ctx.dependentDeductionCfg?.dependent_total_income_max_wan, 0);
  const itBands = Array.isArray(ctx.specialKinDeductionITCfg?.child_total_income_bands_wan)
    ? ctx.specialKinDeductionITCfg.child_total_income_bands_wan
    : [];
  const ltBands = Array.isArray(ctx.specialKinDeductionLTCfg?.child_total_income_bands_wan)
    ? ctx.specialKinDeductionLTCfg.child_total_income_bands_wan
    : [];
  let it = 0;
  let lt = 0;
  for (const r of rows) {
    if (!String(r?.who || "").startsWith("子ども")) continue;
    const age = toNumber(r?.age, 0);
    if (age < 19 || age > 22) continue;
    const total = toNumber(r?.totalIncomeWan, 0);
    if (total <= maxDepIncome) continue;
    it += amountByBands(itBands, total);
    lt += amountByBands(ltBands, total);
  }
  return { itWan: it, ltWan: lt };
}

function calcSpouseDeductionFromRows(ctx, cfg, rows) {
  if (!ctx.spouseEnabled) return 0;
  const headRow = rows.find((r) => r.who === "世帯主");
  const spouseRow = rows.find((r) => r.who === "配偶者");
  if (!headRow || !spouseRow) return 0;
  const headTotal = toNumber(headRow?.totalIncomeWan, 0);
  const spouseTotal = toNumber(spouseRow?.totalIncomeWan, 0);
  const spouseMax = toNumber(cfg?.spouse_total_income_max_wan, 0);
  if (spouseTotal > spouseMax) return 0;
  const bands = Array.isArray(cfg?.head_total_income_bands_wan) ? cfg.head_total_income_bands_wan : [];
  const b = bands.find((x) => headTotal >= toNumber(x.min_wan, 0) && headTotal <= toNumber(x.max_wan, 0));
  return toNumber(b?.amount_wan, 0);
}

function calcSpouseSpecialDeductionFromRows(ctx, cfg, spouseDeductionWan, rows) {
  if (!ctx.spouseEnabled) return 0;
  if (spouseDeductionWan !== 0 && cfg?.applies_when_spouse_deduction_is_zero) return 0;
  const headRow = rows.find((r) => r.who === "世帯主");
  const spouseRow = rows.find((r) => r.who === "配偶者");
  if (!headRow || !spouseRow) return 0;
  const headTotal = toNumber(headRow?.totalIncomeWan, 0);
  const spouseTotal = toNumber(spouseRow?.totalIncomeWan, 0);
  const headBands = Array.isArray(cfg?.head_total_income_bands_wan) ? cfg.head_total_income_bands_wan : [];
  const headBand = headBands.find(
    (b) => headTotal >= toNumber(b.head_min_wan, 0) && headTotal <= toNumber(b.head_max_wan, 0)
  );
  if (!headBand) return 0;
  const spouseBands = Array.isArray(headBand.spouse_bands_wan) ? headBand.spouse_bands_wan : [];
  const sb = spouseBands.find(
    (b) => spouseTotal >= toNumber(b.spouse_min_wan, 0) && spouseTotal <= toNumber(b.spouse_max_wan, 0)
  );
  return toNumber(sb?.amount_wan, 0);
}

function calcWidowSingleParent(ctx, rows) {
  const headRow = rows.find((r) => r.who === "世帯主");
  const headTotalWan = toNumber(headRow?.totalIncomeWan, 0);
  const incomeOk = headTotalWan <= 500;
  const widowApplied =
    Boolean(ctx.head.widowWan) && incomeOk && !(ctx.widowDeductionCfg?.requires_no_spouse && ctx.spouseEnabled);
  const singleParentApplied =
    Boolean(ctx.head.singleParentWan) && incomeOk && !(ctx.singleParentDeductionCfg?.requires_no_spouse && ctx.spouseEnabled);
  return {
    widow: {
      itWan: widowApplied ? toNumber(ctx.widowDeductionCfg?.amount_it_wan, 0) : 0,
      ltWan: widowApplied ? toNumber(ctx.widowDeductionCfg?.amount_lt_wan, 0) : 0,
    },
    singleParent: {
      itWan: singleParentApplied ? toNumber(ctx.singleParentDeductionCfg?.amount_it_wan, 0) : 0,
      ltWan: singleParentApplied ? toNumber(ctx.singleParentDeductionCfg?.amount_lt_wan, 0) : 0,
    },
  };
}

function getDisabilityDeductionWan(ctx, col, kind) {
  const it = ctx.disabilityDeductionCfg?.it_wan || {};
  const lt = ctx.disabilityDeductionCfg?.lt_wan || {};
  const table = kind === "it" ? it : lt;
  const amt = (k) => toNumber(table?.[k], 0);
  if (!col) return 0;
  const who = String(col.who || "");

  if (who === "世帯主") {
    if (!ctx.head.disabled) return 0;
    return ctx.head.disabilityKind === "special" ? amt("special") : amt("disabled");
  }
  if (who === "配偶者") {
    if (!ctx.spouseEnabled || !ctx.spouse.disabled) return 0;
    return ctx.spouse.disabilityKind === "special" ? amt("cohab_special") : amt("disabled");
  }
  if (who.startsWith("子ども")) {
    const idx = Number(who.replace("子ども", "")) - 1;
    const c = ctx.children[idx];
    if (!c || !c.disabled) return 0;
    if (c.specialDisabled && c.cohabit) return amt("cohab_special");
    if (c.specialDisabled) return amt("special");
    return amt("disabled");
  }
  return 0;
}

function getDisabilityDeductionForTaxpayerWan(ctx, col, kind, rows) {
  if (!col) return 0;
  const who = String(col?.who || "");
  const depMaxWan = 58;
  const findRow = (w) => (Array.isArray(rows) ? rows.find((r) => String(r?.who || "") === String(w)) : null);
  const isDep = (w) => {
    const r = findRow(w);
    return r ? toNumber(r?.totalIncomeWan, 0) <= depMaxWan : false;
  };

  if (who === "世帯主") {
    let sum = 0;
    sum += getDisabilityDeductionWan(ctx, findRow("世帯主") || col, kind);
    if (ctx.spouseEnabled && isDep("配偶者")) sum += getDisabilityDeductionWan(ctx, findRow("配偶者"), kind);
    for (const r of rows) {
      const w = String(r?.who || "");
      if (!w.startsWith("子ども")) continue;
      if (!isDep(w)) continue;
      sum += getDisabilityDeductionWan(ctx, r, kind);
    }
    return sum;
  }
  if (who === "配偶者") {
    if (!ctx.spouseEnabled) return 0;
    return isDep("配偶者") ? 0 : getDisabilityDeductionWan(ctx, col, kind);
  }
  if (who.startsWith("子ども")) return isDep(who) ? 0 : getDisabilityDeductionWan(ctx, col, kind);
  return 0;
}

function getTaxable(ctx, col, kind, rows, headDedCommonWithKin) {
  const total = toNumber(col?.totalIncomeWan, 0);
  const basic = kind === "it" ? toNumber(col?.basicITWan, 0) : toNumber(col?.basicLTWan, 0);
  const social = toNumber(col?.socialWan, 0);
  const ws = Boolean(col?.workingStudent) ? (kind === "it" ? ctx.wsAmtIT : ctx.wsAmtLT) : 0;
  const dis = getDisabilityDeductionForTaxpayerWan(ctx, col, kind, rows);
  if (String(col?.who || "") !== "世帯主") return Math.max(0, total - basic - social - ws - dis);
  return Math.max(0, total - basic - social - ws - dis - toNumber(headDedCommonWithKin, 0));
}

function getTax(ctx, taxableWan, kind) {
  return interpTableValue(ctx.taxTableStatic, "taxable", taxableWan, kind === "it" ? "tax_it" : "tax_lt");
}

function getResidentIncomeLevyWan(taxLTWan) {
  const rate = 0.6;
  const incomeLevy10 = Math.max(0, toNumber(taxLTWan, 0) - 0.5);
  return incomeLevy10 * rate;
}

function calcBasicDisabilityPensionYenFor(ctx, who, totalIncomeWan) {
  const w = String(who || "");
  const headBase =
    ctx.head.basicDisabilityPensionGrade === "1" ? 1039625 : ctx.head.basicDisabilityPensionGrade === "2" ? 1036625 : 0;
  const spouseBase =
    ctx.spouse.basicDisabilityPensionGrade === "1"
      ? 1039625
      : ctx.spouse.basicDisabilityPensionGrade === "2"
        ? 1036625
        : 0;

  const incomeTotalYen = Math.round(toNumber(totalIncomeWan, 0) * 10000);
  const pre20 =
    w === "世帯主"
      ? Boolean(ctx.head.basicDisabilityPensionPre20)
      : w === "配偶者"
        ? Boolean(ctx.spouse.basicDisabilityPensionPre20)
        : false;
  const factor = !pre20 ? 1 : incomeTotalYen >= 4794001 ? 0 : incomeTotalYen >= 3761001 ? 0.5 : 1;

  if (w === "世帯主") {
    if (!ctx.head.disabled || headBase === 0) return 0;
    const n = ctx.children.filter((c) => toNumber(c?.age, 0) < 18).length;
    const add = 239300 * Math.min(n, 2) + 79800 * Math.max(n - 2, 0);
    return Math.round((headBase + add) * factor);
  }
  if (w === "配偶者") {
    if (!ctx.spouseEnabled || !ctx.spouse.disabled || spouseBase === 0) return 0;
    return Math.round(spouseBase * factor);
  }
  return 0;
}

function calcLimitFuyoInfo(ctx, rows) {
  const cols = Array.isArray(rows) ? rows : [];
  const spouseRow = cols.find((r) => String(r?.who || "") === "配偶者");
  const maxIncome = toNumber(ctx.dependentDeductionCfg?.dependent_total_income_max_wan, 0);
  const spouseMax = toNumber(ctx.spouseDeductionITCfg?.spouse_total_income_max_wan, 0);
  const spouseIsTarget = ctx.spouseEnabled && spouseRow ? toNumber(spouseRow?.totalIncomeWan, 0) <= spouseMax : false;

  const dependents = [];
  if (spouseIsTarget) dependents.push(spouseRow);
  for (const r of cols) {
    if (!String(r?.who || "").startsWith("子ども")) continue;
    if (toNumber(r?.totalIncomeWan, 0) > maxIncome) continue;
    dependents.push(r);
  }

  const statutoryAddYen = dependents.reduce((sum, r) => {
    const age = toNumber(r?.age, 0);
    return sum + (age >= 19 && age < 23 ? 250000 : 0) + (age >= 70 ? 100000 : 0);
  }, 0);

  return { count: dependents.length, statutoryAddYen, dependents };
}

function calcLegacyDisabilityAddedFuyoCount(ctx, rows) {
  const info = calcLimitFuyoInfo(ctx, rows);
  const headRow = Array.isArray(rows) ? rows.find((r) => String(r?.who || "") === "世帯主") : null;
  const addForHead = (row) => (Boolean(row?.disabled) ? 1 : 0);
  const addForFamily = (row) => {
    if (!Boolean(row?.disabled)) return 0;
    if (!Boolean(row?.tccaSpecial)) return 1;
    return Boolean(row?.cohabit) ? 2 : 1;
  };
  let add = addForHead(headRow);
  for (const r of info.dependents) add += addForFamily(r);
  return info.count + add;
}

function calcTccaComputedLocal(ctx, cols, spSpLT) {
  if (!cols || cols.length === 0) return null;
  const headRow = cols.find((r) => r.who === "世帯主");
  const spouseRow = cols.find((r) => r.who === "配偶者");
  const headTotalWan = toNumber(headRow?.totalIncomeWan, 0);
  const spouseTotalWan = toNumber(spouseRow?.totalIncomeWan, 0);

  const incomeLimitYen = (kind, fuyoCount, statutoryAddYen = 0) => {
    const n = Math.max(0, Math.trunc(toNumber(fuyoCount, 0)));
    const add = Math.max(0, Math.trunc(toNumber(statutoryAddYen, 0)));
    if (kind === "head") {
      const base = [4596000, 4976000, 5356000, 5736000];
      if (n <= 3) return base[n] + add;
      return base[3] + 380000 * (n - 3) + add;
    }
    const base = [6287000, 6536000, 6749000, 6962000];
    if (n <= 3) return base[n] + add;
    return base[3] + 213000 * (n - 3) + add;
  };

  const tccaDisWan = (who) => {
    const r = cols.find((x) => String(x?.who || "") === String(who || ""));
    return toNumber(r?.tccaDisWan, 0);
  };
  const isChildDep = (who) => {
    const r = cols.find((x) => String(x?.who || "") === String(who));
    return r ? toNumber(r?.totalIncomeWan, 0) <= 58 : false;
  };

  const limitFuyoInfo = calcLimitFuyoInfo(ctx, cols);
  const fuyoCount = toNumber(limitFuyoInfo.count, 0);
  const legacyFuyoCount = calcLegacyDisabilityAddedFuyoCount(ctx, cols);
  const headLimitYen = incomeLimitYen("head", fuyoCount, limitFuyoInfo.statutoryAddYen);
  const familyLimitYen = incomeLimitYen("family", fuyoCount, limitFuyoInfo.statutoryAddYen);

  const employmentIncomeDeductWan = 10;
  const socialFixedWan = 8;
  const otherDedWan = toNumber(headRow?.otherDedWan, 0);

  const spouseSpecialWan = ctx.spouseEnabled && headRow && spouseRow ? toNumber(spSpLT, 0) : 0;
  let specialDependentCount = 0;
  for (const r of cols) {
    if (!String(r?.who || "").startsWith("子ども")) continue;
    const age = toNumber(r?.age, 0);
    if (age < 19 || age > 22) continue;
    if (!isChildDep(r?.who)) continue;
    specialDependentCount += 1;
  }
  const specialDependentDedWan = 25 * specialDependentCount;

  const hasDependentChild = cols.some((r) => String(r?.who || "").startsWith("子ども") && isChildDep(r?.who));
  const headIncomeOk = headTotalWan <= 500;
  const widowApplied =
    headIncomeOk && Boolean(headRow?.widowWan) && !(ctx.widowDeductionCfg?.requires_no_spouse && ctx.spouseEnabled);
  const singleParentApplied =
    headIncomeOk &&
    Boolean(headRow?.singleParentWan) &&
    !(ctx.singleParentDeductionCfg?.requires_no_spouse && ctx.spouseEnabled);
  const widowWan = hasDependentChild && widowApplied ? 27 : 0;
  const singleParentWan = hasDependentChild && singleParentApplied ? 35 : 0;
  const workingStudentWan = Boolean(headRow?.workingStudent) ? 27 : 0;

  const spouseMaxForDep = toNumber(ctx.spouseDeductionITCfg?.spouse_total_income_max_wan, 58);
  const spouseIsDep = ctx.spouseEnabled && spouseRow ? toNumber(spouseRow?.totalIncomeWan, 0) <= spouseMaxForDep : false;
  let disabilityDedWan = 0;
  disabilityDedWan += tccaDisWan("世帯主");
  if (spouseIsDep) disabilityDedWan += tccaDisWan("配偶者");
  for (const r of cols) {
    const who = String(r?.who || "");
    if (!who.startsWith("子ども")) continue;
    if (!isChildDep(who)) continue;
    disabilityDedWan += tccaDisWan(who);
  }

  const headDedSumWan =
    employmentIncomeDeductWan +
    socialFixedWan +
    otherDedWan +
    spouseSpecialWan +
    specialDependentDedWan +
    widowWan +
    singleParentWan +
    workingStudentWan +
    disabilityDedWan;
  const headAdjustedWan = Math.max(0, headTotalWan - headDedSumWan);

  const familyByWho = new Map();
  const addFamily = (who, totalWan, wsWan, disWan) => {
    const dedSumWan = employmentIncomeDeductWan + socialFixedWan + wsWan + disWan;
    const adjustedWan = Math.max(0, toNumber(totalWan, 0) - dedSumWan);
    familyByWho.set(String(who), {
      who: String(who),
      totalWan: toNumber(totalWan, 0),
      employmentIncomeDeductWan,
      socialFixedWan,
      wsWan,
      disWan,
      dedSumWan,
      adjustedWan,
      adjustedYen: Math.round(adjustedWan * 10000),
    });
  };
  if (ctx.spouseEnabled && spouseRow) {
    addFamily("配偶者", spouseTotalWan, Boolean(spouseRow?.workingStudent) ? 27 : 0, spouseIsDep ? 0 : tccaDisWan("配偶者"));
  }
  for (const r of cols) {
    const who = String(r?.who || "");
    if (!who.startsWith("子ども")) continue;
    addFamily(who, toNumber(r?.totalIncomeWan, 0), Boolean(r?.workingStudent) ? 27 : 0, isChildDep(who) ? 0 : tccaDisWan(who));
  }
  const familyTargets = Array.from(familyByWho.values());
  const familyMaxAdjustedYen = familyTargets.length ? Math.max(...familyTargets.map((x) => x.adjustedYen)) : 0;

  const gradeToMonthlyYen = (g) => (g === "1" ? 56800 : g === "2" ? 37830 : 0);
  const baseMonthlyYen = cols
    .filter((r) => String(r?.who || "").startsWith("子ども"))
    .reduce((a, r) => {
      const age = toNumber(r?.age, 0);
      if (age >= 20) return a;
      const g = String(r?.tccaGrade || "not");
      if (g === "not") return a;
      return a + gradeToMonthlyYen(g);
    }, 0);

  const headOk = Math.round(headAdjustedWan * 10000) <= headLimitYen;
  const familyOk = familyMaxAdjustedYen <= familyLimitYen;
  const totalMonthlyYen = headOk && familyOk ? baseMonthlyYen : 0;

  return {
    fuyoCount,
    limitFuyoCount: fuyoCount,
    legacyFuyoCount,
    limitFuyoStatutoryAddYen: toNumber(limitFuyoInfo.statutoryAddYen, 0),
    limits: { headLimitYen, familyLimitYen },
    head: {
      totalWan: headTotalWan,
      employmentIncomeDeductWan,
      socialFixedWan,
      otherDedWan,
      spouseSpecialWan,
      specialDependentCount,
      specialDependentDedWan,
      hasDependentChild,
      widowWan,
      singleParentWan,
      workingStudentWan,
      disabilityDedWan,
      dedSumWan: headDedSumWan,
      adjustedWan: headAdjustedWan,
      adjustedYen: Math.round(headAdjustedWan * 10000),
    },
    familyByWho,
    familyMaxAdjustedYen,
    totalMonthlyYen,
  };
}

function calcWelfareAllowanceLimitSelfYen(fuyoCount) {
  const n = Math.max(0, Math.trunc(toNumber(fuyoCount, 0)));
  const base = [3661000, 4041000, 4421000, 4801000];
  if (n <= 3) return base[n];
  return base[3] + 380000 * (n - 3);
}

function calcWelfareAllowanceLimitObligorYen(fuyoCount) {
  const n = Math.max(0, Math.trunc(toNumber(fuyoCount, 0)));
  const base0to4 = [6287000, 6536000, 6749000, 6962000, 7175000];
  if (n <= 4) return base0to4[n];
  const base5 = base0to4[4] + 213000;
  return base5 + 213000 * (n - 5);
}

function computePoint(ctx, x) {
  const rows = buildRows(ctx, x);
  const dep = calcDependentDeductionFromRows(ctx, rows);
  const kin = calcSpecialKinDeductionFromRows(ctx, rows);
  const spIT = calcSpouseDeductionFromRows(ctx, ctx.spouseDeductionITCfg, rows);
  const spLT = calcSpouseDeductionFromRows(ctx, ctx.spouseDeductionLTCfg, rows);
  const spSpIT = calcSpouseSpecialDeductionFromRows(ctx, ctx.spouseSpecialDeductionITCfg, spIT, rows);
  const spSpLT = calcSpouseSpecialDeductionFromRows(ctx, ctx.spouseSpecialDeductionLTCfg, spLT, rows);
  const ws = calcWidowSingleParent(ctx, rows);

  const headRow = rows.find((r) => r.who === "世帯主");
  const headDedCommonIT =
    toNumber(ws.widow.itWan, 0) +
    toNumber(ws.singleParent.itWan, 0) +
    (Boolean(headRow?.workingStudent) ? ctx.wsAmtIT : 0) +
    toNumber(headRow?.otherDedWan, 0) +
    toNumber(spIT, 0) +
    toNumber(spSpIT, 0) +
    toNumber(dep.itWan, 0);
  const headDedCommonLT =
    toNumber(ws.widow.ltWan, 0) +
    toNumber(ws.singleParent.ltWan, 0) +
    (Boolean(headRow?.workingStudent) ? ctx.wsAmtLT : 0) +
    toNumber(headRow?.otherDedWan, 0) +
    toNumber(spLT, 0) +
    toNumber(spSpLT, 0) +
    toNumber(dep.ltWan, 0);
  const headDedCommonITWithKin = headDedCommonIT + toNumber(kin.itWan, 0);
  const headDedCommonLTWithKin = headDedCommonLT + toNumber(kin.ltWan, 0);

  let socialWanTotal = 0;
  let taxWanTotal = 0;
  const levyByWho = new Map();
  const byWho = new Map(rows.map((r) => [String(r.who), r]));
  for (const r of rows) {
    socialWanTotal += toNumber(r.socialWan, 0);
    const taxableIT = getTaxable(ctx, r, "it", rows, headDedCommonITWithKin);
    const taxableLT = getTaxable(ctx, r, "lt", rows, headDedCommonLTWithKin);
    const taxIT = getTax(ctx, taxableIT, "it");
    const taxLT = getTax(ctx, taxableLT, "lt");
    taxWanTotal += toNumber(taxIT, 0) + toNumber(taxLT, 0);
    levyByWho.set(String(r.who), {
      who: String(r.who),
      age: toNumber(r.age, 0),
      levyWan: getResidentIncomeLevyWan(taxLT),
    });
  }

  const householdLevySumWan = Array.from(levyByWho.values()).reduce((a, v) => a + toNumber(v.levyWan, 0), 0);
  const levySumWanFor = (who) => {
    const w = String(who);
    const r = levyByWho.get(w);
    if (!r) return 0;
    const age = toNumber(r.age, 0);
    if (w.startsWith("子ども") && age >= 18) return toNumber(r.levyWan, 0);
    if (age >= 18) {
      if (w === "世帯主") {
        const sp = ctx.spouseEnabled ? toNumber(levyByWho.get("配偶者")?.levyWan, 0) : 0;
        return toNumber(r.levyWan, 0) + sp;
      }
      if (w === "配偶者") {
        const hd = toNumber(levyByWho.get("世帯主")?.levyWan, 0);
        return toNumber(r.levyWan, 0) + hd;
      }
      return toNumber(r.levyWan, 0);
    }
    return householdLevySumWan;
  };
  const monthlyFeeYen = (sumLevyWan, age) => {
    const s = toNumber(sumLevyWan, 0);
    const a = toNumber(age, 0);
    if (s <= 0) return 0;
    if (a >= 18) return s < 16 ? 9300 : 37200;
    if (a >= 3 && a <= 5) return 0;
    return s < 28 ? 4600 : 37200;
  };
  let serviceFeeMonthlyYenTotal = 0;
  for (const r of rows) {
    if (!Boolean(byWho.get(String(r.who))?.disabled)) continue;
    serviceFeeMonthlyYenTotal += monthlyFeeYen(levySumWanFor(r.who), r.age);
  }
  const serviceFeeWanTotal = (serviceFeeMonthlyYenTotal * 12) / 10000;

  const basicPensionWan = (() => {
    const headYen = calcBasicDisabilityPensionYenFor(ctx, "世帯主", toNumber(byWho.get("世帯主")?.totalIncomeWan, 0));
    const spouseYen = ctx.spouseEnabled
      ? calcBasicDisabilityPensionYenFor(ctx, "配偶者", toNumber(byWho.get("配偶者")?.totalIncomeWan, 0))
      : 0;
    return (headYen + spouseYen) / 10000;
  })();

  const tcca = calcTccaComputedLocal(ctx, rows, spSpLT);
  const tccaAnnualWan = (toNumber(tcca?.totalMonthlyYen, 0) * 12) / 10000;
  const fuyo = toNumber(tcca?.fuyoCount, 0);
  const legacyFuyo = toNumber(tcca?.legacyFuyoCount ?? tcca?.fuyoCount, 0);

  const WELFARE_CHILD_MONTHLY_YEN = 16100;
  const TOKUBETSU_MONTHLY_YEN = 29590;
  const limitSelfYen = calcWelfareAllowanceLimitSelfYen(0);
  const limitObligorYen = calcWelfareAllowanceLimitObligorYen(fuyo);
  const obligorCols = [rows.find((r) => r.who === "世帯主"), ctx.spouseEnabled ? rows.find((r) => r.who === "配偶者") : null].filter(Boolean);
  const calcWelfareDisabilityDeductionWan = (col, mode) => {
    const who = String(col?.who || "");
    const selfDisWan = toNumber(col?.welfareDisWan, 0);
    const depMaxWan = 58;
    const isDepLike = (w) => {
      const rr = rows.find((xx) => String(xx?.who || "") === String(w));
      return rr ? toNumber(rr?.totalIncomeWan, 0) <= depMaxWan : false;
    };
    const depDisWan = (() => {
      if (who !== "世帯主") return 0;
      let sum = 0;
      if (ctx.spouseEnabled && isDepLike("配偶者")) {
        const rr = rows.find((xx) => String(xx?.who || "") === "配偶者");
        sum += toNumber(rr?.welfareDisWan, 0);
      }
      for (const rr of rows) {
        const w = String(rr?.who || "");
        if (!w.startsWith("子ども")) continue;
        if (!isDepLike(w)) continue;
        sum += toNumber(rr?.welfareDisWan, 0);
      }
      return sum;
    })();
    if (mode === "obligor") return depDisWan + selfDisWan;
    return depDisWan;
  };
  const calcWelfareAdjustedIncomeYen = (col, mode = "self") => {
    const totalWan = toNumber(col?.totalIncomeWan, 0);
    if (mode === "obligor") {
      const allowanceTotalWan = totalWan + toNumber(col?.incomeAdjWan, 0);
      const deductionsWan = 10 + 8 + calcWelfareDisabilityDeductionWan(col, mode);
      return Math.round(Math.max(0, allowanceTotalWan - deductionsWan) * 10000);
    }
    const who = String(col?.who || "");
    const headRow2 = rows.find((rr) => rr.who === "世帯主");
    const headTotalForLimitWan = toNumber(headRow2?.totalIncomeWan, 0);
    const headIncomeOk = headTotalForLimitWan <= 500;
    const otherDedWan = who === "世帯主" ? toNumber(headRow2?.otherDedWan, 0) : 0;
    const spouseSpecialWan = who === "世帯主" ? toNumber(spSpIT, 0) : 0;
    const socialWan = toNumber(col?.socialWan, 0);
    const widowWan =
      who === "世帯主" &&
      headIncomeOk &&
      toNumber(headRow2?.widowWan, 0) &&
      !(ctx.widowDeductionCfg?.requires_no_spouse && ctx.spouseEnabled)
        ? 27
        : 0;
    const singleParentWan =
      who === "世帯主" &&
      headIncomeOk &&
      toNumber(headRow2?.singleParentWan, 0) &&
      !(ctx.singleParentDeductionCfg?.requires_no_spouse && ctx.spouseEnabled)
        ? 35
        : 0;
    const wsWan = Boolean(col?.workingStudent) ? 27 : 0;
    const disWan = calcWelfareDisabilityDeductionWan(col, mode);
    const deductionsWan = otherDedWan + spouseSpecialWan + socialWan + widowWan + singleParentWan + wsWan + disWan;
    return Math.round(Math.max(0, totalWan - deductionsWan) * 10000);
  };
  const obligorMaxYen = obligorCols.length ? Math.max(...obligorCols.map((o) => calcWelfareAdjustedIncomeYen(o, "obligor"))) : 0;
  const obligorOk = obligorMaxYen <= limitObligorYen;

  const recipients = rows
    .map((c) => {
      const age = toNumber(c?.age, 0);
      const who = String(c?.who || "");
      const idx = who.startsWith("子ども") ? Number(who.replace("子ども", "")) - 1 : -1;
      const cc = idx >= 0 ? ctx.children?.[idx] : null;
      const isWelfareChild =
        age < 20 &&
        (who === "世帯主"
          ? Boolean(ctx.head.childWelfareAllowance)
          : who === "配偶者"
            ? Boolean(ctx.spouse.childWelfareAllowance)
            : Boolean(cc?.childWelfareAllowance));
      const isTokubetsu =
        age >= 20 &&
        (who === "世帯主"
          ? Boolean(ctx.head.tokubetsuAllowance)
          : who === "配偶者"
            ? Boolean(ctx.spouse.tokubetsuAllowance)
            : Boolean(cc?.tokubetsuAllowance));
      if (!isWelfareChild && !isTokubetsu) return null;
      const type = isWelfareChild ? "child" : "adult";
      const selfYen = calcWelfareAdjustedIncomeYen(c, "self");
      const selfOk = selfYen <= limitSelfYen;
      const ok = selfOk && obligorOk;
      const monthlyYen = ok ? (type === "child" ? WELFARE_CHILD_MONTHLY_YEN : TOKUBETSU_MONTHLY_YEN) : 0;
      return { type, ok, monthlyYen };
    })
    .filter(Boolean);
  const welfareMonthly = recipients.reduce((a, r) => a + toNumber(r.monthlyYen, 0), 0);
  const welfareAnnualWan = (welfareMonthly * 12) / 10000;

  const childSupportAnnualWan = (() => {
    const isSingleParent = Boolean(ctx.head.singleParentWan) && !ctx.spouseEnabled;
    if (!isSingleParent) return 0;
    const idx = Math.min(5, Math.max(0, Math.trunc(toNumber(legacyFuyo, 0))));
    const h = tcca?.head || {};
    const totalWan = toNumber(h.totalWan, 0);
    const dedSumWan = toNumber(h.dedSumWan, 0);
    const dedSumNo =
      Math.max(0, dedSumWan - toNumber(h.widowWan, 0) - toNumber(h.singleParentWan, 0) - toNumber(h.spouseSpecialWan, 0) - toNumber(h.specialDependentDedWan, 0));
    const adjustedWan = Math.max(0, totalWan - dedSumNo);
    const incomeYen = Math.round(adjustedWan * 10000);
    const fullLimitWanByFuyo = [68, 106, 144, 183, 220, 259];
    const partialLimitWanByFuyo = [208, 246, 284, 322, 260, 398];
    const fullLimitYen = Math.round((fullLimitWanByFuyo[idx] ?? fullLimitWanByFuyo[5]) * 10000);
    const partialLimitYen = Math.round((partialLimitWanByFuyo[idx] ?? partialLimitWanByFuyo[5]) * 10000);
    const status = incomeYen <= fullLimitYen ? "満額" : incomeYen <= partialLimitYen ? "一部" : "対象外";
    const eligibleChildren = ctx.children.filter((c) => {
      const age = toNumber(c?.age, 0);
      return age < 19 || (Boolean(c?.disabled) && age < 20);
    });
    const n = eligibleChildren.length;
    if (n === 0 || status === "対象外") return 0;
    if (status === "満額") return (46690 + Math.max(0, n - 1) * 11030) * 12 / 10000;
    const delta = Math.max(0, incomeYen - fullLimitYen);
    const first = Math.max(0, 46690 - (delta * 0.0256619 + 10));
    const add = Math.max(0, 11030 - (delta * 0.0039568 + 10));
    return Math.round(first + Math.max(0, n - 1) * add) * 12 / 10000;
  })();

  const childAllowanceAnnualWan = (() => {
    const kids = ctx.children
      .map((c, i) => ({ ...c, __idx: i, age: toNumber(c?.age, 0) }))
      .filter((c) => c.age < 18)
      .sort((a, b) => b.age - a.age || a.__idx - b.__idx);
    let monthly = 0;
    for (let i = 0; i < kids.length; i++) {
      const c = kids[i];
      const order = i + 1;
      if (order >= 3) {
        monthly += 30000;
        continue;
      }
      if (c.age <= 2) monthly += 15000;
      else monthly += 10000;
    }
    return (monthly * 12) / 10000;
  })();

  const allowanceWanTotal =
    toNumber(basicPensionWan, 0) +
    toNumber(tccaAnnualWan, 0) +
    toNumber(welfareAnnualWan, 0) +
    toNumber(childSupportAnnualWan, 0) +
    toNumber(childAllowanceAnnualWan, 0);

  const grossWan = rows.reduce((a, r) => a + toNumber(r.salaryWan, 0) + toNumber(r.otherIncomeWan, 0), 0);
  const takeHomeWan = grossWan - toNumber(socialWanTotal, 0) - toNumber(taxWanTotal, 0);
  const disposableWan = toNumber(takeHomeWan, 0) + toNumber(allowanceWanTotal, 0) - toNumber(serviceFeeWanTotal, 0);
  const expTax = -toNumber(taxWanTotal, 0);
  const expSocial = -toNumber(socialWanTotal, 0);
  const expService = -toNumber(serviceFeeWanTotal, 0);
  const totalPlusWan = toNumber(grossWan, 0) + toNumber(allowanceWanTotal, 0);

  return {
    x,
    gross: grossWan,
    allowance: allowanceWanTotal,
    takeHome: takeHomeWan,
    disposable: disposableWan,
    householdLevySumWan,
    levyByWho: Array.from(levyByWho.values()),
    expTax,
    expSocial,
    expService,
    service: toNumber(serviceFeeWanTotal, 0),
    tax: toNumber(taxWanTotal, 0),
    social: toNumber(socialWanTotal, 0),
    totalPlus: totalPlusWan,
  };
}
