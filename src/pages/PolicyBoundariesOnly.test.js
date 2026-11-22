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
  useSalaryGraphDataset.mockReset();
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
  fireEvent.click(screen.getByRole("checkbox",{name:"就学奨励費"}));
  expect(within(svg).queryByRole("group",{name:/就学奨励費/})).toBeNull();
  expect(within(svg).getByRole("group",{name:/日常生活用具/})).toBeInTheDocument();
  expect(screen.getByRole("checkbox",{name:/医療費助成.*条件未指定/})).toBeDisabled();
  expect(within(svg).queryByLabelText(/下落|回復/)).toBeNull();
});

test("月需要額を仮置きせず、利用者が指定した値と医療の判定条件を描画時に渡す",()=>{
  render(<PolicyBoundariesOnly inputs={inputs}/>);
  expect(usePolicyBoundaryDataset).toHaveBeenLastCalledWith(null);
  const need=screen.getByRole("spinbutton",{name:/世帯の月需要額/});
  expect(need).toHaveValue(null);
  fireEvent.click(screen.getByRole("checkbox",{name:"小学部に在籍"}));
  fireEvent.change(need,{target:{value:"-10"}});
  expect(screen.getByRole("button",{name:"制度境界を描画"})).toBeDisabled();
  fireEvent.change(need,{target:{value:"234567"}});
  fireEvent.click(screen.getByRole("checkbox",{name:/手帳等の障害要件/}));
  fireEvent.change(screen.getByRole("combobox",{name:/医療保険の被保険者/}),{target:{value:"spouse"}});
  fireEvent.change(screen.getByRole("combobox",{name:/所得制限の特例/}),{target:{value:"no"}});
  fireEvent.click(screen.getByRole("button",{name:"制度境界を描画"}));
  expect(JSON.parse(usePolicyBoundaryDataset.mock.calls.at(-1)[0])).toMatchObject({inputs,
    options:{educationElementary:true,educationMonthlyNeedYen:234567,
      medical:{disabilityConfirmed:true,insuredParent:"spouse",exceptionConfirmed:false}}});
});

test("Eの制度境界専用タブは既存給与面・下落・回復や点Pを起動せず、世帯設定を使用する",()=>{
  render(<RevisionIncomePlane graphView="systems"/>);
  expect(screen.getByRole("tab",{name:"制度境界のみ（2D）"})).toHaveAttribute("aria-selected","true");
  expect(screen.queryByRole("region",{name:"点P"})).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button",{name:"制度境界を描画"}));
  expect(useSalaryGraphDataset.mock.calls.every(([,enabled])=>enabled===false)).toBe(true);
  const config=JSON.parse(usePolicyBoundaryDataset.mock.calls.at(-1)[0]);
  expect(config.inputs).toMatchObject({children:[{age:8}]});
});
