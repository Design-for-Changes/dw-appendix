import {buildSalaryLevelContour} from "./salaryLevelContour.js";
import {UNKNOWN_PLANE_NET_YEN as missing} from "./salaryPlaneRecovery.js";
import {createRevisionCalculator} from "./revisionEngine.js";

const grid=(w,f)=>({width:w,netYen:Int32Array.from({length:w*w},(_,i)=>f(i%w,Math.floor(i/w)))});
const vertical=(lines,x,y)=>lines.filter(([x1,y1,x2,y2])=>x1===x&&x2===x&&y1<=y&&y<=y2).length;
const horizontal=(lines,x,y)=>lines.filter(([x1,y1,x2,y2])=>y1===y&&y2===y&&x1<=x&&x<=x2).length;

test("同額の台地は到達側。2軸の境界を所得差の大きさで補間せず、半目盛にまとめる",()=>{
  const g=grid(5,(x,y)=>x>=2&&y>=2?1010:10);
  expect(buildSalaryLevelContour(g,1010)).toEqual({levelYen:1010,segments:[
    [1.5,1.5,4,1.5],[1.5,1.5,1.5,4],
  ]});
  expect(buildSalaryLevelContour(g,1009).segments).toEqual(buildSalaryLevelContour(g,1010).segments);
  for(const z of [10,1011])expect(buildSalaryLevelContour(g,z).segments).toEqual([]);
});

test("未算定をまたぐことも、未算定をゼロや未達とみなすこともない",()=>{
  const g=grid(5,(x,y)=>x===2&&y===2?missing:x>=2?0:-100);
  expect(buildSalaryLevelContour(g,0).segments).toEqual([[1.5,0,1.5,1.5],[1.5,2.5,1.5,4]]);
  expect(buildSalaryLevelContour(grid(1,()=>missing),0).segments).toEqual([]);
});

test("各軸で隣接する2点の独立比較と一致し、格子の対角方向だけの接触は線にしない",()=>{
  const g=grid(13,(x,y)=>(x+y)%11===0?missing:((x*7-y*13+x*y)%17));
  const n=g.width,xy=(x,y)=>g.netYen[y*n+x];
  for(const z of [-10,0,1,10]){
    const {segments}=buildSalaryLevelContour(g,z);
    const crosses=(a,b)=>Number(a!==missing&&b!==missing&&Math.min(a,b)<z&&Math.max(a,b)>=z);
    for(const [x1,y1,x2,y2] of segments){
      expect(x1===x2?y1<y2:y1===y2&&x1<x2).toBe(true);
      expect([x1,y1,x2,y2].every(v=>v>=0&&v<=n-1&&Number.isInteger(v*2))).toBe(true);
    }
    for(let y=0;y<n;y++)for(let x=0;x<n;x++){
      if(x)expect(vertical(segments,x-.5,y)).toBe(crosses(xy(x,y),xy(x-1,y)));
      if(y)expect(horizontal(segments,x,y-.5)).toBe(crosses(xy(x,y),xy(x,y-1)));
    }
  }
});

test("全体の水平切断と、1方向に給与を増やす初回回復は別物：独立した未達域を双方とも表示",()=>{
  const g=grid(7,(x,y)=>((x===2&&y===2)||(x===5&&y===4))?99:100);
  const {segments}=buildSalaryLevelContour(g,100);
  for(const [x,y] of [[2,2],[5,4]]){
    expect(vertical(segments,x-.5,y)).toBe(1);expect(vertical(segments,x+.5,y)).toBe(1);
    expect(horizontal(segments,x,y-.5)).toBe(1);expect(horizontal(segments,x,y+.5)).toBe(1);
  }
  expect(segments).toHaveLength(8);
});

test("実試算：世帯主194→195万、配偶者825万。下落直前7,739,908円の水準で切る",()=>{
  const c=createRevisionCalculator({protocol:"paper-2029",serviceAmountYen:10406,children:[
    {age:10,tccaGrade:"2",welfareEligible:false,taxStatus:"none",serviceUser:true},
  ]});
  const g=grid(6,(x,y)=>Math.round(c.evaluate(192+x,823+y).studyDisposableWan*10000));
  expect([g.netYen[2*6+2],g.netYen[2*6+3]]).toEqual([7739908,7663988]);
  const cut=buildSalaryLevelContour(g,7739908).segments;
  expect(vertical(cut,2.5,2)).toBe(1);
  expect(horizontal(cut,2,1.5)).toBe(1);
});
test("整数円・格子型とサイズを検査する。入力配列は変更しない",()=>{
  const g=grid(2,(x,y)=>x-y);const original=Array.from(g.netYen);
  for(const z of [null,NaN,1.2,missing])expect(()=>buildSalaryLevelContour(g,z)).toThrow(RangeError);
  expect(()=>buildSalaryLevelContour({...g,width:3},1)).toThrow(RangeError);
  expect(()=>buildSalaryLevelContour({...g,netYen:new Float32Array(4)},1)).toThrow(RangeError);
  buildSalaryLevelContour(g,0);expect(Array.from(g.netYen)).toEqual(original);
});
