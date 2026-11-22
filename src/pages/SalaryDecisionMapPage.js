import { useMemo, useState } from "react";
import { useSessionParameter } from "./salarySimulatorSession";
import "./salary-decision-map.css";

const SYSTEMS=[
  {id:"N01-1",label:"特別児童扶養手当",color:"#a72344",weight:7},
  {id:"N01-2",label:"障害児福祉手当",color:"#13498b",weight:4.5},
  {id:"N02/N03",label:"通所等の負担上限",color:"#13764f",weight:2},
];
const WIDTH=1032, HEIGHT=720, LEFT=83, RIGHT=998, TOP=28, BOTTOM=639;
const yen=n=>n.toLocaleString("ja-JP");
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));

// 境界は隣り合う整数給与点の中間にある。長い線の端では、その線に実在する給与点だけを選ぶ。
export function endpointsForBoundary(seg,x,y) {
  const [a,b,c,d]=seg;
  if(a===c) { const sy=clamp(Math.round(y),Math.ceil(b),Math.floor(d)); return [[Math.floor(a),sy],[Math.ceil(a),sy]]; }
  const sx=clamp(Math.round(x),Math.ceil(a),Math.floor(c));
  return [[sx,Math.floor(b)],[sx,Math.ceil(b)]];
}

function describeBoundary(calculator,from,to) {
  const a=calculator.evaluate(...from),b=calculator.evaluate(...to);
  if(a.status!=="calculated" || b.status!=="calculated") return [];
  const payment=v=>v>0?"支給":"停止";
  const service=v=>v===0?"非課税等（0円）":v===4600?"一般1（月4,600円）":"一般2（月37,200円）";
  const values=p=>[payment(p.details.benefits.tcca),payment(p.details.benefits.welfare),service(p.details.service.householdCapYen)];
  const before=values(a),after=values(b);
  return SYSTEMS.flatMap((s,i)=>before[i]!==after[i]&&(i!==2||(a.details.service.hasCapApplicableServiceUse && b.details.service.hasCapApplicableServiceUse))?
    [{...s,before:before[i],after:after[i]}]:[]);
}

const OUTCOMES=[{id:"drop",label:"可処分所得の下落",color:"#302339"}, {id:"recovery",label:"下落前の水準への回復",color:"#b75b00"}];
// Adjacent scan lines may share a threshold. Merge only collinear, touching edges:
// do not draw a diagonal through points where no transition was observed.
function outcomePath(segs,max) {
  const groups=new Map();
  for(const [a,b,c,d] of segs){
    const vert=a===c,k=(vert?"x":"y")+(vert?a:b);
    if(!groups.has(k))groups.set(k,{vert,pos:vert?a:b,spans:[]});
    groups.get(k).spans.push(vert?[b,d]:[a,c]);
  }
  const x=v=>(LEFT+v/max*(RIGHT-LEFT)).toFixed(3),y=v=>(BOTTOM-v/max*(BOTTOM-TOP)).toFixed(3);
  const parts=[];
  for(const {vert,pos,spans} of groups.values()){
    spans.sort((a,b)=>a[0]-b[0]);
    function append(a,b){parts.push(vert?`M${x(pos)} ${y(a)}L${x(pos)} ${y(b)}`:`M${x(a)} ${y(pos)}L${x(b)} ${y(pos)}`);}
    let [lo,hi]=spans[0];
    for(let i=1;i<spans.length;i++){
      if(spans[i][0]<=hi)hi=Math.max(hi,spans[i][1]);
      else{append(lo,hi);[lo,hi]=spans[i];}
    }
    append(lo,hi);
  }
  return parts.join("");
}
function DecisionFigure({map,calculator,head,spouse,onSelectSalary}) {
  const [selection,setSelection]=useState(null);
  const [direction,setDirection]=useSessionParameter("boundaryDirection","head");
  const max=map.maxSalaryWan;
  const outcomes=useMemo(()=>{
    const traces=map.outcomeLines?.[direction];
    return OUTCOMES.map(o=>({...o,path:outcomePath(traces?.[o.id]||[],max)}));
  },[map,direction,max]);
  const sx=(x)=>LEFT+x/max*(RIGHT-LEFT),sy=(y)=>BOTTOM-y/max*(BOTTOM-TOP);
  const geometry=useMemo(()=>map.layers.map(layer=>{
    const x=v=>LEFT+v/map.maxSalaryWan*(RIGHT-LEFT),y=v=>BOTTOM-v/map.maxSalaryWan*(BOTTOM-TOP);
    const segments=layer.segments.map(seg=>({seg,plot:[x(seg[0]),y(seg[1]),x(seg[2]),y(seg[3])]}));
    return {...SYSTEMS.find(s=>s.id===layer.id),segments,path:segments.map(({plot:[a,b,c,d]})=>"M"+a.toFixed(3)+" "+b.toFixed(3)+"L"+c.toFixed(3)+" "+d.toFixed(3)).join("")};
  }),[map]);
  const lines=useMemo(()=>geometry.flatMap(l=>l.segments),[geometry]);
  function selectAt(i,x,y) {
    const [from,to]=endpointsForBoundary(lines[i].seg,x,y);
    setSelection(old=>old && old.i===i && old.from[0]===from[0] && old.from[1]===from[1] ? old : {i,from,to});
  }
  function pointer(e) {
    const bounds=e.currentTarget.getBoundingClientRect(); if(!bounds.width || !bounds.height) return;
    const x=(e.clientX-bounds.left)*WIDTH/bounds.width,y=(e.clientY-bounds.top)*HEIGHT/bounds.height;
    let best=-1,dist=(10*WIDTH/bounds.width)**2;
    lines.forEach(({plot:[a,b,c,d]},i)=>{
      const px=clamp(x,Math.min(a,c),Math.max(a,c)),py=clamp(y,Math.min(b,d),Math.max(b,d));
      const v=(x-px)**2+(y-py)**2; if(v<dist){best=i;dist=v;}
    });
    if(best!==-1) selectAt(best,(x-LEFT)/(RIGHT-LEFT)*max,(BOTTOM-y)/(BOTTOM-TOP)*max);
    else setSelection(null);
  }
  function keyboard(e) {
    if(!lines.length || !["ArrowLeft","ArrowRight","ArrowDown","ArrowUp"].includes(e.key)) return;
    e.preventDefault();
    const forward=e.key==="ArrowRight"||e.key==="ArrowDown";
    const i=selection ? (selection.i+(forward?1:-1)+lines.length)%lines.length : (forward?0:lines.length-1);
    const [a,b,c,d]=lines[i].seg; selectAt(i,(a+c)/2,(b+d)/2);
  }
  const ticks=Array.from({length:7},(_,i)=>i*max/6);
  const detail=useMemo(()=>selection?describeBoundary(calculator,selection.from,selection.to):[],[calculator,selection]);
  const marker=selection&&{x:sx((selection.from[0]+selection.to[0])/2),y:sy((selection.from[1]+selection.to[1])/2)};
  const boxWidth=detail.some(s=>s.id==="N02/N03")?440:295, boxHeight=35+23*detail.length;
  const sortedPoint=selection&&(selection.from[0]!==selection.to[0]?
    `世帯主 ${yen(selection.from[0])} → ${yen(selection.to[0])}／配偶者 ${yen(selection.from[1])} 万円`:
    `世帯主 ${yen(selection.from[0])}／配偶者 ${yen(selection.from[1])} → ${yen(selection.to[1])} 万円`);
  return <figure className="decision-figure" aria-label="夫婦の給与収入と制度の変更点">
    <div role="radiogroup" aria-label="下落と回復を追う方向" className="decision-direction">{[["head","世帯主の給与を増やす"],["spouse","配偶者の給与を増やす"]].map(([id,label])=><label key={id}><input type="radio" name="salary-boundary-direction" checked={direction===id} onChange={()=>setDirection(id)}/>{label}</label>)}</div>
    <ul className="decision-legend" aria-label="制度別の凡例">{SYSTEMS.map(s=><li key={s.id}><i style={{background:s.color,height:s.weight}}/>{s.label}</li>)}{outcomes.map(o=><li key={o.id}><i style={{height:0,borderTop:"3px "+(o.id==="drop"?"solid ":"dashed ")+o.color}}/>{o.label}</li>)}</ul>
    <svg viewBox={"0 0 "+WIDTH+" "+HEIGHT} preserveAspectRatio="none" role="img" aria-label="横軸：世帯主の給与収入、縦軸：配偶者の給与収入（万円／年）"
      tabIndex={lines.length?0:undefined} onPointerMove={pointer} onPointerLeave={()=>setSelection(null)} onClick={e=>{
        const r=e.currentTarget.getBoundingClientRect(); if(!r.width||!r.height)return;
        const x=Math.round((((e.clientX-r.left)*WIDTH/r.width)-LEFT)*max/(RIGHT-LEFT));
        const y=Math.round((BOTTOM-(e.clientY-r.top)*HEIGHT/r.height)*max/(BOTTOM-TOP));
        if(x>=0 && x<=max && y>=0 && y<=max)onSelectSalary?.(x,y);
      }} onKeyDown={keyboard}>
      <desc>給与を1万円動かしたときの制度変更点。線を指すか、矢印キーで境界を選択できます。</desc>
      <rect x={LEFT} y={TOP} width={RIGHT-LEFT} height={BOTTOM-TOP} fill="white"/>
      {ticks.map(t=><g key={t}><line x1={sx(t)} x2={sx(t)} y1={TOP} y2={BOTTOM} className="decision-grid"/><line x1={LEFT} x2={RIGHT} y1={sy(t)} y2={sy(t)} className="decision-grid"/>
        <text x={sx(t)} y={BOTTOM+29} textAnchor="middle">{yen(t)}</text><text x={LEFT-12} y={sy(t)+5} textAnchor="end">{yen(t)}</text></g>)}
      <path d={`M${LEFT} ${TOP}V${BOTTOM}H${RIGHT}`} stroke="#3b505a" fill="none"/>
      <text className="decision-axis" x={(LEFT+RIGHT)/2} y={HEIGHT-15} textAnchor="middle">世帯主の給与収入（万円／年）</text>
      <text className="decision-axis" transform={`translate(21 ${(TOP+BOTTOM)/2}) rotate(-90)`} textAnchor="middle">配偶者の給与収入（万円／年）</text>
      {geometry.map(s=><path key={s.id} data-system={s.id} d={s.path} fill="none" stroke={s.color} strokeWidth={s.weight} strokeLinecap="butt" vectorEffect="non-scaling-stroke"/>)}
      {outcomes.map(o=><path key={o.id} data-outcome={o.id} d={o.path} fill="none" stroke={o.color} strokeWidth={o.id==="drop"?1.2:2.4} strokeDasharray={o.id==="recovery"?"5 2":undefined} vectorEffect="non-scaling-stroke"/>)}
      {Number.isFinite(head)&&Number.isFinite(spouse)&&<g aria-label="点P" pointerEvents="none"><circle cx={sx(head)} cy={sy(spouse)} r="4" fill="#142c33" stroke="white"/><text x={sx(head)+(head>max*.95?-13:8)} y={sy(spouse)-7}>P</text></g>}
      {marker&&<g aria-hidden="true" pointerEvents="none">
        <circle cx={marker.x} cy={marker.y} r="5" fill="white" stroke="#1d3038" strokeWidth="2"/>
        <g transform={`translate(${marker.x+boxWidth+12<=RIGHT?marker.x+12:marker.x-boxWidth-12} ${clamp(marker.y-boxHeight-10,TOP,BOTTOM-boxHeight)})`}>
          <rect width={boxWidth} height={boxHeight} rx="3" fill="white" fillOpacity=".97" stroke="#a9b9bc"/>
          <text x="9" y="21" className="decision-callout-title">{sortedPoint}</text>
          {detail.map((s,i)=><g key={s.id}><rect x="10" y={35+i*23} width="4" height="14" fill={s.color}/>
            <text x="21" y={47+i*23} className="decision-callout-label">{s.label}：{s.before} → {s.after}</text></g>)}
        </g></g>}
    </svg>
    <figcaption className={selection?"decision-caption-selected":undefined}>{!lines.length?"この条件では対象制度の切り替わりはありません。":selection?
      <><strong>（世帯主, 配偶者）</strong>（{selection.from.map(yen).join(", ")}）→（{selection.to.map(yen).join(", ")}）万円
        {detail.map(s=><span key={s.id}><i style={{background:s.color}}/>{s.label}：{s.before} → {s.after}</span>)}</>:
      "線を指すと、給与と制度の切り替わりを表示します。"}</figcaption>
  </figure>;
}

/** The XY figure projects the shared household grid; changing direction does not calculate another grid. */
export default function SalaryDecisionMapPage({datasetState:state,calculator,head,spouse,onSelectSalary}) {
  if(!state)return null;
  if(state.type==="complete")return <DecisionFigure map={state.map} {...{calculator,head,spouse,onSelectSalary}}/>;
  if(state.type==="error")return <p role="alert">{state.message}{state.retry&&<button type="button" onClick={state.retry}>再計算</button>}</p>;
  return <p role="status">計算中：{state.percent}%</p>;
}
