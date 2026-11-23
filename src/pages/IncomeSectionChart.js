import {useId} from "react";
import {PAPER_BOUNDARY_LABELS} from "../data/paperBenefitTerms.js";
import "./IncomeSectionChart.css";

const systemStyle={
  "N01-1":[PAPER_BOUNDARY_LABELS["N01-1"],"#a72344"],
  "N01-2":[PAPER_BOUNDARY_LABELS["N01-2"],"#13498b"],
  "N02/N03":[PAPER_BOUNDARY_LABELS["N02/N03"],"#13764f"],
};
const numberFormat=new Intl.NumberFormat("ja-JP",{maximumFractionDigits:4});
const num=n=>numberFormat.format(n);
const W=1000,L=100,R=970,T=24;

// Both charts plot the same sampled values. Only domains and annotation scales change.
function ticks(lo,hi,aim,unit){
  if(lo>=hi)return [lo];
  const raw=(hi-lo)/aim,pow=10**Math.floor(Math.log10(raw));
  const step=Math.max(unit,([1,2,2.5,5,10].find(s=>s*pow>=raw && Number.isInteger(s*pow/unit))??10)*pow);
  const list=[];
  for(let i=Math.ceil(lo/step);i<=Math.floor(hi/step);i++)list.push(i*step);
  return list;
}
function eventName(ev){ return ev.systems.map(id=>systemStyle[id][0]).join("・"); }
function fixedName(axis){return axis==="head"?"配偶者":"世帯主";}
function movingName(axis){return axis==="head"?"世帯主":"配偶者";}

function IncomePlot({section,selected,onSelectEvent,focus=false}){
  const uid=useId().replace(/:/g,"");
  const {maxSalaryWan:max,axis,points,events}=section;
  let lo=0,hi=max;
  if(focus){
    const a=selected.retreatAtWan??selected.beforeWan,b=selected.recoveryAtWan??selected.afterWan;
    const margin=Math.max(2,Math.ceil((b-a)*.08));
    lo=Math.max(0,Math.min(a,selected.beforeWan)-margin);hi=Math.min(max,b+margin);
  }
  const B=focus?188:327,H=B+70;
  let yMin=Infinity,yMax=-Infinity;
  for(let k=lo;k<=hi;k++){
    if(points[k]==null)continue;
    yMin=Math.min(yMin,points[k]);yMax=Math.max(yMax,points[k]);
  }
  if(!Number.isFinite(yMin))return <p>この断面に算定できる給与点はありません。</p>;
  const pad=Math.max(1,(yMax-yMin)*.10);
  yMin=Math.floor(yMin-pad);yMax=Math.ceil(yMax+pad);
  const sx=k=>L+(k-lo)*(R-L)/Math.max(1,hi-lo);
  const sy=v=>B-(v-yMin)*(B-T)/(yMax-yMin);
  let path="",inRun=false;
  const isolated=[];
  for(let k=lo;k<=hi;k++){
    if(points[k]==null){inRun=false;continue;}
    path+=(inRun?"L":"M")+sx(k).toFixed(2)+" "+sy(points[k]).toFixed(2);
    if(!inRun && (k===hi || points[k+1]==null)) isolated.push(k);
    inRun=true;
  }
  const yt=ticks(yMin,yMax,focus?4:5,1);
  const axisText=movingName(axis)+"の年間給与（万円）";
  // Explicit arrowheads stay inside the plot even for a downward or leftwards arrow.
  const marker=(key,color)=><marker id={uid+key} key={key} viewBox="0 0 8 8" markerWidth="6" markerHeight="6" refX="7" refY="4" orient="auto"><path d="M0 0L8 4L0 8Z" fill={color}/></marker>;
  const arrow=(key,color,x1,y1,x2,y2,label)=><g key={key} aria-label={label} data-measure={key}><title>{label}</title><line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth="2" markerEnd={"url(#"+uid+key+")"}/></g>;
  return <svg className={"income-section-plot"+(focus?" is-detail":"")} role="img" aria-label={(focus?"選択した切替点の詳細":"給与と可処分所得の断面")+"：横軸 "+axisText+"、縦軸 世帯の可処分所得（万円／年）"} viewBox={`0 0 ${W} ${H}`}>
    {focus&&<defs>{[marker("drop","#ae2636"),marker("retreat","#865815"),marker("recovery","#165e88")]}</defs>}
    {yt.map(y=><g key={y}><line className="income-section-grid" x1={L} x2={R} y1={sy(y)} y2={sy(y)}/><text x={L-9} y={sy(y)+5} textAnchor="end">{num(y/10000)}</text></g>)}
    {ticks(lo,hi,7,1).map(x=><g key={x}><line className="income-section-grid" x1={sx(x)} x2={sx(x)} y1={T} y2={B}/><text x={sx(x)} y={B+23} textAnchor="middle">{num(x)}</text></g>)}
    <path className="income-section-axis" d={`M${L} ${T}V${B}H${R}`}/>
    <text className="income-axis-label" textAnchor="middle" x={(L+R)/2} y={H-10}>{axisText}</text>
    <text className="income-axis-label" textAnchor="middle" transform={`translate(19 ${(T+B)/2}) rotate(-90)`}>可処分所得（万円／年）</text>
    <path className="income-section-net" data-series="net" d={path}/>
    {isolated.map(k=><circle key={k} cx={sx(k)} cy={sy(points[k])} r="2" fill="#203e49"/>)}
    {!focus && events.map(ev=>{
      const x=sx(ev.afterWan),y=sy(ev.afterYen),active=ev.afterWan===selected?.afterWan;
      return <g key={ev.afterWan} data-event-salary={ev.afterWan} className="income-section-cut" onClick={()=>onSelectEvent(ev.afterWan)}>
        <title>{num(ev.beforeWan)} → {num(ev.afterWan)}万円：{eventName(ev)}</title>
        {active&&<><line x1={x} x2={x} y1={T} y2={B} stroke="#515c63" strokeDasharray="4 4"/><circle cx={x} cy={y} r={7+ev.systems.length*2} fill="white" stroke="#243b46"/></>}
        {ev.systems.map((id,j)=><circle key={id} cx={x} cy={y} r={4+(ev.systems.length-j-1)*2.5} stroke={systemStyle[id][1]} strokeWidth="2" fill="white"/>)}
        <circle cx={x} cy={y} r="11" fill="transparent"/>
      </g>;
    })}
    {focus&&<>
      <circle cx={sx(selected.beforeWan)} cy={sy(selected.beforeYen)} r="3.6" fill="#283f49"/>
      <circle cx={sx(selected.afterWan)} cy={sy(selected.afterYen)} r="3.6" fill="#283f49"/>
      {arrow("drop","#ae2636",sx(selected.afterWan),sy(selected.beforeYen),sx(selected.afterWan),sy(selected.afterYen),"下落幅 "+num(selected.dropYen)+"円")}
      {selected.retreatAtWan!=null&&arrow("retreat","#865815",sx(selected.afterWan),sy(selected.afterYen),sx(selected.retreatAtWan),sy(selected.afterYen),"後退幅 "+num(selected.retreatWan)+"万円")}
      {selected.recoveryAtWan!=null&&arrow("recovery","#165e88",sx(selected.afterWan),sy(selected.beforeYen),sx(selected.recoveryAtWan),sy(selected.beforeYen),"回復幅 "+num(selected.recoveryWan)+"万円")}
    </>}
  </svg>;
}

/** 同じ給与断面の実算値・制度の変化点・後退／回復を、一つの給与座標で対応づける。 */
export default function IncomeSectionChart({section,selectedAfterWan=null,onSelectEvent}){
  const {axis,fixedWan,events}=section;
  const selected=events.find(ev=>ev.afterWan===selectedAfterWan);
  return <section className="income-section-chart" aria-label="世帯の可処分所得の断面図">
    <h3>可処分所得の断面図</h3>
    <figure><figcaption>{fixedName(axis)}の年間給与：{num(fixedWan)}万円（固定）</figcaption><IncomePlot section={section} selected={selected} onSelectEvent={onSelectEvent}/></figure>
    {events.length===0?<p>この断面では対象制度の切替えはありません。</p>:<>
      <div className="income-section-table-scroll"><table><caption>制度の切替えと可処分所得</caption>
        <thead><tr><th scope="col">{movingName(axis)}の年間給与の変化（万円）</th><th scope="col">制度</th><th scope="col">下落幅（円）</th><th scope="col">後退幅（万円）</th><th scope="col">回復幅（万円）</th></tr></thead>
        <tbody>{events.map(ev=><tr key={ev.afterWan} className={selected===ev?"is-selected":undefined}>
          <th scope="row"><button type="button" aria-pressed={selected===ev} onClick={()=>onSelectEvent(ev.afterWan)}>{num(ev.beforeWan)} → {num(ev.afterWan)}</button></th>
          <td>{ev.systems.map(id=><span className="income-system-label" key={id}><i aria-hidden="true" style={{background:systemStyle[id][1]}}/>{systemStyle[id][0]}</span>)}</td>
          <td>{ev.dropYen>0?num(ev.dropYen):"下落なし"}</td><td>{ev.dropYen>0?(ev.retreatWan==null?"該当点なし":num(ev.retreatWan)):"—"}</td><td>{ev.dropYen>0?(ev.recoveryWan==null?"未回復":num(ev.recoveryWan)):"—"}</td>
        </tr>)}</tbody></table></div>
      {selected?.dropYen>0&&<figure className="income-section-detail"><figcaption>{num(selected.beforeWan)} → {num(selected.afterWan)}万円：{eventName(selected)}</figcaption>
        <IncomePlot section={section} selected={selected} focus/>
        <div className="income-measures"><span className="is-drop">↓ 下落　{num(selected.dropYen)}円</span><span className="is-retreat">← 後退　{selected.retreatWan==null?"該当点なし":num(selected.retreatWan)+"万円"}{selected.retreatAtWan!=null&&<small>（給与{num(selected.retreatAtWan)}万円）</small>}</span><span className="is-recovery">→ 回復　{selected.recoveryWan==null?"未回復":num(selected.recoveryWan)+"万円"}{selected.recoveryAtWan!=null&&<small>（給与{num(selected.recoveryAtWan)}万円）</small>}</span></div>
        {selected.interveningDrops>0&&<p>{selected.recoveryAtWan==null?"試算範囲内で回復せず、さらに":"回復前に、さらに"}{num(selected.interveningDrops)}回の制度切替えに伴う下落。</p>}
      </figure>}
      <p className="income-section-definition">下落幅は切替え前後の可処分所得の差。後退幅・回復幅は切替え直後の給与を起点に、直後の可処分所得以下となる直近の過去の点、直前の水準以上に初めて戻る将来の点までを、それぞれ給与収入の差で示す（1万円刻み）。</p>
    </>}
  </section>;
}
