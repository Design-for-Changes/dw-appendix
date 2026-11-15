import { toNumber } from "./numeric.js";

// 過去の公開3ケースを再現する合成条件値。平均支出・平均支給額ではない。
export const N04_SHOGAKU_ANNUAL_YEN = { first: 72945, second: 36473, third: 0 };

export const N04_EXPENSE_SOURCE_R8 = {
  title: "令和8年度特別支援教育就学奨励費の支給限度額一覧（北海道札幌三角山支援学校）",
  url: "https://www.sankakuyama.hokkaido-c.ed.jp/wysiwyg/file/download/1/383",
  section: "小学部・学用品・通学用品購入費：第1区分11,640円、第2区分5,820円、第3区分対象外",
  fiscalYear: 2026,
  checkedOn: "2026-11-15",
};

export const N04_SUPPLIES_LIMIT_R8 = Object.freeze({ first: 11640, second: 5820, third: 0 });

export const N04_REQUIRED_NEED_INPUTS = Object.freeze([
  "annualYearEndAssistanceYen",
  "monthlyTransitionalAdditionYen",
  "monthlySpecialAdditionYen",
  "monthlyDisabilityAdditionYen",
  "monthlySingleParentAdditionYen",
  "annualSchoolMaterialsYen",
  "annualSchoolLunchBudgetYen",
  "previousAnnualCommuteYen",
  "monthlyHousingYen",
]);

export const N04_INCOME_NEED_SOURCE = {
  title: "特別支援教育就学奨励費に係る収入額・需要額の測定要領",
  url: "https://www.dokyoi.pref.hokkaido.lg.jp/fs/9/7/1/2/4/0/4/_/R7%20%E5%8F%8E%E5%85%A5%E9%A1%8D%E3%83%BB%E9%9C%80%E8%A6%81%E9%A1%8D%E3%81%AE%E6%B8%AC%E5%AE%9A%E8%A6%81%E9%A0%98.pdf",
  archivePath: "./sources/n04-income-and-need-measurement-guideline.pdf",
  section: "収入額・需要額の算定、1.5倍・2.5倍による支弁区分",
};

export const N04_LIVELIHOOD_SOURCE = {
  title: "千葉県 生活保護の基準（令和7年10月1日以降）",
  url: "https://www.pref.chiba.lg.jp/kenshidou/shien/book/seikatsuhogo.html",
  archivePath: "./sources/chiba-r7-livelihood-standards.png",
  section: "1級地-2の生活扶助・教育扶助・各種加算",
};

export const N04_FUNABASHI_SOURCE = {
  title: "船橋市 特別支援教育就学奨励制度（令和8年度）",
  url: "https://www.city.funabashi.lg.jp/kodomo/teate/005/p1008696.html",
  archivePath: "./sources/funabashi-r8-special-education-aid.png",
  section: "支弁区分の決定・支給内容",
};

export const N04_NEED_R7 = {
  firstClassByAgeYen: [
    [2, 43240],
    [5, 43240],
    [11, 45060],
    [17, 47790],
    [19, 45520],
    [40, 45520],
    [59, 45520],
    [64, 45520],
    [69, 45060],
    [74, 45060],
    [Infinity, 38690],
  ],
  diminishingRateBySize: { 1: 1, 2: 0.87, 3: 0.75, 4: 0.66, 5: 0.59, 6: 0.58, 7: 0.55, 8: 0.52, 9: 0.5 },
  secondClassBySizeYen: { 1: 27790, 2: 38060, 3: 44730, 4: 48900, 5: 49180, 6: 55650, 7: 58920, 8: 61910, 9: 64670 },
  winterBySizeYen: { 1: 2630, 2: 3730, 3: 4240, 4: 4580, 5: 4710, 6: 5010, 7: 5220, 8: 5380, 9: 5560 },
  yearEndBySizeYen: { 3: 23270, 4: 26170 },
  temporaryPerPersonYen: 1500,
  disabilitySpecialYen: 26810,
  disabilityOrdinaryYen: 17870,
  childUpbringingYen: 10190,
  elementaryEducationYen: 3400,
  housingYen: 56000,
};

/**
 * 年齢帯に対応する生活扶助第1類の月額を取得する。
 * @remarks N04 需要額。単位: 円/月。式・境界条件・丸めは移動前の実装を維持。
 * @param {number} age 年齢（歳）
 * @returns {*} number。単位: 円/月
 */
export function n04AmountForAge(age) {
  const a = Math.max(0, toNumber(age, 0));
  return N04_NEED_R7.firstClassByAgeYen.find(([upper]) => a <= upper)?.[1] || 0;
}

/**
 * 世帯人数別の需要額要素を取得し、9人超は9人値を使う。
 * @remarks N04 需要額。単位: 入力表により円/月または率。式・境界条件・丸めは移動前の実装を維持。
 * @param {*} table 判定対象・区分または補助値（呼出側の定義に従う）
 * @param {*} size 判定対象・区分または補助値（呼出側の定義に従う）
 * @returns {*} number。単位: 入力表により円/月または率
 */
export function n04BySize(table, size) {
  const n = Math.max(1, Math.trunc(toNumber(size, 1)));
  if (n <= 9) return toNumber(table[n], 0);
  return toNumber(table[9], 0);
}

/**
 * 需要額の指定要素を10円単位で切り上げる。
 * @remarks N04 端数処理。単位: 円。式・境界条件・丸めは移動前の実装を維持。
 * @param {*} value 判定対象・区分または補助値（呼出側の定義に従う）
 * @returns {*} number。単位: 円
 */
export function ceilToTenYen(value) {
  return Math.ceil(toNumber(value, 0) / 10) * 10;
}

/**
 * 新研究用N04入力を検証し、未確定の需要額要素を0円へ置換せず列挙する。
 * @param {object} profile 学校・年度・費目・需要額の条件。金額は円。
 * @returns {string[]} 算定を妨げる入力上の問題。空配列なら入力が充足している。
 */
export function validateN04EducationProfile(profile) {
  const issues = [];
  if (!profile || typeof profile !== "object") return ["N04の学校・費目条件が未指定"];
  if (profile.schemaVersion !== 1) issues.push("N04 profileのschemaVersionは1が必要");
  if (profile.fiscalYear !== 2026) issues.push("確認済みのN04費目単価は2026年度のみ");
  if (profile.schoolType !== "special-needs-school" || profile.department !== "elementary" || profile.enrollment !== "day") {
    issues.push("新研究用N04は特別支援学校小学部・通学生に限定");
  }
  if (!Array.isArray(profile.expenses) || profile.expenses.length !== 1 || profile.expenses[0]?.id !== "school-supplies") {
    issues.push("新研究用N04の採用費目は学用品・通学用品購入費1費目に限定");
  } else if (!Number.isFinite(profile.expenses[0].annualExpenseYen) || profile.expenses[0].annualExpenseYen < 0) {
    issues.push("学用品・通学用品の対象実費（年額）が未確定");
  }
  const need = profile.needMeasurement;
  if (need?.basisDate !== "2025-12-31") issues.push("2026年度N04の需要額測定基準日は2025-12-31が必要");
  if (need?.gradeArea !== "1-2" || need?.winterRegion !== "VI") issues.push("需要額表の確認範囲は1級地2・冬季VI区のみ");
  if (!Number.isInteger(need?.educationChildrenCount) || need.educationChildrenCount < 1) issues.push("需要額測定の教育扶助対象児数が未確定");
  for (const key of N04_REQUIRED_NEED_INPUTS) {
    if (!Number.isFinite(need?.[key]) || need[key] < 0) issues.push(`需要額入力 ${key} が未確定（0円とみなさない）`);
  }
  return issues;
}

/**
 * 特別支援学校小学部の学用品費を、対象実費・支弁区分別補助率・上限から算定する。
 * @remarks 年額円。実費の平均ではない。円未満の支払端数規則は未同定のため、数式上の額を丸めない。
 * @param {object} profile 費目入力。expenses[0].annualExpenseYenは対象児1人の対象実費。
 * @param {string} supportClass 第1区分／第2区分／第3区分。
 * @returns {object} 対象実費、率、上限、給付額の内訳（円/児童・年）。
 */
export function calcN04ExpenseSupport(profile, supportClass) {
  const expense = profile?.expenses?.[0];
  if (profile?.fiscalYear !== 2026 || profile?.schoolType !== "special-needs-school" || profile?.department !== "elementary" || profile?.enrollment !== "day") {
    throw new Error("N04費目計算は2026年度・特別支援学校小学部・通学生のみ対応");
  }
  if (!Array.isArray(profile.expenses) || profile.expenses.length !== 1 || expense?.id !== "school-supplies" || !Number.isFinite(expense.annualExpenseYen) || expense.annualExpenseYen < 0) {
    throw new Error("N04学用品費は対象実費を明示した1費目として指定する必要がある");
  }
  if (!["第1区分", "第2区分", "第3区分"].includes(supportClass)) throw new Error("N04支弁区分が不正");
  const key = supportClass === "第1区分" ? "first" : supportClass === "第2区分" ? "second" : "third";
  const rate = key === "first" ? 1 : key === "second" ? 0.5 : 0;
  const annualLimitYen = N04_SUPPLIES_LIMIT_R8[key];
  const annualSupportYen = Math.min(expense.annualExpenseYen * rate, annualLimitYen);
  return {
    mode: "itemized-r8-school-supplies",
    fiscalYear: 2026,
    schoolType: profile.schoolType,
    department: profile.department,
    enrollment: profile.enrollment,
    annualExpenseYen: expense.annualExpenseYen,
    rate,
    annualLimitYen,
    annualSupportYen,
    finalAnnualExpenseYen: expense.annualExpenseYen - annualSupportYen,
    roundingPolicy: "数式上の額を丸めない。実支払の端数処理規則を再現したものではない",
    source: N04_EXPENSE_SOURCE_R8,
  };
}

/**
 * 需要額の人数別表を、確認した人数の範囲内だけ参照する。
 * @param {object} table 人数をキーとする円額又は率の表。
 * @param {number} size 世帯人数（人）。
 * @returns {number} 表の値。不足する人数を他人数の値や0で補完しない。
 */
export function n04VerifiedSizeValue(table, size) {
  if (!Number.isInteger(size) || size < 1 || size > 5 || !Object.prototype.hasOwnProperty.call(table, size)) {
    throw new Error(`N04新研究の人数別表は1～5人のみ確認済み（入力${size}人）`);
  }
  return table[size];
}

/**
 * 費目限定の新研究用N04を計算し、未確定入力があれば計算を中止する。
 * @remarks 需要額は円/月、所得・給付は万円/年。生活保護世帯需要とN04測定対象を分け、教育費の測定額は実費給付と別入力とする。
 * @param {object} ctx 世帯とprograms.n04EducationProfileの明示条件。
 * @param {Array} rows 所得・社会保険料・年齢を含む世帯員の計算行。
 * @returns {object} 支弁区分、費目別給付、需要額の全採用要素と出典。
 */
export function calcN04ProfileDetail(ctx, rows) {
  const profile = ctx.programs.n04EducationProfile;
  const issues = validateN04EducationProfile(profile);
  if (issues.length) throw new Error(`N04_CONFIG_INCOMPLETE: ${issues.join(" / ")}`);
  const householdRows = (Array.isArray(rows) ? rows : []).filter((row) => ["世帯主", "配偶者"].includes(row.who) || String(row.who).startsWith("子ども"));
  const householdSize = householdRows.length;
  const childRowsCount = householdRows.filter((row) => String(row.who).startsWith("子ども")).length;
  const count = ctx.programs.n04Count;
  if (!Number.isInteger(count) || count < 1 || count > childRowsCount) {
    throw new Error("N04対象児数は1人以上かつ世帯の児童数以下で明示する");
  }
  if (!Number.isInteger(profile.needMeasurement.educationChildrenCount) || profile.needMeasurement.educationChildrenCount < count || profile.needMeasurement.educationChildrenCount > childRowsCount) {
    throw new Error("N04需要額の教育扶助対象児数を明示する必要がある");
  }
  const needInput = profile.needMeasurement;
  const firstClassRawYen = householdRows.reduce((sum, row) => sum + n04AmountForAge(row.age), 0);
  const diminishingRate = n04VerifiedSizeValue(N04_NEED_R7.diminishingRateBySize, householdSize);
  const firstClassAdjustedYen = ceilToTenYen(firstClassRawYen * diminishingRate);
  const secondClassYen = n04VerifiedSizeValue(N04_NEED_R7.secondClassBySizeYen, householdSize);
  const winterAnnualizedYen = n04VerifiedSizeValue(N04_NEED_R7.winterBySizeYen, householdSize) * 5 / 12;
  const yearEndAnnualizedYen = needInput.annualYearEndAssistanceYen / 12;
  const educationAssistanceYen = N04_NEED_R7.elementaryEducationYen * needInput.educationChildrenCount;
  const materialsMonthlyYen = needInput.annualSchoolMaterialsYen / 12;
  const lunchBudgetMonthlyYen = needInput.annualSchoolLunchBudgetYen / 12;
  const previousCommuteMonthlyYen = needInput.previousAnnualCommuteYen / 12;
  const monthlyNeedYen = firstClassAdjustedYen + secondClassYen + winterAnnualizedYen + yearEndAnnualizedYen +
    needInput.monthlyTransitionalAdditionYen + needInput.monthlySpecialAdditionYen +
    needInput.monthlyDisabilityAdditionYen + needInput.monthlySingleParentAdditionYen +
    educationAssistanceYen + materialsMonthlyYen + lunchBudgetMonthlyYen + previousCommuteMonthlyYen + needInput.monthlyHousingYen;
  const totalIncomeWan = householdRows.reduce((sum, row) => sum + toNumber(row.totalIncomeWan, 0), 0);
  const socialDeductionWan = householdRows.reduce((sum, row) => sum + toNumber(row.socialWan, 0), 0);
  const annualMeasuredIncomeWan = Math.max(0, totalIncomeWan - socialDeductionWan);
  const monthlyMeasuredIncomeYen = annualMeasuredIncomeWan * 10000 / 12;
  const ratio = monthlyMeasuredIncomeYen / monthlyNeedYen;
  const supportClass = ratio < 1.5 ? "第1区分" : ratio < 2.5 ? "第2区分" : "第3区分";
  const expenseDetail = calcN04ExpenseSupport(profile, supportClass);
  const annualWan = expenseDetail.annualSupportYen * count / 10000;
  const annualEligibleExpenseYen = expenseDetail.annualExpenseYen * count;
  return {
    enabled: true, status: supportClass, supportClass, count, mode: expenseDetail.mode,
    annualYenPerRecipient: expenseDetail.annualSupportYen,
    annualWan, educationCostReliefWan: annualWan,
    annualEligibleExpenseYen, grossExpenseAnnualYen: annualEligibleExpenseYen,
    educationCostBurdenWan: annualEligibleExpenseYen / 10000,
    salaryManyen: toNumber(householdRows.find((row) => row.who === "世帯主")?.salaryWan, 0),
    expenseDetail,
    educationExpenseNote: "採用学用品実費とその補助額を別々に計上。全教育支出を網羅した家計実態ではない。給食費給付は採用しない。",
    need: {
      basisDate: needInput.basisDate, householdSize, firstClassRawYen, diminishingRate, firstClassAdjustedYen,
      secondClassYen, winterAnnualizedYen, yearEndAnnualizedYen,
      temporaryAdditionYen: needInput.monthlySpecialAdditionYen,
      transitionalAdditionYen: needInput.monthlyTransitionalAdditionYen,
      disabilityAdditionYen: needInput.monthlyDisabilityAdditionYen,
      singleParentAdditionYen: needInput.monthlySingleParentAdditionYen,
      educationAssistanceYen, materialsMonthlyYen, lunchBudgetMonthlyYen, previousCommuteMonthlyYen,
      housingAssistanceYen: needInput.monthlyHousingYen, monthlyNeedYen,
      childUpbringingAdditionYen: 0,
      childUpbringingNote: "生活保護世帯の児童養育加算をN04需要額へ自動加算しない。N04測定要領の採用項目を用いる。",
      source: N04_INCOME_NEED_SOURCE, livelihoodSource: N04_LIVELIHOOD_SOURCE,
      inputEvidence: needInput.inputEvidence || {},
    },
    judgment: {
      householdSize, totalIncomeWan, annualMeasuredIncomeWan, monthlyMeasuredIncomeYen,
      deductions: [{ label: "社会保険料控除", wan: socialDeductionWan }, { label: "本比較では設定しないその他の要領上の控除", wan: 0 }],
      deductionSumWan: socialDeductionWan, monthlyNeedYen, ratio,
      firstThresholdYen: monthlyNeedYen * 1.5, secondThresholdYen: monthlyNeedYen * 2.5,
      supportClass, source: N04_INCOME_NEED_SOURCE,
      formula: "世帯員の所得合計から採用控除を差し引いた月額 ÷ N04測定対象の需要額（月額）",
    },
    amountFormula: { annualYenPerRecipient: expenseDetail.annualSupportYen, count, annualWan,
      educationCostReliefWan: annualWan, formula: "min(対象実費×支弁区分別率, 区分別上限) × 対象児数", source: N04_EXPENSE_SOURCE_R8 },
    needAmountWan: monthlyNeedYen / 10000, ratio, confidence: "conditional",
  };
}

/**
 * 生活保護基準に基づく需要額と世帯所得比から就学奨励費の支弁区分と年額を求める。
 * @remarks N04 就学奨励費。単位: 需要額=円/月、所得/給付=万円/年。ratio<1.5/<2.5。式・境界条件・丸めは移動前の実装を維持。
 * @param {object} ctx 世帯・制度設定または計算条件
 * @param {Array} rows 計算行・系列または設定行の配列
 * @returns {*} 判定・需要額内訳・年額・出典。単位: 需要額=円/月、所得/給付=万円/年。ratio<1.5/<2.5
 */
export function calcN04Detail(ctx, rows) {
  const salaryManyen = toNumber(rows?.find((r) => r.who === "世帯主")?.salaryWan, 0);
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
  if (ctx.programs.n04EducationProfile) return calcN04ProfileDetail(ctx, rows);
  const x = salaryManyen;
  const count = Math.max(1, Math.trunc(toNumber(ctx.programs?.n04Count, 1)));
  const householdRows = (Array.isArray(rows) ? rows : []).filter((row) =>
    ["世帯主", "配偶者"].includes(row.who) || String(row.who).startsWith("子ども")
  );
  const householdSize = householdRows.length;
  const totalIncomeWan = householdRows.reduce((sum, row) => sum + toNumber(row.totalIncomeWan, 0), 0);
  const socialDeductionWan = householdRows.reduce((sum, row) => sum + toNumber(row.socialWan, 0), 0);
  const allowedDeductionWan = socialDeductionWan;
  const annualMeasuredIncomeWan = Math.max(0, totalIncomeWan - allowedDeductionWan);
  const monthlyMeasuredIncomeYen = (annualMeasuredIncomeWan * 10000) / 12;

  const firstClassRawYen = householdRows.reduce((sum, row) => sum + n04AmountForAge(row.age), 0);
  const diminishingRate = n04BySize(N04_NEED_R7.diminishingRateBySize, householdSize);
  const firstClassAdjustedYen = ceilToTenYen(firstClassRawYen * diminishingRate);
  const secondClassYen = n04BySize(N04_NEED_R7.secondClassBySizeYen, householdSize);
  const temporaryAdditionYen = N04_NEED_R7.temporaryPerPersonYen * householdSize;
  const winterAnnualizedYen = n04BySize(N04_NEED_R7.winterBySizeYen, householdSize) * 5 / 12;
  const yearEndAnnualizedYen = n04BySize(N04_NEED_R7.yearEndBySizeYen, householdSize) / 12;
  const specialDisabledCount = householdRows.filter((row) => row.tccaSpecial).length;
  const ordinaryDisabledCount = householdRows.filter((row) => row.disabled && !row.tccaSpecial).length;
  const disabilityAdditionYen =
    specialDisabledCount * N04_NEED_R7.disabilitySpecialYen +
    ordinaryDisabledCount * N04_NEED_R7.disabilityOrdinaryYen;
  const childUpbringingCount = householdRows.filter((row) => toNumber(row.age, 0) < 18).length;
  const childUpbringingAdditionYen = childUpbringingCount * N04_NEED_R7.childUpbringingYen;
  const educationAssistanceYen = N04_NEED_R7.elementaryEducationYen * count;
  const housingAssistanceYen = toNumber(ctx.programs?.n04HousingYen, N04_NEED_R7.housingYen);
  const monthlyNeedYen =
    firstClassAdjustedYen +
    secondClassYen +
    temporaryAdditionYen +
    winterAnnualizedYen +
    yearEndAnnualizedYen +
    disabilityAdditionYen +
    childUpbringingAdditionYen +
    educationAssistanceYen +
    housingAssistanceYen;
  const ratio = monthlyNeedYen > 0 ? monthlyMeasuredIncomeYen / monthlyNeedYen : Infinity;
  const supportClass = ratio < 1.5 ? "第1区分" : ratio < 2.5 ? "第2区分" : "第3区分";
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
    judgment: {
      salaryManyen: x,
      householdSize,
      totalIncomeWan,
      deductions: [
        { label: "社会保険料控除", wan: socialDeductionWan },
        { label: "生命保険料控除等", wan: 0 },
      ],
      deductionSumWan: allowedDeductionWan,
      annualMeasuredIncomeWan,
      monthlyMeasuredIncomeYen,
      monthlyNeedYen,
      ratio,
      firstThresholdYen: monthlyNeedYen * 1.5,
      secondThresholdYen: monthlyNeedYen * 2.5,
      supportClass,
      formula: "月額収入額 ÷ 月額需要額（1.5未満=第1、2.5未満=第2、それ以上=第3）",
      source: N04_INCOME_NEED_SOURCE,
    },
    need: {
      firstClassRawYen,
      diminishingRate,
      firstClassAdjustedYen,
      secondClassYen,
      temporaryAdditionYen,
      winterAnnualizedYen,
      yearEndAnnualizedYen,
      specialDisabledCount,
      ordinaryDisabledCount,
      disabilityAdditionYen,
      childUpbringingCount,
      childUpbringingAdditionYen,
      educationAssistanceYen,
      housingAssistanceYen,
      monthlyNeedYen,
      formulas: {
        firstClass: `${Math.round(firstClassRawYen).toLocaleString("ja-JP")}円 × ${diminishingRate}`,
        secondClass: `${Math.round(secondClassYen).toLocaleString("ja-JP")}円`,
        temporary: `${N04_NEED_R7.temporaryPerPersonYen.toLocaleString("ja-JP")}円 × ${householdSize}人`,
        winter: `${Math.round(n04BySize(N04_NEED_R7.winterBySizeYen, householdSize)).toLocaleString("ja-JP")}円 × 5か月 ÷ 12`,
        yearEnd: `${Math.round(n04BySize(N04_NEED_R7.yearEndBySizeYen, householdSize)).toLocaleString("ja-JP")}円 ÷ 12`,
        disability: `${specialDisabledCount}人 × ${N04_NEED_R7.disabilitySpecialYen.toLocaleString("ja-JP")}円 ＋ ${ordinaryDisabledCount}人 × ${N04_NEED_R7.disabilityOrdinaryYen.toLocaleString("ja-JP")}円`,
        childUpbringing: `${childUpbringingCount}人 × ${N04_NEED_R7.childUpbringingYen.toLocaleString("ja-JP")}円`,
        education: `${count}人 × ${N04_NEED_R7.elementaryEducationYen.toLocaleString("ja-JP")}円`,
        housing: `${Math.round(housingAssistanceYen).toLocaleString("ja-JP")}円（モデル入力）`,
        total: "N4a ＋ N4b ＋ N4c ＋ N4d ＋ N4e ＋ N4f ＋ N4g ＋ N4h ＋ N4i",
      },
      formula: "第1類×逓減率 + 第2類 + 臨時加算 + 冬季加算年平均 + 期末一時扶助月割 + 障害者加算 + 児童養育加算 + 教育扶助 + 住宅扶助",
      livelihoodSource: N04_LIVELIHOOD_SOURCE,
      localSource: N04_FUNABASHI_SOURCE,
      housingConfidence: "provisional",
      housingNote: "住宅扶助は船橋市3人以上の公開上限56,000円をモデル入力として使用",
    },
    amountFormula: {
      annualYenPerRecipient,
      count,
      annualWan: (annualYenPerRecipient * count) / 10000,
      educationCostReliefWan: (annualYenPerRecipient * count) / 10000,
      formula: "区分別補助単価 × 対象人数 = 高所得側0基準の教育費負担軽減",
      source: N04_FUNABASHI_SOURCE,
    },
    needAmountWan: monthlyNeedYen / 10000,
    ratio,
    confidence: "provisional",
  };
}
