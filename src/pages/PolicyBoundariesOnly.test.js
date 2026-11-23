import {fireEvent,render,screen,within} from "@testing-library/react";
import PolicyBoundariesOnly, {PolicyBoundaryFigure} from "./PolicyBoundariesOnly";
import {partitionPolicyBoundaries} from "./policyBoundaryInk";
import {usePolicyBoundaryDataset} from "./policyBoundaryDataset";
import RevisionIncomePlane from "./RevisionIncomePlane";
import {useSalaryGraphDataset} from "./salaryGraphDataset";
import {buildPolicyOnlyMap} from "../calc/policyOnlyBoundaries";

jest.mock("./policyBoundaryDataset",()=>({usePolicyBoundaryDataset:jest.fn(),retryPolicyBoundaryDataset:jest.fn()}));
jest.mock("./salaryGraphDataset",()=>({useSalaryGraphDataset:jest.fn()}));
const inputs={protocol:"paper-2029",children:[{age:9}]};
const layers=[
  {id:"N01-1",label:"特別児童扶養手当",status:"calculated",classes:["支給","支給停止"],segments:[[1,.5,8,.5,1,2]]},
  {id:"N02/M03",label:"日常生活用具",status:"calculated",classes:["0円","37,200円"],segments:[[4,.5,9,.5,1,2]]},
  {id:"N01-2",label:"障害児福祉手当",status:"not-applicable",classes:[],segments:[]},
];
beforeEach(()=>{
  window.sessionStorage.clear();
  usePolicyBoundaryDataset.mockReset();
  useSalaryGraphDataset.mockReset().mockReturnValue(null);
});

test("重なる線は重なる区間だけ複数色、直交点は共通区間としない",()=>{
  const added={id:"Q",classes:["a","b"],segments:[[6,0,6,3,1,2]]};
  const groups=partitionPolicyBoundaries([...layers,added]);
  expect(groups.find(g=>g.ids.length===2)).toMatchObject({ids:["N01-1","N02/M03"],segments:[[4,.5,8,.5]]});
  expect(groups.filter(g=>g.ids.includes("Q"))).toHaveLength(1);
  expect(groups.find(g=>g.ids.includes("Q")).segments).toEqual([[6,0,6,3]]);
});

test("区分の境界だけを表示し、重複する線は制度別に切り替えられる",()=>{
  render(<PolicyBoundaryFigure result={{maxSalaryWan:1500,layers}}/>);
  const svg=screen.getByRole("group",{name:/横軸/});
  const both=within(svg).getByRole("group",{name:/特別児童扶養手当.*日常生活用具/});
  // SVG paths encode stroke stacking, which is not represented in the accessibility tree.
  // eslint-disable-next-line testing-library/no-node-access
  expect(both.querySelectorAll("path[data-system]")).toHaveLength(2);
  fireEvent.click(both);
  expect(screen.getByText(/支給 ↔ 支給停止.*日常生活用具/, {selector:"figcaption"})).toBeInTheDocument();
  const allowance=screen.getByRole("button",{name:"特別児童扶養手当"});
  expect(allowance).toHaveAttribute("aria-pressed","true");
  fireEvent.click(allowance);
  expect(allowance).toHaveAttribute("aria-pressed","false");
  expect(within(svg).queryByRole("group",{name:/特別児童扶養手当/})).toBeNull();
  expect(within(svg).getByRole("group",{name:/日常生活用具/})).toBeInTheDocument();
  expect(screen.getByRole("button",{name:/障害児福祉手当/})).toBeDisabled();
  fireEvent.click(screen.getByRole("button",{name:"すべて"}));
  expect(allowance).toHaveAttribute("aria-pressed","true");
  expect(within(svg).getByRole("group",{name:/特別児童扶養手当.*日常生活用具/})).toBeInTheDocument();
  expect(within(svg).queryByLabelText(/下落|回復/)).toBeNull();
});

test("制度図は世帯画面で確定した条件をそのまま使い、在籍・需要額合計・医療要件を再入力させない",()=>{
  render(<PolicyBoundariesOnly inputs={inputs}/>);
  expect(JSON.parse(usePolicyBoundaryDataset.mock.calls.at(-1)[0])).toEqual({inputs});
  for(const label of [/世帯の月需要額/,/小学部に在籍/,/手帳等の障害要件/,/医療保険の被保険者/,/所得制限の特例/])
    expect(screen.queryByLabelText(label)).not.toBeInTheDocument();
  expect(screen.queryByRole("button",{name:"制度境界を描画"})).not.toBeInTheDocument();
});

test("実際の分類結果を描画するとN04とM01は凡例・資料から外れ、別制度の育成医療等は残る",()=>{
  const household={protocol:"paper-2029",children:[{age:8,tccaGrade:"1",welfareEligible:true,taxStatus:"special",serviceUser:false,serviceAmountYen:0}]};
  usePolicyBoundaryDataset.mockReturnValue({type:"ready",result:buildPolicyOnlyMap(household,{maxSalaryWan:10})});
  render(<PolicyBoundariesOnly inputs={household}/>);
  const legend=screen.getByRole("group",{name:"表示する制度"});
  expect(legend.previousElementSibling).toHaveTextContent("（船橋市を想定）");
  expect(legend).not.toHaveTextContent(/就学奨励費|重度心身障害者医療費助成/);
  expect(within(legend).getByRole("button",{name:/育成・精神通院/})).toBeInTheDocument();
  fireEvent.click(screen.getByText("境界の算定に用いた資料",{selector:"summary"}));
  expect(screen.queryByRole("link",{name:/就学奨励費|需要額|重度心身障害者医療費助成/})).not.toBeInTheDocument();
  expect(screen.getByRole("link",{name:/育成・精神通院/})).toBeVisible();
});

test("Eの制度境界専用タブは既存給与面・下落・回復や点Pを起動せず、世帯設定を使用する",()=>{
  render(<RevisionIncomePlane graphView="systems"/>);
  expect(screen.getByRole("tab",{name:"制度境界のみ（2D）"})).toHaveAttribute("aria-selected","true");
  expect(screen.queryByRole("region",{name:"点P"})).not.toBeInTheDocument();
  expect(usePolicyBoundaryDataset).not.toHaveBeenCalled();
  expect(screen.queryByRole("button",{name:"制度境界を描画"})).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button",{name:"グラフを描画"}));
  expect(useSalaryGraphDataset.mock.calls.every(([,enabled])=>enabled===false)).toBe(true);
  const config=JSON.parse(usePolicyBoundaryDataset.mock.calls.at(-1)[0]);
  expect(config.inputs).toMatchObject({children:[{age:8}]});
});

test("就学奨励費用の旧入力があっても、同じ世帯の描画状態を保持し、制度図・給与格子の計算には渡さない",()=>{
  const prefix="dw-appendix:salary-surface:v1:";
  const {unmount}=render(<RevisionIncomePlane graphView="systems"/>);
  fireEvent.click(screen.getByRole("button",{name:"グラフを描画"}));
  const key=usePolicyBoundaryDataset.mock.calls.at(-1)[0];
  const household=JSON.parse(key).inputs;
  unmount();
  const educationInputs={previousAnnualCommuteYen:24000};
  window.sessionStorage.setItem(prefix+"boundaryEducationInputsV2",JSON.stringify(educationInputs));
  // The previous release saved a serialized compound key as a JSON string.
  window.sessionStorage.setItem(prefix+"lastDrawnKey",JSON.stringify(JSON.stringify({inputs:household,educationInputs})));
  usePolicyBoundaryDataset.mockClear();
  render(<RevisionIncomePlane graphView="systems"/>);
  expect(usePolicyBoundaryDataset).toHaveBeenLastCalledWith(key);
  expect(JSON.parse(key)).toEqual({inputs:household});
  expect(useSalaryGraphDataset.mock.calls.at(-1)[0]).toEqual(household);
});

test("世帯条件には就学奨励費の専用欄がなく、教材費・通学費を仮置きしない",()=>{
  render(<RevisionIncomePlane graphView="systems"/>);
  expect(screen.getByLabelText("子どもの人数")).toBeVisible();
  expect(screen.queryByText(/就学奨励費の制度境界/)).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/教材費|通学費|通学交通費/)).not.toBeInTheDocument();
});

test("旧形式の描画条件でも世帯が違えば再利用しない",()=>{
  const prior={inputs:{...inputs,children:[{age:17}]},educationInputs:{annualMaterialsYen:2000}};
  window.sessionStorage.setItem("dw-appendix:salary-surface:v1:lastDrawnKey",JSON.stringify(JSON.stringify(prior)));
  render(<RevisionIncomePlane graphView="systems"/>);
  expect(screen.getByRole("button",{name:"グラフを描画"})).toBeEnabled();
  expect(usePolicyBoundaryDataset).not.toHaveBeenCalled();
});

test("他図から初めて制度図を開く場合も再描画は不要。同じ条件で戻ると同じ結果、変更後は前の結果を出さない",()=>{
  usePolicyBoundaryDataset.mockReturnValue({type:"ready",result:{maxSalaryWan:1500,layers}});
  render(<RevisionIncomePlane/>);
  const switchTo=name=>fireEvent.click(screen.getByRole("tab",{name}));
  const plot=()=>screen.queryByRole("figure",{name:"制度ごとの所得区分の境界"});
  fireEvent.click(screen.getByRole("button",{name:"グラフを描画"}));
  expect(usePolicyBoundaryDataset).not.toHaveBeenCalled();
  switchTo("制度境界のみ（2D）");
  expect(plot()).toBeVisible();
  const initialPlot=plot(), key=usePolicyBoundaryDataset.mock.calls.at(-1)[0];
  switchTo("可処分所得差");
  expect(initialPlot).not.toBeVisible();
  switchTo("制度境界・下落（2D）");
  expect(initialPlot).not.toBeVisible();
  switchTo("制度境界のみ（2D）");
  expect(plot()).toBe(initialPlot);
  expect(usePolicyBoundaryDataset.mock.calls.at(-1)[0]).toBe(key);
  fireEvent.click(screen.getByText("世帯と子どもの条件",{selector:"summary"}));
  fireEvent.change(screen.getByLabelText("子どもの人数"),{target:{value:"2"}});
  expect(plot()).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button",{name:"グラフを描画"}));
  expect(plot()).toBeVisible();
  expect(JSON.parse(usePolicyBoundaryDataset.mock.calls.at(-1)[0]).inputs).toMatchObject({children:[{age:8},{age:8}]});
});
