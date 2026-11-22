import { useEffect, useMemo, useState } from "react";
import { classifyRevisionFalls } from "../calc/revisionEngine";
import { scanPaperChangePoints } from "../calc/paperChangePoints";
import RevisionDiscussion from "./RevisionDiscussion";
import SalarySurfaceMesh from "./SalarySurfaceMesh";
import { REVISION_INCOME_DESIGN as design } from "../data/revisionIncomeDesign";
import { DifferenceExtrema } from "./IncomeDifferenceReadout";
import IncomeDifferenceHeatmap from "./IncomeDifferenceHeatmap";

const MAX = 1500;
const yenNumber = (v) => v.toLocaleString("ja-JP", { maximumFractionDigits: 2 });
const outcomeLabel = design.outcome.axis;
const valueOf = (point) => point?.studyDisposableWan ?? null;

/** 同一の世帯条件では給与カーソルを移動しても格子を再計算しない。 */
export function RevisionSurface({ inputs, head, spouse, point, calculator, onSelectSalary, fixedTotal=null, comparison=false, datasetState }) {
  const [result, setResult] = useState(null);
  const shared=datasetState!==undefined;
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
    <IncomeDifferenceHeatmap surface={state.surface} differenceYen={datasetState?.grid?.differenceYen}/>
    <DifferenceExtrema surface={state.surface}/>
  </>:pending}</section>;
  return <figure id="salary-surface-plot" className="revision-surface" aria-label="夫婦の給与収入と世帯の可処分所得の3Dグラフ">
    {state?.surface?<SalarySurfaceMesh surface={state.surface} calculator={calculator} onSelectSalary={onSelectSalary} fixedTotal={fixedTotal} head={head} spouse={spouse} selectedZ={valueOf(point)}/>:pending}
  </figure>;
}

// 立体の粗い格子で失われる段差を、実際に評価した全1,501点の折れ線と対象制度の印で区別する。
function SliceChart({ values, falls, axisName, outcomeLabel }) {
  const known = values.filter(Number.isFinite);
  const low = Math.floor(Math.min(0, ...known) / 100) * 100;
  const high = Math.ceil(Math.max(100, ...known) / 100) * 100;
  const x = (i) => 64 + 625 * i / MAX;
  const y = (v) => 216 - 171 * (v - low) / (high - low);
  // 1万円ずつ連続して算定できた区間だけをつなぐ。欠測をまたぐ線や0円への落下を作らない。
  const runs = [];
  for(let i=0;i<values.length;i++) if (Number.isFinite(values[i])) {
    if (i===0 || !Number.isFinite(values[i-1])) runs.push([]);
    runs[runs.length-1].push([x(i),y(values[i])]);
  }
  return <figure className="revision-surface"><figcaption>固定した給与で切り出した断面</figcaption>
    <svg viewBox="0 0 738 267" role="img" aria-label={`${axisName}の給与に対する${outcomeLabel}の1万円刻みの折れ線。丸印は表に掲載した下落点`}>
      {[low, (high+low)/2, high].map((v) => <g key={v}><line x1={x(0)} x2={x(MAX)} y1={y(v)} y2={y(v)} stroke="#d4dedf" /><text x="54" y={y(v)+4} textAnchor="end">{yenNumber(v)}</text></g>)}
      {runs.map((run,i)=>run.length===1 ? <circle key={i} cx={run[0][0]} cy={run[0][1]} r="2" fill="#176b59"/> : <polyline key={i} points={run.map(p=>p.join(",")).join(" ")} fill="none" stroke="#176b59" strokeWidth="2" />)}
      {falls.map((f) => <circle key={f.at} cx={x(f.at)} cy={y(values[f.at])} r="3.8" fill="#9d420c" stroke="white" strokeWidth=".9"/>)}
      {[0,500,1000,1500].map((i) => <text key={i} x={x(i)} y="234" textAnchor="middle">{yenNumber(i)}</text>)}
      <text x="64" y="21">{outcomeLabel}（万円）</text><text x="381" y="258" textAnchor="middle">{axisName}の給与（万円／年）</text>
    </svg>
  </figure>;
}

/** 選択軸の全1501点を数十点ずつ評価し、条件変更・アンマウント時は旧結果を破棄する。 */
export function RevisionSlice({ calculator, head, spouse }) {
  const [axisId, setAxisId] = useState("head");
  const [requested, setRequested] = useState(null);
  const [results, setResults] = useState(null);
  const [includeTaxOnly, setIncludeTaxOnly] = useState(false);
  const fixed = axisId === "head" ? spouse : head;
  const axisName = axisId === "head" ? "世帯主" : "配偶者";
  const fixedName = axisId === "head" ? "配偶者" : "世帯主";
  // 旧結果は同じ値に戻しても意図せず混ざらないよう、設定ごとのオブジェクトを用いる。
  const key = useMemo(() => ({ calculator, fixed, axisId }), [calculator, fixed, axisId]);
  useEffect(() => {
    if (requested !== key) return undefined;
    let i = 0;
    let timer;
    const points = [];
    function chunk() {
      const end = Math.min(MAX + 1, i + 40);
      for (; i < end; i++) points.push(axisId === "head" ? calculator.evaluate(i, fixed) : calculator.evaluate(fixed, i));
      if (i <= MAX) timer = setTimeout(chunk, 0);
      else {
        const falls = classifyRevisionFalls(points);
        // 考察は同じ給与点の判定履歴を読む。収支を再計算せず、変化点を下落件数にも加えない。
        const cached = {evaluate:(h,s)=>points[axisId === "head" ? h : s]};
        const boundaries = scanPaperChangePoints(cached, axisId, fixed);
        setResults({ key, ...falls, boundaries, reasons:points.map(p=>p.reasons?.join("／") ?? ""), statuses:points.map(p=>p.status) });
      }
    }
    timer = setTimeout(chunk, 0);
    return () => clearTimeout(timer);
  }, [requested, key, calculator, axisId, fixed]);
  const ready = results?.key === key;
  const busy = requested === key && !ready;
  const selectedFalls = ready ? (includeTaxOnly ? results.allFalls : results.falls) : [];
  const calculated = ready ? results.values.filter(Number.isFinite).length : 0;
  const hasPair = ready && results.values.some((v,i)=>i>0 && Number.isFinite(v) && Number.isFinite(results.values[i-1]));
  return <section className="revision-slice" aria-labelledby="revision-slice-title">
    <h4 id="revision-slice-title">片方の給与を固定して、1万円刻みで比較</h4>
    <div className="revision-fields"><label>変化させる給与<select value={axisId} onChange={(e) => setAxisId(e.target.value)}><option value="head">世帯主</option><option value="spouse">配偶者</option></select></label>
      <p>{fixedName}の給与を年{yenNumber(fixed)}万円に固定</p>
      <button type="button" disabled={busy || ready} onClick={() => setRequested(key)}>{busy ? "計算中…" : ready ? "計算済み" : "全1,501点を計算"}</button>
    </div>
    {ready && <div className="revision-slice-result">
      <label className="revision-check"><input type="checkbox" checked={includeTaxOnly} onChange={(e) => setIncludeTaxOnly(e.target.checked)} />参考：税・保険料だけが変化した低下も含める</label>
      <p role="status">算定できた給与点：{yenNumber(calculated)}／1,501点。{hasPair ? <>隣接する算定済み給与点で、{outcomeLabel}が下がる箇所：{selectedFalls.length}点（{includeTaxOnly ? "すべての低下" : "給付減・サービス負担増を伴う低下のみ"}）。</> : "隣接する算定済み給与点がないため、所得逆転の有無は判定できません。"}</p>
      <SliceChart values={results.values} falls={selectedFalls} axisName={axisName} outcomeLabel={outcomeLabel} />
      {selectedFalls.length > 0 && <div className="appendix-table-wrap"><table className="appendix-table"><caption>下落前の水準に初めて戻る給与点（表示額：万円）</caption><thead><tr><th>下落時の{axisName}給与</th><th>変化した制度</th><th>下落幅</th><th>回復点</th><th>回復に要する増収</th></tr></thead>
      <tbody>{selectedFalls.map((f) => <tr key={f.at}><td data-label="下落時の給与">{yenNumber(f.at)}</td><td data-label="変化した制度">{f.causes.length ? f.causes.join("、") : "税・保険料"}</td><td data-label="下落幅">{yenNumber(f.delta)}</td><td data-label="回復点">{f.recovered === null ? (f.recoveryStatus === "gap" ? "未算定点があり判定不能" : "範囲内未回復") : yenNumber(f.recovered)}</td><td data-label="回復に要する増収">{f.recovered === null ? "―" : yenNumber(f.recovered - f.at)}</td></tr>)}</tbody></table></div>}
      <a download={`salary-slice-${axisId}-fixed-${fixed}.csv`} href={"data:text/csv;charset=utf-8," + encodeURIComponent("\uFEFF" + [`世帯主給与(万円/年),配偶者給与(万円/年),${outcomeLabel}(万円/年),算定状態,対象外・未算定理由`, ...results.values.map((z, i) => `${axisId === "head" ? i : fixed},${axisId === "head" ? fixed : i},${Number.isFinite(z) ? z : ""},${Number.isFinite(z) ? "算定" : results.statuses[i] === "excluded" ? "対象外" : "未算定"},"${results.reasons[i].replace(/"/g,'""')}"`)].join("\r\n"))}>この条件の1,501点をCSVで保存</a>
      <RevisionDiscussion boundaries={results.boundaries} />
    </div>}
  </section>;
}
