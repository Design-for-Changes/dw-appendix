import {prepareSalaryGraphDrawing} from "./prepareSalaryGraphDrawing";

const grid=heights=>({heights:Float32Array.from(heights),width:2,min:-1,max:1});
test("世帯面だけ3D三角形をつくり、差額は正・負・0円・原点の2D画素をつくる",()=>{
  const income=grid([NaN,10,20,30]),difference=grid([NaN,-1,0,1]);
  prepareSalaryGraphDrawing(income,difference);
  expect([...income.meshIndices]).toEqual([2,1,3,0xffffffff]);
  expect(difference.meshIndices).toBeUndefined();
  expect(income.inkGeometry).toEqual([]);
  expect(difference.barBins).toBeUndefined();
  expect([...difference.heatmapPixels]).toEqual([
    251,250,246,255,19,127,131,255,110,121,128,255,174,52,84,255
  ]);
  expect([...income.heights]).toEqual([NaN,10,20,30]);expect([...difference.heights]).toEqual([NaN,-1,0,1]);
});
test("二世帯の差額だけが未算定のときも2D図で欠測点を正負に塗らない",()=>{
  const income=grid([NaN,10,20,30]),difference=grid([NaN,-1,NaN,1]);
  prepareSalaryGraphDrawing(income,difference);
  expect(difference.meshIndices).toBeUndefined();
  expect([...difference.heatmapPixels.slice(0,4)]).toEqual([110,121,128,255]);
});
test("原点しか含まない空の格子はゼロ差の柱にせず、算定外だけを返す",()=>{
  const income={width:1,heights:new Float32Array([NaN])},difference={...income};
  prepareSalaryGraphDrawing(income,difference);
  expect(income.meshIndices).toHaveLength(0);expect(difference.barBins).toBeUndefined();
  expect([...difference.heatmapPixels]).toEqual([110,121,128,255]);
});
