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
test("全給与格子1点1画素。左下の原点は算定外、±1円とゼロを区別。点P移動で再描画しない",()=>{
  const select=jest.fn(),{rerender}=render(<IncomeDifferenceHeatmap surface={surface} head={1} spouse={0} onSelectSalary={select}/>);
  expect(canvas()).toHaveAttribute("width","3");expect(canvas()).toHaveAttribute("height","3");
  expect(ctx.createImageData).toHaveBeenCalledWith(3,3);expect(ctx.putImageData).toHaveBeenCalledTimes(1);
  const rgba=ctx.putImageData.mock.calls[0][0].data;
  const color=(px,py)=>Array.from(rgba.slice((py*W+px)*4,(py*W+px)*4+3));
  expect(color(0,2)).toEqual([110,121,128]); // missing
  expect(color(1,2)).toEqual([174,52,84]);expect(color(2,2)).toEqual([19,127,131]);
  expect(color(0,1)).toEqual([251,250,246]);
  expect(color(0,1)).not.toEqual(color(1,1));expect(color(0,1)).not.toEqual(color(2,1));expect(color(1,1)).not.toEqual(color(2,1));
  rerender(<IncomeDifferenceHeatmap surface={surface} head={1} spouse={1} onSelectSalary={select}/>);
  expect(ctx.putImageData).toHaveBeenCalledTimes(1);
  expect(screen.getByText(/点P.*世帯主 1万円.*配偶者 1万円.*差 ＋1円/)).toBeVisible();
});

test("下から増加する配偶者給与と横軸を復元し、原点は選ばない",()=>{
  const select=jest.fn();
  render(<IncomeDifferenceHeatmap surface={surface} head={1} spouse={0} onSelectSalary={select}/>);
  setRect(canvas());
  click(0,0);expect(select).not.toHaveBeenCalled();
  click(2,1);expect(select).toHaveBeenLastCalledWith(2,1);
  fireEvent.keyDown(canvas(),{key:"ArrowUp"});expect(select).toHaveBeenLastCalledWith(1,1);
});

test("総額固定の線外を選ばず、キーボード操作でも夫婦総額を維持する",()=>{
  const select=jest.fn();
  render(<IncomeDifferenceHeatmap surface={surface} head={1} spouse={1} fixedTotal={2} onSelectSalary={select}/>);
  setRect(canvas());click(1,0);expect(select).not.toHaveBeenCalled();
  click(0,2);expect(select).toHaveBeenLastCalledWith(0,2);
  fireEvent.keyDown(canvas(),{key:"ArrowRight"});expect(select).toHaveBeenLastCalledWith(2,0);
  fireEvent.keyDown(canvas(),{key:"ArrowUp"});expect(select).toHaveBeenLastCalledWith(0,2);
});
