import { rowAtKeyInt } from "./tableUtils.js";
import { CALCULATION_SOURCES } from "./calculationSources.js";
import { normalizeScenario, toNumber } from "./numeric.js";
import { M01_KENSHIN_ANNUAL_YEN_DEFAULT } from "./medicalAid.js";
import { N04_NEED_R7 } from "./educationAid.js";
import { calculateSocialInsuranceComponents, describeSocialInsuranceDeduction } from "./socialInsurance.js";
import { calcIncomeAdjustmentDeductionWan, describeEmploymentIncomeDeduction, describeBasicDeduction } from "./taxDescriptions.js";

/**
 * 世帯入力を正規化し、年齢・障害区分・給付・助成の既定値を設定する。
 * @remarks 世帯条件。単位: 金額はWan=万円、Yen=円、年齢は歳。式・境界条件・丸めは移動前の実装を維持。
 * @param {object} caseHousehold 世帯・制度設定または計算条件
 * @returns {*} householdオブジェクト。単位: 金額はWan=万円、Yen=円、年齢は歳
 */
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
      n04HousingYen: toNumber(programsInput.n04HousingYen, N04_NEED_R7.housingYen),
    },
  };
}

/**
 * ネストされた設定、旧形式の設定、空オブジェクトの順に取得する。
 * @remarks 設定。単位: 設定ごとに定義。式・境界条件・丸めは移動前の実装を維持。
 * @param {object} tables 世帯・制度設定または計算条件
 * @param {*} key 判定対象・区分または補助値（呼出側の定義に従う）
 * @returns {*} 設定オブジェクト。単位: 設定ごとに定義
 */
export function getConfig(tables, key) {
  return tables?.configs?.[key] || tables?.[key] || {};
}

/**
 * 静的表と控除設定を内部コンテキストの名前へ対応付ける。
 * @remarks 設定。単位: 表ごとに定義。式・境界条件・丸めは移動前の実装を維持。
 * @param {object} tables 世帯・制度設定または計算条件
 * @returns {*} 表・設定オブジェクト。単位: 表ごとに定義
 */
export function getRequiredTables(tables = {}) {
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

/**
 * 世帯、入力表、年度キー、勤労学生控除を計算コンテキストへまとめる。
 * @remarks 設定。単位: 金額は万円。式・境界条件・丸めは移動前の実装を維持。
 * @param {object} options 世帯・年度・入力表
 * @param {object} options.household 正規化済み世帯
 * @param {string} options.scenario 年度キーまたは旧別名
 * @param {object} options.tables 静的表と控除設定
 * @returns {*} ctxオブジェクト。単位: 金額は万円
 */
export function createContext({ household, scenario, tables }) {
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

/**
 * 個人給与から給与所得控除、社会保険、基礎控除表を適用し個人計算行を作る。
 * @remarks 個人所得。単位: 万円/年。表キーはMath.round。式・境界条件・丸めは移動前の実装を維持。
 * @param {object} ctx 世帯・制度設定または計算条件
 * @param {number} age 年齢（歳）
 * @param {number} salaryWan 万円（年額。補助値は呼出側の定義に従う）
 * @param {number} otherIncomeWan 万円（年額。補助値は呼出側の定義に従う）
 * @param {object} opts 世帯・制度設定または計算条件
 * @returns {*} 個人計算行。単位: 万円/年。表キーはMath.round
 */
export function calcOne(ctx, age, salaryWan, otherIncomeWan, opts = {}) {
  const s = Math.max(0, toNumber(salaryWan, 0));
  const o = Math.max(0, toNumber(otherIncomeWan, 0));
  const r = rowAtKeyInt(ctx.empStatic, "x", Math.round(s));
  const empBaseWan = toNumber(r?.[ctx.empKey], 0);
  const incomeAdjWan = toNumber(opts?.incomeAdjWan, 0);
  const empWan = empBaseWan + incomeAdjWan;
  const incomeWan = Math.max(0, s - empWan);
  const totalIncomeWan = incomeWan + o;

  const exemptSocial = Boolean(opts?.exemptSocialUnder130) && s <= 130;
  const socialComponents = calculateSocialInsuranceComponents(s, age, ctx.skey);
  const socialWan = exemptSocial ? 0 : socialComponents.totalWan;

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
      healthWan: exemptSocial ? 0 : socialComponents.healthWan,
      careWan: exemptSocial ? 0 : socialComponents.careWan,
      pensionWan: exemptSocial ? 0 : socialComponents.pensionWan,
      employmentWan: exemptSocial ? 0 : socialComponents.employmentWan,
      childSupportContributionWan: exemptSocial ? 0 : socialComponents.childSupportContributionWan,
      sources: {
        healthCarePensionSupport: CALCULATION_SOURCES.socialHealth,
        employment: CALCULATION_SOURCES.employmentInsurance,
      },
    },
  };
}

/**
 * 世帯員の計算行を作り、家族要件に応じて所得金額調整控除を再計算する。
 * @remarks 世帯所得。単位: 万円/年。年齢は歳。式・境界条件・丸めは移動前の実装を維持。
 * @param {object} ctx 世帯・制度設定または計算条件
 * @param {number} headSalaryWan 万円（年額。補助値は呼出側の定義に従う）
 * @returns {*} 個人計算行配列。単位: 万円/年。年齢は歳
 */
export function buildRows(ctx, headSalaryWan) {
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
