import {fireEvent,render,screen,within} from "@testing-library/react";
import SalaryDecisionMapPage,{endpointsForBoundary} from "./SalaryDecisionMapPage";
import {createRevisionCalculator} from "../calc/revisionEngine";

beforeEach(()=>sessionStorage.clear());

function inputsFor(child={}) {
  return {protocol:"paper-2029",serviceAmountYen:0,
    roles:{allowanceRecipient:"highest-salary",welfareMaintainer:"both",spouseDeductionClaimant:"head"},
    children:[{age:8,tccaGrade:"1",taxStatus:"special",welfareEligible:true,taxDependentOf:"highest-salary",maintainedBy:null,serviceUser:true,serviceAmountYen:20000,...child}]};
}
function draw(child){
  const inputs=inputsFor(child),calculator=createRevisionCalculator(inputs);
  const props={inputs,calculator};
  const view=render(<SalaryDecisionMapPage {...props} datasetState={{type:"progress",percent:40}}/>);
  function finish(segments={},outcomeLines,grid) {
    const layers=["N01-1","N01-2","N02/N03"].map(id=>({id,segments:segments[id]||[]}));
    const empty=()=>({drop:[],recovery:[],dropMasks:[],recoveryDropIndex:[]});
    const map={maxSalaryWan:1500,validCount:2253000,layers,outcomeLines:outcomeLines??{head:empty(),spouse:empty()}};
    view.rerender(<SalaryDecisionMapPage {...props} datasetState={{type:"complete",map,grid}}/>);
  }
  return {calculator,finish,unmount:view.unmount};
}
const plot=()=>screen.getByRole("img",{name:/横軸：世帯主.*縦軸：配偶者/});

test("縦線・横線を正しい給与軸の1万円差に戻し、線分端や座標端で範囲外へ飛ばない",()=>{
  expect(endpointsForBoundary([7.5,0,7.5,3.5],7.5,3.5)).toEqual([[7,3],[8,3]]);
  expect(endpointsForBoundary([7.5,3.5,7.5,12.5],7.5,3.5)).toEqual([[7,4],[8,4]]);
  expect(endpointsForBoundary([10.5,1499.5,1500,1499.5],1500,1499.5)).toEqual([[1500,1499],[1500,1500]]);
});

test("共通の給与格子を使い、各制度の線を夫婦の給与全域に色分けして表示する",()=>{
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
  expect(within(screen.getByRole("list",{name:"制度別の凡例"})).getAllByRole("listitem")).toHaveLength(3);
  fireEvent.keyDown(map,{key:"ArrowRight"});
  fireEvent.keyDown(map,{key:"Enter"});
  expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
  expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  expect(screen.queryByRole("slider")).not.toBeInTheDocument();
  expect(screen.queryByRole("button",{name:/描画/})).not.toBeInTheDocument();
  expect(screen.queryByText(/断面|固定給与/)).not.toBeInTheDocument();
  expect(screen.queryByTestId("income-section-guide")).not.toBeInTheDocument();
});

test("該当境界がなければ平面図に切替なしと表示する",()=>{
  const {finish}=draw();finish();
  expect(screen.getByText("この条件では対象制度の切り替わりはありません。")).toBeVisible();
});

test("両方向の制度線を黒線で覆わず、制度線を選ぶと下落幅・前後の給与と可処分所得を読める",()=>{
  const {calculator,finish}=draw();
  const horizontal=y=>[599.5,y-.5,600.5,y-.5],vertical=x=>[x-.5,599.5,x-.5,600.5];
  const pair=line=>({drop:[line(907)],recovery:[line(937)],dropMasks:[2],recoveryDropIndex:[0]});
  // 給与軸を交換しても同じ906→907万円で児福が停止する例。
  for(const axis of ["head","spouse"]) {
    const net=w=>Math.round((axis==="head"?calculator.evaluate(w,600):calculator.evaluate(600,w)).studyDisposableWan*10000);
    expect([net(906),net(907)]).toEqual([11419020,11227552]);
  }
  const grid={width:1501,netYen:new Int32Array(1501*1501)};
  for(const w of [906,907])for(const [x,y] of [[600,w],[w,600]])grid.netYen[y*grid.width+x]=Math.round(calculator.evaluate(x,y).studyDisposableWan*10000);
  finish({"N01-2":[vertical(907),horizontal(907)]},{head:pair(vertical),spouse:pair(horizontal)},grid);
  const map=plot(),base=map.querySelector("rect");
  const left=Number(base.getAttribute("x")),top=Number(base.getAttribute("y"));
  const width=Number(base.getAttribute("width")),height=Number(base.getAttribute("height"));
  const sx=x=>left+x*width/1500,sy=y=>top+(1500-y)*height/1500;
  const svgCoords=([x1,y1,x2,y2])=>[sx(x1),sy(y1),sx(x2),sy(y2)];
  const segs=p=>Array.from(p.getAttribute("d").matchAll(/M([^M]+)/g),m=>m[1].match(/-?\d+(?:\.\d+)?/g).map(Number));
  const sameSegment=(actual,expected)=>actual.length===4&&actual.every((n,i)=>Math.abs(n-expected[i])<.01);
  expect(map.querySelector("path[data-outcome]")).toBeNull();
  expect(map.closest("figure")).not.toHaveTextContent("制度切替時の可処分所得の下落");
  const welfareLine=map.querySelector("path[data-system='N01-2']");
  for(const seg of [vertical(907),horizontal(907)])expect(segs(welfareLine).some(actual=>sameSegment(actual,svgCoords(seg)))).toBe(true);
  map.getBoundingClientRect=()=>({left:0,top:0,width:1032,height:720});
  fireEvent.click(map,{clientX:sx(600),clientY:sy(906.5)});
  const caption=map.closest("figure").querySelector("figcaption");
  for(const term of ["下落幅","191,468円","下落前","11,419,020円","下落後","11,227,552円"])expect(caption).toHaveTextContent(term);
  expect(caption).toHaveTextContent(/600[,、]\s*906/);
  expect(caption).toHaveTextContent(/600[,、]\s*907/);
  expect(map.querySelector("path[data-outcome='level']")).toBeNull();
  expect(map.closest("figure")).not.toHaveTextContent("同水準線");
  fireEvent.keyDown(map,{key:"ArrowRight"});
  expect(caption).toHaveTextContent(/906[,、]\s*600/);
  expect(caption).toHaveTextContent(/907[,、]\s*600/);
  expect(screen.queryByRole("radio")).toBeNull();
  expect(screen.queryByRole("spinbutton")).toBeNull();
  expect(screen.queryByText(/点P/)).toBeNull();
});

test("連続する制度線上でもキーボードで1万円刻みに給与点を選べる",()=>{
  const {finish}=draw();
  finish({"N01-2":[[596.5,906.5,603.5,906.5]]});
  const map=plot(),caption=map.closest("figure").querySelector("figcaption");
  fireEvent.keyDown(map,{key:"ArrowRight"});
  expect(caption).toHaveTextContent("（597, 906）→（597, 907）");
  fireEvent.keyDown(map,{key:"ArrowRight"});
  expect(caption).toHaveTextContent("（598, 906）→（598, 907）");
  fireEvent.keyDown(map,{key:"ArrowLeft"});
  expect(caption).toHaveTextContent("（597, 906）→（597, 907）");
  fireEvent.keyDown(map,{key:"ArrowLeft"});
  expect(caption).toHaveTextContent("（603, 906）→（603, 907）");
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
  const caption=map.closest("figure").querySelector("figcaption");
  expect(within(caption).queryByText("特別児童扶養手当：支給 → 停止")).toBeNull();
  expect(within(caption).getByText("障害児福祉手当：支給 → 停止")).toBeVisible();
  expect(caption).toHaveTextContent(new RegExp(`380[,、]\\s*${y-1}`));
  expect(caption).toHaveTextContent(new RegExp(`380[,、]\\s*${y}`));
});

test("サービスの実負担が1,000円のままでも負担上限の切り替わりを示す",()=>{
  const {calculator,finish}=draw({tccaGrade:"not",welfareEligible:false,taxStatus:"none",serviceAmountYen:1000});
  expect([811,812].map(x=>calculator.evaluate(x,200).details.service.monthly)).toEqual([1000,1000]);
  expect([811,812].map(x=>calculator.evaluate(x,200).details.service.householdCapYen)).toEqual([4600,37200]);
  const net=[811,812].map(x=>Math.round(calculator.evaluate(x,200).studyDisposableWan*10000));
  expect(net).toEqual([7694776,7702028]); // 区分が上がっても年間可処分所得は下落していない。
  const grid={width:1501,netYen:new Int32Array(1501*1501)};
  grid.netYen[200*grid.width+811]=net[0];grid.netYen[200*grid.width+812]=net[1];
  finish({"N02/N03":[[811.5,199.5,811.5,200.5]]},undefined,grid);
  const map=plot();fireEvent.keyDown(map,{key:"ArrowRight"});
  const caption=map.closest("figure").querySelector("figcaption");
  expect(within(caption).getByText("通所等の負担上限：一般1（月4,600円） → 一般2（月37,200円）")).toBeVisible();
  expect(caption).not.toHaveTextContent("下落幅");
  expect(map.querySelector("path[data-outcome='level']")).toBeNull();
});

test("別タブから戻ると同じ世帯の境界選択を復元し、異なる世帯条件へは引き継がない",()=>{
  const child={tccaGrade:"not",welfareEligible:false,taxStatus:"none",serviceAmountYen:1000};
  const lines={"N02/N03":[[811.5,199.5,811.5,200.5]]};
  const caption=()=>plot().closest("figure").querySelector("figcaption");
  const first=draw(child);first.finish(lines);
  fireEvent.keyDown(plot(),{key:"ArrowRight"});
  expect(caption()).toHaveTextContent("一般1（月4,600円） → 一般2（月37,200円）");
  first.unmount();
  const same=draw(child);same.finish(lines);
  expect(caption()).toHaveTextContent("一般1（月4,600円） → 一般2（月37,200円）");
  same.unmount();
  const changed=draw({...child,age:12});changed.finish(lines);
  expect(caption()).not.toHaveTextContent("一般1（月4,600円） → 一般2（月37,200円）");
});
