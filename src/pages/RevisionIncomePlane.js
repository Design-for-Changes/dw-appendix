import { useEffect, useMemo, useState } from "react";
import { REVISION_INCOME_DESIGN as design, readSalaryWan, salaryBounds } from "../data/revisionIncomeDesign";
import { createRevisionCalculator } from "../calc/revisionEngine";
import { createDisabilityIncomeComparison } from "../calc/disabilityIncomeDifference";
import { CALCULATION_SOURCES } from "../calc/calculationSources";
import { RevisionSurface } from "./RevisionSurface";
import { useSessionParameter } from "./salarySimulatorSession";
import { blankChild, usePaperHousehold } from "./paperHouseholdSession";
import HouseholdCalculationTrace from "./HouseholdCalculationTrace";
import { DifferenceAllCases, IncomeDifferencePoint } from "./IncomeDifferenceReadout";
import { CHILD_ELIGIBILITY_OPTIONS, childEligibilityId } from "../data/childEligibilityOptions";
import "./revision-simulator.css";

const fmt = (v) => Number.isFinite(v) ? v.toLocaleString("ja-JP", { maximumFractionDigits: 2 }) : "未算定";
export {blankChild};
const PARENT_NAME={head:"世帯主",spouse:"配偶者"};
const range = (max) => Array.from({ length: max + 1 }, (_, i) => i);
const initialPoint = ["200", "0"];
const designUrl = "data:application/json;charset=utf-8," + encodeURIComponent(JSON.stringify(design, null, 2));

export function ChildFields({ index, child, update }) {
  return <fieldset className="revision-child"><legend>子ども{index + 1}</legend>
    <div className="revision-fields">
      <label>年齢<select value={child.age} onChange={(e) => update({ age: Number(e.target.value) })}>{range(17).map((n) => <option key={n} value={n}>{n}歳</option>)}</select></label>
      <label>障害の組み合わせ<select value={childEligibilityId(child)} onChange={(e) => {
        const {tccaGrade, welfareEligible, taxStatus} = CHILD_ELIGIBILITY_OPTIONS.find(o => o.id === e.target.value);
        update({tccaGrade, welfareEligible, taxStatus});
      }}>{CHILD_ELIGIBILITY_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>
    </div>
    <div className="revision-fee-row">
      <label htmlFor={"day-fee-"+index}>通所支援の月額負担（多子軽減後・世帯上限前）</label>
      <input id={"day-fee-"+index} type="range" min="0" max="37200" step="1" value={child.serviceAmountYen}
        aria-valuetext={fmt(child.serviceAmountYen)+"円／月"} onChange={e=>update({serviceAmountYen:Number(e.target.value)})}/>
      <output htmlFor={"day-fee-"+index}>{fmt(child.serviceAmountYen)}円{child.serviceAmountYen>0 && child.age>=3 && child.age<=5 ? " → 通所は無償" : ""}</output>
    </div>
  </fieldset>;
}


/** 世帯条件ごとに同じ計算器で選択点と立体格子を計算する。 */
export default function RevisionIncomePlane({comparison=false}) {
  const {children,setChildren,roles,setRoles,inputs}=usePaperHousehold();
  const [income, setIncome] = useSessionParameter("income", initialPoint);
  const [fixedTotal, setFixedTotal] = useSessionParameter("fixedTotal", null);
  const [lastDrawnKey,setLastDrawnKey] = useSessionParameter(comparison?"differenceDrawnKey":"lastDrawnKey", null);
  const salary = income.map(readSalaryWan);
  const { min, max } = salaryBounds(fixedTotal);
  const incomesValid = salary.every((v) => v !== null && v >= min && v <= max);
  const total = incomesValid ? salary[0] + salary[1] : null;
  const { calculator, error } = useMemo(() => {
    try {
      return { calculator: comparison?createDisabilityIncomeComparison(inputs):createRevisionCalculator(inputs), error:null };
    } catch (err) { return { calculator: null, error: err.message }; }
  }, [inputs,comparison]);
  const inputKey=useMemo(()=>calculator ? JSON.stringify(inputs) : null,[calculator,inputs]);
  const drawn=inputKey !== null && lastDrawnKey === inputKey;
  const [conditionsOpen,setConditionsOpen]=useState(()=>!drawn);
  useEffect(()=>{
    if (lastDrawnKey !== null && lastDrawnKey !== inputKey) setLastDrawnKey(null);
  },[inputKey,lastDrawnKey,setLastDrawnKey]);
  const point = incomesValid && calculator ? calculator.evaluate(salary[0], salary[1]) : null;
  const recipient=point?.status==="calculated" ? (comparison ? point.allowanceRecipient : point.details.roles.allowanceRecipient) : null;
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
  return <section id={comparison?"disability-income-difference":"salary-surface"} className="revision-simulator" aria-label={comparison?"障害の有無による可処分所得差":"夫婦の給与収入と世帯の可処分所得"}>
    {comparison && <p>差額は、設定した世帯の年間可処分所得から、給与・子どもの人数・年齢・扶養関係が同じで、障害関係の手当・控除・サービス自己負担がない世帯の年間可処分所得を引いた額です。</p>}
    {comparison && <DifferenceAllCases/>}
    <details className="revision-conditions" open={conditionsOpen} onToggle={e=>setConditionsOpen(e.currentTarget.open)}>
      <summary>世帯と子どもの条件</summary>
      <div className="revision-fields"><label>子どもの人数<select value={children.length} onChange={(e) => setChildren(Array.from({ length: Number(e.target.value) }, (_, i) => children[i] || blankChild()))}>{[1, 2, 3].map((n) => <option key={n} value={n}>{n}人</option>)}</select></label></div>
      <div className="revision-fields">
        <label>配偶者控除・配偶者特別控除を申告する親<select value={roles.spouseDeductionClaimant} onChange={e=>setRoles({...roles,spouseDeductionClaimant:e.target.value})}><option value="head">世帯主</option><option value="spouse">配偶者</option><option value="none">どちらも申告しない</option></select></label>
        <label>障害児福祉手当の主たる生計維持者<select value={roles.welfareMaintainer} onChange={e=>setRoles({...roles,welfareMaintainer:e.target.value})}><option value="highest-salary">給与の高い親（同額なら世帯主）</option><option value="head">世帯主固定</option><option value="spouse">配偶者固定</option></select></label>
      </div>
      {children.map((c, i) => <ChildFields key={i} index={i} child={c} update={delta=>updateChild(i,delta)} />)}
      {error && <p role="alert">入力条件を確認してください：{error}</p>}
      <button type="button" disabled={!calculator || drawn} onClick={()=>{setLastDrawnKey(inputKey);setConditionsOpen(false);}}>グラフを描画</button>
    </details>
    {drawn && <RevisionSurface inputs={inputs} calculator={calculator} head={point ? salary[0] : null} spouse={point ? salary[1] : null} point={point} fixedTotal={fixedTotal} onSelectSalary={selectSalary} comparison={comparison} />}
    <section className="revision-point" aria-label="点P"><h3>点P</h3>
      <div className="revision-fields">{design.salary.axes.map((name, i) => <label key={name}>{name}（万円／年）<input type="number" min={min} max={max} step="1" value={income[i]} onChange={(e) => changeIncome(i, e.target.value)} /></label>)}</div>
      <label className="revision-check"><input type="checkbox" checked={fixedTotal !== null} disabled={fixedTotal === null && !incomesValid} onChange={(e) => setFixedTotal(e.target.checked ? total : null)} />世帯の給与収入総額を固定して夫婦間の配分を変える</label>
      <p aria-live="polite">{incomesValid ? `世帯の給与収入総額：${fmt(total)}万円／年` : `${fmt(min)}～${fmt(max)}万円の整数を入力してください。`}</p>
      {recipient&&<p>特児の受給資格者・子の税扶養：{PARENT_NAME[recipient]}</p>}
    {comparison && point && <IncomeDifferencePoint point={point}/>}
    {!comparison && point && <><div className="revision-result" aria-live="polite"><strong>{design.outcome.axis}</strong>
      {point.status !== "calculated" ? <><span>{point.status==="excluded"?"この給与点は試算対象外":"この給与点は未算定"}</span><ul>{point.reasons.map((r,i)=><li key={i}>{r}</li>)}</ul></> : <span>{fmt(point.studyDisposableWan)}<small> 万円／年</small></span>}
      </div>
      {point.breakdown && <HouseholdCalculationTrace point={point} inputs={inputs}/>}
      <a download="household-point.json" href={"data:application/json;charset=utf-8," + encodeURIComponent(JSON.stringify({ schema: "household-income-point-paper-2029", outcome: design.outcome, salaryUnit: "万円／年", headSalaryWan: salary[0], spouseSalaryWan: salary[1], inputs, result: point }, null, 2))}>この給与点の世帯条件・計算内訳を保存（JSON）</a>
    </>}
    </section>
    <details><summary>試算条件・出典</summary>
      <p>夫婦はともに45歳で、船橋市に居住・勤務する。子は全員、父母と同居し、本人の所得は前年・当年ともに0円とする。給与は前年と同額で12等分し、賞与・通勤手当・任意控除は含めない。給与が正の親は勤務先で加入、無給与の配偶者は被扶養者とする。</p>
      <p>2029年末の制度を想定し、未確定の手当額・保険料率には令和8年度の公表値を使用。通所負担は多子軽減後、食費等を除く。{design.outcome.scopeNote}</p>
      <a href={CALCULATION_SOURCES.serviceBurden.url}>利用者負担の基準</a> ／ <a href={designUrl} download="revision-income-design.json">給与軸の仕様（JSON）</a></details>
  </section>;
}
