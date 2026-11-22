import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { createRevisionCalculator } from "../calc/revisionEngine";
import { REVISION_INCOME_DESIGN, salaryGridSize, readSalaryWan, salaryBounds } from "../data/revisionIncomeDesign";
import RevisionIncomePlane from "./RevisionIncomePlane";
import * as surfaceModule from "./RevisionSurface";

beforeEach(()=>window.sessionStorage.clear());

const change = (el, value) => fireEvent.change(el, { target: { value } });
const child = (i) => within(screen.getByRole("group", { name: "子ども" + i }));
const combination = (i) => child(i).getByRole("combobox", { name: "障害の組み合わせ" });
const serviceSlider = (i) => child(i).getByRole("slider",{name:/通所支援の月額負担/});
const renderWithPoint = () => render(<RevisionIncomePlane />);
const conditions = () => screen.getByText("世帯と子どもの条件",{selector:"summary"}).closest("details");
const openConditions = () => { if (!conditions().open) fireEvent.click(conditions().querySelector("summary")); };
const drawGraph = () => fireEvent.click(screen.getByRole("button",{name:"グラフを描画"}));
const setChildCount = (n) => change(screen.getByLabelText("子どもの人数"), String(n));
const savedPoint = () => {
  const url = screen.getByRole("link", {name:/この給与点の世帯条件/}).getAttribute("href");
  return JSON.parse(decodeURIComponent(url.slice(url.indexOf(",")+1)));
};
const savedChildren = ({inputs:{children}} = savedPoint()) => children;

test("独立の整数給与2軸で両端を含み、格子と任意の1点は別物である", () => {
  expect(salaryGridSize()).toEqual({ perAxis: 1501, pairs: 2253001 });
  expect(REVISION_INCOME_DESIGN.salary.excludedCoordinates).toEqual([[0,0]]);
  expect(REVISION_INCOME_DESIGN.status).toBe("on-demand");
  expect([0, "1500", "1", 0.5, "1501", "", undefined, null].map(readSalaryWan)).toEqual([0, 1500, 1, null, null, null, null, null]);
  expect(salaryBounds(2800)).toEqual({ min: 1300, max: 1500 });
});

test("総額固定で配分を変え、入力範囲外の結果を残さない", () => {
  renderWithPoint();
  drawGraph();
  const head = screen.getByRole("spinbutton", { name: /世帯主の給与収入/ });
  const spouse = screen.getByRole("spinbutton", { name: /配偶者の給与収入/ });
  change(head, "1470"); change(spouse, "1330");
  expect(screen.getByText(/総額：2,800万円/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("checkbox", { name: /総額を固定/ }));
  change(spouse, "1500"); expect(head).toHaveValue(1300);
  expect(screen.getByRole("figure", { name:/可処分所得の3Dグラフ/ })).toBeInTheDocument();
  change(spouse, "1299"); expect(screen.getByText(/整数を入力してください/)).toBeInTheDocument();
  expect(screen.getByRole("figure", { name:/可処分所得の3Dグラフ/ })).toBeVisible();
  expect(screen.queryByRole("link",{name:/この給与点の世帯条件/})).not.toBeInTheDocument();
  change(spouse, ""); fireEvent.click(screen.getByRole("checkbox", { name: /総額を固定/ }));
  change(spouse, "0"); expect(screen.getByText(/総額：1,300万円/)).toBeInTheDocument();
});

test("点Pは初期表示から可視で、3Dの境界選択が両方の給与・内訳へ同時に反映される", () => {
  const surface=jest.spyOn(surfaceModule,"RevisionSurface");
  const current=()=>surface.mock.calls[surface.mock.calls.length-1][0];
  try {
    renderWithPoint();
    const section=screen.getByRole("region",{name:"点P"}), p=within(section);
    expect(section.closest("details")).toBeNull();
    expect(p.getByRole("heading",{name:"点P"})).toBeVisible();
    expect(surface).not.toHaveBeenCalled();
    expect(conditions()).toHaveAttribute("open");
    drawGraph();
    expect(conditions()).not.toHaveAttribute("open");
    expect(current()).toMatchObject({head:200,spouse:0,point:{status:"calculated"}});
    const fixed=p.getByRole("checkbox",{name:/総額を固定/});
    fireEvent.click(fixed);
    act(()=>current().onSelectSalary(150,50));
    expect(fixed).toBeChecked();
    act(()=>current().onSelectSalary(360,120));
    expect(fixed).toBeChecked();
    expect(current()).toMatchObject({head:150,spouse:50,fixedTotal:200});
    fireEvent.click(fixed);
    act(()=>current().onSelectSalary(360,120));
    expect(fixed).not.toBeChecked();
    expect(p.getByRole("spinbutton",{name:/世帯主の給与収入/})).toHaveValue(360);
    expect(p.getByRole("spinbutton",{name:/配偶者の給与収入/})).toHaveValue(120);
    expect(current()).toMatchObject({head:360,spouse:120,point:{studyDisposableWan:savedPoint().result.studyDisposableWan}});
    expect(savedPoint()).toMatchObject({headSalaryWan:360,spouseSalaryWan:120});
    change(p.getByRole("spinbutton",{name:/配偶者の給与収入/}),"");
    expect(current()).toMatchObject({head:null,spouse:null,point:null});
  } finally { surface.mockRestore(); }
});

test("同じタブで再表示すると子ども別の条件・通所額、申告条件、点Pと総額固定を復元する", () => {
  const first=renderWithPoint();
  setChildCount(2);
  change(child(2).getByLabelText("年齢"),"16");
  change(combination(2),"1:yes:special");
  change(child(2).getByLabelText("この子を税の扶養親族として申告する親"),"spouse");
  fireEvent.click(child(2).getByLabelText(/前年12月31日/));
  change(serviceSlider(1),"1100"); change(serviceSlider(2),"3200");
  change(screen.getByLabelText("配偶者控除・配偶者特別控除を申告する親"),"none");
  change(screen.getByLabelText("障害児福祉手当の主たる生計維持者"),"spouse");
  change(screen.getByLabelText(/世帯主の給与収入/),"460");
  change(screen.getByLabelText(/配偶者の給与収入/),"120");
  fireEvent.click(screen.getByRole("checkbox",{name:/総額を固定/}));
  drawGraph();
  const before=savedPoint();
  first.unmount(); renderWithPoint();
  expect(savedPoint()).toEqual(before);
  expect(screen.getByRole("figure",{name:/3Dグラフ/})).toBeVisible();
  expect(conditions()).not.toHaveAttribute("open");
  openConditions();
  expect(screen.getByLabelText("子どもの人数")).toHaveValue("2");
  expect(serviceSlider(1)).toHaveValue("1100"); expect(serviceSlider(2)).toHaveValue("3200");
  expect(screen.getByRole("checkbox",{name:/総額を固定/})).toBeChecked();
  change(screen.getByLabelText(/配偶者の給与収入/),"121");
  expect(screen.getByLabelText(/世帯主の給与収入/)).toHaveValue(459);
});

test("世帯条件を変更したら古い図は消え、元の条件に戻しても描画ボタンを押すまで格子を作らない", () => {
  const first=renderWithPoint();
  const graph=()=>screen.queryByRole("figure",{name:/3Dグラフ/});
  expect(graph()).not.toBeInTheDocument();
  setChildCount(2);
  change(serviceSlider(2),"1200");
  expect(graph()).not.toBeInTheDocument();
  drawGraph();
  const drawn=graph();
  expect(drawn).toBeVisible();
  change(screen.getByLabelText(/世帯主の給与収入/),"450");
  expect(graph()).toBe(drawn);
  openConditions();
  change(serviceSlider(2),"2300");
  expect(graph()).not.toBeInTheDocument();
  change(serviceSlider(2),"1200");
  expect(graph()).not.toBeInTheDocument();
  first.unmount(); renderWithPoint();
  expect(graph()).not.toBeInTheDocument();
  drawGraph();
  expect(graph()).toBeVisible();
});

test("児童別のプルダウンは15通りすべてを直接選べ、他の児童の入力を変えずに各制度の条件で再計算する", () => {
  renderWithPoint();
  expect(screen.queryByLabelText("比較ケースの初期値")).not.toBeInTheDocument();
  expect(screen.queryByRole("region", { name:/固定した3ケースの比較/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name:/3ケースの図表/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("checkbox", { name:/根拠未確定|感度分析/ })).not.toBeInTheDocument();
  for (const oldLabel of ["特別児童扶養手当", "障害児福祉手当", "税法上の区分"]) {
    expect(child(1).queryByRole("combobox", { name:oldLabel })).not.toBeInTheDocument();
  }
  setChildCount(2);
  const expected = ["not:no", "2:no", "2:yes", "1:no", "1:yes"]
    .flatMap(pair => ["none", "ordinary", "special"].map(tax => pair + ":" + tax));
  const select = combination(1);
  const options = within(select).getAllByRole("option");
  expect(options.map(o => o.value).sort()).toEqual([...expected].sort());
  expect(new Set(options.map(o => o.textContent.trim())).size).toBe(expected.length);
  change(combination(2), "1:yes:special");
  change(serviceSlider(2), "2123");
  const otherChild = savedChildren()[1];
  expect(otherChild).toMatchObject({tccaGrade:"1", welfareEligible:true, taxStatus:"special", serviceAmountYen:2123});
  for (const value of expected) {
    const [grade, welfare, tax] = value.split(":");
    expect(options.find(option => option.value === value)).toBeEnabled();
    change(select, value);
    expect(select).toHaveValue(value);
    const point = savedPoint();
    expect(savedChildren(point)[0]).toMatchObject({tccaGrade:grade, welfareEligible:welfare === "yes", taxStatus:tax});
    expect(savedChildren(point)[1]).toEqual(otherChild);
    expect(combination(2)).toHaveValue("1:yes:special");
    expect(point.result.status).toBe("calculated");
    const recalculated = createRevisionCalculator(point.inputs).evaluate(point.headSalaryWan, point.spouseSalaryWan);
    expect(point.result.breakdown).toEqual(recalculated.breakdown);
  }
  setChildCount(3);
  change(child(3).getByLabelText("年齢"), "17");
  change(combination(3), "2:yes:ordinary");
  expect(savedChildren()[2]).toMatchObject({age:17, tccaGrade:"2", welfareEligible:true, taxStatus:"ordinary"});
  setChildCount(1);
  expect(screen.queryByRole("group", { name: "子ども2" })).not.toBeInTheDocument();
  expect(savedChildren()).toHaveLength(1);
});

test("就学奨励費と対象支出はともに除外し、画面と保存した試算結果が一致する", () => {
  renderWithPoint();
  expect(screen.queryByLabelText("就学条件")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("世帯の年間需要額（円）")).not.toBeInTheDocument();
  expect(screen.getByText(/就学奨励費（N04）とその対象支出、医療費助成（M01）と医療の自己負担は試算対象外/)).toBeInTheDocument();
  const saved = savedPoint();
  expect(saved).toMatchObject({schema:"household-income-point-paper-2029",inputs:{protocol:"paper-2029"},
    outcome:{field:"studyDisposableWan", axis:"世帯の可処分所得"},
    result:{status:"calculated", studyDisposableWan: expect.any(Number)}});
  for(const field of ["education","medical"]) expect(saved.inputs).not.toHaveProperty(field);
  for(const field of ["school","education","medical"]) expect(saved.result.details).not.toHaveProperty(field);
  for(const field of ["educationExpenseWan","educationAidWan","medicalAidWan","medicalExpenseWan"]) expect(saved.result.breakdown).not.toHaveProperty(field);
  const value = saved.result.studyDisposableWan.toLocaleString("ja-JP", { maximumFractionDigits: 2 });
  expect(screen.getByText(saved.outcome.axis)).toBeVisible();
  expect(screen.getByText(value, {selector:".revision-result span"})).toBeVisible();
});

test("断面の全1,501点計算を画面から外し、立体図と給与一点の内訳は残す", () => {
  renderWithPoint();
  drawGraph();
  expect(screen.queryByText(/片方の給与を固定して/)).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name:/1,501点を計算/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name:/1,501点をCSV/ })).not.toBeInTheDocument();
  expect(screen.getByRole("figure", {name:/可処分所得の3Dグラフ/})).toBeVisible();
  expect(savedPoint().result.status).toBe("calculated");
});

test("新稿画面は船橋市の固定条件で夫婦を個別計算し、旧国保・勤務時間の入力を求めない",()=>{
  renderWithPoint();
  setChildCount(2);
  expect(screen.queryByLabelText("配偶者の勤務先の健康保険・厚生年金")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("世帯の当年の国保支払額（円／年）")).not.toBeInTheDocument();
  change(child(2).getByLabelText("この子を税の扶養親族として申告する親"),"spouse");
  fireEvent.click(child(2).getByLabelText(/前年12月31日/));
  change(screen.getByLabelText(/世帯主の給与収入/),"350");
  change(screen.getByLabelText(/配偶者の給与収入/),"500");
  let p=savedPoint();
  expect(p.inputs.protocol).toBe("paper-2029");
  expect(p.inputs).not.toHaveProperty("insurance");
  expect(p.inputs.roles).toEqual({spouseDeductionClaimant:"head",allowanceRecipient:"head",welfareMaintainer:"highest-salary"});
  expect(savedChildren(p).map(c=>c.taxDependentOf)).toEqual(["head","spouse"]);
  expect(savedChildren(p)[1].maintainedByRecipient).toBe(true);
  expect(p.result.details.roles).toMatchObject({allowanceRecipient:"head",welfareMaintainer:"spouse"});
  expect(p.result.details.insurance.spouse.status).toBe("employee");
  const totals=screen.getByRole("table",{name:"世帯の可処分所得（円／年）",hidden:true});
  const taxRow=within(totals).getByText("税額",{selector:"th"}).closest("tr");
  expect(taxRow.cells[2]).toHaveTextContent(p.result.details.spouseTax.incomeTaxYen.toLocaleString("ja-JP"));
  expect(taxRow.cells[3]).toHaveTextContent(Math.round(p.result.breakdown.taxWan*10000).toLocaleString("ja-JP")+"円");
  change(screen.getByLabelText(/配偶者の給与収入/),"350");
  expect(savedPoint().result.details.roles.welfareMaintainer).toBe("head");
  change(screen.getByLabelText("障害児福祉手当の主たる生計維持者"),"spouse");
  change(screen.getByLabelText("配偶者控除・配偶者特別控除を申告する親"),"none");
  expect(savedPoint().result.details.roles).toMatchObject({allowanceRecipient:"head",welfareMaintainer:"spouse",spouseDeductionClaimant:"none"});
  for(const w of ["1","129","130"]) {
    change(screen.getByLabelText(/配偶者の給与収入/),w);
    expect(savedPoint().result.details.insurance.spouse.status).toBe("employee");
  }
  change(screen.getByLabelText(/配偶者の給与収入/),"0");
  expect(savedPoint().result.details.insurance.spouse.status).toBe("dependent");
  change(screen.getByLabelText(/世帯主の給与収入/),"0");
  expect(savedPoint().result).toMatchObject({status:"excluded",studyDisposableWan:null,breakdown:null});
  expect(screen.getByText("この給与点は試算対象外")).toBeVisible();
});

test("児童別の通所スライダーは0円なら利用なし、正額なら合算後に世帯上限を一度だけ適用する",()=>{
  renderWithPoint();
  expect(serviceSlider(1)).toBeVisible();
  expect(screen.queryByRole("group",{name:/サービス利用者負担/})).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/通所以外の合算対象負担/)).not.toBeInTheDocument();
  expect(savedPoint().inputs).not.toHaveProperty("otherServiceMonthlyYen");
  expect(child(1).getByLabelText("年齢")).toHaveValue("8");
  expect(savedChildren()[0]).toMatchObject({age:8,serviceUser:false,serviceAmountYen:0});
  setChildCount(2);
  expect(screen.queryByRole("checkbox",{name:/通所支援を利用|児童ごとに通所の月額を指定/})).not.toBeInTheDocument();
  expect(screen.queryByRole("slider",{name:/利用児1人当たり/})).not.toBeInTheDocument();
  change(screen.getByLabelText(/世帯主の給与収入/),"1500");
  const first=serviceSlider(1), second=serviceSlider(2);
  for(const slider of [first,second]){
    expect(slider).toHaveAttribute("min","0"); expect(slider).toHaveAttribute("max","37200");
    expect(slider).toHaveAttribute("step","1"); expect(slider).toHaveValue("0");
  }
  const check=(sum,other,cap,monthly)=>{
    const {result}=savedPoint();
    expect(result.details.service).toMatchObject({dayMonthlyBeforeCapYen:sum,otherServiceMonthlyYen:other,householdCapYen:cap,monthly,annual:monthly*12});
    expect(Math.round(result.breakdown.serviceWan*10000)).toBe(monthly*12);
  };
  check(0,0,37200,0);
  change(first,"10406");check(10406,0,37200,10406);
  expect(second).toHaveValue("0");
  expect(savedChildren().map(c=>[c.serviceUser,c.serviceAmountYen])).toEqual([[true,10406],[false,0]]);
  change(second,"10406");check(20812,0,37200,20812);
  change(first,"37200");change(second,"37200");check(74400,0,37200,37200);
  change(first,"0");change(second,"0");check(0,0,37200,0);
  expect(savedChildren().map(c=>c.serviceUser)).toEqual([false,false]);
  change(first,"1100");change(second,"2200");
  check(3300,0,37200,3300);
  change(screen.getByLabelText(/世帯主の給与収入/),"400");check(3300,0,4600,3300);
  change(second,"10000");check(11100,0,4600,4600);
  change(child(2).getByLabelText("年齢"),"4");check(1100,0,4600,1100);
  expect(child(2).getByText(/通所は無償/)).toBeVisible();
  // The child age exemption is for day support only, even if another charge
  // is supplied to the same calculator outside this UI.
  const p=savedPoint();
  const recalculated=createRevisionCalculator({...p.inputs,otherServiceMonthlyYen:300}).evaluate(p.headSalaryWan,p.spouseSalaryWan);
  expect(recalculated.details.service).toMatchObject({dayMonthlyBeforeCapYen:1100,otherServiceMonthlyYen:300,monthly:1400});
});
