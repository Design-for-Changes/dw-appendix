import { rowAtKeyInt } from "./tableUtils.js";

const DEFAULT_SWEEP = { min: 1, max: 1500, step: 1 };
export const M01_KENSHIN_ANNUAL_YEN_DEFAULT = 149531;
export const M01_KENSHIN_ANNUAL_YEN_RANGE = { min: 149531, max: 167929 };
export const M01_LEVY_CUTOFF_YEN = 235000;
export const RAW_TSUSHO_CHILD_MONTHLY_YEN = 10406;
export const N04_SHOGAKU_ANNUAL_YEN = { first: 72945, second: 36473, third: 0 };
export const N04_BOUNDARY_1_2_SALARY_MANYEN = 747;
export const N04_BOUNDARY_2_3_SALARY_MANYEN = 1055;

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

function roundWan(v, digits = 4) {
  const m = 10 ** digits;
  return Math.round(toNumber(v, 0) * m) / m;
}

function compactDeductions(items) {
  return (Array.isArray(items) ? items : [])
    .map((item) => ({ ...item, wan: roundWan(item?.wan, 4) }))
    .filter((item) => Boolean(item?.alwaysShow) || Math.abs(toNumber(item?.wan, 0)) > 1e-9)
    .map(({ alwaysShow, ...item }) => item);
}

export function buildHousehold(caseHousehold = {}) {
  const headInput = caseHousehold.head || {};
  const spouseInput = caseHousehold.spouse || {};
  const childrenInput = Array.isArray(caseHousehold.children) ? caseHousehold.children : [];
  const programsInput = caseHousehold.programs || {};

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
    programs: {
      m01: Boolean(caseHousehold.m01 || caseHousehold.m01Enabled || programsInput.m01 || programsInput.m01Enabled),
      m01AnnualYen: toNumber(programsInput.m01AnnualYen, M01_KENSHIN_ANNUAL_YEN_DEFAULT),
      m01Count: Math.max(1, Math.trunc(toNumber(programsInput.m01Count, 1))),
      n04: Boolean(caseHousehold.n04 || caseHousehold.n04Enabled || programsInput.n04 || programsInput.n04Enabled),
      n04Count: Math.max(1, Math.trunc(toNumber(programsInput.n04Count, 1))),
      n04Boundary12SalaryManyen: toNumber(programsInput.n04Boundary12SalaryManyen, N04_BOUNDARY_1_2_SALARY_MANYEN),
      n04Boundary23SalaryManyen: toNumber(programsInput.n04Boundary23SalaryManyen, N04_BOUNDARY_2_3_SALARY_MANYEN),
    },
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

function describeEmploymentIncomeDeduction(salaryWan, scenarioKey, tableWan, incomeAdjustmentWan) {
  const s = Math.max(0, toNumber(salaryWan, 0));
  const skey = normalizeScenario(scenarioKey);
  const baseWan = toNumber(tableWan, 0);
  const minByScenario = {
    s1: { amountWan: 55, upperWan: 162, bracketLabel: "162万円以下" },
    s2: { amountWan: 65, upperWan: 190, bracketLabel: "190万円以下" },
    s3: { amountWan: 74, upperWan: 220, bracketLabel: "220万円以下" },
  };
  const min = minByScenario[skey] || minByScenario.s2;
  let detail;
  if (s <= 0) {
    detail = {
      bracketLabel: "0円",
      rate: 0,
      interceptWan: 0,
      capWan: null,
      isCapped: false,
      formula: "給与収入0のため給与所得控除0",
      formulaValueWan: 0,
    };
  } else if (s <= min.upperWan) {
    detail = {
      bracketLabel: min.bracketLabel,
      rate: 0,
      interceptWan: min.amountWan,
      capWan: null,
      isCapped: false,
      formula: `${min.amountWan}万円(最低保障)`,
      formulaValueWan: min.amountWan,
    };
  } else if (s <= 180) {
    detail = {
      bracketLabel: "162万円超180万円以下",
      rate: 0.4,
      interceptWan: -10,
      capWan: null,
      isCapped: false,
      formula: "収入×0.40 − 10万円",
      formulaValueWan: roundWan(s * 0.4 - 10, 4),
    };
  } else if (s < 360) {
    detail = {
      bracketLabel: "180万円超360万円未満",
      rate: 0.3,
      interceptWan: 8,
      capWan: null,
      isCapped: false,
      formula: "収入×0.30 + 8万円",
      formulaValueWan: roundWan(s * 0.3 + 8, 4),
    };
  } else if (s < 660) {
    detail = {
      bracketLabel: "360万円以上660万円未満",
      rate: 0.2,
      interceptWan: 44,
      capWan: null,
      isCapped: false,
      formula: "収入×0.20 + 44万円",
      formulaValueWan: roundWan(s * 0.2 + 44, 4),
    };
  } else if (s <= 850) {
    detail = {
      bracketLabel: "660万円以上850万円以下",
      rate: 0.1,
      interceptWan: 110,
      capWan: 195,
      isCapped: false,
      formula: "収入×0.10 + 110万円",
      formulaValueWan: roundWan(s * 0.1 + 110, 4),
    };
  } else {
    detail = {
      bracketLabel: "850万円超",
      rate: 0.1,
      interceptWan: 110,
      capWan: 195,
      isCapped: true,
      rawFormulaWan: roundWan(s * 0.1 + 110, 4),
      formula: "min(195万円, 収入×0.10 + 110万円)",
      formulaValueWan: 195,
    };
  }
  return {
    ...detail,
    salaryWan: s,
    roundedSalaryWan: Math.round(s),
    tableValueWan: baseWan,
    incomeAdjustmentDeductionWan: toNumber(incomeAdjustmentWan, 0),
    totalDeductionWan: baseWan + toNumber(incomeAdjustmentWan, 0),
    employmentIncomeWan: Math.max(0, s - baseWan - toNumber(incomeAdjustmentWan, 0)),
    source: "emp_deduction.json + embedded bracket metadata",
  };
}

const SOCIAL_FIXED_ANNUAL_YEN = {
  s1: { u40: [131354, 137342, 143330], o40: [136922, 143870, 150818] },
  s2: { u40: [131111, 137057, 143003], o40: [136644, 143544, 150444] },
  s3: { u40: [132152, 137750, 143798], o40: [137339, 144360, 151380] },
};
const SOCIAL_UPPER_RATE_762_1626 = {
  s1: { u40: 0.05265, o40: 0.06065 },
  s2: { u40: 0.0523, o40: 0.06025 },
  s3: { u40: 0.05315, o40: 0.06125 },
};
const SOCIAL_UPPER_1627_PLUS = {
  slope: 0.0055,
  intercept: {
    s1: { u40: 1546032, o40: 1679472 },
    s2: { u40: 1540194, o40: 1672800 },
    s3: { u40: 1554372, o40: 1689480 },
  },
};

function describeSocialInsuranceDeduction(salaryWan, age, scenarioKey, totalWan, exemptSocial) {
  const s = Math.max(0, toNumber(salaryWan, 0));
  const incomeYen = Math.round(s * 10000);
  const skey = normalizeScenario(scenarioKey);
  const ageKey = toNumber(age, 0) >= 40 ? "o40" : "u40";
  const fixed = SOCIAL_FIXED_ANNUAL_YEN[skey]?.[ageKey] || [];
  const upperRate = SOCIAL_UPPER_RATE_762_1626[skey]?.[ageKey] || 0;
  const upperIntercept = SOCIAL_UPPER_1627_PLUS.intercept[skey]?.[ageKey] || 0;
  const base = {
    salaryWan: s,
    roundedSalaryWan: Math.round(s),
    age: toNumber(age, 0),
    ageBand: ageKey,
    scenario: skey,
    totalWan: toNumber(totalWan, 0),
    source: "social_u40/social_o40 generated from bracket formulas",
  };
  if (exemptSocial) {
    return { ...base, bracketLabel: "130万円以下・被扶養扱い", rate: 0, interceptYen: 0, fixedAnnualYen: 0, formula: "130万円以下の被扶養扱いで0" };
  }
  if (incomeYen <= 0) {
    return { ...base, bracketLabel: "0円", rate: 0, interceptYen: 0, fixedAnnualYen: 0, formula: "給与収入0のため社会保険料0" };
  }
  if (incomeYen <= 756000) {
    return { ...base, bracketLabel: "75.6万円以下", rate: 0, interceptYen: 0, fixedAnnualYen: fixed[0], formula: "固定年額" };
  }
  if (incomeYen <= 876000) {
    return { ...base, bracketLabel: "75.6万円超87.6万円以下", rate: 0, interceptYen: 0, fixedAnnualYen: fixed[1], formula: "固定年額" };
  }
  if (incomeYen < 1000000) {
    return { ...base, bracketLabel: "87.6万円超100万円未満", rate: 0, interceptYen: 0, fixedAnnualYen: fixed[2], formula: "固定年額" };
  }
  if (incomeYen >= 7620000 && incomeYen <= 16260000) {
    return { ...base, bracketLabel: "762万円以上1626万円以下", rate: upperRate, interceptYen: 713700, fixedAnnualYen: null, formula: "収入×区分率 + 713,700円" };
  }
  if (incomeYen >= 16270000) {
    return { ...base, bracketLabel: "1627万円以上", rate: SOCIAL_UPPER_1627_PLUS.slope, interceptYen: upperIntercept, fixedAnnualYen: null, formula: "収入×0.0055 + 区分別切片" };
  }
  return { ...base, bracketLabel: "100万円以上762万円未満", rate: upperRate + 0.0915, interceptYen: 0, fixedAnnualYen: null, formula: "収入×(区分率 + 0.0915)" };
}

function describeBasicDeduction(kind, scenarioKey, totalIncomeWan, amountWan) {
  const income = Math.max(0, toNumber(totalIncomeWan, 0));
  const skey = normalizeScenario(scenarioKey);
  const valueWan = toNumber(amountWan, 0);
  const incomeTaxBands = {
    s1: [
      { maxWan: 2400, amountWan: 48, label: "2400万円以下" },
      { maxWan: 2450, amountWan: 32, label: "2400万円超2450万円以下" },
      { maxWan: 2500, amountWan: 16, label: "2450万円超2500万円以下" },
      { maxWan: Infinity, amountWan: 0, label: "2500万円超" },
    ],
    s2: [
      { maxWan: 132, amountWan: 95, label: "132万円以下" },
      { maxWan: 336, amountWan: 88, label: "132万円超336万円以下" },
      { maxWan: 489, amountWan: 68, label: "336万円超489万円以下" },
      { maxWan: 655, amountWan: 63, label: "489万円超655万円以下" },
      { maxWan: 2350, amountWan: 58, label: "655万円超2350万円以下" },
      { maxWan: 2400, amountWan: 48, label: "2350万円超2400万円以下" },
      { maxWan: 2450, amountWan: 32, label: "2400万円超2450万円以下" },
      { maxWan: 2500, amountWan: 16, label: "2450万円超2500万円以下" },
      { maxWan: Infinity, amountWan: 0, label: "2500万円超" },
    ],
    s3: [
      { maxWan: 489, amountWan: 104, label: "489万円以下" },
      { maxWan: 655, amountWan: 67, label: "489万円超655万円以下" },
      { maxWan: 2350, amountWan: 62, label: "655万円超2350万円以下" },
      { maxWan: 2400, amountWan: 48, label: "2350万円超2400万円以下" },
      { maxWan: 2450, amountWan: 32, label: "2400万円超2450万円以下" },
      { maxWan: 2500, amountWan: 16, label: "2450万円超2500万円以下" },
      { maxWan: Infinity, amountWan: 0, label: "2500万円超" },
    ],
  };
  const residentBands = [
    { maxWan: 2400, amountWan: 43, label: "2400万円以下" },
    { maxWan: 2450, amountWan: 29, label: "2400万円超2450万円以下" },
    { maxWan: 2500, amountWan: 15, label: "2450万円超2500万円以下" },
    { maxWan: Infinity, amountWan: 0, label: "2500万円超" },
  ];
  const bands = kind === "it" ? incomeTaxBands[skey] || incomeTaxBands.s2 : residentBands;
  const band = bands.find((b) => income <= b.maxWan) || bands[bands.length - 1];
  return {
    kind,
    scenario: kind === "it" ? skey : "common",
    totalIncomeWan: income,
    bracketLabel: band.label,
    upperIncomeWan: Number.isFinite(band.maxWan) ? band.maxWan : null,
    deductionWan: valueWan,
    formulaValueWan: band.amountWan,
    formula: `合計所得金額 ${band.label} → 基礎控除 ${band.amountWan}万円`,
    source: kind === "it" ? "basic_it.json + embedded bracket metadata" : "basic_lt.json + embedded bracket metadata",
  };
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
    employmentIncomeDeductionDetail: describeEmploymentIncomeDeduction(s, ctx.skey, empBaseWan, incomeAdjWan),
    basicDeductionDetail: {
      incomeTax: describeBasicDeduction("it", ctx.skey, totalIncomeWan, basicITWan),
      residentTax: describeBasicDeduction("lt", ctx.skey, totalIncomeWan, basicLTWan),
    },
    socialInsuranceDetail: {
      ...describeSocialInsuranceDeduction(s, age, ctx.skey, socialWan, exemptSocial),
      tableKey: ctx.socialKey,
      table: toNumber(age, 0) >= 40 ? "socialO40" : "socialU40",
      exemptUnder130: exemptSocial,
      healthWan: null,
      careWan: null,
      pensionWan: null,
      employmentWan: null,
      childSupportContributionWan: null,
    },
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

function floorTaxableWanToThousandYen(taxableWan) {
  const yen = Math.max(0, Math.floor(toNumber(taxableWan, 0) * 10000));
  return Math.floor(yen / 1000) * 1000;
}

const INCOME_TAX_BANDS = [
  { max: 1950000, rate: 0.05, deductionYen: 0 },
  { max: 3300000, rate: 0.1, deductionYen: 97500 },
  { max: 6950000, rate: 0.2, deductionYen: 427500 },
  { max: 9000000, rate: 0.23, deductionYen: 636000 },
  { max: 18000000, rate: 0.33, deductionYen: 1536000 },
  { max: 40000000, rate: 0.4, deductionYen: 2796000 },
  { max: Infinity, rate: 0.45, deductionYen: 4796000 },
];

function getIncomeTaxParts(taxableWan) {
  const taxableYen = floorTaxableWanToThousandYen(taxableWan);
  const band = INCOME_TAX_BANDS.find((b) => taxableYen <= b.max) || INCOME_TAX_BANDS[INCOME_TAX_BANDS.length - 1];
  const rawTaxYen = taxableYen * band.rate - band.deductionYen;
  const taxYen = Math.max(0, Math.round(rawTaxYen));
  return {
    taxableWan: taxableYen / 10000,
    taxableYen,
    rate: band.rate,
    deductionYen: band.deductionYen,
    rawTaxYen,
    taxYen,
    taxWan: taxYen / 10000,
  };
}

function getResidentTaxParts(taxableWan) {
  const taxableYen = floorTaxableWanToThousandYen(taxableWan);
  const rate = 0.1;
  const rawIncomeLevyYen = taxableYen * rate;
  const adjustmentDeductionYen = rawIncomeLevyYen > 0 ? 5000 : 0;
  const incomeLevyYen = Math.max(0, Math.round(rawIncomeLevyYen - adjustmentDeductionYen));
  const municipalIncomeLevyYen = Math.max(0, Math.round(incomeLevyYen * 0.6));
  const prefecturalIncomeLevyYen = Math.max(0, incomeLevyYen - municipalIncomeLevyYen);
  const perCapitaYen = incomeLevyYen > 0 ? 5000 : 0;
  const incomeLevyWan = incomeLevyYen / 10000;
  return {
    taxableWan: taxableYen / 10000,
    taxableYen,
    rate,
    rawIncomeLevyYen,
    adjustmentDeductionYen,
    incomeLevyYen,
    incomeLevyWan,
    municipalIncomeLevyYen,
    municipalIncomeLevyWan: municipalIncomeLevyYen / 10000,
    prefecturalIncomeLevyYen,
    prefecturalIncomeLevyWan: prefecturalIncomeLevyYen / 10000,
    adjustmentDeductionWan: adjustmentDeductionYen / 10000,
    perCapitaYen,
    perCapitaWan: perCapitaYen / 10000,
    totalWan: incomeLevyWan + perCapitaYen / 10000,
  };
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
  const allowanceIncomeWan = (row) => toNumber(row?.totalIncomeWan, 0) + toNumber(row?.incomeAdjWan, 0);
  const headTotalWan = allowanceIncomeWan(headRow);
  const spouseTotalWan = allowanceIncomeWan(spouseRow);

  const incomeLimitParts = (kind, fuyoCount, statutoryAddYen = 0) => {
    const n = Math.max(0, Math.trunc(toNumber(fuyoCount, 0)));
    const add = Math.max(0, Math.trunc(toNumber(statutoryAddYen, 0)));
    const isHead = kind === "head";
    const base = isHead ? [4596000, 4976000, 5356000, 5736000] : [6287000, 6536000, 6749000, 6962000];
    const stepYen = isHead ? 380000 : 213000;
    const extraCount = Math.max(0, n - 3);
    const baseYen = n <= 3 ? base[n] : base[3] + stepYen * extraCount;
    return {
      kind,
      fuyoCount: n,
      baseYen,
      statutoryAddYen: add,
      stepYen,
      extraCount,
      limitYen: baseYen + add,
      formula: n <= 3 ? "基準額テーブル + 法定加算" : "3人基準額 + 追加人数×加算単価 + 法定加算",
    };
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
  const headLimit = incomeLimitParts("head", fuyoCount, limitFuyoInfo.statutoryAddYen);
  const familyLimit = incomeLimitParts("family", fuyoCount, limitFuyoInfo.statutoryAddYen);
  const headLimitYen = headLimit.limitYen;
  const familyLimitYen = familyLimit.limitYen;

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
  const headJudgmentIncome = {
    totalWan: roundWan(headTotalWan, 4),
    deductions: compactDeductions([
      { label: "基礎控除引き上げ相当額(特児10万上限)", wan: employmentIncomeDeductWan, alwaysShow: true },
      { label: "社会保険料控除(特児8万固定)", wan: socialFixedWan, alwaysShow: true },
      { label: "その他控除", wan: otherDedWan },
      { label: "配偶者特別控除", wan: spouseSpecialWan },
      { label: "特定扶養親族控除", wan: specialDependentDedWan },
      { label: "寡婦控除", wan: widowWan },
      { label: "ひとり親控除", wan: singleParentWan },
      { label: "勤労学生控除", wan: workingStudentWan },
      { label: "障害者控除", wan: disabilityDedWan },
    ]),
    deductionSumWan: roundWan(headDedSumWan, 4),
    adjustedWan: roundWan(headAdjustedWan, 4),
    adjustedYen: Math.round(headAdjustedWan * 10000),
    formula: "総所得 − 控除合計 = 判定所得",
  };

  const familyByWho = new Map();
  const addFamily = (who, totalWan, wsWan, disWan) => {
    const dedSumWan = employmentIncomeDeductWan + socialFixedWan + wsWan + disWan;
    const adjustedWan = Math.max(0, toNumber(totalWan, 0) - dedSumWan);
    const judgmentIncome = {
      totalWan: roundWan(totalWan, 4),
      deductions: compactDeductions([
        { label: "基礎控除引き上げ相当額(特児10万上限)", wan: employmentIncomeDeductWan, alwaysShow: true },
        { label: "社会保険料控除(特児8万固定)", wan: socialFixedWan, alwaysShow: true },
        { label: "勤労学生控除", wan: wsWan },
        { label: "障害者控除", wan: disWan },
      ]),
      deductionSumWan: roundWan(dedSumWan, 4),
      adjustedWan: roundWan(adjustedWan, 4),
      adjustedYen: Math.round(adjustedWan * 10000),
      formula: "総所得 − 控除合計 = 判定所得",
    };
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
      judgmentIncome,
      limit: familyLimit,
    });
  };
  if (ctx.spouseEnabled && spouseRow) {
    addFamily("配偶者", spouseTotalWan, Boolean(spouseRow?.workingStudent) ? 27 : 0, spouseIsDep ? 0 : tccaDisWan("配偶者"));
  }
  for (const r of cols) {
    const who = String(r?.who || "");
    if (!who.startsWith("子ども")) continue;
    addFamily(who, allowanceIncomeWan(r), Boolean(r?.workingStudent) ? 27 : 0, isChildDep(who) ? 0 : tccaDisWan(who));
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
    limits: { headLimitYen, familyLimitYen, head: headLimit, family: familyLimit },
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
      judgmentIncome: headJudgmentIncome,
      limit: headLimit,
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

function calcM01Detail(ctx, householdLevySumWan) {
  if (!ctx.programs?.m01) {
    return {
      enabled: false,
      status: "対象外",
      householdLevyWan: toNumber(householdLevySumWan, 0),
      cutoffWan: M01_LEVY_CUTOFF_YEN / 10000,
      eligible: false,
      count: 0,
      annualWan: 0,
      confidence: "representative",
    };
  }
  const configured = toNumber(ctx.programs?.m01AnnualYen, M01_KENSHIN_ANNUAL_YEN_DEFAULT);
  const annualYenPerRecipient = Math.min(
    M01_KENSHIN_ANNUAL_YEN_RANGE.max,
    Math.max(M01_KENSHIN_ANNUAL_YEN_RANGE.min, configured)
  );
  const householdLevyYen = toNumber(householdLevySumWan, 0) * 10000;
  const eligible = householdLevyYen < M01_LEVY_CUTOFF_YEN;
  const count = Math.max(1, Math.trunc(toNumber(ctx.programs?.m01Count, 1)));
  const annualWan = eligible ? (annualYenPerRecipient * count) / 10000 : 0;
  return {
    enabled: true,
    status: eligible ? "該当" : "非該当",
    householdLevyWan: toNumber(householdLevySumWan, 0),
    cutoffWan: M01_LEVY_CUTOFF_YEN / 10000,
    eligible,
    count,
    annualYenPerRecipient,
    annualWan,
    fullReliefWan: (annualYenPerRecipient * count) / 10000,
    medicalCostBurdenWan: eligible ? 0 : (annualYenPerRecipient * count) / 10000,
    sensitivityRangeWan: {
      min: (M01_KENSHIN_ANNUAL_YEN_RANGE.min * count) / 10000,
      max: (M01_KENSHIN_ANNUAL_YEN_RANGE.max * count) / 10000,
    },
    judgment: {
      householdLevyWan: toNumber(householdLevySumWan, 0),
      householdLevyYen,
      cutoffYen: M01_LEVY_CUTOFF_YEN,
      eligible,
      formula: "世帯所得割 < 23.5万円なら該当",
    },
    amountFormula: {
      annualYenPerRecipient,
      count,
      annualWan,
      fullReliefWan: (annualYenPerRecipient * count) / 10000,
      medicalCostBurdenWan: eligible ? 0 : (annualYenPerRecipient * count) / 10000,
      formula: "代表年額 × 対象人数 = 軽減額 / 非該当時の医療費自己負担",
    },
    confidence: "representative",
  };
}


function calcN04Detail(ctx, salaryManyen) {
  if (!ctx.programs?.n04) {
    return {
      enabled: false,
      status: "対象外",
      salaryManyen: toNumber(salaryManyen, 0),
      supportClass: "対象外",
      annualWan: 0,
      educationCostReliefWan: 0,
      educationCostBurdenWan: 0,
      confidence: "provisional",
    };
  }
  const x = toNumber(salaryManyen, 0);
  const b12 = toNumber(ctx.programs?.n04Boundary12SalaryManyen, N04_BOUNDARY_1_2_SALARY_MANYEN);
  const b23 = toNumber(ctx.programs?.n04Boundary23SalaryManyen, N04_BOUNDARY_2_3_SALARY_MANYEN);
  const count = Math.max(1, Math.trunc(toNumber(ctx.programs?.n04Count, 1)));
  const supportClass = x < b12 ? "第1区分" : x < b23 ? "第2区分" : "第3区分";
  const annualYenPerRecipient =
    supportClass === "第1区分"
      ? N04_SHOGAKU_ANNUAL_YEN.first
      : supportClass === "第2区分"
        ? N04_SHOGAKU_ANNUAL_YEN.second
        : N04_SHOGAKU_ANNUAL_YEN.third;
  return {
    enabled: true,
    status: supportClass,
    salaryManyen: x,
    supportClass,
    count,
    annualYenPerRecipient,
    annualWan: (annualYenPerRecipient * count) / 10000,
    educationCostReliefWan: (annualYenPerRecipient * count) / 10000,
    educationCostBurdenWan: 0,
    boundaries: {
      firstToSecondManyen: b12,
      secondToThirdManyen: b23,
    },
    judgment: {
      salaryManyen: x,
      firstToSecondManyen: b12,
      secondToThirdManyen: b23,
      supportClass,
      formula: "給与収入で支弁区分を判定",
    },
    amountFormula: {
      annualYenPerRecipient,
      count,
      annualWan: (annualYenPerRecipient * count) / 10000,
      educationCostReliefWan: (annualYenPerRecipient * count) / 10000,
      formula: "区分別補助単価 × 対象人数 = 高所得側0基準の教育費負担軽減",
    },
    needAmountWan: null,
    ratio: null,
    confidence: "provisional",
  };
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
  const taxByWho = [];
  const byWho = new Map(rows.map((r) => [String(r.who), r]));
  for (const r of rows) {
    socialWanTotal += toNumber(r.socialWan, 0);
    const taxableIT = getTaxable(ctx, r, "it", rows, headDedCommonITWithKin);
    const taxableLT = getTaxable(ctx, r, "lt", rows, headDedCommonLTWithKin);
    const incomeTax = getIncomeTaxParts(taxableIT);
    const taxIT = incomeTax.taxWan;
    const residentTax = getResidentTaxParts(taxableLT);
    const taxLT = residentTax.totalWan;
    const residentIncomeLevyWan = residentTax.municipalIncomeLevyWan;
    const residentPerCapitaWan = residentTax.perCapitaWan;
    taxWanTotal += toNumber(taxIT, 0) + toNumber(taxLT, 0);
    levyByWho.set(String(r.who), {
      who: String(r.who),
      age: toNumber(r.age, 0),
      levyWan: residentIncomeLevyWan,
    });
    taxByWho.push({
      who: String(r.who),
      age: toNumber(r.age, 0),
      incomeTax: {
        taxableWan: incomeTax.taxableWan,
        taxableYen: incomeTax.taxableYen,
        rate: incomeTax.rate,
        quickDeductionYen: incomeTax.deductionYen,
        rawTaxYen: incomeTax.rawTaxYen,
        taxYen: incomeTax.taxYen,
        taxWan: toNumber(taxIT, 0),
        formula: "課税所得(千円未満切捨) × 税率 − 速算控除",
      },
      residentTax: {
        taxableWan: residentTax.taxableWan,
        taxableYen: residentTax.taxableYen,
        computedTaxWan: toNumber(taxLT, 0),
        incomeLevyWan: residentIncomeLevyWan,
        incomeLevyYen: residentTax.incomeLevyYen,
        perCapitaWan: residentPerCapitaWan,
        perCapitaYen: residentTax.perCapitaYen,
        rate: residentTax.rate,
        rawIncomeLevyYen: residentTax.rawIncomeLevyYen,
        adjustmentDeductionWan: residentTax.adjustmentDeductionWan,
        adjustmentDeductionYen: residentTax.adjustmentDeductionYen,
        municipalIncomeLevyWan: residentTax.municipalIncomeLevyWan,
        municipalIncomeLevyYen: residentTax.municipalIncomeLevyYen,
        prefecturalIncomeLevyWan: residentTax.prefecturalIncomeLevyWan,
        prefecturalIncomeLevyYen: residentTax.prefecturalIncomeLevyYen,
        formula: "課税所得(千円未満切捨) × 10% − 調整控除 + 均等割",
      },
      deductions: {
        basicITWan: toNumber(r.basicITWan, 0),
        basicLTWan: toNumber(r.basicLTWan, 0),
        basicITDetail: r.basicDeductionDetail?.incomeTax || null,
        basicLTDetail: r.basicDeductionDetail?.residentTax || null,
        socialWan: toNumber(r.socialWan, 0),
        workingStudentITWan: Boolean(r.workingStudent) ? ctx.wsAmtIT : 0,
        workingStudentLTWan: Boolean(r.workingStudent) ? ctx.wsAmtLT : 0,
        disabilityITWan: getDisabilityDeductionForTaxpayerWan(ctx, r, "it", rows),
        disabilityLTWan: getDisabilityDeductionForTaxpayerWan(ctx, r, "lt", rows),
        commonITWan: String(r.who) === "世帯主" ? headDedCommonITWithKin : 0,
        commonLTWan: String(r.who) === "世帯主" ? headDedCommonLTWithKin : 0,
      },
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
    const levyYen = Math.max(0, Math.round(toNumber(sumLevyWan, 0) * 10000));
    const a = toNumber(age, 0);
    if (levyYen <= 0) return 0;
    if (a >= 18) return levyYen < 160000 ? 9300 : 37200;
    if (a >= 3 && a <= 5) return 0;
    const upperLimitYen = levyYen < 280000 ? 4600 : 37200;
    return Math.min(RAW_TSUSHO_CHILD_MONTHLY_YEN, upperLimitYen);
  };
  const serviceType = (sumLevyWan, age) => {
    const levyYen = Math.max(0, Math.round(toNumber(sumLevyWan, 0) * 10000));
    const a = toNumber(age, 0);
    if (a >= 3 && a <= 5) return "無償化";
    if (levyYen <= 0) return "非課税";
    if (a >= 18) return levyYen < 160000 ? "一般1" : "一般2";
    return levyYen < 280000 ? "一般1" : "一般2";
  };
  const serviceConfidence = (sumLevyWan, age) => {
    const levyYen = Math.max(0, Math.round(toNumber(sumLevyWan, 0) * 10000));
    const a = toNumber(age, 0);
    if (a < 18 && !(a >= 3 && a <= 5) && levyYen >= 280000) return "representative";
    return "strict";
  };
  let serviceFeeMonthlyYenTotal = 0;
  const serviceFeeDetails = [];
  for (const r of rows) {
    if (!Boolean(byWho.get(String(r.who))?.disabled)) continue;
    const levyWan = levySumWanFor(r.who);
    const monthlyYen = monthlyFeeYen(levyWan, r.age);
    const age = toNumber(r.age, 0);
    const type = serviceType(levyWan, age);
    const confidence = serviceConfidence(levyWan, age);
    serviceFeeMonthlyYenTotal = Math.max(serviceFeeMonthlyYenTotal, monthlyYen);
    serviceFeeDetails.push({
      who: String(r.who),
      age,
      householdLevyWan: levyWan,
      householdLevyYen: Math.max(0, Math.round(toNumber(levyWan, 0) * 10000)),
      type,
      monthlyUpperYen: monthlyYen,
      annualFeeWan: (monthlyYen * 12) / 10000,
      rawMonthlyYen: age < 18 && !(age >= 3 && age <= 5) ? RAW_TSUSHO_CHILD_MONTHLY_YEN : null,
      confidence,
    });
  }
  const serviceConfidenceOverall = serviceFeeDetails.some((d) => d.confidence === "representative") ? "representative" : "strict";
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
        if (ctx.spouse.childWelfareAllowance || ctx.spouse.tokubetsuAllowance) sum += toNumber(rr?.welfareDisWan, 0);
      }
      for (const rr of rows) {
        const w = String(rr?.who || "");
        if (!w.startsWith("子ども")) continue;
        if (!isDepLike(w)) continue;
        const idx = Number(w.replace("子ども", "")) - 1;
        const child = ctx.children?.[idx];
        if (!child?.childWelfareAllowance && !child?.tokubetsuAllowance) continue;
        sum += toNumber(rr?.welfareDisWan, 0);
      }
      return sum;
    })();
    if (mode === "obligor") return depDisWan + selfDisWan;
    return depDisWan;
  };
  const calcWelfareAdjustedIncomeDetail = (col, mode = "self") => {
    const totalWan = toNumber(col?.totalIncomeWan, 0);
    const who = String(col?.who || "");
    if (mode === "obligor") {
      const incomeAdjustmentWan = toNumber(col?.incomeAdjWan, 0);
      const allowanceTotalWan = totalWan + incomeAdjustmentWan;
      const employmentIncomeDeductWan = 10;
      const socialFixedWan = 8;
      const disWan = calcWelfareDisabilityDeductionWan(col, mode);
      const deductionsWan = employmentIncomeDeductWan + socialFixedWan + disWan;
      const adjustedWan = Math.max(0, allowanceTotalWan - deductionsWan);
      return {
        who,
        mode,
        totalWan: roundWan(totalWan, 4),
        incomeAdjustmentWan: roundWan(incomeAdjustmentWan, 4),
        allowanceTotalWan: roundWan(allowanceTotalWan, 4),
        deductions: compactDeductions([
          { label: "給与所得控除相当(手当10万固定)", wan: employmentIncomeDeductWan, alwaysShow: true },
          { label: "社会保険料控除(手当8万固定)", wan: socialFixedWan, alwaysShow: true },
          { label: "障害者控除", wan: disWan },
        ]),
        deductionSumWan: roundWan(deductionsWan, 4),
        adjustedWan: roundWan(adjustedWan, 4),
        adjustedYen: Math.round(adjustedWan * 10000),
        formula: "総所得(+所得金額調整控除戻し) − 控除合計 = 判定所得",
      };
    }
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
    const adjustedWan = Math.max(0, totalWan - deductionsWan);
    return {
      who,
      mode,
      totalWan: roundWan(totalWan, 4),
      deductions: compactDeductions([
        { label: "その他控除", wan: otherDedWan },
        { label: "配偶者特別控除", wan: spouseSpecialWan },
        { label: "社会保険料控除(実額)", wan: socialWan },
        { label: "寡婦控除", wan: widowWan },
        { label: "ひとり親控除", wan: singleParentWan },
        { label: "勤労学生控除", wan: wsWan },
        { label: "障害者控除", wan: disWan },
      ]),
      deductionSumWan: roundWan(deductionsWan, 4),
      adjustedWan: roundWan(adjustedWan, 4),
      adjustedYen: Math.round(adjustedWan * 10000),
      formula: "総所得 − 控除合計 = 判定所得",
    };
  };
  const obligorJudgmentIncomeDetails = obligorCols.map((o) => calcWelfareAdjustedIncomeDetail(o, "obligor"));
  const obligorMaxYen = obligorJudgmentIncomeDetails.length ? Math.max(...obligorJudgmentIncomeDetails.map((o) => o.adjustedYen)) : 0;
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
      const selfJudgmentIncome = calcWelfareAdjustedIncomeDetail(c, "self");
      const selfYen = selfJudgmentIncome.adjustedYen;
      const selfOk = selfYen <= limitSelfYen;
      const ok = selfOk && obligorOk;
      const monthlyYen = ok ? (type === "child" ? WELFARE_CHILD_MONTHLY_YEN : TOKUBETSU_MONTHLY_YEN) : 0;
      return {
        who,
        type,
        ok,
        selfYen,
        selfLimitYen: limitSelfYen,
        selfOk,
        selfJudgmentIncome,
        obligorMaxYen,
        obligorLimitYen: limitObligorYen,
        obligorOk,
        monthlyYen,
      };
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

  const m01Detail = calcM01Detail(ctx, householdLevySumWan);
  const n04Detail = calcN04Detail(ctx, x);
  const m01AnnualWan = m01Detail.annualWan;
  const n04AnnualWan = n04Detail.annualWan;
  const m01FullReliefWan = toNumber(m01Detail.fullReliefWan ?? m01Detail.sensitivityRangeWan?.min, 0);
  const medicalCostBurdenWan = Math.max(0, m01FullReliefWan - toNumber(m01AnnualWan, 0));
  const educationCostBurdenWan = 0;
  const educationCostReliefWan = toNumber(n04AnnualWan, 0);
  const costBurdenWanTotal =
    toNumber(medicalCostBurdenWan, 0) +
    toNumber(serviceFeeWanTotal, 0);

  const allowanceWanTotal =
    toNumber(basicPensionWan, 0) +
    toNumber(tccaAnnualWan, 0) +
    toNumber(welfareAnnualWan, 0) +
    toNumber(childSupportAnnualWan, 0) +
    toNumber(childAllowanceAnnualWan, 0);

  const grossWan = rows.reduce((a, r) => a + toNumber(r.salaryWan, 0) + toNumber(r.otherIncomeWan, 0), 0);
  const takeHomeWan = grossWan - toNumber(socialWanTotal, 0) - toNumber(taxWanTotal, 0);
  const disposableWan =
    toNumber(takeHomeWan, 0) +
    toNumber(allowanceWanTotal, 0) +
    toNumber(educationCostReliefWan, 0) -
    toNumber(costBurdenWanTotal, 0);
  const expTax = -toNumber(taxWanTotal, 0);
  const expSocial = -toNumber(socialWanTotal, 0);
  const expService = -toNumber(serviceFeeWanTotal, 0);
  const expMedicalCost = -toNumber(medicalCostBurdenWan, 0);
  const expEducationCost = -toNumber(educationCostBurdenWan, 0);
  const totalPlusWan = toNumber(grossWan, 0) + toNumber(allowanceWanTotal, 0);
  const allowanceBreakdown = {
    basicDisabilityPensionWan: toNumber(basicPensionWan, 0),
    tccaWan: toNumber(tccaAnnualWan, 0),
    welfareAllowanceWan: toNumber(welfareAnnualWan, 0),
    childSupportWan: toNumber(childSupportAnnualWan, 0),
    childAllowanceWan: toNumber(childAllowanceAnnualWan, 0),
  };
  const costBurdenBreakdown = {
    medicalCostBurdenWan: toNumber(medicalCostBurdenWan, 0),
    educationCostBurdenWan: toNumber(educationCostBurdenWan, 0),
    serviceFeeWan: toNumber(serviceFeeWanTotal, 0),
    totalWan: toNumber(costBurdenWanTotal, 0),
  };
  const rowsDetail = rows.map((r) => ({
    who: String(r.who),
    age: toNumber(r.age, 0),
    salaryWan: toNumber(r.salaryWan, 0),
    otherIncomeWan: toNumber(r.otherIncomeWan, 0),
    employmentIncomeDeductionWan: toNumber(r.empWan, 0),
    employmentIncomeBaseDeductionWan: toNumber(r.empBaseWan, 0),
    incomeAdjustmentDeductionWan: toNumber(r.incomeAdjWan, 0),
    employmentIncomeWan: toNumber(r.incomeWan, 0),
    totalIncomeWan: toNumber(r.totalIncomeWan, 0),
    socialInsuranceWan: toNumber(r.socialWan, 0),
    employmentIncomeDeductionDetail: r.employmentIncomeDeductionDetail || null,
    basicDeductionDetail: r.basicDeductionDetail || null,
    socialInsuranceBreakdown: {
      ...(r.socialInsuranceDetail || {}),
      totalWan: toNumber(r.socialWan, 0),
      healthWan: null,
      careWan: null,
      pensionWan: null,
      employmentWan: null,
      childSupportContributionWan: null,
    },
    disabled: Boolean(r.disabled),
    disabilityKind: r.tccaSpecial ? "special" : r.disabled ? "disabled" : "none",
    cohabit: Boolean(r.cohabit),
  }));
  const tccaDetail = {
    confidence: "strict",
    fuyoCount: toNumber(tcca?.fuyoCount, 0),
    statutoryAddYen: toNumber(tcca?.limitFuyoStatutoryAddYen, 0),
    headAdjustedIncomeYen: toNumber(tcca?.head?.adjustedYen, 0),
    headLimitYen: toNumber(tcca?.limits?.headLimitYen, 0),
    headLimit: tcca?.limits?.head || null,
    familyMaxAdjustedIncomeYen: toNumber(tcca?.familyMaxAdjustedYen, 0),
    familyLimitYen: toNumber(tcca?.limits?.familyLimitYen, 0),
    familyLimit: tcca?.limits?.family || null,
    eligible:
      toNumber(tcca?.head?.adjustedYen, 0) <= toNumber(tcca?.limits?.headLimitYen, 0) &&
      toNumber(tcca?.familyMaxAdjustedYen, 0) <= toNumber(tcca?.limits?.familyLimitYen, 0),
    monthlyYen: toNumber(tcca?.totalMonthlyYen, 0),
    annualWan: toNumber(tccaAnnualWan, 0),
    head: tcca?.head || null,
    family: Array.from(tcca?.familyByWho?.values?.() || []),
  };
  const welfareAllowanceDetail = {
    confidence: "strict",
    fuyoCount: fuyo,
    obligorLimitYen: limitObligorYen,
    obligorMaxAdjustedIncomeYen: obligorMaxYen,
    obligorOk,
    obligorJudgmentIncomeDetails,
    selfLimitYen: limitSelfYen,
    recipients,
    monthlyYen: welfareMonthly,
    annualWan: welfareAnnualWan,
  };
  const taxDetail = {
    byWho: taxByWho,
    incomeTaxWan: taxByWho.reduce((a, r) => a + toNumber(r.incomeTax.taxWan, 0), 0),
    residentTaxWan: taxByWho.reduce((a, r) => a + toNumber(r.residentTax.computedTaxWan, 0), 0),
    residentIncomeLevyWan: householdLevySumWan,
    totalWan: toNumber(taxWanTotal, 0),
  };
  const deductionsDetail = {
    dependent: dep,
    specialKin: kin,
    spouse: { itWan: spIT, ltWan: spLT },
    spouseSpecial: { itWan: spSpIT, ltWan: spSpLT },
    widowSingleParent: ws,
  };

  return {
    x,
    gross: grossWan,
    allowance: allowanceWanTotal,
    m01: m01AnnualWan,
    n04: n04AnnualWan,
    takeHome: takeHomeWan,
    disposable: disposableWan,
    householdLevySumWan,
    levyByWho: Array.from(levyByWho.values()),
    expTax,
    expSocial,
    expService,
    expMedicalCost,
    expEducationCost,
    educationCostRelief: educationCostReliefWan,
    service: toNumber(serviceFeeWanTotal, 0),
    medicalCostBurden: toNumber(medicalCostBurdenWan, 0),
    educationCostBurden: toNumber(educationCostBurdenWan, 0),
    costBurden: toNumber(costBurdenWanTotal, 0),
    tax: toNumber(taxWanTotal, 0),
    social: toNumber(socialWanTotal, 0),
    totalPlus: totalPlusWan,
    breakdown: {
      salaryWan: grossWan,
      rows: rowsDetail,
      deductions: deductionsDetail,
      socialInsurance: {
        totalWan: toNumber(socialWanTotal, 0),
        byWho: rowsDetail.map((r) => ({
          who: r.who,
          totalWan: r.socialInsuranceWan,
          ...r.socialInsuranceBreakdown,
        })),
      },
      tax: taxDetail,
      takeHome: {
        salaryWan: grossWan,
        socialWan: toNumber(socialWanTotal, 0),
        taxWan: toNumber(taxWanTotal, 0),
        takeHomeWan,
      },
      programs: {
        tcca: tccaDetail,
        welfareAllowance: welfareAllowanceDetail,
        service: {
          confidence: serviceConfidenceOverall,
          householdLevySumWan,
          details: serviceFeeDetails,
          calculation: {
            method: "householdMax",
            monthlyCandidateYenByChild: serviceFeeDetails.map((d) => ({
              who: d.who,
              type: d.type,
              monthlyYen: d.monthlyUpperYen,
              confidence: d.confidence,
            })),
            monthlyTotalYen: serviceFeeMonthlyYenTotal,
            annualWan: serviceFeeWanTotal,
            formula: "児童ごとの月額候補の最大値を世帯上限として採用し、12か月分を年額化",
          },
          monthlyTotalYen: serviceFeeMonthlyYenTotal,
          annualWan: serviceFeeWanTotal,
        },
        m01: m01Detail,
        n04: n04Detail,
      },
      allowance: {
        totalWan: allowanceWanTotal,
        ...allowanceBreakdown,
      },
      costBurden: costBurdenBreakdown,
      disposable: {
        takeHomeWan,
        allowanceWan: allowanceWanTotal,
        medicalCostBurdenWan,
        educationCostBurdenWan,
        serviceFeeWan: serviceFeeWanTotal,
        costBurdenWan: costBurdenWanTotal,
        educationCostReliefWan,
        disposableWan,
      },
    },
  };
}
