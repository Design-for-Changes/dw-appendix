import React from "react";
import {render,screen,fireEvent} from "@testing-library/react";
import IncomeDifferenceHeatmap from "./IncomeDifferenceHeatmap";

const W=3;
const surface={width:W,min:-1,max:1,heights:new Float32Array([NaN,-1,1, 0,.0001,-.0001, 0,-.5,.5])};
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
  render(<IncomeDifferenceHeatmap surface={surface}/>);
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
  expect(screen.getByText(/世帯主 1万円.*配偶者 1万円.*差 ＋1円/)).toBeVisible();
  expect(screen.queryByText(/点P/)).toBeNull();
});

test("クリック・矢印キーで横軸と下から増加する縦軸を読み、3Dの給与点・総額固定を参照も更新もしない",()=>{
  const select=jest.fn();
  render(<IncomeDifferenceHeatmap surface={surface} head={1} spouse={0} fixedTotal={1} onSelectSalary={select}/>);
  setRect(canvas());
  click(0,0);expect(screen.queryByText(/円／年$/)).toBeNull();
  click(2,1);expect(screen.getByText(/世帯主 2万円.*配偶者 1万円.*差 −1円/)).toBeVisible();
  fireEvent.keyDown(canvas(),{key:"ArrowUp"});expect(screen.getByText(/世帯主 2万円.*配偶者 2万円.*差 ＋5,000円/)).toBeVisible();
  expect(select).not.toHaveBeenCalled();
  expect(screen.queryByText(/点P/)).toBeNull();
});

test("円の読取りは表示用Float32の万円から逆算せず、共有整数格子の当該給与点の値を使う",()=>{
  const heights=surface.heights.slice(),differenceYen=new Int32Array(9);
  heights[8]=50000001/10000;differenceYen[8]=50000001;
  expect(Math.round(heights[8]*10000)).toBe(50000000);
  render(<IncomeDifferenceHeatmap surface={{...surface,heights,max:5000}} differenceYen={differenceYen}/>);
  setRect(canvas());click(2,2);
  expect(screen.getByText(/世帯主 2万円.*配偶者 2万円.*差 ＋50,000,001円/)).toBeVisible();
});

test("最高・最低が複数あるときも各代表給与点の画素中央に1個ずつ、整数円の符号つきの差を示す",()=>{
  const low=-446401,high=50000001;
  // 閾値の示度ではなく給与格子の中心。(2,1)と(1,2)を入れ替えると結果が異なる。
  const amounts=[NaN,high,low, 0,0,high, 0,low,0];
  const chart={...surface,heights:Float32Array.from(amounts,v=>v/10000),min:low/10000,max:high/10000,validCount:8,
    maximum:{headWan:2,spouseWan:1,differenceYen:high,count:2},minimum:{headWan:1,spouseWan:2,differenceYen:low,count:2}};
  const {container}=render(<IncomeDifferenceHeatmap surface={chart} differenceYen={Int32Array.from(amounts)}/>);
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
    min:value/10000,max:value/10000,minimum:common,maximum:common}} differenceYen={Int32Array.from(all)}/>);
  expect(container.querySelector("figure")).toHaveTextContent("全算定点：最高＝最低");
  expect(container.querySelectorAll("[data-difference-extreme]")).toHaveLength(0);
});

test("全点未算定であれば最低・最高の記号も全点同額の表示も出さない",()=>{
  const {container}=render(<IncomeDifferenceHeatmap surface={{...surface,validCount:0,heights:new Float32Array(9).fill(NaN),
    min:null,max:null,minimum:null,maximum:null}}/>);
  expect(container.querySelectorAll("[data-difference-extreme]")).toHaveLength(0);
  expect(container.querySelector("figure")).not.toHaveTextContent("全算定点：最高＝最低");
});
