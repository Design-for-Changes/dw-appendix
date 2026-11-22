import { useEffect, useMemo, useState } from "react";
import { createRevisionCalculator } from "../calc/revisionEngine";
import { buildSalaryIncomeSection } from "../calc/salaryIncomeSection";
import { readSalaryWan } from "../data/revisionIncomeDesign";
import { useSessionParameter } from "./salarySimulatorSession";
import IncomeSectionChart from "./IncomeSectionChart";
import { ChildFields } from "./RevisionIncomePlane";
import { blankChild,usePaperHousehold } from "./paperHouseholdSession";
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

function DecisionFigure({map,calculator,axis,fixedWan,selectedAfterWan,onPick}) {
  const [selection,setSelection]=useState(null);
  const max=map.maxSalaryWan;
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
  function pointer(e,commit=false) {
    const bounds=e.currentTarget.getBoundingClientRect(); if(!bounds.width || !bounds.height) return;
    const x=(e.clientX-bounds.left)*WIDTH/bounds.width,y=(e.clientY-bounds.top)*HEIGHT/bounds.height;
    let best=-1,dist=(10*WIDTH/bounds.width)**2;
    lines.forEach(({plot:[a,b,c,d]},i)=>{
      const px=clamp(x,Math.min(a,c),Math.max(a,c)),py=clamp(y,Math.min(b,d),Math.max(b,d));
      const v=(x-px)**2+(y-py)**2; if(v<dist){best=i;dist=v;}
    });
    const u=(x-LEFT)/(RIGHT-LEFT)*max, v=(BOTTOM-y)/(BOTTOM-TOP)*max;
    if(best!==-1) {
      selectAt(best,u,v);
      if(commit) pickSegment(endpointsForBoundary(lines[best].seg,u,v));
    } else if(commit && u>=0 && u<=max && v>=0 && v<=max) {
      setSelection(null);
      onPick(axis,Math.round(axis==="head"?v:u),null);
    }
  }
  function pickSegment([from,to]) {
    const horizontal=from[0]!==to[0];
    onPick(horizontal?"head":"spouse", horizontal?from[1]:from[0], horizontal?to[0]:to[1]);
  }
  function keyboard(e) {
    if(e.key==="Enter" && selection){e.preventDefault();pickSegment([selection.from,selection.to]);return;}
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
    <ul className="decision-legend" aria-label="制度別の凡例">{SYSTEMS.map(s=><li key={s.id}><i style={{background:s.color,height:s.weight}}/>{s.label}</li>)}{fixedWan!==null&&<li><i className="decision-slice-key"/>断面：{axis==="head"?"配偶者":"世帯主"} {yen(fixedWan)}万円固定</li>}</ul>
    <svg viewBox={"0 0 "+WIDTH+" "+HEIGHT} preserveAspectRatio="none" role="img" aria-label="横軸：世帯主の給与収入、縦軸：配偶者の給与収入（万円／年）"
      tabIndex={lines.length?0:undefined} onPointerMove={pointer} onPointerLeave={()=>setSelection(null)} onClick={e=>pointer(e,true)} onKeyDown={keyboard}>
      <desc>制度境界をクリックすると、その境界を横切る断面を表示します。矢印キーで境界を選び、Enterでも確定できます。</desc>
      <rect x={LEFT} y={TOP} width={RIGHT-LEFT} height={BOTTOM-TOP} fill="white"/>
      {ticks.map(t=><g key={t}><line x1={sx(t)} x2={sx(t)} y1={TOP} y2={BOTTOM} className="decision-grid"/><line x1={LEFT} x2={RIGHT} y1={sy(t)} y2={sy(t)} className="decision-grid"/>
        <text x={sx(t)} y={BOTTOM+29} textAnchor="middle">{yen(t)}</text><text x={LEFT-12} y={sy(t)+5} textAnchor="end">{yen(t)}</text></g>)}
      <path d={`M${LEFT} ${TOP}V${BOTTOM}H${RIGHT}`} stroke="#3b505a" fill="none"/>
      <text className="decision-axis" x={(LEFT+RIGHT)/2} y={HEIGHT-15} textAnchor="middle">世帯主の給与収入（万円／年）</text>
      <text className="decision-axis" transform={`translate(21 ${(TOP+BOTTOM)/2}) rotate(-90)`} textAnchor="middle">配偶者の給与収入（万円／年）</text>
      {geometry.map(s=><path key={s.id} data-system={s.id} d={s.path} fill="none" stroke={s.color} strokeWidth={s.weight} strokeLinecap="butt" vectorEffect="non-scaling-stroke"/>)}
      {fixedWan!==null&&<g fill="none" pointerEvents="none">
        <line data-testid="income-section-guide" x1={axis==="head"?LEFT:sx(fixedWan)} x2={axis==="head"?RIGHT:sx(fixedWan)} y1={axis==="head"?sy(fixedWan):TOP} y2={axis==="head"?sy(fixedWan):BOTTOM} stroke="#3e4147" strokeDasharray="8 6" strokeWidth="1.6" vectorEffect="non-scaling-stroke"/>
        {selectedAfterWan!=null&&<circle cx={sx(axis==="head"?selectedAfterWan-.5:fixedWan)} cy={sy(axis==="head"?fixedWan:selectedAfterWan-.5)} r="7" stroke="#23232a" strokeWidth="2.5"/>}
      </g>}
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
      "境界線をクリックすると、その境界を横切る断面を表示します。"}</figcaption>
  </figure>;
}

function MapResult({job,calculator,retry}) {
  const [state,setState]=useState({type:"progress",percent:0});
  const [axis,setAxis]=useSessionParameter("sectionAxis","head");
  const [pointP]=useSessionParameter("income",["200","0"]);
  const [fixedSalaries,setFixedSalaries]=useSessionParameter("sectionFixedSalaries",pointP);
  const fixedIndex=axis==="head"?1:0;
  const fixedText=fixedSalaries[fixedIndex], fixedWan=readSalaryWan(fixedText);
  const [chosen,setChosen]=useState(null);
  const section=useMemo(()=>fixedWan===null?null:buildSalaryIncomeSection(calculator,{axis,fixedWan}),[calculator,axis,fixedWan]);
  const selectedAfterWan=section?.events.find(e=>e.afterWan===chosen)?.afterWan??section?.events.find(e=>e.dropYen>0)?.afterWan??section?.events[0]?.afterWan??null;
  function pick(axisNext,fixedNext,salaryAfter){
    setAxis(axisNext);
    setFixedSalaries(prev=>prev.map((v,i)=>i===(axisNext==="head"?1:0)?String(fixedNext):v));
    setChosen(salaryAfter);
  }
  useEffect(()=>{
    let worker,active=true;
    import("./createSalaryDecisionMapWorker").then(({createSalaryDecisionMapWorker})=>{
      if(!active) return;
      worker=createSalaryDecisionMapWorker();
      worker.onmessage=({data})=>{
        if(!active)return;
        setState(data);
        if(data.type!=="progress") worker.terminate();
      };
      worker.onerror=()=>{if(active){setState({type:"error",message:"制度の変更点を計算できませんでした。"});worker.terminate();}};
      worker.postMessage({type:"decision-map",household:job});
    }).catch(()=>{if(active)setState({type:"error",message:"制度の変更点を計算できませんでした。"});});
    return ()=>{active=false;worker?.terminate();};
  },[job]);
  const fixedLabel=(axis==="head"?"配偶者":"世帯主")+"の固定給与（万円／年）";
  return <>
    <div className="decision-section-options">
      <label>断面の横軸<select value={axis} onChange={e=>{setAxis(e.target.value);setChosen(null);}}>
        <option value="head">世帯主の給与</option><option value="spouse">配偶者の給与</option>
      </select></label>
      <label>{fixedLabel}<input type="number" value={fixedText} min="0" max="1500" step="1"
        onChange={e=>{const next=e.target.value;setFixedSalaries(prev=>prev.map((v,i)=>i===fixedIndex?next:v));setChosen(null);}}/></label>
      <input type="range" aria-label={fixedLabel} min="0" max="1500" step="1" value={fixedWan??0} onChange={e=>pick(axis,e.target.value,null)}/>
    </div>
    {state.type==="complete"?<DecisionFigure map={state.map} calculator={calculator} axis={axis} fixedWan={fixedWan} selectedAfterWan={selectedAfterWan} onPick={pick}/>:
      state.type==="error"?<p role="alert">{state.message} <button type="button" onClick={retry}>再計算</button></p>:<p role="status">境界図を計算中：{state.percent}%</p>}
    {section?<IncomeSectionChart section={section} selectedAfterWan={selectedAfterWan} onSelectEvent={setChosen}/>:<p>固定給与は0～1,500万円の整数で指定してください。</p>}
  </>;
}

/** Gと同じ世帯入力を同一タブで共有する。別条件の計算結果を使い回さない。 */
export default function SalaryDecisionMapPage() {
  const {children,setChildren,roles,setRoles,inputs}=usePaperHousehold();
  const [job,setJob]=useState(null),[open,setOpen]=useState(true);
  const {calculator,error}=useMemo(()=>{try{return {calculator:createRevisionCalculator(inputs)};}catch(e){return {error:e.message};}},[inputs]);
  const draw=()=>{setJob({inputs});setOpen(false);};
  return <section id="salary-decision-map" className="appendix-panel revision-simulator decision-page" aria-label="制度の変更点（2次元）">
    <details className="revision-conditions" open={open} onToggle={e=>setOpen(e.currentTarget.open)}>
      <summary>世帯と子どもの条件</summary>
      <div className="revision-fields"><label>子どもの人数<select value={children.length} onChange={e=>{setJob(null);setChildren(Array.from({length:Number(e.target.value)},(_,i)=>children[i]||blankChild()));}}>{[1,2,3].map(n=><option key={n} value={n}>{n}人</option>)}</select></label></div>
      <div className="revision-fields">
        <label>配偶者控除・配偶者特別控除を申告する親<select value={roles.spouseDeductionClaimant} onChange={e=>{setJob(null);setRoles({...roles,spouseDeductionClaimant:e.target.value});}}><option value="head">世帯主</option><option value="spouse">配偶者</option><option value="none">どちらも申告しない</option></select></label>
        <label>障害児福祉手当の主たる生計維持者<select value={roles.welfareMaintainer} onChange={e=>{setJob(null);setRoles({...roles,welfareMaintainer:e.target.value});}}><option value="highest-salary">給与の高い親（同額なら世帯主）</option><option value="head">世帯主固定</option><option value="spouse">配偶者固定</option></select></label>
      </div>
      {children.map((c,i)=><ChildFields key={i} index={i} child={c} update={d=>{setJob(null);setChildren(cs=>cs.map((v,j)=>i===j?{...v,...d}:v));}}/>)}
      {error&&<p role="alert">{error}</p>}
      <button type="button" disabled={!!error || job?.inputs===inputs} onClick={draw}>変更点を描画</button>
    </details>
    {job&&calculator&&job.inputs===inputs&&<MapResult job={job.inputs} calculator={calculator} retry={()=>{setJob(null);setOpen(true);}}/>}
  </section>;
}
