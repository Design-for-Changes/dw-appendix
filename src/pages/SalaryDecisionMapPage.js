import {useMemo} from "react";
import {PAPER_BOUNDARY_LABELS} from "../data/paperBenefitTerms.js";
import {UNKNOWN_PLANE_NET_YEN} from "../calc/salaryPlaneRecovery";
import {useSessionParameter} from "./salarySimulatorSession";
import SalaryPlaneAxes,{WIDTH,HEIGHT,LEFT,RIGHT,TOP,BOTTOM,viewBox,xPlot,yPlot,toSalaryPlanePath as toPath} from "./SalaryPlaneAxes";
import "./salary-decision-map.css";

const SYSTEMS=[
  {id:"N01-1",color:"#a72344",weight:7},
  {id:"N01-2",color:"#13498b",weight:4.5},
  {id:"N02/N03",color:"#13764f",weight:2.5},
].map(s=>({...s,label:PAPER_BOUNDARY_LABELS[s.id]}));
const yen=n=>n.toLocaleString("ja-JP");
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));

// 縦の半目盛は世帯主給与の1万円増、横の半目盛は配偶者給与の1万円増を表す。
export function endpointsForBoundary([a,b,c,d],x,y){
  if(a===c){const fixed=clamp(Math.round(y),Math.ceil(b),Math.floor(d));return [[Math.floor(a),fixed],[Math.ceil(a),fixed]];}
  const fixed=clamp(Math.round(x),Math.ceil(a),Math.floor(c));return [[fixed,Math.floor(b)],[fixed,Math.ceil(b)]];
}
function describeBoundary(calculator,from,to){
  const a=calculator.evaluate(...from),b=calculator.evaluate(...to);
  if(a.status!=="calculated"||b.status!=="calculated")return [];
  const payment=v=>v>0?"支給":"停止";
  const service=v=>v===0?"非課税等（0円）":v===4600?"一般1（月4,600円）":"一般2（月37,200円）";
  const values=p=>[payment(p.details.benefits.tcca),payment(p.details.benefits.welfare),service(p.details.service.householdCapYen)];
  const before=values(a),after=values(b);
  return SYSTEMS.flatMap((s,i)=>before[i]!==after[i]&&(i!==2||(a.details.service.hasCapApplicableServiceUse&&b.details.service.hasCapApplicableServiceUse))?[{...s,before:before[i],after:after[i]}]:[]);
}
function readNet(grid,[x,y]){
  const value=grid?.netYen?.[y*grid.width+x];
  return Number.isSafeInteger(value)&&value!==UNKNOWN_PLANE_NET_YEN?value:null;
}
const coords=point=>"（"+point.map(yen).join(", ")+"）";

function DecisionFigure({map,grid,calculator,household}){
  const max=map.maxSalaryWan||1;
  const [stored,store]=useSessionParameter("boundarySelectedEdge",null);
  const geometry=useMemo(()=>{
    const systems=map.layers.map(layer=>({...SYSTEMS.find(s=>s.id===layer.id),path:toPath(layer.segments,max),segments:layer.segments}));
    return {systems,lines:systems.flatMap(s=>s.segments)};
  },[map,max]);
  const selection=useMemo(()=>{
    if(!stored||stored.lineSet!=="systems"||stored.household!==household||!Number.isInteger(stored.i)||!Number.isFinite(stored.x)||!Number.isFinite(stored.y))return null;
    const seg=geometry.lines[stored.i];
    if(!seg)return null;
    const [from,to]=endpointsForBoundary(seg,stored.x,stored.y);
    return {i:stored.i,from,to};
  },[stored,household,geometry]);
  const before=selection?readNet(grid,selection.from):null,after=selection?readNet(grid,selection.to):null;
  // 他方の給与を固定し、一方の年間給与を1万円増やした後の値から、増やす前の値を引く。
  const change=before!==null&&after!==null?after-before:null;
  const detail=useMemo(()=>selection?describeBoundary(calculator,selection.from,selection.to):[],[calculator,selection]);
  function select(i,x,y){store({i,x,y,household,lineSet:"systems"});}
  function pointer(event){
    const bounds=event.currentTarget.getBoundingClientRect();
    if(!bounds.width||!bounds.height)return;
    const px=event.clientX-bounds.left,py=event.clientY-bounds.top;
    const rx=bounds.width/WIDTH,ry=bounds.height/HEIGHT;
    let best=-1,distance=100;
    geometry.lines.forEach(([a,b,c,d],i)=>{
      const nx=clamp(px,xPlot(a,max)*rx,xPlot(c,max)*rx),ny=clamp(py,yPlot(d,max)*ry,yPlot(b,max)*ry);
      const dd=(px-nx)**2+(py-ny)**2;
      if(dd<distance){best=i;distance=dd;}
    });
    if(best!==-1)select(best,(px/rx-LEFT)/(RIGHT-LEFT)*max,(BOTTOM-py/ry)/(BOTTOM-TOP)*max);
    else store(null);
  }
  function keyboard(event){
    const n=geometry.lines.length;if(!n)return;
    if(event.key==="Escape"){event.preventDefault();store(null);return;}
    const step={ArrowRight:1,ArrowDown:1,ArrowLeft:-1,ArrowUp:-1,Enter:selection?0:1}[event.key];
    if(step===undefined)return;
    event.preventDefault();
    if(step===0)return;
    // 結合された長い制度線でも、矢印で線上の給与点を1万円ずつ辿れる。
    if(selection){
      const [a,b,c,d]=geometry.lines[selection.i],vertical=a===c;
      const p=selection.from[vertical?1:0]+step;
      if(p>=Math.ceil(vertical?b:a)&&p<=Math.floor(vertical?d:c)){
        select(selection.i,vertical?a:p,vertical?p:b);
        return;
      }
    }
    const i=selection?(selection.i+step+n)%n:step>0?0:n-1;
    const [a,b,c,d]=geometry.lines[i];
    select(i,step>0?a:c,step>0?b:d);
  }
  return <figure className="decision-figure" aria-label="制度境界・可処分所得の変化量">
    <ul className="decision-legend" aria-label="制度別の凡例">{SYSTEMS.map(s=><li key={s.id}><i style={{background:s.color,height:s.weight}}/>{s.label}</li>)}</ul>
    <svg viewBox={viewBox} width={WIDTH} height={HEIGHT} role="img" aria-label="横軸：世帯主の年間給与、縦軸：配偶者の年間給与（万円）" tabIndex={geometry.lines.length?0:undefined} onClick={pointer} onKeyDown={keyboard}>
      <desc>線をクリックするか矢印キーで選択すると、境界を挟む両給与点の変化が分かります。</desc>
      <SalaryPlaneAxes max={max}/>
      {geometry.systems.map(s=><path key={s.id} data-system={s.id} d={s.path} fill="none" stroke={s.color} strokeWidth={s.weight} vectorEffect="non-scaling-stroke"/>)}
      {selection&&<circle aria-hidden="true" cx={xPlot((selection.from[0]+selection.to[0])/2,max)} cy={yPlot((selection.from[1]+selection.to[1])/2,max)} r="5" fill="white" stroke="currentColor" strokeWidth="2" pointerEvents="none"/>}
    </svg>
    <figcaption aria-live="polite">{!geometry.lines.length?"この条件では対象制度の切り替わりはありません。":!selection?null:<>
      <div>（世帯主, 配偶者）{coords(selection.from)}→{coords(selection.to)}万円
        {detail.map(s=><span key={s.id}><i style={{background:s.color}}/>{s.label}：{s.before} → {s.after}</span>)}</div>
      <div>年間可処分所得 {before===null?"—":yen(before)+"円"} → {after===null?"—":yen(after)+"円"}　<strong>変化量 {change===null?"—":(change>0?"＋":change<0?"−":"")+yen(Math.abs(change))+"円"}</strong></div>
    </>}</figcaption>
  </figure>;
}

/** 可処分所得・可処分所得差の図と同じ1万円格子から、制度境界と前後の可処分所得の変化量を示す。 */
export default function SalaryDecisionMapPage({datasetState:state,calculator,inputs}){
  const household=useMemo(()=>JSON.stringify(inputs)||"",[inputs]);
  if(!state)return null;
  if(state.type==="complete")return <DecisionFigure map={state.map} grid={state.grid} calculator={calculator} household={household}/>;
  if(state.type==="error")return <p role="alert">{state.message}{state.retry&&<button type="button" onClick={state.retry}>再計算</button>}</p>;
  return <p role="status">計算中：{state.percent}%</p>;
}
