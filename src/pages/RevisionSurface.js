import { useEffect, useMemo, useState } from "react";
import SalarySurfaceMesh from "./SalarySurfaceMesh";
import {createDisabilityIncomeComparison} from "../calc/disabilityIncomeDifference";
import IncomeDifferenceHeatmap from "./IncomeDifferenceHeatmap";

const valueOf = (point) => point?.studyDisposableWan ?? null;

/** 同一の世帯条件では給与カーソルを移動しても格子を再計算しない。 */
export function RevisionSurface({ inputs, head, spouse, point, calculator, onSelectSalary, fixedTotal=null, comparison=false, datasetState }) {
  const [result, setResult] = useState(null);
  const shared=datasetState!==undefined;
  const lookupPair=useMemo(()=>{
    if(shared||!comparison)return null;
    let model;
    return (headWan,spouseWan)=>(model??=createDisabilityIncomeComparison(inputs)).evaluate(headWan,spouseWan);
  },[inputs,comparison,shared]);
  useEffect(() => {
    // nullも親が管理する「未描画」。タブの初回表示・再表示・進捗通知で二重計算しない。
    if(shared)return undefined;
    let active = true, worker;
    function fail() { if (active) setResult({inputs, comparison, error:"3Dグラフの計算を開始できませんでした。"}); }
    if (typeof Worker === "undefined") { fail(); return undefined; }
    import("./createSalarySurfaceWorker").then(({default: createWorker}) => {
      if (!active) return;
      worker = createWorker();
      worker.onmessage = ({data}) => {
        if (!active) return;
        if (data.type === "progress") setResult({inputs, comparison, percent:Math.floor(data.done * 100 / data.total)});
        if (data.type === "complete") { setResult({inputs, comparison, surface:data}); worker.terminate(); }
        if (data.type === "error") { fail(); worker.terminate(); }
      };
      worker.onerror = () => { fail(); worker.terminate(); };
      worker.postMessage(comparison ? {type:"start",inputs,comparison:true} : {type:"start",inputs});
    }).catch(fail);
    return () => { active=false; worker?.terminate(); };
  }, [inputs,comparison,shared]);
  const local=result && result.inputs===inputs && result.comparison===comparison ? result : null;
  const state=shared ? (datasetState?.type==="complete" ? {surface:comparison?datasetState.comparison:datasetState.income}
    : datasetState?.type==="error" ? {error:datasetState.message,retry:datasetState.retry} : datasetState) : local;
  const pending=state?.error ? <p role="status">{state.error}{typeof state.retry==="function" && <button type="button" onClick={state.retry}>再計算</button>}</p>
    : shared && !datasetState ? null : <p className="revision-surface-loading" role="status">1万円刻みで計算中：{state?.percent ?? 0}%</p>;
  if(comparison)return <section id="income-difference-plot" aria-label="可処分所得差の分布">{state?.surface?<>
    <IncomeDifferenceHeatmap surface={state.surface} grid={datasetState?.grid} lookupPair={lookupPair}/>
  </>:pending}</section>;
  return <figure id="salary-surface-plot" className="revision-surface" aria-label="夫婦の給与収入と世帯の可処分所得の3Dグラフ">
    {state?.surface?<SalarySurfaceMesh surface={state.surface} calculator={calculator} onSelectSalary={onSelectSalary} fixedTotal={fixedTotal} head={head} spouse={spouse} selectedZ={valueOf(point)}/>:pending}
  </figure>;
}
