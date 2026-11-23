import React from "react";
import {render,screen,fireEvent,within} from "@testing-library/react";
import IncomeDifferenceHeatmap from "./IncomeDifferenceHeatmap";

const W=3;
const surface={width:W,min:-1,max:1,validCount:8,negativeCount:3,
  minimum:{headWan:1,spouseWan:0,differenceYen:-10000,count:1},maximum:{headWan:2,spouseWan:0,differenceYen:10000,count:1},
  heights:new Float32Array([NaN,-1,1, 0,.0001,-.0001, 0,-.5,.5])};
// 対照世帯の既知の可処分所得を100,000円＋格子添字とし、軸の転置も検出する。
function gridFor(differenceYen=Int32Array.from(surface.heights,v=>Math.round(v*10000))){
  return {width:W,differenceYen,netYen:Int32Array.from(differenceYen,(v,i)=>100000+i+v)};
}
const table=()=>screen.getByRole("table",{name:"給与点別の年間収入・可処分所得"});
const atCursor=()=>within(within(table()).getByRole("row",{name:/図上の点/})).getAllByRole("cell").map(c=>c.textContent);
let ctx,spy;
beforeEach(()=>{
  ctx={createImageData:jest.fn((w,h)=>({width:w,height:h,data:new Uint8ClampedArray(w*h*4)})),putImageData:jest.fn()};
  spy=jest.spyOn(HTMLCanvasElement.prototype,"getContext").mockReturnValue(ctx);
});
afterEach(()=>spy.mockRestore());
const canvas=()=>screen.getByRole("img",{name:/横軸：世帯主の給与収入/});
function setRect(c){
  c.getBoundingClientRect=()=>({left:10,top:15,width:300,height:300});
}
const click=(x,y)=>fireEvent.click(canvas(),{clientX:10+(x+.5)*100,clientY:15+(W-1-y+.5)*100});
test("全給与格子1点1画素。左下の原点は算定外、±1円とゼロを区別。局所読取りで再描画しない",()=>{
  render(<IncomeDifferenceHeatmap surface={surface} grid={gridFor()}/>);
  expect(canvas()).toHaveAttribute("width","3");expect(canvas()).toHaveAttribute("height","3");
  expect(ctx.createImageData).toHaveBeenCalledWith(3,3);expect(ctx.putImageData).toHaveBeenCalledTimes(1);
  const rgba=ctx.putImageData.mock.calls[0][0].data;
  const color=(px,py)=>Array.from(rgba.slice((py*W+px)*4,(py*W+px)*4+3));
  expect(color(0,2)).toEqual([110,121,128]); // missing
  expect(color(1,2)).toEqual([174,52,84]);expect(color(2,2)).toEqual([19,127,131]);
  expect(color(0,1)).toEqual([251,250,246]);
  expect(color(0,1)).not.toEqual(color(1,1));expect(color(0,1)).not.toEqual(color(2,1));expect(color(1,1)).not.toEqual(color(2,1));
  setRect(canvas());click(1,1);
  expect(ctx.putImageData).toHaveBeenCalledTimes(1);
  expect(atCursor()).toEqual(["1万円","1万円","2万円","0円","100,005円","100,004円","＋1円"]);
  expect(screen.queryByText(/点P/)).toBeNull();
});

test("クリック・矢印キーで横軸と下から増加する縦軸を読み、3Dの給与点・総額固定を参照も更新もしない",()=>{
  const select=jest.fn();
  render(<IncomeDifferenceHeatmap surface={surface} grid={gridFor()} head={1} spouse={0} fixedTotal={1} onSelectSalary={select}/>);
  setRect(canvas());
  click(0,0);expect(within(table()).queryByRole("row",{name:/図上の点.*\d+万円/})).toBeNull();
  click(2,1);expect(atCursor()).toEqual(["2万円","1万円","3万円","0円","100,004円","100,005円","−1円"]);
  fireEvent.keyDown(canvas(),{key:"ArrowUp"});expect(atCursor()).toEqual(["2万円","2万円","4万円","0円","105,008円","100,008円","＋5,000円"]);
  click(1,2);expect(atCursor()).toEqual(["1万円","2万円","3万円","0円","95,007円","100,007円","−5,000円"]);
  expect(select).not.toHaveBeenCalled();
  expect(screen.queryByText(/点P/)).toBeNull();
});

test("円の読取りは表示用Float32の万円から逆算せず、共有整数格子の当該給与点の値を使う",()=>{
  const heights=surface.heights.slice(),differenceYen=new Int32Array(9);
  heights[8]=50000001/10000;differenceYen[8]=50000001;
  expect(Math.round(heights[8]*10000)).toBe(50000000);
  render(<IncomeDifferenceHeatmap surface={{...surface,heights,max:5000}} grid={gridFor(differenceYen)}/>);
  setRect(canvas());click(2,2);
  expect(atCursor().slice(-3)).toEqual(["50,100,009円","100,008円","＋50,000,001円"]);
});

test("最大・最小が複数あるときも各代表給与点の画素中央に1個ずつ、整数円の符号つきの差を示す",()=>{
  const low=-446401,high=50000001;
  // 閾値の示度ではなく給与格子の中心。(2,1)と(1,2)を入れ替えると結果が異なる。
  const amounts=[NaN,high,low, 0,0,high, 0,low,0];
  const chart={...surface,heights:Float32Array.from(amounts,v=>v/10000),min:low/10000,max:high/10000,validCount:8,
    maximum:{headWan:2,spouseWan:1,differenceYen:high,count:2},minimum:{headWan:1,spouseWan:2,differenceYen:low,count:2}};
  const {container}=render(<IncomeDifferenceHeatmap surface={chart} grid={gridFor(Int32Array.from(amounts))}/>);
  const svg=container.querySelector(".diff-map-axes"),box=svg.querySelector("rect");
  const left=+box.getAttribute("x"),top=+box.getAttribute("y"),width=+box.getAttribute("width"),height=+box.getAttribute("height");
  expect(svg.querySelectorAll("g[data-difference-extreme]")).toHaveLength(2);
  for(const [kind,signed] of [["maximum","＋50,000,001円"],["minimum","−446,401円"]]){
    const markers=svg.querySelectorAll('g[data-difference-extreme="'+kind+'"]');
    expect(markers).toHaveLength(1);
    const transform=markers[0].getAttribute("transform");
    const translate=transform.match(/^translate\(\s*([\d.]+)[\s,]+([\d.]+)\s*\)$/);
    expect(translate).not.toBeNull();
    const {headWan,spouseWan}=chart[kind];
    expect(+translate[1]).toBeCloseTo(left+(headWan+.5)*width/chart.width,2);
    expect(+translate[2]).toBeCloseTo(top+(chart.width-1-spouseWan+.5)*height/chart.width,2);
    expect(markers[0].querySelector("title")).toHaveTextContent(signed);
  }
});

test.each([0,12345])("全算定点が一律%i円なら、1点を極値とせず図中に一律である旨を示す",value=>{
  const all=[NaN,...Array(8).fill(value)];
  const common={headWan:1,spouseWan:0,differenceYen:value,count:8};
  const {container}=render(<IncomeDifferenceHeatmap surface={{...surface,validCount:8,heights:Float32Array.from(all,v=>v/10000),
    min:value/10000,max:value/10000,minimum:common,maximum:common}} grid={gridFor(Int32Array.from(all))}/>);
  expect(container.querySelector("figure")).toHaveTextContent("全算定点：最小＝最大");
  expect(container.querySelectorAll("[data-difference-extreme]")).toHaveLength(0);
  expect(within(table()).getAllByRole("rowheader",{name:/最小＝最大/})).toHaveLength(1);
  expect(within(table()).queryByRole("rowheader",{name:/最小点|最大点/})).toBeNull();
  setRect(canvas());click(2,2);
  expect(atCursor().slice(-3)).toEqual([value===0?"100,008円":"112,353円","100,008円",value===0?"0円":"＋12,345円"]);
});

test("全点未算定であれば最小・最大の記号も全点同額の表示も出さない",()=>{
  const {container}=render(<IncomeDifferenceHeatmap surface={{...surface,validCount:0,heights:new Float32Array(9).fill(NaN),
    min:null,max:null,minimum:null,maximum:null}}/>);
  expect(container.querySelectorAll("[data-difference-extreme]")).toHaveLength(0);
  expect(container.querySelector("figure")).not.toHaveTextContent("全算定点：最小＝最大");
});
