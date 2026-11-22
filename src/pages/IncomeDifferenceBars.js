import {useEffect,useMemo,useRef,useState} from "react";
import {INITIAL_VIEW,makeScene,rotateView} from "./salarySurfaceCamera";
import {useSessionParameter} from "./salarySimulatorSession";
import {BAR_BIN_WAN,barGeometry,barSalaryPoint,binIncomeDifferences,pickBar} from "./incomeDifferenceBarGeometry";
import "./IncomeDifferenceBars.css";

const num=n=>n.toLocaleString("ja-JP",{maximumFractionDigits:4});
const bounded=(v,a,b)=>Math.min(b,Math.max(a,v));
const keys={ArrowLeft:[-8,0],ArrowRight:[8,0],ArrowUp:[0,-8],ArrowDown:[0,8]};

function Axes({scene,max,point}) {
  const {w,h,low,high,project:P}=scene;
  const marks=Array.from(new Set([0,Math.round(max/3),Math.round(2*max/3),max]));
  const target=(high-low)/5,unit=10**Math.floor(Math.log10(target)),zstep=([1,2,5,10].find(s=>s*unit>=target)??10)*unit;
  const zs=[];for(let j=Math.ceil(low/zstep);j<=Math.floor(high/zstep);j++)zs.push(j*zstep);
  const axis=(title,st,en,values,pos,dx,dy)=>{
    const line=(a,b)=><line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]}/>;
    const mz=title.includes("差"),at=mz?en:[(st[0]+en[0])/2,(st[1]+en[1])/2];
    return <g className="income-bars-axis">{line(st,en)}{values.map(v=>{
      const [x,y]=pos(v);return <g key={v}>{line([x,y],[x+dx*.25,y+dy*.25])}
        <text x={bounded(x+dx,19,w-19)} y={bounded(y+dy,13,h-3)}>{num(v)}</text></g>;
    })}<text className="income-bars-title" x={bounded(at[0]+(mz?0:dx*1.9),50,w-50)} y={bounded(at[1]+(mz?-16:dy*2.4),16,h-3)}>{title}</text></g>;
  };
  const XP=v=>P(2*v/max-1,-1,0),YP=v=>P(-1,2*v/max-1,0),ZP=v=>P(-1,-1,v);
  return <svg aria-hidden="true" viewBox={`0 0 ${w} ${h}`}>
    {axis("世帯主給与",XP(0),XP(max),marks.slice(1),XP,0,15)}
    {axis("配偶者給与",YP(0),YP(max),marks.slice(1),YP,0,-10)}
    {axis("可処分所得差",ZP(low),ZP(high),zs,ZP,-18,0)}
    <text x={w-12} y="20" textAnchor="end" className="income-bars-unit">万円／年</text>
    {point&&<g className="income-bars-cursor"><circle cx={point[0]} cy={point[1]} r="5"/><text x={point[0]+9} y={point[1]-7}>P</text></g>}
  </svg>;
}

export default function IncomeDifferenceBars({surface,head,spouse,selectedZ,onSelectSalary,fixedTotal=null}) {
  const frame=useRef(),canvas=useRef(),drag=useRef(null),drawn=useRef(null);
  const [size,setSize]=useState([920,560]),[view,setView]=useSessionParameter("differenceCamera",INITIAL_VIEW);
  const [error,setError]=useState(false);
  const ok=surface?.validCount>0&&surface.width>1&&surface.heights?.length===surface.width**2;
  const data=useMemo(()=>ok?(surface.barBins??binIncomeDifferences(surface)):null,[surface,ok]);
  const scene=useMemo(()=>ok?makeScene(size,view,surface):null,[size,view,surface,ok]);
  useEffect(()=>{
    const e=frame.current;if(!e)return undefined;
    const resize=()=>{const w=e.clientWidth,h=e.clientHeight;if(w&&h)setSize(prev=>prev[0]===w&&prev[1]===h?prev:[w,h]);};
    resize();if(typeof ResizeObserver!=="undefined"){const obs=new ResizeObserver(resize);obs.observe(e);return()=>obs.disconnect();}
    window.addEventListener("resize",resize);return()=>window.removeEventListener("resize",resize);
  },[ok]);
  useEffect(()=>{
    drawn.current=null;if(!data||!scene||!canvas.current)return undefined;
    const id=requestAnimationFrame(()=>{
      const el=canvas.current;if(!el)return;
      const ctx=el.getContext("2d");if(!ctx){setError(true);return;}setError(false);
      const {w,h,project:P}=scene,dpr=Math.min(2,window.devicePixelRatio||1);
      const pw=Math.round(w*dpr),ph=Math.round(h*dpr);
      if(el.width!==pw||el.height!==ph){el.width=pw;el.height=ph;}
      ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
      const quad=p=>{ctx.beginPath();ctx.moveTo(...p[0]);for(let i=1;i<p.length;i++)ctx.lineTo(...p[i]);ctx.closePath();};
      quad([P(-1,-1,0),P(1,-1,0),P(1,1,0),P(-1,1,0)]);ctx.strokeStyle="#78858a";ctx.lineWidth=1;ctx.stroke();
      const faces=barGeometry(data,scene);
      for(const f of faces){quad(f.points);ctx.fillStyle=f.color;ctx.fill();}
      drawn.current={faces,scene};
    });
    return()=>cancelAnimationFrame(id);
  },[data,scene]);
  if(!ok)return <p>この範囲に算定できた給与点はありません。</p>;
  const n=data.max;
  const p=Number.isInteger(head)&&head>=0&&head<=n&&Number.isInteger(spouse)&&spouse>=0&&spouse<=n&&Number.isFinite(selectedZ)
    ?scene.project(2*head/n-1,2*spouse/n-1,selectedZ):null;
  const rotate=(x,y)=>setView(old=>rotateView(old,x,y));
  function release(e){
    const d=drag.current;if(!d||e.pointerId!==d.id)return;drag.current=null;
    if(d.moved||drawn.current?.scene!==scene)return;
    const r=e.currentTarget.getBoundingClientRect();
    const hit=pickBar(drawn.current.faces,(e.clientX-r.left)*scene.w/r.width,(e.clientY-r.top)*scene.h/r.height);
    const salary=barSalaryPoint(data,hit,fixedTotal);
    if(salary)onSelectSalary?.(...salary);
  }
  return <section className="income-difference-bars" aria-label="給与の組み合わせと可処分所得差の3D柱状図">
    <p className="income-bars-key"><span><i className="is-pos"/>正</span><span><i className="is-neg"/>負</span><span><i className="is-zero"/>0円のみ</span></p>
    <div className="income-bars-stage" ref={frame} tabIndex={0} role="group" aria-label="3D柱状図。ドラッグまたは矢印キーで回転、Homeキーで初期方向"
      onKeyDown={e=>{if(keys[e.key]){e.preventDefault();rotate(...keys[e.key]);}else if(e.key==="Home"){e.preventDefault();setView(INITIAL_VIEW);}}}
      onPointerDown={e=>{if(e.button!==0||drag.current)return;drag.current={id:e.pointerId,x:e.clientX,y:e.clientY,moved:false};e.currentTarget.setPointerCapture?.(e.pointerId);}}
      onPointerMove={e=>{const d=drag.current;if(!d||d.id!==e.pointerId)return;
        const dx=e.clientX-d.x,dy=e.clientY-d.y;if(!d.moved&&Math.hypot(dx,dy)<3)return;
        d.moved=true;d.x=e.clientX;d.y=e.clientY;rotate(.55*dx,.55*dy);}}
      onPointerCancel={()=>{drag.current=null;}} onLostPointerCapture={()=>{drag.current=null;}} onPointerUp={release}>
      <canvas ref={canvas} aria-hidden="true"/>
      {error?<p role="status">この環境では柱状図を描画できません。</p>:<Axes scene={scene} max={n} point={p}/>}
    </div>
    <p className="income-bars-note">給与各{BAR_BIN_WAN}万円の区画内で、正の最高差を上に、負の最低差を下に示す（万円／年）。未算定点は除く。柱を選ぶと、その端値をとる給与の組み合わせを点Pに表示する。</p>
  </section>;
}
