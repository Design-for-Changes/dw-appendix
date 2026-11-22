import {prepareSalaryGraphDrawing} from "./prepareSalaryGraphDrawing";

const grid=heights=>({heights:Float32Array.from(heights),width:2,min:-1,max:1});
test("共有Workerの描画データ：同じ欠測位置なら三角形を共有し、差額の正・負・0円と原点を別扱いにする",()=>{
  const income=grid([NaN,10,20,30]),difference=grid([NaN,-1,0,1]);
  prepareSalaryGraphDrawing(income,difference);
  expect([...income.meshIndices]).toEqual([2,1,3,0xffffffff]);
  expect(difference.meshIndices).toBe(income.meshIndices);
  expect(income.inkGeometry).toEqual([]);
  expect(difference.barBins.heights).toBe(difference.heights);
  expect(difference.barBins.bins).toEqual([{bx:0,by:0,valid:3,zero:2,pos:3,neg:1}]);
  expect([...difference.heatmapPixels]).toEqual([
    251,250,246,255,19,127,131,255,110,121,128,255,174,52,84,255
  ]);
  expect([...income.heights]).toEqual([NaN,10,20,30]);expect([...difference.heights]).toEqual([NaN,-1,0,1]);
});
test("二世帯の差額だけが未算定のときは索引を分け、欠測点を含む三角形は埋めない",()=>{
  const income=grid([NaN,10,20,30]),difference=grid([NaN,-1,NaN,1]);
  prepareSalaryGraphDrawing(income,difference);
  expect(difference.meshIndices).not.toBe(income.meshIndices);
  expect(difference.meshIndices).toHaveLength(0);
});
test("原点しか含まない空の格子はゼロ差の柱にせず、算定外だけを返す",()=>{
  const income={width:1,heights:new Float32Array([NaN])},difference={...income};
  prepareSalaryGraphDrawing(income,difference);
  expect(income.meshIndices).toHaveLength(0);expect(difference.barBins).toBeNull();
  expect([...difference.heatmapPixels]).toEqual([110,121,128,255]);
});
