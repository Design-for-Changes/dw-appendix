import {fireEvent,render,screen,within} from "@testing-library/react";
import PolicyBoundariesOnly, {PolicyBoundaryFigure} from "./PolicyBoundariesOnly";
import {partitionPolicyBoundaries} from "./policyBoundaryInk";
import {usePolicyBoundaryDataset} from "./policyBoundaryDataset";
import RevisionIncomePlane from "./RevisionIncomePlane";
import {useSalaryGraphDataset} from "./salaryGraphDataset";

jest.mock("./policyBoundaryDataset",()=>({usePolicyBoundaryDataset:jest.fn(),retryPolicyBoundaryDataset:jest.fn()}));
jest.mock("./salaryGraphDataset",()=>({useSalaryGraphDataset:jest.fn()}));
const inputs={protocol:"paper-2029",children:[{age:9}]};
const layers=[
  {id:"N04",label:"就学奨励費",status:"calculated",classes:["第1区分","第2区分"],segments:[[1,.5,8,.5,1,2]]},
  {id:"N02/M03",label:"日常生活用具",status:"calculated",classes:["0円","37,200円"],segments:[[4,.5,9,.5,1,2]]},
  {id:"M01",label:"医療費助成",status:"needs-input",classes:[],segments:[]},
];
beforeEach(()=>{
  window.sessionStorage.clear();
  usePolicyBoundaryDataset.mockReset();
  useSalaryGraphDataset.mockReset().mockReturnValue(null);
});

test("重なる線は重なる区間だけ複数色、直交点は共通区間としない",()=>{
  const added={id:"Q",classes:["a","b"],segments:[[6,0,6,3,1,2]]};
  const groups=partitionPolicyBoundaries([...layers,added]);
  expect(groups.find(g=>g.ids.length===2)).toMatchObject({ids:["N02/M03","N04"],segments:[[4,.5,8,.5]]});
  expect(groups.filter(g=>g.ids.includes("Q"))).toHaveLength(1);
  expect(groups.find(g=>g.ids.includes("Q")).segments).toEqual([[6,0,6,3]]);
});

test("区分の境界だけを表示し、重複する線は制度別に切り替えられる",()=>{
  render(<PolicyBoundaryFigure result={{maxSalaryWan:1500,layers}}/>);
  const svg=screen.getByRole("group",{name:/横軸/});
  const both=within(svg).getByRole("group",{name:/日常生活用具.*就学奨励費/});
  // SVG paths encode stroke stacking, which is not represented in the accessibility tree.
  // eslint-disable-next-line testing-library/no-node-access
  expect(both.querySelectorAll("path[data-system]")).toHaveLength(2);
  fireEvent.click(both);
  expect(screen.getByText(/日常生活用具.*第1区分 ↔ 第2区分/, {selector:"figcaption"})).toBeInTheDocument();
  const education=screen.getByRole("button",{name:"就学奨励費"});
  expect(education).toHaveAttribute("aria-pressed","true");
  fireEvent.click(education);
  expect(education).toHaveAttribute("aria-pressed","false");
  expect(within(svg).queryByRole("group",{name:/就学奨励費/})).toBeNull();
  expect(within(svg).getByRole("group",{name:/日常生活用具/})).toBeInTheDocument();
  expect(screen.getByRole("button",{name:/医療費助成/})).toBeDisabled();
  fireEvent.click(screen.getByRole("button",{name:"すべて"}));
  expect(education).toHaveAttribute("aria-pressed","true");
  expect(within(svg).getByRole("group",{name:/日常生活用具.*就学奨励費/})).toBeInTheDocument();
  expect(within(svg).queryByLabelText(/下落|回復/)).toBeNull();
});

test("制度図は世帯画面で確定した条件をそのまま使い、在籍・需要額合計・医療要件を再入力させない",()=>{
  const educationInputs={previousAnnualCommuteYen:19200};
  render(<PolicyBoundariesOnly inputs={inputs} educationInputs={educationInputs}/>);
  expect(JSON.parse(usePolicyBoundaryDataset.mock.calls.at(-1)[0])).toMatchObject({inputs, options:{educationInputs}});
  for(const label of [/世帯の月需要額/,/小学部に在籍/,/手帳等の障害要件/,/医療保険の被保険者/,/所得制限の特例/])
    expect(screen.queryByLabelText(label)).not.toBeInTheDocument();
  expect(screen.queryByRole("button",{name:"制度境界を描画"})).not.toBeInTheDocument();
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

test("教育の条件を含む共通の描画状態は再表示しても保持し、給与格子にはその金額を混入させない",()=>{
  const educationInputs={previousAnnualCommuteYen:24000};
  window.sessionStorage.setItem("dw-appendix:salary-surface:v1:boundaryEducationInputsV2",JSON.stringify(educationInputs));
  const {unmount}=render(<RevisionIncomePlane graphView="systems"/>);
  fireEvent.click(screen.getByRole("button",{name:"グラフを描画"}));
  const key=usePolicyBoundaryDataset.mock.calls.at(-1)[0];
  expect(JSON.parse(key)).toMatchObject({options:{educationInputs}});
  unmount();
  usePolicyBoundaryDataset.mockClear();
  render(<RevisionIncomePlane graphView="systems"/>);
  expect(usePolicyBoundaryDataset).toHaveBeenLastCalledWith(key);
  expect(useSalaryGraphDataset.mock.calls.at(-1)[0]).not.toHaveProperty("educationInputs");
});

test("教材費だけ変えた場合も前の制度線を直ちに閉じ、共通の描画ボタンから新しい金額を渡す",()=>{
  usePolicyBoundaryDataset.mockReturnValue({type:"ready",result:{maxSalaryWan:1500,layers}});
  render(<RevisionIncomePlane graphView="systems"/>);
  const draw=()=>fireEvent.click(screen.getByRole("button",{name:"グラフを描画"}));
  draw();
  expect(screen.getByRole("figure")).toBeVisible();
  fireEvent.click(screen.getByText("世帯と子どもの条件",{selector:"summary"}));
  fireEvent.click(screen.getByText("就学奨励費の制度境界",{selector:"summary"}));
  fireEvent.change(screen.getByRole("spinbutton",{name:/学校指定の教材費/}),{target:{value:"12000"}});
  expect(screen.queryByRole("figure")).not.toBeInTheDocument();
  draw();
  const {inputs:household,options}=JSON.parse(usePolicyBoundaryDataset.mock.calls.at(-1)[0]);
  expect(options.educationInputs).toEqual({annualMaterialsYen:12000});
  expect(household).not.toHaveProperty("educationInputs");
  expect(screen.getByRole("figure")).toBeVisible();
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
  switchTo("制度境界・下落・同水準線（2D）");
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
