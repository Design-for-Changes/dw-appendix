import {fireEvent,render,screen,within} from "@testing-library/react";
import SalaryDecisionMapPage,{endpointsForBoundary} from "./SalaryDecisionMapPage";
import {createRevisionCalculator} from "../calc/revisionEngine";

function inputsFor(child={}) {
  return {protocol:"paper-2029",serviceAmountYen:0,
    roles:{allowanceRecipient:"highest-salary",welfareMaintainer:"highest-salary",spouseDeductionClaimant:"head"},
    children:[{age:8,tccaGrade:"1",taxStatus:"special",welfareEligible:true,taxDependentOf:"highest-salary",maintainedBy:null,serviceUser:true,serviceAmountYen:20000,...child}]};
}
function draw(child){
  const inputs=inputsFor(child),calculator=createRevisionCalculator(inputs);
  const props={inputs,calculator,head:600,spouse:200,fixedTotal:null,onSelectSalary:jest.fn()};
  const view=render(<SalaryDecisionMapPage {...props} datasetState={{type:"progress",percent:40}}/>);
  function finish(segments={},outcomeLines) {
    const layers=["N01-1","N01-2","N02/N03"].map(id=>({id,segments:segments[id]||[]}));
    const empty=()=>({drop:[],recovery:[],dropMasks:[],recoveryDropIndex:[]});
    const map={maxSalaryWan:1500,validCount:2253000,layers,outcomeLines:outcomeLines??{head:empty(),spouse:empty()}};
    view.rerender(<SalaryDecisionMapPage {...props} datasetState={{type:"complete",map}}/>);
  }
  return {calculator,finish};
}
const plot=()=>screen.getByRole("img",{name:/横軸：世帯主.*縦軸：配偶者/});

test("縦線・横線を正しい給与軸の1万円差に戻し、線分端や座標端で範囲外へ飛ばない",()=>{
  expect(endpointsForBoundary([7.5,0,7.5,3.5],7.5,3.5)).toEqual([[7,3],[8,3]]);
  expect(endpointsForBoundary([7.5,3.5,7.5,12.5],7.5,3.5)).toEqual([[7,4],[8,4]]);
  expect(endpointsForBoundary([10.5,1499.5,1500,1499.5],1500,1499.5)).toEqual([[1500,1499],[1500,1500]]);
});

test("Gの描画結果を使い、各制度の線を夫婦の給与全域に色分けして表示する",()=>{
  const {finish}=draw();
  finish({"N01-1":[[0,906.5,300.5,906.5]],"N01-2":[[599.5,906.5,600.5,906.5]],"N02/N03":[[811.5,199.5,811.5,200.5]]});
  const map=plot();
  expect(screen.getAllByRole("img")).toHaveLength(1);
  expect(within(map).getAllByText("0")).toHaveLength(2);
  expect(within(map).getAllByText("1,500")).toHaveLength(2);
  const systems=Array.from(map.querySelectorAll("path[data-system]"));
  expect(systems.map(path=>path.dataset.system)).toEqual(["N01-1","N01-2","N02/N03"]);
  expect(systems.every(path=>/^M.+L/.test(path.getAttribute("d")))).toBe(true);
  expect(new Set(systems.map(path=>path.getAttribute("stroke"))).size).toBe(3);
  for(const label of ["特別児童扶養手当","障害児福祉手当","通所等の負担上限"]) {
    expect(within(screen.getByRole("list",{name:"制度別の凡例"})).getByText(label)).toBeVisible();
  }
  fireEvent.keyDown(map,{key:"ArrowRight"});
  fireEvent.keyDown(map,{key:"Enter"});
  expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
  expect(screen.queryByRole("slider")).not.toBeInTheDocument();
  expect(screen.queryByRole("button",{name:/描画/})).not.toBeInTheDocument();
  expect(screen.queryByText(/断面|固定給与/)).not.toBeInTheDocument();
  expect(screen.queryByTestId("income-section-guide")).not.toBeInTheDocument();
});

test("該当境界がなければ平面図に切替なしと表示する",()=>{
  const {finish}=draw();finish();
  expect(screen.getByText("この条件では対象制度の切り替わりはありません。")).toBeVisible();
});

test("増収方向を切り替えると、児福停止時の下落線と初回回復線が同じXY平面内の正しい給与位置に描かれる",()=>{
  const {calculator,finish}=draw();
  const horizontal=y=>[599.5,y-.5,600.5,y-.5],vertical=x=>[x-.5,599.5,x-.5,600.5];
  const pair=line=>({drop:[line(907)],recovery:[line(937)],dropMasks:[2],recoveryDropIndex:[0]});
  // 世帯主／配偶者とも600万円以上ではこの世帯条件の給与軸を交換しても同じ算定値となる。
  // 906万円直前水準を907〜936万円は下回り、937万円で初めて回復する。
  for(const axis of ["head","spouse"]) {
    const net=w=>Math.round((axis==="head"?calculator.evaluate(w,600):calculator.evaluate(600,w)).studyDisposableWan*10000);
    expect([net(906),net(907),net(937)]).toEqual([11419020,11227552,11425160]);
    for(let w=908;w<937;w++)expect(net(w)).toBeLessThan(net(906));
  }
  finish({"N01-2":[vertical(907),horizontal(907)]},{head:pair(vertical),spouse:pair(horizontal)});
  const map=plot(),base=map.querySelector("rect");
  function pathAt(kind){
    const el=map.querySelector(`path[data-outcome="${kind}"]`);
    expect(el).not.toBeNull();
    return el.getAttribute("d").match(/-?\d+(?:\.\d+)?/g).map(Number);
  }
  function checkPath(kind,[x1,y1,x2,y2]){
    const left=Number(base.getAttribute("x")),top=Number(base.getAttribute("y"));
    const width=Number(base.getAttribute("width")),height=Number(base.getAttribute("height"));
    const expected=[left+x1*width/1500,top+(1500-y1)*height/1500,left+x2*width/1500,top+(1500-y2)*height/1500];
    const pts=pathAt(kind);
    expect(pts).toHaveLength(4);
    pts.forEach((n,i)=>expect(n).toBeCloseTo(expected[i],2));
  }
  fireEvent.click(screen.getByRole("radio",{name:"世帯主の給与を増やす"}));
  checkPath("drop",vertical(907));checkPath("recovery",vertical(937));
  fireEvent.click(screen.getByRole("radio",{name:"配偶者の給与を増やす"}));
  checkPath("drop",horizontal(907));checkPath("recovery",horizontal(937));
  expect(map).toBe(plot());
});

test("世帯主の増収で特児が停止する境界では実際の隣接座標と判定を示す",()=>{
  const {calculator,finish}=draw({tccaGrade:"2",welfareEligible:false});
  let x=501;while(x<1500&&!(calculator.evaluate(x-1,200).details.benefits.tcca>0&&calculator.evaluate(x,200).details.benefits.tcca===0))x++;
  expect(x).toBeLessThan(1500);
  finish({"N01-1":[[x-.5,199.5,x-.5,200.5]]});
  const map=plot();fireEvent.keyDown(map,{key:"ArrowRight"});
  const caption=map.closest("figure").querySelector("figcaption");
  expect(within(caption).getByText("特別児童扶養手当：支給 → 停止")).toBeVisible();
  expect(caption).toHaveTextContent(`（${x-1}, 200）→（${x}, 200）万円`);
});

test("配偶者の増収により児福が停止する境界では、先に停止済みの特児を重ねない",()=>{
  const {calculator,finish}=draw();
  let y=801;while(y<1500&&calculator.evaluate(380,y).details.benefits.welfare>0)y++;
  expect(y).toBeLessThan(1500);
  const before=calculator.evaluate(380,y-1),after=calculator.evaluate(380,y);
  expect(before.details.roles.allowanceRecipient).toBe("spouse");
  expect([before.details.benefits.tcca,after.details.benefits.tcca]).toEqual([0,0]);
  expect(before.details.benefits.welfare).toBeGreaterThan(0);
  expect(after.details.benefits.welfare).toBe(0);
  finish({"N01-2":[[379.5,y-.5,380.5,y-.5]]});
  const map=plot();fireEvent.keyDown(map,{key:"ArrowRight"});
  expect(within(map).queryByText("特別児童扶養手当：支給 → 停止")).toBeNull();
  expect(within(map).getByText("障害児福祉手当：支給 → 停止")).toBeVisible();
  expect(map.closest("figure").querySelector("figcaption")).toHaveTextContent(`（380, ${y-1}）→（380, ${y}）万円`);
});

test("サービスの実負担が1,000円のままでも負担上限の切り替わりを示す",()=>{
  const {calculator,finish}=draw({tccaGrade:"not",welfareEligible:false,taxStatus:"none",serviceAmountYen:1000});
  expect([811,812].map(x=>calculator.evaluate(x,200).details.service.monthly)).toEqual([1000,1000]);
  expect([811,812].map(x=>calculator.evaluate(x,200).details.service.householdCapYen)).toEqual([4600,37200]);
  finish({"N02/N03":[[811.5,199.5,811.5,200.5]]});
  const map=plot();fireEvent.keyDown(map,{key:"ArrowRight"});
  expect(within(map).getByText("通所等の負担上限：一般1（月4,600円） → 一般2（月37,200円）")).toBeVisible();
});
