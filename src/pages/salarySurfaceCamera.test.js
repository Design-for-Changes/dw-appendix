/** @jest-environment node */
import { INITIAL_VIEW, makeScene, rotateView } from "./salarySurfaceCamera.js";

const viewport = [760, 420], surface = {min:-48, max:937};
test.each([
  [-.0001,0], [0,.0001], [-.0013,.0064], [-12.3,-.2], [5,8], [0,0],
])("Jの範囲：差 %s～%s 万円と0面を含み、小さな差を100万円軸に潰さない",(min,max)=>{
  const data={kind:"disability-difference",min,max};
  const {low,high,project}=makeScene(viewport,INITIAL_VIEW,data);
  expect(low).toBeLessThanOrEqual(Math.min(0,min));
  expect(high).toBeGreaterThanOrEqual(Math.max(0,max));
  expect(high).toBeGreaterThan(low);
  expect(high-low).toBeLessThanOrEqual(2*Math.max(.0001,Math.max(max,0)-Math.min(min,0)) + 1e-10);
  expect(project(0,0,0).every(Number.isFinite)).toBe(true);
  if(min===max && max===0)expect(low).toBe(-high);
});
const faceOn = [1,0,0, 0,1,0, 0,0,-1]; // increasing world Z approaches the viewer
const row = (m, i) => Array.from(m).slice(3*i, 3*i+3);
const dot = (a, b) => a.reduce((v, n, i) => v+n*b[i], 0);
const transform = (m, v) => [0,1,2].map(i => dot(row(m,i), v));
const difference = (a,b) => Math.hypot(...a.map((v,i) => v-b[i]));
const nearPole = m => row(m,2).map(v => -v); // near-side point, centered on screen
const close = (a,b) => {
  expect(a.length).toBe(b.length);
  b.forEach((v,i) => expect(a[i]).toBeCloseTo(v,5));
};

test("斜め・逆さの状態からも、手前の点はドラッグした画面方向に動く", () => {
  let view = INITIAL_VIEW;
  for (const [dx,dy] of [[0,0],[67,0],[0,142],[-49,-31]]) {
    view = rotateView(view,dx,dy);
    const front = nearPole(view);
    close(transform(view,front),[0,0,-1]);
    const angle = 11*Math.PI/180;
    close(transform(rotateView(view,11,0),front),[Math.sin(angle),0,-Math.cos(angle)]);
    close(transform(rotateView(view,0,11),front),[0,-Math.sin(angle),-Math.cos(angle)]);
  }
});

test("斜めドラッグを繰り返しても、三軸の長さ、直角、向きは変わらない", () => {
  const determinant = m => m[0]*(m[4]*m[8]-m[5]*m[7])
    - m[1]*(m[3]*m[8]-m[5]*m[6])+m[2]*(m[3]*m[7]-m[4]*m[6]);
  let view = INITIAL_VIEW;
  for (let i=0; i<720; i++) view = rotateView(view,1.25,i%3 ? -2 : 3);
  [0,1,2].forEach(i => [0,1,2].forEach(j =>
    expect(dot(row(view,i),row(view,j))).toBeCloseTo(i===j ? 1 : 0,5)));
  expect(determinant(view)).toBeCloseTo(determinant(INITIAL_VIEW),5);
});

test.each([[1,0],[-1,0],[0,1],[0,-1]])("画面方向 (%i,%i) の1度刻みで、極を越えて一周する", (dx,dy) => {
  let view = faceOn;
  const front = nearPole(faceOn);
  // Check intermediate positions too: a fixed/clamped view could appear to return home.
  const angles = [1,89,90,91,179,180,181,269,270,271,359,360];
  for (let i=1; i<=360; i++) {
    view = rotateView(view,dx,dy);
    if (angles.includes(i)) {
      const a = i*Math.PI/180;
      close(transform(view,front),[dx*Math.sin(a),-dy*Math.sin(a),-Math.cos(a)]);
    }
  }
  close(view,faceOn);
});

test("水平と垂直の同じ長さを同じ画素数で投影し、回転によって再拡大しない", () => {
  const scene = makeScene(viewport,faceOn,surface);
  const mid = (scene.low+scene.high)/2, length=.4;
  const span = (s,x,y) => difference(s.project(x,y,mid),s.project(-x,-y,mid));
  const diameter = span(scene,length,0);
  expect(diameter).toBeGreaterThan(0);
  expect(span(scene,0,length)).toBeCloseTo(diameter,5);
  // Vertical dragging preserves the original screen-right line through the pivot.
  for (const angle of [27,76,126,183,278]) {
    const tilted = makeScene(viewport,rotateView(faceOn,0,angle),surface);
    expect(tilted.focalPixels).toBeCloseTo(scene.focalPixels,5);
    expect(tilted.distance).toBeCloseTo(scene.distance,5);
    expect(span(tilted,length,0)).toBeCloseTo(diameter,5);
  }
});

test("等長の線分は手前ほど大きく、投影倍率の逆数は奥行きに比例して変化する", () => {
  const s = makeScene(viewport,faceOn,surface);
  const width = z => difference(s.project(-.5,0,z),s.project(.5,0,z));
  const far = width(s.low), center = width((s.low+s.high)/2), near = width(s.high);
  expect(near).toBeGreaterThan(center);
  expect(center).toBeGreaterThan(far);
  expect(far).toBeGreaterThan(0);
  expect((2*far*near)/(far+near)).toBeCloseTo(center,5);
});

const salarySlope=()=>{
  const width=51;
  const heights=Float32Array.from({length:width*width},(_,i)=>-25+
    2165*(i%width+Math.floor(i/width))/(2*(width-1)));
  heights[width+1]=NaN;
  return {width,min:-25,max:2140,heights};
};
test.each([[1348,783],[1310,783],[387,519]])("初期画面 %i×%i で給与0の床が幅の85%%以上を占め、面と軸は枠内に収まる", (w,h)=>{
  const s=salarySlope(), c=makeScene([w,h],INITIAL_VIEW,s);
  const corners=[[-1,-1],[-1,1],[1,-1],[1,1]].map(([x,y])=>c.project(x,y,0));
  const xs=corners.map(p=>p[0]), fraction=(Math.max(...xs)-Math.min(...xs))/w;
  expect(fraction).toBeGreaterThanOrEqual(.85);
  expect(fraction).toBeLessThanOrEqual(.91);
  // Full width alone is misleading if the surface appears as a thin edge.
  const cornersOnSurface=[[0,0],[1,0],[1,1],[0,1]].map(([u,v])=>
    c.project(2*u-1,2*v-1,s.heights[(s.width-1)*(v*s.width+u)]));
  const twiceArea=cornersOnSurface.reduce((sum,[x,y],i,points)=>{
    const [nx,ny]=points[(i+1)%points.length]; return sum+x*ny-y*nx;
  },0);
  if(w>=1000) expect(Math.abs(twiceArea)/2/(w*h)).toBeGreaterThan(.23);
  const coords=[...corners,c.project(-1,-1,c.low),c.project(-1,-1,c.high)];
  s.heights.forEach((z,k)=>{
    if (Number.isFinite(z)) coords.push(c.project(2*(k%s.width)/(s.width-1)-1,
      2*Math.floor(k/s.width)/(s.width-1)-1,z));
  });
  const bounds=(axis,fn)=>fn(...coords.map(p=>p[axis]));
  expect(bounds(0,Math.min)).toBeGreaterThanOrEqual(20);
  expect(bounds(0,Math.max)).toBeLessThanOrEqual(w-20);
  expect(bounds(1,Math.min)).toBeGreaterThanOrEqual(25.99);
  expect(bounds(1,Math.max)).toBeLessThanOrEqual(h-39.99);
});

test("実測面の外形は一度だけ読み、回転後もレンズ位置・焦点距離・グラフの中心は変わらない",()=>{
  const s=salarySlope(), heights=s.heights;
  let reads=0;
  s.heights=new Proxy(heights,{get(target,key){reads++;return target[key];}});
  const bounds=[1348,783], first=makeScene(bounds,INITIAL_VIEW,s), before=reads;
  expect(before).toBeGreaterThanOrEqual(heights.length);
  expect(first.centerY).not.toBeCloseTo(bounds[1]/2);
  for (const [dx,dy] of [[89,31],[11,160],[-83,240]]) {
    const rotated=makeScene(bounds,rotateView(INITIAL_VIEW,dx,dy),s);
    expect(rotated.focalPixels).toBe(first.focalPixels);
    expect(rotated.centerY).toBe(first.centerY);
    close(rotated.project(0,0,(rotated.low+rotated.high)/2),[bounds[0]/2,first.centerY]);
  }
  makeScene([800,600],INITIAL_VIEW,s);
  expect(reads).toBe(before);
});
