import { useEffect, useId, useMemo, useState } from "react";
import { REVISION_INCOME_DESIGN as design, readSalaryWan, salaryBounds } from "../data/revisionIncomeDesign";
import { createRevisionCalculator } from "../calc/revisionEngine";
import { RevisionSurface } from "./RevisionSurface";
import SalaryDecisionMapPage from "./SalaryDecisionMapPage";
import PolicyBoundariesOnly from "./PolicyBoundariesOnly";
import {useSalaryGraphDataset} from "./salaryGraphDataset";
import { useSessionParameter } from "./salarySimulatorSession";
import { blankChild, usePaperHousehold } from "./paperHouseholdSession";
import HouseholdCalculationTrace from "./HouseholdCalculationTrace";
import ChildDayFeeSlider from "./ChildDayFeeSlider";
import { CHILD_ELIGIBILITY_OPTIONS, childEligibilityId } from "../data/childEligibilityOptions";
import "./revision-simulator.css";

const fmt = (v) => Number.isFinite(v) ? v.toLocaleString("ja-JP", { maximumFractionDigits: 2 }) : "未算定";
export {blankChild};
const PARENT_NAME={head:"世帯主",spouse:"配偶者"};
const range = (max) => Array.from({ length: max + 1 }, (_, i) => i);
const initialPoint = ["200", "0"];
const GRAPH_VIEWS = [
  ["income","可処分所得（3D）"],
  ["boundaries","制度境界・下落・同水準線（2D）"],
  ["systems","制度境界のみ（2D）"],
  ["difference","可処分所得差"],
];

export function ChildFields({ index, child, update }) {
  return <fieldset className="revision-child"><legend>子ども{index + 1}</legend>
    <div className="revision-fields">
      <label>年齢<select value={child.age} onChange={(e) => update({ age: Number(e.target.value) })}>{range(17).map((n) => <option key={n} value={n}>{n}歳</option>)}</select></label>
      <label>障害の組み合わせ<select value={childEligibilityId(child)} onChange={(e) => {
        const {tccaGrade, welfareEligible, taxStatus} = CHILD_ELIGIBILITY_OPTIONS.find(o => o.id === e.target.value);
        update({tccaGrade, welfareEligible, taxStatus});
      }}>{CHILD_ELIGIBILITY_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>
    </div>
    <ChildDayFeeSlider id={"day-fee-"+index} className="revision-fee-row" age={child.age}
      value={child.serviceAmountYen} onChange={v=>update({serviceAmountYen:v})}/>
  </fieldset>;
}


/** 4図の世帯条件は一度の描画で確定する。給与格子と制度境界は必要な図を開いたときに計算する。 */
export default function RevisionIncomePlane({graphView,onGraphViewChange,comparison=false}) {
  const pointId=useId();
  const [localView,setLocalView]=useState(comparison?"difference":"income");
  const view=graphView ?? localView;
  function changeView(id) {
    if(graphView===undefined)setLocalView(id);
    onGraphViewChange?.(id);
  }
  function navigateTabs(event,index) {
    const n=GRAPH_VIEWS.length;
    const target={ArrowRight:(index+1)%n,ArrowLeft:(index+n-1)%n,Home:0,End:n-1}[event.key];
    if(target===undefined)return;
    event.preventDefault();
    event.currentTarget.parentNode.children[target].focus();
    changeView(GRAPH_VIEWS[target][0]);
  }
  const {children,setChildren,inputs}=usePaperHousehold();
  const [income, setIncome] = useSessionParameter("income", initialPoint);
  const [fixedTotal, setFixedTotal] = useSessionParameter("fixedTotal", null);
  const [lastDrawnKey,setLastDrawnKey] = useSessionParameter("lastDrawnKey", null);
  const salary = income.map(readSalaryWan);
  const { min, max } = salaryBounds(fixedTotal);
  const incomesValid = salary.every((v) => v !== null && v >= min && v <= max);
  const total = incomesValid ? salary[0] + salary[1] : null;
  const { calculator, error } = useMemo(() => {
    try {
      return { calculator:createRevisionCalculator(inputs), error:null };
    } catch (err) { return { calculator: null, error: err.message }; }
  }, [inputs]);
  const inputKey=useMemo(()=>calculator ? JSON.stringify(inputs) : null,[calculator,inputs]);
  const drawn=useMemo(()=>{
    if(inputKey===null || !lastDrawnKey)return false;
    if(lastDrawnKey===inputKey)return true;
    // 旧版で教材費等を入力して描画した場合も、同じ世帯条件なら再描画を求めない。
    try { return JSON.stringify(JSON.parse(lastDrawnKey)?.inputs)===inputKey; }
    catch { return false; }
  },[lastDrawnKey,inputKey]);
  // 未訪問の図は先回りで描画せず、一度開いた図は非表示状態のまま保持する。
  const [visited,setVisited]=useState([]);
  useEffect(()=>{
    setVisited(old=>!drawn ? (old.length?[]:old) : old.includes(view)?old:[...old,view]);
  },[drawn,view]);
  const plotted=id=>drawn&&(view===id||visited.includes(id));
  const datasetState=useSalaryGraphDataset(inputs,drawn&&(view!=="systems"||visited.some(id=>id!=="systems")));
  const [conditionsOpen,setConditionsOpen]=useState(()=>!drawn);
  useEffect(()=>{
    if (lastDrawnKey !== null && lastDrawnKey !== inputKey) setLastDrawnKey(drawn ? inputKey : null);
  },[drawn,inputKey,lastDrawnKey,setLastDrawnKey]);
  const [head,spouse]=incomesValid?salary:[null,null];
  const point=useMemo(()=>head!==null&&calculator?calculator.evaluate(head,spouse):null,[calculator,head,spouse]);
  const recipient=point?.status==="calculated" ? point.details.roles.allowanceRecipient : null;
  function changeIncome(i, value) {
    const next = [...income]; next[i] = value;
    const v = readSalaryWan(value);
    if (fixedTotal !== null && v !== null && v >= min && v <= max) next[1 - i] = String(fixedTotal - v);
    setIncome(next);
  }
  function selectSalary(head, spouse) {
    const h=readSalaryWan(head), s=readSalaryWan(spouse);
    if (h === null || s === null || (fixedTotal !== null && h+s !== fixedTotal)) return;
    setIncome([String(h),String(s)]);
  }
  function updateChild(i, delta) {
    setChildren(prev=>prev.map((c,j)=>j===i?{...c,...delta}:c));
  }
  const sharedPlot={inputs,datasetState};
  return <section id="salary-surface" className="revision-simulator" aria-label="夫婦の給与収入と世帯の可処分所得">
    <details className="revision-conditions" open={conditionsOpen} onToggle={e=>setConditionsOpen(e.currentTarget.open)}>
      <summary>世帯と子どもの条件</summary>
      <div className="revision-fields"><label>子どもの人数<select value={children.length} onChange={(e) => setChildren(Array.from({ length: Number(e.target.value) }, (_, i) => children[i] || blankChild()))}>{[1, 2, 3].map((n) => <option key={n} value={n}>{n}人</option>)}</select></label></div>
      {children.map((c, i) => <ChildFields key={i} index={i} child={c} update={delta=>updateChild(i,delta)} />)}
      {error && <p role="alert">入力条件を確認してください：{error}</p>}
      <button type="button" disabled={!calculator || drawn} onClick={()=>{setLastDrawnKey(inputKey);setConditionsOpen(false);}}>グラフを描画</button>
    </details>
    <div className="revision-graph-tabs" role="tablist" aria-label="グラフの切り替え">
      {GRAPH_VIEWS.map(([id,label],index)=><button key={id} id={pointId+"-tab-"+id} type="button" role="tab"
        aria-selected={view===id} aria-controls={pointId+"-panel-"+id} tabIndex={view===id?0:-1}
        onClick={()=>changeView(id)} onKeyDown={event=>navigateTabs(event,index)}>{label}</button>)}
    </div>
    {GRAPH_VIEWS.map(([id])=><div key={id} id={pointId+"-panel-"+id} role="tabpanel" aria-labelledby={pointId+"-tab-"+id} hidden={view!==id}>
      {plotted(id)&&(id==="systems"?<PolicyBoundariesOnly inputs={inputs}/>:id==="boundaries"?<SalaryDecisionMapPage {...sharedPlot} calculator={calculator}/>:
        id==="difference"?<RevisionSurface {...sharedPlot} comparison/>:
        <RevisionSurface {...sharedPlot} {...{calculator,point,head,spouse,fixedTotal}} onSelectSalary={selectSalary}/>)}
    </div>)}
    {view==="income"&&<section className="revision-point" aria-label="点P"><h3>点P</h3>
      <div className="point-salary-fields">{design.salary.axes.map((name,i)=>{
        const id=pointId+"-salary-"+i, caption=name+"（万円／年）";
        return <div className="point-salary-field" key={name}>
          <label id={id+"-label"} htmlFor={id}>{caption}</label>
          <input id={id} type="number" min={min} max={max} step="1" value={income[i]} onChange={e=>changeIncome(i,e.target.value)}/>
          <input type="range" aria-labelledby={id+"-label"} min={min} max={max} step="1"
            value={Math.max(min,Math.min(max,salary[i]??min))} aria-valuetext={salary[i]===null || salary[i]<min || salary[i]>max?"未設定":fmt(salary[i])+"万円／年"}
            onChange={e=>changeIncome(i,e.target.value)}/>
        </div>;
      })}</div>
      <label className="revision-check"><input type="checkbox" checked={fixedTotal !== null} disabled={fixedTotal === null && !incomesValid} onChange={(e) => setFixedTotal(e.target.checked ? total : null)} />世帯の給与収入総額を固定して夫婦間の配分を変える</label>
      <p aria-live="polite">{incomesValid ? `世帯の給与収入総額：${fmt(total)}万円／年` : `${fmt(min)}～${fmt(max)}万円の整数を入力してください。`}</p>
      {recipient&&<p>特児の受給資格者・子の税扶養：{PARENT_NAME[recipient]}</p>}
    {point && <><div className="revision-result" aria-live="polite"><strong>{design.outcome.axis}</strong>
      {point.status !== "calculated" ? <><span>{point.status==="excluded"?"この給与点は試算対象外":"この給与点は未算定"}</span><ul>{point.reasons.map((r,i)=><li key={i}>{r}</li>)}</ul></> : <span>{fmt(point.studyDisposableWan)}<small> 万円／年</small></span>}
      </div>
      {point.breakdown && <HouseholdCalculationTrace point={point} inputs={inputs}/>}
      <a download="household-point.json" href={"data:application/json;charset=utf-8," + encodeURIComponent(JSON.stringify({ schema: "household-income-point-paper-2029", outcome: design.outcome, salaryUnit: "万円／年", headSalaryWan: salary[0], spouseSalaryWan: salary[1], inputs, result: point }, null, 2))}>この給与点の世帯条件・計算内訳を保存（JSON）</a>
    </>}
    </section>}
    <details><summary>試算条件</summary>
      <p>夫婦はともに45歳で、船橋市に居住・勤務する。子は全員、父母と同居し、配偶者はおらず、本人の所得は前年・当年ともに0円とする。給与は前年と同額で12等分し、賞与・通勤手当・任意控除は含めない。給与が正の親は勤務先で加入、無給与の配偶者は被扶養者とする。</p>
    </details>
  </section>;
}
