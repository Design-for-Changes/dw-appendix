import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import IncomeDifferenceBars from "./IncomeDifferenceBars";
import {barGeometry,barSalaryPoint,binIncomeDifferences,pickBar} from "./incomeDifferenceBarGeometry";
import {INITIAL_VIEW,makeScene,rotateView} from "./salarySurfaceCamera";

const surface=(width,heights)=>{const z=[...heights].filter(Number.isFinite);return {kind:"disability-difference",validCount:z.length,width,heights,
  min:z.length?Math.min(...z):null,max:z.length?Math.max(...z):null};};
afterEach(()=>{cleanup();window.sessionStorage.clear();jest.restoreAllMocks();});

test("区画は全1万円点を一度ずつ含む。相殺しない両端値・符号・0・欠測・最終端",()=>{
  const w=51,h=new Float32Array(w*w).fill(NaN);
  [[0,0,0],[3,11,-4.5],[4,11,-4.5],[14,19,8.25],[24,24,1],[25,0,0],[50,24,0],[50,50,-.0001]].forEach(([x,y,z])=>h[w*y+x]=z);
  const g=binIncomeDifferences(surface(w,h));expect(g.count).toBe(2);
  expect(g.bins.map(b=>b.valid)).toEqual([5,2,0,1]);expect(g.bins[0]).toMatchObject({pos:19*w+14,neg:11*w+3,zero:0});
  expect(g.bins[1]).toMatchObject({pos:-1,neg:-1,zero:25});expect(g.bins[2]).toMatchObject({pos:-1,neg:-1,zero:-1});
  expect(g.bins[3].neg).toEqual(50*w+50);
  const hit={index:g.bins[0].neg,bin:g.bins[0]};expect(barSalaryPoint(g,hit)).toEqual([3,11]);
  expect(barSalaryPoint(g,hit,15)).toEqual([4,11]);expect(barSalaryPoint(g,hit,200)).toBeNull();
  expect(barSalaryPoint(g,{index:g.bins[1].zero,bin:g.bins[1]},74)).toEqual([50,24]);
});
test("全2,253,000給与点を階級に一度ずつ分類し、端値を保持する",()=>{
  const w=1501,l=w*w,h=new Float32Array(l);h[0]=NaN;h[123*w+632]=-.02;h[123*w+648]=.07;h[l-1]=-.5;
  const g=binIncomeDifferences({width:w,heights:h});expect(g.bins.length).toBe(3600);
  expect(g.bins.reduce((s,b)=>s+b.valid,0)).toBe(2253000);
  const b=g.bins[Math.floor(123/25)*60+Math.floor(632/25)];expect(b.neg).toBe(123*w+632);expect(b.pos).toBe(123*w+648);
  expect(g.bins.at(-1).neg).toBe(l-1);
});
test("360°回転時も柱は0基準で、負・正の異なる給与座標を選ぶ。欠測区画は描かない",()=>{
  const h=new Float32Array(16).fill(NaN);h[0]=3;h[1]=-2;h[3]=0;
  const s=surface(4,h),g=binIncomeDifferences(s,2);
  for(const matrix of [INITIAL_VIEW,rotateView(INITIAL_VIEW,120,-100),rotateView(INITIAL_VIEW,180,0)]){
    const scene=makeScene([900,600],matrix,s),faces=barGeometry(g,scene);
    expect(new Set(faces.map(f=>f.kind))).toEqual(new Set(["pos","neg","zero"]));
    const coordinates=new Set(faces.map(f=>f.index));expect(coordinates).toEqual(new Set([0,1,3]));
    expect(pickBar(faces,-100,-100)).toBeNull();
    const face=faces.at(-1),x=face.points.reduce((a,p)=>a+p[0]/4,0),y=face.points.reduce((a,p)=>a+p[1]/4,0);
    expect(pickBar(faces,x,y).index).toBe(face.index);
  }
});
test("柱の単位・凡例・0の座標選択、キーボードによるカメラの回転と復帰",async()=>{
  const context={setTransform:jest.fn(),clearRect:jest.fn(),beginPath:jest.fn(),moveTo:jest.fn(),lineTo:jest.fn(),closePath:jest.fn(),stroke:jest.fn(),fill:jest.fn()};
  jest.spyOn(HTMLCanvasElement.prototype,"getContext").mockReturnValue(context);
  const s=surface(3,new Float32Array([NaN,0,0,0,0,0,0,0,0])),onSelectSalary=jest.fn();
  const {container}=render(<IncomeDifferenceBars surface={s} head={0} spouse={1} selectedZ={0} fixedTotal={2} onSelectSalary={onSelectSalary}/>);
  await waitFor(()=>expect(context.fill).toHaveBeenCalled());
  const stage=screen.getByRole("group",{name:/3D柱状図/});
  expect(screen.getByText("可処分所得差")).toBeInTheDocument();expect(screen.getByText("万円／年")).toBeInTheDocument();
  expect(screen.getByText("0円のみ")).toBeInTheDocument();expect(screen.getByText("P")).toBeInTheDocument();
  jest.spyOn(stage,"getBoundingClientRect").mockReturnValue({left:0,top:0,width:920,height:560});
  const [clientX,clientY]=makeScene([920,560],INITIAL_VIEW,s).project(0,0,0);
  for(const type of ["pointerdown","pointerup"]){
    fireEvent(stage,Object.assign(new Event(type,{bubbles:true}),{button:0,pointerId:1,clientX,clientY}));
  }
  expect(onSelectSalary).toHaveBeenCalledWith(2,0); // 原点・総額を無視せず、端値0円を取る実給与に移る。
  const axis=container.querySelector(".income-bars-axis line"),start=axis.getAttribute("x1");
  fireEvent.keyDown(stage,{key:"ArrowRight"});expect(axis.getAttribute("x1")).not.toBe(start);
  fireEvent.keyDown(stage,{key:"Home"});expect(axis.getAttribute("x1")).toBe(start);
});
