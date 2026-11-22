import { render, screen, fireEvent, within } from "@testing-library/react";
import RevisionScenariosAppendix, { LegacyRevisionMaterials } from "./RevisionScenariosAppendix";
import { createRevisionCalculator } from "../calc/revisionEngine";
import { paperCases } from "./revisionPaperCases";
jest.mock("./salaryGraphDataset",()=>({useSalaryGraphDataset:()=>({type:"progress",percent:0})}));

afterEach(() => jest.restoreAllMocks());

test("Gはシミュレーター単独の入口とし、研究資料・旧UIを表示も取得もしない", () => {
  const fetchSpy = jest.spyOn(global, "fetch");
  const { container } = render(<RevisionScenariosAppendix />);
  const simulator = screen.getByRole("region", { name: "夫婦の給与収入と世帯の可処分所得" });
  expect(container.querySelector("#revision-scenarios")?.children).toHaveLength(1);
  expect(simulator.parentElement).toHaveAttribute("id", "revision-scenarios");
  expect(simulator).toHaveAttribute("id","salary-surface");
  const conditions=within(simulator).getByText("世帯と子どもの条件",{selector:"summary"}).closest("details");
  expect(simulator.firstElementChild).toBe(conditions);
  expect(conditions).toHaveAttribute("open");
  expect(within(simulator).queryByRole("figure",{name:/3Dグラフ/})).not.toBeInTheDocument();
  const draw=within(simulator).getByRole("button",{name:"グラフを描画"});
  fireEvent.click(draw);
  const figure=within(simulator).getByRole("figure",{name:/3Dグラフ/});
  expect(conditions).not.toHaveAttribute("open");
  const tabs=within(simulator).getByRole("tablist",{name:"グラフの切り替え"});
  expect(conditions.nextElementSibling).toBe(tabs);
  expect(within(simulator).getByRole("tabpanel")).toContainElement(figure);
  expect(figure.querySelector("figcaption")).toBeNull();
  expect(figure).not.toHaveTextContent(/現金給付|表示範囲/);
  const point=within(simulator).getByRole("region",{name:"点P"});
  expect(figure.compareDocumentPosition(point)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(point.closest("details")).toBeNull();
  expect(within(point).getByRole("heading",{name:"点P"})).toBeVisible();
  expect(within(simulator).queryByText(/通りが試算対象です|組み合わせを選んでください|実際の認定を再現/)).not.toBeInTheDocument();
  expect(screen.queryByText("試算の給与帯・利用料は、公表統計のどこに当たるか")).not.toBeInTheDocument();
  expect(screen.queryByText("旧設計：配偶者給与と利用額を固定した条件索引")).not.toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "モデル条件と感度分析" })).not.toBeInTheDocument();
  expect(fetchSpy).not.toHaveBeenCalled();
});

test("旧試算の給与帯は旧v2の3ケースに一致し、現行の給与点として表示しない", () => {
  render(<LegacyRevisionMaterials />);
  const notes = within(screen.getByRole("region", { name: "試算の給与帯・利用料は、公表統計のどこに当たるか" }));
  const thresholdText = notes.getByText(/ケース1・2で年824万円、ケース3で年867万円/);
  for (const { id, children } of paperCases) {
    const calculator = createRevisionCalculator({protocol:"legacy-v2", children, serviceAmountYen: 10406, otherServiceMonthlyYen: 0});
    const threshold = id === "P3" ? 867 : 824;
    expect(calculator.evaluate(threshold - 1, 0).breakdown.tccaWan).toBeGreaterThan(0);
    expect(calculator.evaluate(threshold, 0).breakdown.tccaWan).toBe(0);
    expect(threshold / 12).toBeGreaterThanOrEqual(60);
    expect(threshold / 12).toBeLessThan(90);
  }
  expect(thresholdText).toHaveTextContent("旧試算（v2）の給与帯");
  expect(thresholdText).toHaveTextContent("52人／888人（5.9%");
  expect(thresholdText).toHaveTextContent("28人／452人（6.2%");
  expect(notes.getByText(/公表表の「0～18歳」/)).toHaveTextContent("所得逆転を経験する世帯の割合ではない");
  expect(notes.getByText(/一般2の4,103人/)).toHaveTextContent("上限適用後の東京都の値");
});

// 金額はUIの検証用入力であり、研究に採用する需要額ではない。
const profile = { schemaVersion: 1, fiscalYear: 2026, schoolType: "special-needs-school", department: "elementary", enrollment: "day", expenses: [{ id: "school-supplies", annualExpenseYen: 11640 }], needMeasurement: { basisDate: "2025-12-31", gradeArea: "1-2", winterRegion: "VI", educationChildrenCount: 1, annualYearEndAssistanceYen: 1, monthlyTransitionalAdditionYen: 0, monthlySpecialAdditionYen: 0, monthlyDisabilityAdditionYen: 1, monthlySingleParentAdditionYen: 0, annualSchoolMaterialsYen: 0, annualSchoolLunchBudgetYen: 1, previousAnnualCommuteYen: 0, monthlyHousingYen: 0 } };
const currentPoints = [{ x: 200, disposable: 250 }, { x: 1500, disposable: 1050 }];
const adjustment = { kind: "illustrative-not-optimal", needAnnualWan: 300, eligibleExpenseAnnualWan: 40, fullSupportAnnualWan: 90, lowerRatio: 1.5, upperRatio: 2.5, burdenRate: 0.1, points: [{ x: 200, disposableAnnualWan: 260, differenceAnnualWan: 10 }, { x: 1500, disposableAnnualWan: 1030, differenceAnnualWan: -20 }], impact: { minimumDifferenceAnnualWan: -20, maximumDifferenceAnnualWan: 10, lowerIncomeIntervals: [{ fromSalaryWan: 1500, toSalaryWan: 1500, minimumDifferenceAnnualWan: -20 }] } };
const familyA = { id: "n1-A", total_children: 1, disabled_children: 1, qualification_counts: { A: 1, B: 0, C: 0 } };
const sample = { schema_version: "1.0.0", title: "モデル条件", scope: {}, factors: {}, family_profiles: [familyA], conditions: [
  { id: "one", family_profile_id: "n1-A", spouse_salary_wan: 0, service_use_yen_per_child_month: 4600, household: {}, calculation_status: "blocked", blocking_issues: ["需要額の給食単価が未確定"], result: null },
  { id: "two", family_profile_id: "n1-A", spouse_salary_wan: 200, service_use_yen_per_child_month: 4600, household: { programs: { n04: true, n04EducationProfile: profile } }, calculation_status: "computed", result: { series_url: "data/research/example-series.json", reversals: [{ salary_wan: 800, programs: ["特別児童扶養手当"], drop_wan: 69.4, recovery_salary_wan: 900, recovery_increase_wan: 100 }] } },
] };

/** 原データを変更せず、テストごとの索引を作る。 */
function copySample() { return JSON.parse(JSON.stringify(sample)); }

/** 索引と系列を読み分ける通信モックを設定する。 */
function mockData(metadata, series = currentPoints) {
  return jest.spyOn(global, "fetch").mockImplementation(async (url) => ({ ok: true, json: async () => String(url).includes("revision-scenarios") ? metadata : series }));
}

async function openArchive() {
  render(<LegacyRevisionMaterials />);
  fireEvent.click(await screen.findByText("旧設計：配偶者給与と利用額を固定した条件索引"));
}

test("未確定条件を数値0として表示せず理由を示す", async () => {
  jest.spyOn(global, "fetch").mockResolvedValue({ ok: true, json: async () => sample });
  await openArchive();
  expect(await screen.findByText("需要額の給食単価が未確定")).toBeInTheDocument();
  expect(screen.queryByRole("img", { name: /選択した仮想世帯条件/ })).not.toBeInTheDocument();
  expect(screen.getByText(/医学的重症度を三階層/)).toBeInTheDocument();
});

test("計算済み条件を選ぶとその条件の系列と逆転表を表示する", async () => {
  const mock = mockData(sample);
  await openArchive();
  const select = await screen.findByLabelText("配偶者給与（万円／年）");
  fireEvent.change(select, { target: { value: "200" } });
  expect(await screen.findByRole("img", { name: /選択した仮想世帯条件/ })).toBeInTheDocument();
  expect(within(screen.getByRole("region", { name: "旧設計の条件索引" })).getByText("特別児童扶養手当")).toBeInTheDocument();
  expect(screen.getByText("69.40")).toBeInTheDocument();
  expect(mock).toHaveBeenCalledWith(expect.stringContaining("example-series.json"), expect.any(Object));
  expect(screen.getByText(/参考調整例は未計算/)).toBeInTheDocument();
});

test("資料を取得できなければエラーを表示する", async () => {
  jest.spyOn(global, "fetch").mockResolvedValue({ ok: false, status: 404 });
  await openArchive();
  expect(await screen.findByRole("alert")).toHaveTextContent("条件資料を読み込めませんでした。");
});

test("現行と参考例の2線、同給与差の最小最大、不利区間を表示する", async () => {
  const data = copySample();
  data.conditions[1].result.adjustment = adjustment;
  mockData(data);
  await openArchive();
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
  await openArchive();
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
  await openArchive();
  expect(await screen.findByRole("alert")).toHaveTextContent("条件資料を読み込めませんでした。");
  expect(screen.queryByRole("img", { name: /選択した仮想世帯条件/ })).not.toBeInTheDocument();
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
  await openArchive();
  fireEvent.change(await screen.findByLabelText("配偶者給与（万円／年）"), { target: { value: "200" } });
  expect(await screen.findByRole("alert")).toHaveTextContent("計算系列を読み込めませんでした。");
  expect(screen.queryByTestId("adjustment-disposable-line")).not.toBeInTheDocument();
});

test("参考例が系列ファイル内にある場合も2線を表示する", async () => {
  mockData(sample, { points: currentPoints, adjustment });
  await openArchive();
  fireEvent.change(await screen.findByLabelText("配偶者給与（万円／年）"), { target: { value: "200" } });
  expect(await screen.findByTestId("adjustment-disposable-line")).toBeInTheDocument();
});

test("通所Rを実測平均や分位と呼ばない説明を常に表示する", async () => {
  mockData(sample);
  await openArchive();
  expect(await screen.findByText(/実測された上限適用前費用の平均・中央値・分位点ではない/)).toBeInTheDocument();
});

test("利用児2人の任意の利用額を世帯合算して所得区分別に頭打ちにする", async () => {
  const data = copySample();
  data.family_profiles.push({ ...familyA, id: "two-a", total_children: 2 },
    { id: "two-ab", total_children: 2, disabled_children: 2, qualification_counts: { A: 1, B: 1, C: 0 } });
  const mock = mockData(data);
  await openArchive();
  const slider = await screen.findByRole("slider", { name: /上限適用前の自己負担相当額/ });
  const fees = screen.getByLabelText("所得区分別にみた上限適用後の世帯負担");
  const total = screen.getByLabelText("子どもの総数");
  const disabled = screen.getByLabelText("うち障害児の人数");
  const pattern = screen.getByLabelText("各障害児の手当要件の組合せ");
  fireEvent.change(total, { target: { value: "2" } });
  expect(pattern).toHaveValue("two-a");
  fireEvent.change(disabled, { target: { value: "2" } });
  expect(pattern).toHaveValue("two-ab");
  fireEvent.change(slider, { target: { value: "5081" } });
  expect(fees.textContent).toBe("非課税0円／月一般14,600円／月一般210,162円／月");
  expect(screen.getByText("two-ab-R5081")).toBeInTheDocument();
  expect(mock).toHaveBeenCalledTimes(1);
  fireEvent.change(slider, { target: { value: "37200" } });
  expect(fees.textContent).toBe("非課税0円／月一般14,600円／月一般237,200円／月");
  fireEvent.change(total, { target: { value: "1" } });
  expect(disabled).toHaveValue("1");
  expect(pattern).toHaveValue("n1-A");
  fireEvent.change(slider, { target: { value: "0" } });
  expect(fees.textContent).toBe("非課税0円／月一般10円／月一般20円／月");
});
