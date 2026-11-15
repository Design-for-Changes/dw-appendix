import {
  N04_SHOGAKU_ANNUAL_YEN,
  calcN04Detail,
  calcN04ExpenseSupport,
  n04VerifiedSizeValue,
  validateN04EducationProfile,
} from "./educationAid.js";

/** 計算の単位・欠損処理を検証するための明示入力。統計上の代表世帯ではない。 */
function makeProfile(overrides = {}) {
  return {
    schemaVersion: 1,
    fiscalYear: 2026,
    schoolType: "special-needs-school",
    department: "elementary",
    enrollment: "day",
    expenses: [{ id: "school-supplies", annualExpenseYen: 11640 }],
    needMeasurement: {
      basisDate: "2025-12-31", gradeArea: "1-2", winterRegion: "VI",
      educationChildrenCount: 1,
      annualYearEndAssistanceYen: 22720,
      monthlyTransitionalAdditionYen: 0,
      monthlySpecialAdditionYen: 4500,
      monthlyDisabilityAdditionYen: 26810,
      monthlySingleParentAdditionYen: 0,
      annualSchoolMaterialsYen: 1200,
      annualSchoolLunchBudgetYen: 12000,
      previousAnnualCommuteYen: 0,
      monthlyHousingYen: 0,
    },
    ...overrides,
  };
}

/** 行計算済みの世帯員を、N04単体テスト用に構成する。 */
function makeRows(childCount = 1) {
  return [
    { who: "世帯主", age: 45, salaryWan: 200, totalIncomeWan: 100, socialWan: 20 },
    { who: "配偶者", age: 45, salaryWan: 0, totalIncomeWan: 0, socialWan: 0 },
    ...Array.from({ length: childCount }, (_, i) => ({ who: `子ども${i + 1}`, age: 7, totalIncomeWan: 0, socialWan: 0 })),
  ];
}

test("旧profile未指定の72945/36473/0は履歴互換値として保持する", () => {
  expect(N04_SHOGAKU_ANNUAL_YEN).toEqual({ first: 72945, second: 36473, third: 0 });
  const rows = makeRows();
  expect(calcN04Detail({ programs: { n04: true, n04Count: 1 } }, rows).annualYenPerRecipient).toBe(72945);
});

test.each([
  ["第1区分", 5000, 5000], ["第2区分", 5000, 2500], ["第3区分", 5000, 0],
  ["第1区分", 100000, 11640], ["第2区分", 100000, 5820], ["第3区分", 100000, 0],
])("学用品実費と区分別上限：%s、実費%i円", (supportClass, expense, expected) => {
  const profile = makeProfile({ expenses: [{ id: "school-supplies", annualExpenseYen: expense }] });
  const result = calcN04ExpenseSupport(profile, supportClass);
  expect(result.annualSupportYen).toBe(expected);
  expect(result.finalAnnualExpenseYen).toBe(expense - expected);
});

test("円未満は未確認の支払端数規則で勝手に丸めない", () => {
  const profile = makeProfile({ expenses: [{ id: "school-supplies", annualExpenseYen: 1 }] });
  expect(calcN04ExpenseSupport(profile, "第2区分").annualSupportYen).toBe(0.5);
});

test("給食費を旧合成額として新研究へ混入しない", () => {
  const profile = makeProfile({ expenses: [{ id: "school-lunch", annualExpenseYen: 61305 }] });
  expect(validateN04EducationProfile(profile).join(" ")).toContain("学用品");
  expect(() => calcN04ExpenseSupport(profile, "第1区分")).toThrow("1費目");
});

test("特別支援学級や未確認年度へ同じ率を流用しない", () => {
  expect(validateN04EducationProfile(makeProfile({ schoolType: "special-needs-class" })).join(" ")).toContain("特別支援学校");
  expect(() => calcN04ExpenseSupport(makeProfile({ fiscalYear: 2025 }), "第1区分")).toThrow("2026年度");
});

test("必須需要項目のnullは0へ変換せず計算を中止する", () => {
  const profile = makeProfile();
  profile.needMeasurement.annualSchoolLunchBudgetYen = null;
  expect(validateN04EducationProfile(profile).join(" ")).toContain("annualSchoolLunchBudgetYen");
  expect(() => calcN04Detail({ programs: { n04: true, n04Count: 1, n04EducationProfile: profile } }, makeRows())).toThrow("N04_CONFIG_INCOMPLETE");
});

test("明示した徒歩通学0円は欠損nullと区別される", () => {
  const profile = makeProfile();
  expect(validateN04EducationProfile(profile)).toEqual([]);
  const result = calcN04Detail({ programs: { n04: true, n04Count: 1, n04EducationProfile: profile } }, makeRows());
  expect(result.need.previousCommuteMonthlyYen).toBe(0);
  expect(result.need.materialsMonthlyYen).toBe(100);
  expect(result.need.lunchBudgetMonthlyYen).toBe(1000);
});

test("新研究は補助額と年間教育実費を別々の単位付き項目にする", () => {
  const result = calcN04Detail({ programs: { n04: true, n04Count: 1, n04EducationProfile: makeProfile() } }, makeRows());
  expect(result.annualEligibleExpenseYen).toBe(11640);
  expect(result.grossExpenseAnnualYen).toBe(11640);
  expect(result.educationCostBurdenWan).toBe(1.164);
  expect(result.annualWan).toBe(1.164);
  expect(result.need.childUpbringingAdditionYen).toBe(0);
});

test("5人世帯では第1/2類・冬季表を使い、教育扶助対象全児童と給付対象児数を分ける", () => {
  const profile = makeProfile();
  Object.assign(profile.needMeasurement, { educationChildrenCount: 3, annualYearEndAssistanceYen: 26630, monthlyTransitionalAdditionYen: 2140, monthlySpecialAdditionYen: 7500 });
  const result = calcN04Detail({ programs: { n04: true, n04Count: 1, n04EducationProfile: profile } }, makeRows(3));
  expect(result.need.householdSize).toBe(5);
  expect(result.need.firstClassRawYen).toBe(226220);
  expect(result.need.firstClassAdjustedYen).toBe(133470);
  expect(result.need.diminishingRate).toBe(0.59);
  expect(result.need.secondClassYen).toBe(49180);
  expect(result.need.winterAnnualizedYen).toBe(4710 * 5 / 12);
  expect(result.need.educationAssistanceYen).toBe(10200);
  expect(result.count).toBe(1);
  expect(result.annualEligibleExpenseYen).toBe(11640);
});

test("未確認の6人以上又は表の欠けは外挿・0円補完しない", () => {
  expect(() => n04VerifiedSizeValue({ 5: 49180 }, 6)).toThrow("1～5人");
  expect(() => n04VerifiedSizeValue({ 3: 22720, 4: 25550 }, 5)).toThrow("1～5人");
});

test("教育扶助対象児数は親を含む世帯人数ではなく児童数の範囲で検証する", () => {
  const profile = makeProfile();
  profile.needMeasurement.educationChildrenCount = 2;
  expect(() => calcN04Detail({ programs: { n04: true, n04Count: 1, n04EducationProfile: profile } }, makeRows(1))).toThrow("教育扶助対象児数");
});
