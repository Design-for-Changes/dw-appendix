import { render, screen, fireEvent } from "@testing-library/react";
import RevisionScenariosAppendix from "./RevisionScenariosAppendix";

afterEach(() => jest.restoreAllMocks());

// 金額はUIの検証用入力であり、研究に採用する需要額ではない。
const profile = { schemaVersion: 1, fiscalYear: 2026, schoolType: "special-needs-school", department: "elementary", enrollment: "day", expenses: [{ id: "school-supplies", annualExpenseYen: 11640 }], needMeasurement: { basisDate: "2025-12-31", gradeArea: "1-2", winterRegion: "VI", educationChildrenCount: 1, annualYearEndAssistanceYen: 1, monthlyTransitionalAdditionYen: 0, monthlySpecialAdditionYen: 0, monthlyDisabilityAdditionYen: 1, monthlySingleParentAdditionYen: 0, annualSchoolMaterialsYen: 0, annualSchoolLunchBudgetYen: 1, previousAnnualCommuteYen: 0, monthlyHousingYen: 0 } };
const currentPoints = [{ x: 200, disposable: 250 }, { x: 1500, disposable: 1050 }];
const adjustment = { kind: "illustrative-not-optimal", needAnnualWan: 300, eligibleExpenseAnnualWan: 40, fullSupportAnnualWan: 90, lowerRatio: 1.5, upperRatio: 2.5, burdenRate: 0.1, points: [{ x: 200, disposableAnnualWan: 260, differenceAnnualWan: 10 }, { x: 1500, disposableAnnualWan: 1030, differenceAnnualWan: -20 }], impact: { minimumDifferenceAnnualWan: -20, maximumDifferenceAnnualWan: 10, lowerIncomeIntervals: [{ fromSalaryWan: 1500, toSalaryWan: 1500, minimumDifferenceAnnualWan: -20 }] } };
const sample = { schema_version: "1.0.0", title: "モデル条件", scope: {}, factors: {}, family_profiles: [{ id: "n1-A", label: "子1人・A1人" }], conditions: [
  { id: "one", family_profile_id: "n1-A", spouse_salary_wan: 0, service_use_yen_per_child_month: 4600, household: {}, calculation_status: "blocked", blocking_issues: ["需要額の給食単価が未確定"], result: null },
  { id: "two", family_profile_id: "n1-A", spouse_salary_wan: 200, service_use_yen_per_child_month: 4600, household: { programs: { n04: true, n04EducationProfile: profile } }, calculation_status: "computed", result: { series_url: "data/research/example-series.json", reversals: [{ salary_wan: 800, programs: ["特別児童扶養手当"], drop_wan: 69.4, recovery_salary_wan: 900, recovery_increase_wan: 100 }] } },
] };

/** 原データを変更せず、テストごとの索引を作る。 */
function copySample() { return JSON.parse(JSON.stringify(sample)); }

/** 索引と系列を読み分ける通信モックを設定する。 */
function mockData(metadata, series = currentPoints) {
  return jest.spyOn(global, "fetch").mockImplementation(async (url) => ({ ok: true, json: async () => String(url).includes("revision-scenarios") ? metadata : series }));
}

test("未確定条件を数値0として表示せず理由を示す", async () => {
  jest.spyOn(global, "fetch").mockResolvedValue({ ok: true, json: async () => sample });
  render(<RevisionScenariosAppendix />);
  expect(await screen.findByRole("heading", { name: "モデル条件と感度分析" })).toBeInTheDocument();
  expect(screen.getByText("需要額の給食単価が未確定")).toBeInTheDocument();
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  expect(screen.getByText(/医学的重症度を三階層/)).toBeInTheDocument();
});

test("計算済み条件を選ぶとその条件の系列と逆転表を表示する", async () => {
  const mock = mockData(sample);
  render(<RevisionScenariosAppendix />);
  const select = await screen.findByLabelText("配偶者給与（万円／年）");
  fireEvent.change(select, { target: { value: "200" } });
  expect(await screen.findByRole("img", { name: /選択した仮想世帯条件/ })).toBeInTheDocument();
  expect(screen.getByText("特別児童扶養手当")).toBeInTheDocument();
  expect(screen.getByText("69.40")).toBeInTheDocument();
  expect(mock).toHaveBeenCalledWith(expect.stringContaining("example-series.json"), expect.any(Object));
  expect(screen.getByText(/参考調整例は未計算/)).toBeInTheDocument();
});

test("資料を取得できなければエラーを表示する", async () => {
  jest.spyOn(global, "fetch").mockResolvedValue({ ok: false, status: 404 });
  render(<RevisionScenariosAppendix />);
  expect(await screen.findByRole("alert")).toHaveTextContent("条件資料を読み込めませんでした。");
});

test("現行と参考例の2線、同給与差の最小最大、不利区間を表示する", async () => {
  const data = copySample();
  data.conditions[1].result.adjustment = adjustment;
  mockData(data);
  render(<RevisionScenariosAppendix />);
  fireEvent.change(await screen.findByLabelText("配偶者給与（万円／年）"), { target: { value: "200" } });
  expect(await screen.findByTestId("adjustment-disposable-line")).toBeInTheDocument();
  expect(screen.getByTestId("current-disposable-line")).toBeInTheDocument();
  expect(screen.getByText("10.00万円／年")).toBeInTheDocument();
  expect(screen.getByText("-20.00万円／年")).toBeInTheDocument();
  expect(screen.getByText("1,500～1,500")).toBeInTheDocument();
  expect(screen.getByText(/影響を受ける世帯数や世帯割合を示さない/)).toBeInTheDocument();
  expect(screen.getByText(/給与掃引範囲内で得られた最大現金給付/)).toBeInTheDocument();
  expect(screen.getByText(/政策的な最適解や財政中立を示すものではなく/)).toBeInTheDocument();
});

test("blockedでは参考例や系列を読み込まず、0円の曲線を作らない", async () => {
  const mock = mockData(sample);
  render(<RevisionScenariosAppendix />);
  expect(await screen.findByText("この条件の結果は未確定")).toBeInTheDocument();
  expect(screen.queryByTestId("adjustment-disposable-line")).not.toBeInTheDocument();
  expect(mock).toHaveBeenCalledTimes(1);
});

test.each(["missing-conditions", "missing-series-url", "duplicate-id", "n04-incomplete", "missing-drop"])("不正な条件索引を読込エラーとする：%s", async (kind) => {
  const data = copySample();
  if (kind === "missing-conditions") delete data.conditions;
  if (kind === "missing-series-url") delete data.conditions[1].result.series_url;
  if (kind === "duplicate-id") data.conditions[1].id = data.conditions[0].id;
  if (kind === "n04-incomplete") data.conditions[1].household.programs.n04EducationProfile.needMeasurement.annualSchoolLunchBudgetYen = null;
  if (kind === "missing-drop") data.conditions[1].result.reversals[0].drop_wan = null;
  mockData(data);
  render(<RevisionScenariosAppendix />);
  expect(await screen.findByRole("alert")).toHaveTextContent("条件資料を読み込めませんでした。");
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
});

test.each(["current-null", "after-null", "difference-mismatch", "impact-mismatch"])("欠損や不整合を0円に補完しない：%s", async (kind) => {
  const data = copySample();
  data.conditions[1].result.adjustment = JSON.parse(JSON.stringify(adjustment));
  const series = JSON.parse(JSON.stringify(currentPoints));
  if (kind === "current-null") series[0].disposable = null;
  if (kind === "after-null") data.conditions[1].result.adjustment.points[0].disposableAnnualWan = null;
  if (kind === "difference-mismatch") data.conditions[1].result.adjustment.points[0].differenceAnnualWan = 9;
  if (kind === "impact-mismatch") data.conditions[1].result.adjustment.impact.minimumDifferenceAnnualWan = -19;
  mockData(data, series);
  render(<RevisionScenariosAppendix />);
  fireEvent.change(await screen.findByLabelText("配偶者給与（万円／年）"), { target: { value: "200" } });
  expect(await screen.findByRole("alert")).toHaveTextContent("計算系列を読み込めませんでした。");
  expect(screen.queryByTestId("adjustment-disposable-line")).not.toBeInTheDocument();
});

test("参考例が系列ファイル内にある場合も2線を表示する", async () => {
  mockData(sample, { points: currentPoints, adjustment });
  render(<RevisionScenariosAppendix />);
  fireEvent.change(await screen.findByLabelText("配偶者給与（万円／年）"), { target: { value: "200" } });
  expect(await screen.findByTestId("adjustment-disposable-line")).toBeInTheDocument();
});

test("通所Rを実測平均や分位と呼ばない説明を常に表示する", async () => {
  mockData(sample);
  render(<RevisionScenariosAppendix />);
  expect(await screen.findByText(/実測された上限適用前費用の平均・中央値・分位点ではない/)).toBeInTheDocument();
});
