/** @jest-environment node */
import { INITIAL_VIEW, makeScene, rotateView } from "./salarySurfaceCamera.js";
import { pickSalaryChange, visibleSalaryCursor, pickSalaryAtPointer } from "./salarySurfacePick.js";

const top=[1,0,0, 0,1,0, 0,0,-1], front=[1,0,0, 0,0,1, 0,1,0];
function grid(width,marked,height=40) {
  return {width,min:0,max:100,heights:new Float32Array(width**2).fill(height),
    changePoints:Uint32Array.from(marked),changeBySystem:{}};
}
const xy=(s,c,x,y)=>c.project(2*x/(s.width-1)-1,2*y/(s.width-1)-1,s.heights[y*s.width+x]);

test("7 CSS px以内の最寄りの実測変化点だけを選び、制度を指定したら対象を限定する",()=>{
  const first=32*65+30, second=first+1, s=grid(65,[first,second]), c=makeScene([320,260],top,s);
  s.changeBySystem={first:{points:[first]},second:{points:[second]}};
  const [sx,sy]=xy(s,c,30,32);
  expect(pickSalaryChange(s,c,sx,sy)).toBe(first);
  expect(pickSalaryChange(s,c,sx,sy,"first")).toBe(first);
  expect(pickSalaryChange(s,c,sx,sy,"unknown")).toBeNull();
  expect(pickSalaryChange(s,c,sx,sy+7,"first")).toBe(first);
  expect(pickSalaryChange(s,c,sx,sy+7.01,"first")).toBeNull();
  expect(pickSalaryChange(s,c,sx,sy,"second")).toBe(second);
});

test("画面上の最近点が未印の稜線に隠れたら、奥を選ばず手前の実測点を選ぶ",()=>{
  const w=9, near=4, far=6*w+4, s=grid(w,[near,far]);
  const c=makeScene([400,300],front,s);
  s.heights.fill(95,2*w,3*w);
  const p=xy(s,c,4,6);
  expect(pickSalaryChange(s,c,...p)).toBe(near);
  s.changeBySystem.onlyFar={points:[far]};
  expect(pickSalaryChange(s,c,...p,"onlyFar")).toBeNull();
  // The hole removes all incident triangles. No invisible wall may remain.
  s.heights.fill(NaN,2*w,3*w);
  expect(pickSalaryChange(s,c,...p,"onlyFar")).toBe(far);
});

test("回転でPが稜線に隠れたら印を描かず、元の向きでは可視のP自身を優先する",()=>{
  const w=9, near=4, far=6*w+4, s=grid(w,[near]);
  s.heights.fill(95,2*w,3*w);
  const above=makeScene([400,300],top,s), side=makeScene([400,300],front,s);
  const marker=visibleSalaryCursor(s,above,4,6);
  expect(marker).toMatchObject({index:far});
  expect([marker.px,marker.py]).toEqual(xy(s,above,4,6));
  expect(pickSalaryAtPointer(s,above,marker.px,marker.py,null,null,marker)).toBe(far);
  expect(visibleSalaryCursor(s,side,4,6)).toBeNull();
  expect(pickSalaryAtPointer(s,side,...xy(s,side,4,6),null,null,null)).toBe(near);
  expect(visibleSalaryCursor(s,above,null,6)).toBeNull();
  s.heights[far]=NaN;
  expect(visibleSalaryCursor(s,above,4,6)).toBeNull();
});

test("給与総額を固定した場合、スナップ範囲内でも別総額の制度境界を選ばない",()=>{
  const w=65, i=32*w+30, s=grid(w,[i,i+1]), c=makeScene([320,260],top,s);
  const click=xy(s,c,30,32);
  expect(pickSalaryAtPointer(s,c,...click,null,63,null)).toBe(i+1);
  expect(pickSalaryAtPointer(s,c,...click,null,64,null)).toBeNull();
  expect(pickSalaryAtPointer(s,c,...click,null,null,null)).toBe(i);
});

test("同じ画素に重なる候補は、配列順ではなくカメラに近い順で選ぶ",()=>{
  const w=9, s=grid(w,[w+4,7*w+4],50);
  const c=makeScene([400,300],[1,0,0, 0,0,-1, 0,-1,0],s);
  expect(pickSalaryChange(s,c,...xy(s,c,4,7))).toBe(7*w+4);
});

test("スナップ半径内でも、未算定の給与座標をまたいでは選ばない",()=>{
  const w=65, k=32*w+30, s=grid(w,[k]), c=makeScene([190,190],top,s);
  const click=xy(s,c,33,32);
  expect(pickSalaryChange(s,c,...click)).toBe(k);
  s.heights[32*w+31]=NaN;
  expect(pickSalaryChange(s,c,...click)).toBeNull();
  s.heights[k]=NaN;
  expect(pickSalaryChange(s,c,...xy(s,c,30,31))).toBeNull();
});

test("全格子点に印がある場合も、1回のクリックで高さを全走査しない",()=>{
  const w=501, s=grid(w,Array.from({length:w*w},(_,i)=>i));
  const c=makeScene([900,900],top,s), raw=s.heights, center=(w*w-1)/2;
  let reads=0;
  s.heights=new Proxy(raw,{get(data,key){reads++;return data[key];}});
  expect(pickSalaryChange(s,c,450,450)).toBe(center);
  expect(reads).toBeLessThan(1000);
});

test("凹凸と欠測のある格子の表・裏・斜めで、全三角形を比較する独立な深度判定と一致する",()=>{
  const w=9, n=w-1, s=grid(w,[]);
  for (let k=0;k<w*w;k++) s.heights[k]=(k%13===0 ? NaN : (13*k*k+23*k)%97);
  for (const view of [INITIAL_VIEW,rotateView(INITIAL_VIEW,26,120),rotateView(INITIAL_VIEW,145,-72)]) {
    const c=makeScene([470,360],view,s);
    const vertices=Array.from(s.heights,(z,k)=>{
      const x=2*(k%w)/n-1, y=2*Math.floor(k/w)/n-1;
      return [...c.project(x,y,z),c.cameraDepth(x,y,z)];
    });
    const triangles=[];
    for (let y=0;y<n;y++) for (let x=0;x<n;x++) {
      const k=y*w+x;
      triangles.push([k,k+1,k+w],[k+w+1,k+w,k+1]);
    }
    vertices.forEach(([px,py,depth],k)=>{
      if (!Number.isFinite(depth)) return;
      const hidden=triangles.some(indices=>{
        const [[ax,ay,az],[bx,by,bz],[cx,cy,cz]]=indices.map(i=>vertices[i]);
        const denom=(by-cy)*(ax-cx)+(cx-bx)*(ay-cy);
        if (!Number.isFinite(denom) || Math.abs(denom)<1e-10) return false;
        const a=((by-cy)*(px-cx)+(cx-bx)*(py-cy))/denom;
        const b=((cy-ay)*(px-cx)+(ax-cx)*(py-cy))/denom, d=1-a-b;
        return Math.min(a,b,d)>=-1e-8 && (1/(a/az+b/bz+d/cz))<depth-1e-6;
      });
      s.changePoints=[k];
      expect(pickSalaryChange(s,c,px,py)).toBe(hidden ? null : k);
    });
  }
});
