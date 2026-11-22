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
