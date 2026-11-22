import {act,fireEvent,render,screen,waitFor,within} from "@testing-library/react";
import SalaryDecisionMapPage,{endpointsForBoundary} from "./SalaryDecisionMapPage";
import {createSalaryDecisionMapWorker} from "./createSalaryDecisionMapWorker";
import {createRevisionCalculator} from "../calc/revisionEngine";

jest.mock("./createSalaryDecisionMapWorker",()=>({createSalaryDecisionMapWorker:jest.fn()}));
let worker;
beforeEach(()=>{window.sessionStorage.clear();worker={postMessage:jest.fn(),terminate:jest.fn()};createSalaryDecisionMapWorker.mockReset().mockReturnValue(worker);});

test("縦線・横線をそれぞれ正しい給与軸の1万円差に戻す。線分端や座標端で範囲外へ飛ばない",()=>{
  expect(endpointsForBoundary([7.5,0,7.5,3.5],7.5,3.5)).toEqual([[7,3],[8,3]]);
  expect(endpointsForBoundary([7.5,3.5,7.5,12.5],7.5,3.5)).toEqual([[7,4],[8,4]]);
  expect(endpointsForBoundary([10.5,1499.5,1500,1499.5],1500,1499.5)).toEqual([[1500,1499],[1500,1500]]);
});

async function draw(){fireEvent.click(screen.getByRole("button",{name:"変更点を描画"}));await waitFor(()=>expect(worker.postMessage).toHaveBeenCalledTimes(1));return worker.postMessage.mock.calls[0][0].household;}
const finish=layers=>act(()=>worker.onmessage({data:{type:"complete",map:{maxSalaryWan:1500,validCount:2253000,layers}}}));

test("最初は計算せず、Gと同じ条件をworkerへ渡す。変えた瞬間に前の図を消して再描画待ちにする",async()=>{
  window.sessionStorage.setItem("dw-appendix:salary-surface:v1:children",JSON.stringify([{age:16,tccaGrade:"2",taxStatus:"special",welfareEligible:false,serviceAmountYen:100}]));
  render(<SalaryDecisionMapPage/>);
  expect(createSalaryDecisionMapWorker).not.toHaveBeenCalled();
  expect(screen.getByRole("combobox",{name:"年齢"})).toHaveValue("16");
  const h=await draw();
  expect(h).toMatchObject({protocol:"paper-2029",children:[{age:16,tccaGrade:"2",taxStatus:"special",serviceAmountYen:100,serviceUser:true}]});
  finish([{id:"N01-1",segments:[]},{id:"N01-2",segments:[]},{id:"N02/N03",segments:[]}]);
  expect(screen.getByText("この条件では対象制度の切り替わりはありません。")).toBeInTheDocument();
  fireEvent.click(screen.getByText("世帯と子どもの条件",{selector:"summary"}));
  fireEvent.change(screen.getByRole("combobox",{name:"年齢"}),{target:{value:"15"}});
  expect(screen.queryByRole("figure")).toBeNull();expect(worker.terminate).toHaveBeenCalled();
  expect(screen.getByRole("button",{name:"変更点を描画"})).toBeEnabled();
});

test("給付が変わる隣接給与で座標と実際の区分を表示する。3D図・合計所得の軸を設けない",async()=>{
  render(<SalaryDecisionMapPage/>);
  fireEvent.change(screen.getByRole("combobox",{name:"障害の組み合わせ"}),{target:{value:"2:no:special"}});
  const h=await draw();const calc=createRevisionCalculator(h);
  let x=501;while(x<1500&&!(calc.evaluate(x-1,200).details.benefits.tcca>0&&calc.evaluate(x,200).details.benefits.tcca===0))x++;
  expect(x).toBeLessThan(1500);
  finish([{id:"N01-1",segments:[[x-.5,199.5,x-.5,200.5]]},{id:"N01-2",segments:[]},{id:"N02/N03",segments:[]}]);
  const plot=screen.getByRole("img",{name:/横軸：世帯主.*縦軸：配偶者/});
  fireEvent.keyDown(plot,{key:"ArrowRight"});
  expect(within(plot.parentElement.querySelector("figcaption")).getByText("特別児童扶養手当：支給 → 停止")).toBeVisible();
  expect(plot.parentElement.querySelector("figcaption")).toHaveTextContent(`（${x-1}, 200）→（${x}, 200）万円`);
  expect(screen.queryByText("可処分所得",{exact:true})).toBeNull();
});

test("途中で条件を変更したらworkerを止め、古い計算結果が遅れて返っても表示しない",async()=>{
  render(<SalaryDecisionMapPage/>);await draw();
  const stale=worker.onmessage;
  fireEvent.click(screen.getByText("世帯と子どもの条件",{selector:"summary"}));
  fireEvent.change(screen.getByRole("combobox",{name:"子どもの人数"}),{target:{value:"2"}});
  expect(worker.terminate).toHaveBeenCalled();
  act(()=>stale({data:{type:"complete",map:{maxSalaryWan:1500,layers:[]}}}));
  expect(screen.queryByRole("figure")).toBeNull();expect(screen.queryByText(/^計算中：/)).toBeNull();
});

test("配偶者840→841万円で重なる2手当を同じ座標の詳細から両方読める",async()=>{
  render(<SalaryDecisionMapPage/>);
  fireEvent.change(screen.getByRole("combobox",{name:"障害の組み合わせ"}),{target:{value:"1:yes:special"}});
  await draw();
  const seg=[379.5,840.5,380.5,840.5];
  finish([{id:"N01-1",segments:[seg]},{id:"N01-2",segments:[seg]},{id:"N02/N03",segments:[]}]);
  const plot=screen.getByRole("img");
  const paths=Array.from(plot.querySelectorAll("path[data-system]"));
  expect(paths[0].getAttribute("d")).toBe(paths[1].getAttribute("d"));
  expect(Number(paths[0].getAttribute("stroke-width"))).toBeGreaterThan(Number(paths[1].getAttribute("stroke-width")));
  fireEvent.keyDown(plot,{key:"ArrowRight"});
  expect(within(plot).getByText("特別児童扶養手当：支給 → 停止")).toBeVisible();
  expect(within(plot).getByText("障害児福祉手当：支給 → 停止")).toBeVisible();
  expect(plot.parentElement.querySelector("figcaption")).toHaveTextContent("（380, 840）→（380, 841）万円");
});

test("サービスの実負担が1,000円のままでも、負担上限の変更を表示する",async()=>{
  render(<SalaryDecisionMapPage/>);
  fireEvent.change(screen.getByRole("slider"),{target:{value:"1000"}});
  const h=await draw(),calc=createRevisionCalculator(h);
  expect([811,812].map(x=>calc.evaluate(x,200).details.service.monthly)).toEqual([1000,1000]);
  finish([{id:"N01-1",segments:[]},{id:"N01-2",segments:[]},{id:"N02/N03",segments:[[811.5,199.5,811.5,200.5]]}]);
  const plot=screen.getByRole("img"); fireEvent.keyDown(plot,{key:"ArrowRight"});
  expect(within(plot).getByText("通所等の負担上限：一般1（月4,600円） → 一般2（月37,200円）")).toBeVisible();
});
