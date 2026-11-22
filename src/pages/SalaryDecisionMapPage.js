import {useMemo} from "react";
import {UNKNOWN_PLANE_NET_YEN} from "../calc/salaryPlaneRecovery";
import {useSessionParameter} from "./salarySimulatorSession";
import {useSalaryLevelContour} from "./salaryLevelContourState";
import SalaryPlaneAxes,{WIDTH,HEIGHT,LEFT,RIGHT,TOP,BOTTOM,xPlot,yPlot,toSalaryPlanePath as toPath} from "./SalaryPlaneAxes";
import "./salary-decision-map.css";

const SYSTEMS=[
  {id:"N01-1",label:"特別児童扶養手当",color:"#a72344",weight:7},
  {id:"N01-2",label:"障害児福祉手当",color:"#13498b",weight:4.5},
  {id:"N02/N03",label:"通所等の負担上限",color:"#13764f",weight:2.5},
];
const DROP="#302339",LEVEL="#a54d00";
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
    // 方向を1つに固定せず、各隣接座標で実際に下落した短い辺を両方向とも保持する。
    // 同一位置の制度線と下落線を選んだ場合は、個別の給与点を持つ下落の辺が先。
    const drops=[...(map.outcomeLines?.head?.drop||[]),...(map.outcomeLines?.spouse?.drop||[])];
    const lines=[...drops,...systems.flatMap(s=>s.segments)];
    return {systems,dropPath:toPath(drops,max),lines};
  },[map,max]);
  const selection=useMemo(()=>{
    if(!stored||stored.household!==household||!Number.isInteger(stored.i)||!Number.isFinite(stored.x)||!Number.isFinite(stored.y))return null;
    const seg=geometry.lines[stored.i];
    if(!seg)return null;
    const [from,to]=endpointsForBoundary(seg,stored.x,stored.y);
    return {i:stored.i,from,to};
  },[stored,household,geometry]);
  const before=selection?readNet(grid,selection.from):null,after=selection?readNet(grid,selection.to):null;
  const drop=before!==null&&after!==null&&before>after?before-after:null;
  const contour=useSalaryLevelContour(grid,drop!==null?before:null);
  const levelPath=useMemo(()=>drop!==null&&contour.status==="ready"&&contour.levelYen===before?toPath(contour.segments,max):null,[drop,before,contour,max]);
  const detail=useMemo(()=>selection?describeBoundary(calculator,selection.from,selection.to):[],[calculator,selection]);
  function select(i,x,y){store({i,x,y,household});}
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
    const i=selection?(selection.i+step+n)%n:step>0?0:n-1;
    if(step===0)return;
    const [a,b,c,d]=geometry.lines[i];select(i,(a+c)/2,(b+d)/2);
  }
  return <figure className="decision-figure" aria-label="夫婦の給与収入と制度の変更点">
    <ul className="decision-legend" aria-label="制度別の凡例">{SYSTEMS.map(s=><li key={s.id}><i style={{background:s.color,height:s.weight}}/>{s.label}</li>)}
      <li><i style={{background:DROP}}/>制度切替時の可処分所得の下落</li>
      {drop!==null&&<li><i style={{height:0,borderTop:"3px dashed "+LEVEL}}/>下落前の可処分所得の同水準線</li>}
    </ul>
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" role="img" aria-label="横軸：世帯主の給与収入、縦軸：配偶者の給与収入（万円／年）" tabIndex={geometry.lines.length?0:undefined} onClick={pointer} onKeyDown={keyboard}>
      <desc>線をクリックするか矢印キーで選択すると、境界を挟む両給与点の変化が分かります。下落を選ぶと、その直前の可処分所得以上と未満の境界を表示します。</desc>
      <SalaryPlaneAxes max={max}/>
      {geometry.systems.map(s=><path key={s.id} data-system={s.id} d={s.path} fill="none" stroke={s.color} strokeWidth={s.weight} vectorEffect="non-scaling-stroke"/>)}
      <path data-outcome="drop" d={geometry.dropPath} fill="none" stroke={DROP} strokeWidth="1.4" vectorEffect="non-scaling-stroke"/>
      {levelPath&&<path data-outcome="level" d={levelPath} fill="none" stroke={LEVEL} strokeWidth="2.5" strokeDasharray="6 3" vectorEffect="non-scaling-stroke"/>}
      {selection&&<circle aria-hidden="true" cx={xPlot((selection.from[0]+selection.to[0])/2,max)} cy={yPlot((selection.from[1]+selection.to[1])/2,max)} r="5" fill="white" stroke={DROP} strokeWidth="2" pointerEvents="none"/>}
    </svg>
    <figcaption aria-live="polite">{!geometry.lines.length?"この条件では対象制度の切り替わりはありません。":!selection?"下落線を選ぶと、下落前の可処分所得の同水準線を表示します。":<>
      <div>（世帯主, 配偶者）{coords(selection.from)}→{coords(selection.to)}万円
        {detail.map(s=><span key={s.id}><i style={{background:s.color}}/>{s.label}：{s.before} → {s.after}</span>)}</div>
      {drop!==null&&<><div>下落前 {yen(before)}円 → 下落後 {yen(after)}円　<strong>下落幅 {yen(drop)}円</strong></div>
        <div>同水準線：可処分所得 {yen(before)}円以上と未満の境界{contour.status==="computing"?"（計算中）":contour.status==="error"?"（計算できませんでした）":""}</div></>}
    </>}</figcaption>
  </figure>;
}

/** 同じ1万円格子を3D・差額図と共有。表示する同水準線は下落箇所を選んだ後だけ算定する。 */
export default function SalaryDecisionMapPage({datasetState:state,calculator,inputs}){
  const household=useMemo(()=>JSON.stringify(inputs)||"",[inputs]);
  if(!state)return null;
  if(state.type==="complete")return <DecisionFigure map={state.map} grid={state.grid} calculator={calculator} household={household}/>;
  if(state.type==="error")return <p role="alert">{state.message}{state.retry&&<button type="button" onClick={state.retry}>再計算</button>}</p>;
  return <p role="status">計算中：{state.percent}%</p>;
}
