import {useMemo} from "react";
import {useSessionParameter} from "./salarySimulatorSession";
import {retryPolicyBoundaryDataset, usePolicyBoundaryDataset} from "./policyBoundaryDataset";
import {partitionPolicyBoundaries} from "./policyBoundaryInk";
import SalaryPlaneAxes,{WIDTH,HEIGHT,toSalaryPlanePath} from "./SalaryPlaneAxes";
import "./salary-decision-map.css";
import "./policy-boundaries.css";

const colors = {"N01-1":"#a72344","N01-2":"#13498b","N02/N03":"#13764f",
  N04:"#934d09",M01:"#86418d","N02/M03":"#246d7e",
  housing:"#59612b",hearing:"#814637",power:"#4f568b",medicalCare:"#1c677a"};
const defaults = {education:false, need:"", medical:false, exception:"", insured:""};

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
    <ul className="policy-layer-list" aria-label="表示する制度">{layers.map(s=>{
      const hasLine=s.status==="calculated" && s.segments.length>0;
      const disabledText=s.status==="needs-input" ? "条件未指定" : s.status==="not-applicable" ? "対象外" : "境界なし";
      return <li key={s.id}><label><input type="checkbox" disabled={!hasLine} checked={hasLine&&!hidden.includes(s.id)}
        onChange={()=>setHidden(before=>before.includes(s.id)?before.filter(id=>id!==s.id):[...before,s.id])}/>
        <i aria-hidden="true" style={{backgroundColor:colors[s.id] || "#485968"}}/>
        {s.label}{!hasLine&&<small>（{disabledText}）</small>}</label></li>;})}</ul>
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

export default function PolicyBoundariesOnly({inputs}) {
  const [fields,setFields]=useSessionParameter("policyBoundaryOptions",defaults);
  const [submitted,setSubmitted]=useSessionParameter("policyBoundaryDrawn","");
  const need=Number(fields.need);
  const invalid=fields.education && fields.need!=="" && (!Number.isSafeInteger(need) || need<=0);
  const options={
    educationElementary:fields.education,educationMonthlyNeedYen:fields.education&&Number.isSafeInteger(need)&&need>0?need:null,
    medical:{disabilityConfirmed:fields.medical,exceptionConfirmed:fields.exception===""?null:fields.exception==="yes",
      insuredParent:fields.insured || null},
  };
  const key=JSON.stringify({inputs,options});
  const state=usePolicyBoundaryDataset(submitted===key && !invalid ? key : null);
  const set=(field,value)=>setFields(old=>({...old,[field]:value}));
  return <section className="policy-boundaries" aria-label="制度境界のみ">
    <p>各制度の所得区分が切り替わる位置を示す。利用や支給を仮定せず、金額は可処分所得に加算しない。自治体制度は船橋市を対象とする。
      <a href="#income-assessment">制度別の所得区分・出典</a></p>
    <div className="policy-options">
      <fieldset><legend>就学奨励費（特別支援学校小学部）</legend>
        <label><input type="checkbox" checked={fields.education} onChange={e=>set("education",e.target.checked)}/> 小学部に在籍</label>
        <label>世帯の月需要額（円）<input type="number" min="1" step="1" value={fields.need} disabled={!fields.education}
          onChange={e=>set("need",e.target.value)}/></label>
      </fieldset>
      <fieldset><legend>医療制度の所得判定</legend>
        <label>対象児の医療保険の被保険者 <select value={fields.insured} onChange={e=>set("insured",e.target.value)}>
          <option value="">未指定</option><option value="head">世帯主</option><option value="spouse">配偶者</option>
          <option value="higher">給与の高い親と仮定</option></select></label>
        <label><input type="checkbox" checked={fields.medical} onChange={e=>set("medical",e.target.checked)}/> 重度心身障害者医療費助成の手帳等の障害要件に該当</label>
        <label>同助成の所得制限の特例（高額治療継続者等） <select value={fields.exception} disabled={!fields.medical} onChange={e=>set("exception",e.target.value)}>
          <option value="">未確認</option><option value="no">非該当</option><option value="yes">該当</option></select></label>
      </fieldset>
    </div>
    {invalid && <p role="alert">月需要額は1円以上の整数で入力してください。</p>}
    <button type="button" className="policy-draw" onClick={()=>setSubmitted(key)} disabled={invalid||Boolean(state)}>制度境界を描画</button>
    {state?.type==="progress" && <p role="status">制度境界を計算中：{state.percent}%</p>}
    {state?.type==="error" && <p role="alert">{state.message} <button type="button" onClick={()=>retryPolicyBoundaryDataset(key)}>再計算</button></p>}
    {state?.type==="ready" && <><PolicyBoundaryFigure result={state.result}/>
      <details><summary>境界の算定に用いた資料</summary>
        <ul>{state.result.layers.filter(s=>typeof s.source==="string").map(s=><li key={s.id}>
          <a href={s.source}>{s.label}</a></li>)}</ul>
      </details></>}
  </section>;
}
