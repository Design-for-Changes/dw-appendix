import {useMemo} from "react";
import {useSessionParameter} from "./salarySimulatorSession";
import {retryPolicyBoundaryDataset, usePolicyBoundaryDataset} from "./policyBoundaryDataset";
import {partitionPolicyBoundaries} from "./policyBoundaryInk";
import {BOUNDARY_EDUCATION_BASIS} from "../calc/policyEducationNeed";
import SalaryPlaneAxes,{WIDTH,HEIGHT,toSalaryPlanePath} from "./SalaryPlaneAxes";
import "./salary-decision-map.css";
import "./SalarySurfaceMesh.css";
import "./policy-boundaries.css";

const colors = {"N01-1":"#a72344","N01-2":"#13498b","N02/N03":"#13764f",
  N04:"#934d09",M01:"#86418d","N02/M03":"#246d7e",
  housing:"#59612b",hearing:"#814637",power:"#4f568b",medicalCare:"#1c677a"};

export function PolicyBoundaryFigure({result}) {
  const [hidden,setHidden]=useSessionParameter("policyBoundaryHidden",[]);
  const [focus,setFocus]=useSessionParameter("policyBoundarySelection","");
  const layers=result.layers, m=result.maxSalaryWan;
  const chartGroups=useMemo(()=>partitionPolicyBoundaries(layers.filter(s=>s.status==="calculated"&&!hidden.includes(s.id)))
    .map(g=>({...g,path:toSalaryPlanePath(g.segments,m,2)})),[layers,hidden,m]);
  const names=Object.fromEntries(layers.map(s=>[s.id,s.label]));
  const describe=g=>g.transitions.map(t=>names[t.id]+(t.from && t.to ? "："+t.from+" ↔ "+t.to : "")).join(" ／ ");
  const active=chartGroups.find(g=>g.key===focus);
  return <figure className="decision-figure policy-boundary-figure" aria-label="制度ごとの所得区分の境界">
    <div className="salary-mesh-legend" role="group" aria-label="表示する制度">
      <button type="button" aria-pressed={layers.every(s=>!s.segments.length||!hidden.includes(s.id))} onClick={()=>setHidden([])}>すべて</button>
      {layers.map(s=>{
      const hasLine=s.status==="calculated" && s.segments.length>0;
      const disabledText=s.status==="needs-input" ? "条件未指定" : s.status==="not-applicable" ? "対象外" : "境界なし";
      return <button key={s.id} type="button" disabled={!hasLine} aria-pressed={hasLine&&!hidden.includes(s.id)}
        onClick={()=>setHidden(before=>before.includes(s.id)?before.filter(id=>id!==s.id):[...before,s.id])}>
        <i aria-hidden="true" style={{backgroundColor:colors[s.id] || "#485968"}}/>
        {s.label}{!hasLine&&<small>（{disabledText}）</small>}</button>;})}</div>
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="group" aria-label="横軸：世帯主給与、縦軸：配偶者給与（万円／年）">
      <SalaryPlaneAxes max={m}/>
      {chartGroups.map(g=><g key={g.key} onClick={()=>setFocus(g.key)} onFocus={()=>setFocus(g.key)}
        tabIndex="0" role="group" aria-label={describe(g)}><title>{describe(g)}</title>
        <path d={g.path} stroke="transparent" strokeWidth="10" fill="none" vectorEffect="non-scaling-stroke"/>
        {g.ids.map((id,i)=><path key={id} data-system={id} d={g.path} fill="none" stroke={colors[id] || "#485968"}
          strokeWidth={2.5+(g.ids.length-1-i)*2.5} vectorEffect="non-scaling-stroke"/>)}</g>)}
    </svg>
    <figcaption aria-live="polite">{active ? describe(active) : chartGroups.length
      ? "線を選ぶと区分を表示します。重なる区間は複数色で示します。" : "表示条件に該当する境界はありません。"}</figcaption>
  </figure>;
}

export default function PolicyBoundariesOnly({inputs,educationInputs={}}) {
  // このタブは共通の「グラフを描画」で条件が確定した後だけマウントする。
  const key=JSON.stringify({inputs,options:{educationInputs}});
  const state=usePolicyBoundaryDataset(key);
  return <section className="policy-boundaries" aria-label="制度境界のみ">
    {state?.type==="progress" && <p role="status">制度境界を計算中：{state.percent}%</p>}
    {state?.type==="error" && <p role="alert">{state.message} <button type="button" onClick={()=>retryPolicyBoundaryDataset(key)}>再計算</button></p>}
    {state?.type==="ready" && <><PolicyBoundaryFigure result={state.result}/>
      <details><summary>境界の算定に用いた資料</summary>
        <ul>{state.result.layers.filter(s=>typeof s.source==="string").map(s=><li key={s.id}>
          <a href={s.source}>{s.label}</a>{s.id==="N04"&&<> ／ <a href={BOUNDARY_EDUCATION_BASIS.rateTable}>需要額の費目別単価表（転載）</a></>}</li>)}</ul>
      </details></>}
  </section>;
}
