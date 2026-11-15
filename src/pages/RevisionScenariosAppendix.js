import { useEffect, useMemo, useState } from "react";
import { summarizeAdjustmentImpact } from "../calc/illustrativeAdjustment";
import { validateN04EducationProfile } from "../calc/educationAid";

const base = process.env.PUBLIC_URL || ".";
const metadataUrl = `${base}/data/research/revision-scenarios.json`;

const needInputLabels = {
  annualYearEndAssistanceYen: "期末一時扶助の年額",
  monthlyTransitionalAdditionYen: "経過的加算の月額",
  monthlySpecialAdditionYen: "特例加算の月額",
  monthlyDisabilityAdditionYen: "障害者加算の月額",
  annualSchoolMaterialsYen: "指定教材費の年額",
  annualSchoolLunchBudgetYen: "給食費の参照予算年額",
  monthlyHousingYen: "住宅費の月額",
};

function describeBlockingIssue(issue) {
  let text = typeof issue === "string" ? issue : issue.description || issue.message || issue.id;
  for (const [key, label] of Object.entries(needInputLabels)) text = String(text).replaceAll(key, label);
  return text;
}

/** 通常又はgzipの結果JSONを読み込む。未計算値を補完しない。 */
async function loadResultJson(url, signal) {
  const response = await fetch(`${base}/${url.replace(/^\.\//, "")}`, { signal });
  if (!response.ok) throw new Error(`series: ${response.status}`);
  if (!url.endsWith(".gz")) return response.json();
  if (typeof DecompressionStream !== "function") throw new Error("圧縮系列の展開に対応していません。");
  return new Response(response.body.pipeThrough(new DecompressionStream("gzip"))).json();
}

/** 欠損・文字列・無限大を金額0とみなさず、エラーにする。 */
function requireNumber(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${label}が有限の数値ではありません。`);
  return value;
}

/** 条件索引の必須構造、ID、計算状態を表示前に確認する。 */
function validateMetadata(json) {
  if (json?.schema_version !== "1.0.0" || !Array.isArray(json.family_profiles) || !json.family_profiles.length || !Array.isArray(json.conditions)) throw new Error("条件資料の形式が不正です。");
  const familyIds = new Set(json.family_profiles.map((item) => item.id));
  if (familyIds.size !== json.family_profiles.length || [...familyIds].some((id) => typeof id !== "string" || !id)) throw new Error("家族条件IDが不正です。");
  const conditionIds = new Set();
  const conditionKeys = new Set();
  for (const condition of json.conditions) {
    if (typeof condition.id !== "string" || !condition.id || conditionIds.has(condition.id) || !familyIds.has(condition.family_profile_id)) throw new Error("条件IDが重複又は不正です。");
    conditionIds.add(condition.id);
    requireNumber(condition.spouse_salary_wan, "配偶者給与");
    requireNumber(condition.service_use_yen_per_child_month, "利用条件");
    const key = `${condition.family_profile_id}/${condition.spouse_salary_wan}/${condition.service_use_yen_per_child_month}`;
    if (conditionKeys.has(key)) throw new Error("同一の比較条件が重複しています。");
    conditionKeys.add(key);
    if (!["blocked", "conditions-ready-results-pending", "computed"].includes(condition.calculation_status)) throw new Error("計算状態が不正です。");
    if (condition.calculation_status === "computed" && (typeof condition.result?.series_url !== "string" || !condition.result.series_url)) throw new Error("計算済み条件の系列URLがありません。");
    if (condition.calculation_status === "computed" && (condition.household?.programs?.n04 !== true || validateN04EducationProfile(condition.household?.programs?.n04EducationProfile).length)) throw new Error("N04の未確定入力を含む条件は計算済みにできません。");
    if (condition.calculation_status !== "computed" && condition.result != null) throw new Error("未計算条件に計算結果が混在しています。");
    if (condition.blocking_issues != null && !Array.isArray(condition.blocking_issues)) throw new Error("未確定理由の形式が不正です。");
    if (condition.household?.programs?.n04EducationProfile && condition.household.programs.n04 !== true) throw new Error("新N04条件ではn04=trueが必要です。");
    if (condition.result?.reversals != null) {
      if (!Array.isArray(condition.result.reversals)) throw new Error("所得逆転表の形式が不正です。");
      for (const reversal of condition.result.reversals) {
        requireNumber(reversal.salary_wan ?? reversal.x, "所得逆転の給与収入");
        requireNumber(reversal.drop_wan ?? reversal.drop, "下落幅");
        if (reversal.programs != null && !Array.isArray(reversal.programs)) throw new Error("作用した制度の形式が不正です。");
        const recovery = reversal.recovery_salary_wan ?? reversal.recovery_x;
        const width = reversal.recovery_increase_wan ?? reversal.recovery_width;
        if (recovery != null) requireNumber(recovery, "回復点");
        if (width != null) requireNumber(width, "回復に必要な増収額");
      }
    }
  }
  if (json.counts && (json.counts.family_profiles !== json.family_profiles.length || json.counts.household_conditions !== json.conditions.length)) throw new Error("条件の件数と索引が一致しません。");
  return json;
}

/** 現行系列を単位を変えずに検証し、給与順の点列として取得する。 */
function readCurrentPoints(json) {
  const raw = Array.isArray(json) ? json : json?.series || json?.points;
  if (!Array.isArray(raw) || !raw.length) throw new Error("現行制度の系列がありません。");
  let previous = -Infinity;
  return raw.map((point) => {
    const x = requireNumber(point.x ?? point.salary_wan, "給与収入");
    const disposable = requireNumber(point.disposable ?? point.disposable_wan, "現行可処分所得");
    if (x <= previous) throw new Error("給与収入の順序又は重複が不正です。");
    previous = x;
    return { ...point, x, disposable };
  });
}

/** 同給与の現行値と参考例を照合し、増減額と不利区間を給与点から算出する。 */
function readAdjustment(raw, currentPoints) {
  if (!raw) return null;
  if (raw.kind !== "illustrative-not-optimal" || !Array.isArray(raw.points) || raw.points.length !== currentPoints.length) throw new Error("参考調整例の系列形式が不正です。");
  for (const key of ["needAnnualWan", "eligibleExpenseAnnualWan", "fullSupportAnnualWan", "lowerRatio", "upperRatio", "burdenRate"]) requireNumber(raw[key], `参考例 ${key}`);
  if (raw.needAnnualWan <= 0 || raw.eligibleExpenseAnnualWan < 0 || raw.fullSupportAnnualWan < 0 || raw.upperRatio <= raw.lowerRatio || raw.burdenRate < 0) throw new Error("参考調整例の算定条件が不正です。");
  const points = raw.points.map((point, index) => {
    const x = requireNumber(point.x, "参考例の給与収入");
    const disposableAnnualWan = requireNumber(point.disposableAnnualWan, "参考例の可処分所得");
    const differenceAnnualWan = requireNumber(point.differenceAnnualWan, "同給与での差額");
    const current = currentPoints[index];
    if (x !== current.x || Math.abs(disposableAnnualWan - current.disposable - differenceAnnualWan) > 1e-7) throw new Error("現行系列と参考例の同給与差額が一致しません。");
    return { x, disposableAnnualWan, differenceAnnualWan };
  });
  const impact = summarizeAdjustmentImpact(points);
  if (raw.impact) {
    for (const key of ["minimumDifferenceAnnualWan", "maximumDifferenceAnnualWan"]) {
      if (Math.abs(requireNumber(raw.impact[key], `参考例 ${key}`) - impact[key]) > 1e-7) throw new Error("参考例の差額集計と系列が一致しません。");
    }
  }
  return { ...raw, points, impact };
}

/** 現行系列と、あれば別ファイルの参考例系列を同一の取得処理で検証する。 */
async function loadConditionResult(condition, signal) {
  const json = await loadResultJson(condition.result.series_url, signal);
  const points = readCurrentPoints(json);
  let rawAdjustment = condition.result.adjustment || (!Array.isArray(json) ? json.adjustment : null);
  if (rawAdjustment?.series_url) {
    const after = await loadResultJson(rawAdjustment.series_url, signal);
    rawAdjustment = { ...rawAdjustment, points: Array.isArray(after) ? after : after.points };
  }
  return { conditionId: condition.id, points, adjustment: readAdjustment(rawAdjustment, points) };
}

/** 同じ世帯条件の給与系列を表示する。横軸は世帯主給与であり、世帯給与合計ではない。 */
function ScenarioChart({ points, adjustment }) {
  const w = 1040, h = 460, p = { l: 80, r: 25, t: 25, b: 60 };
  const values = [...points.map((point) => point.disposable), ...(adjustment?.points || []).map((point) => point.disposableAnnualWan)];
  const low = Math.floor((Math.min(...values) - 20) / 100) * 100;
  const high = Math.ceil((Math.max(...values) + 20) / 100) * 100;
  const sx = (x) => p.l + (x - 200) / 1300 * (w - p.l - p.r);
  const sy = (y) => p.t + (high - y) / Math.max(1, high - low) * (h - p.t - p.b);
  const currentPath = points.map((point, index) => `${index ? "L" : "M"}${sx(point.x).toFixed(2)},${sy(point.disposable).toFixed(2)}`).join(" ");
  const afterPath = adjustment?.points.map((point, index) => `${index ? "L" : "M"}${sx(point.x).toFixed(2)},${sy(point.disposableAnnualWan).toFixed(2)}`).join(" ");
  return <><p aria-label="グラフ凡例"><span style={{ color: "#2358a6" }}>━━ 現行制度</span>{adjustment && <>　<span style={{ color: "#187b57" }}>┄┄ 参考調整例</span></>}</p><div className="appendix-chart-scroll"><svg className="appendix-chart" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`選択した仮想世帯条件における世帯主給与と年間可処分所得${adjustment ? "（現行制度と参考調整例の比較）" : ""}`}>
    <rect x="0" y="0" width={w} height={h} fill="white" />
    {[0, 1, 2, 3, 4, 5].map((i) => { const v = low + (high - low) * i / 5; return <g key={i}><line x1={p.l} x2={w - p.r} y1={sy(v)} y2={sy(v)} stroke="#dbe4e8" /><text x={p.l - 10} y={sy(v) + 5} textAnchor="end" fontSize="15">{Math.round(v).toLocaleString("ja-JP")}</text></g>; })}
    {[200, 400, 600, 800, 1000, 1200, 1400, 1500].map((x) => <g key={x}><line x1={sx(x)} x2={sx(x)} y1={p.t} y2={h - p.b} stroke="#e5ebee" /><text x={sx(x)} y={h - 32} textAnchor="middle" fontSize="15">{x}</text></g>)}
    <path d={currentPath} fill="none" stroke="#2358a6" strokeWidth="3" data-testid="current-disposable-line" />
    {afterPath && <path d={afterPath} fill="none" stroke="#187b57" strokeWidth="3" strokeDasharray="8 5" data-testid="adjustment-disposable-line" />}
    <text x={w / 2} y={h - 6} textAnchor="middle" fontSize="17">世帯主の給与収入（万円／年）</text>
    <text transform={`translate(22 ${h / 2}) rotate(-90)`} textAnchor="middle" fontSize="17">年間可処分所得（万円）</text>
  </svg></div></>;
}

/** 参考例と現行制度の差を表示する。給与区間を世帯人数・割合と混同しない。 */
function AdjustmentImpact({ model }) {
  const format = (value) => value.toLocaleString("ja-JP", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const intervals = model.impact.lowerIncomeIntervals;
  return <section aria-labelledby="revision-adjustment-impact-title">
    <h3 id="revision-adjustment-impact-title">参考調整例との差（同じ給与収入で比較）</h3>
    <p>政策的な最適解や財政中立を示すものではなく、支給・負担の段差を緩和する考え方の一例である。給付基準Bには、この給与掃引範囲内で得られた最大現金給付 {format(model.fullSupportAnnualWan)}万円／年を用いる。制度上の満額を保証する値ではない。</p>
    <dl className="appendix-controls"><div><dt>参考例−現行制度の最小差</dt><dd>{format(model.impact.minimumDifferenceAnnualWan)}万円／年</dd></div><div><dt>参考例−現行制度の最大差</dt><dd>{format(model.impact.maximumDifferenceAnnualWan)}万円／年</dd></div></dl>
    {intervals.length ? <div className="appendix-table-wrap"><table className="appendix-table"><caption>参考調整例の可処分所得が現行制度を下回る給与区間</caption><thead><tr><th>世帯主の給与収入範囲（万円／年）</th><th>この区間の最小差（参考例−現行、万円／年）</th></tr></thead><tbody>{intervals.map((row, i) => <tr key={i}><td>{row.fromSalaryWan.toLocaleString("ja-JP")}～{row.toSalaryWan.toLocaleString("ja-JP")}</td><td>{format(row.minimumDifferenceAnnualWan)}</td></tr>)}</tbody></table></div> : <p>計算した給与点では、参考例が現行制度を下回る点はない。</p>}
    <p>これらは設定した仮想世帯の給与点の比較であり、影響を受ける世帯数や世帯割合を示さない。給与範囲外の結果も推定しない。</p>
  </section>;
}

export default function RevisionScenariosAppendix() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [familyId, setFamilyId] = useState("");
  const [spouse, setSpouse] = useState(0);
  const [use, setUse] = useState(4600);
  const [series, setSeries] = useState(null);
  const [seriesError, setSeriesError] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch(metadataUrl, { signal: controller.signal }).then((r) => { if (!r.ok) throw new Error(`conditions: ${r.status}`); return r.json(); }).then(validateMetadata).then((json) => { setData(json); setFamilyId(json.family_profiles[0].id); }).catch((e) => { if (e.name !== "AbortError") setError(e); });
    return () => controller.abort();
  }, []);
  const condition = useMemo(() => data?.conditions?.find((item) => item.family_profile_id === familyId && Number(item.spouse_salary_wan) === Number(spouse) && Number(item.service_use_yen_per_child_month) === Number(use)), [data, familyId, spouse, use]);
  useEffect(() => {
    setSeries(null); setSeriesError(null);
    if (!condition || condition.calculation_status !== "computed" || !condition.result?.series_url) return undefined;
    const controller = new AbortController();
    loadConditionResult(condition, controller.signal).then((result) => { if (!controller.signal.aborted) setSeries(result); }).catch((e) => { if (!controller.signal.aborted && e.name !== "AbortError") setSeriesError(e); });
    return () => controller.abort();
  }, [condition]);
  if (error) return <section role="alert" className="appendix-panel">条件資料を読み込めませんでした。</section>;
  if (!data) return <section role="status" className="appendix-panel">条件資料を読み込んでいます。</section>;
  const profile = data.family_profiles?.find((item) => item.id === familyId);
  const computedCount = data.conditions.filter((item) => item.calculation_status === "computed").length;
  return <section id="revision-scenarios" className="appendix-panel" aria-labelledby="revision-scenarios-title">
    <div className="appendix-section-head"><div><p className="appendix-kicker">Web Appendix G</p><h2 id="revision-scenarios-title">モデル条件と感度分析</h2><p>家族構成、配偶者の給与、通所利用条件を分けて比較する。各条件は仮想的な比較設定であり、典型世帯や人口分位を表すものではない。</p></div><a className="research-download" href={metadataUrl} download>モデル条件JSON</a></div>
    <div className="municipal-method"><p>家族構成 {data.family_profiles.length}通り × 配偶者給与3条件 × 通所利用3条件 ＝ {data.conditions.length}条件。計算済み {computedCount}条件。</p><p>横軸は世帯主の給与200〜1,500万円。配偶者給与を増やす比較と、同じ世帯給与を夫婦間で配分する比較は異なる。</p></div>
    <div className="appendix-controls">
      <label>家族構成<select value={familyId} onChange={(e) => setFamilyId(e.target.value)}>{data.family_profiles.map((item) => <option key={item.id} value={item.id}>{item.label || item.id}</option>)}</select></label>
      <label>配偶者給与（万円／年）<select value={spouse} onChange={(e) => setSpouse(Number(e.target.value))}>{[0, 200, 400].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      <label>児童1人の上限適用前負担相当額（円／月）<select value={use} onChange={(e) => setUse(Number(e.target.value))}>{[4600, 10406, 37200].map((value) => <option key={value} value={value}>{value.toLocaleString("ja-JP")}</option>)}</select></label>
    </div>
    <p>{profile?.description || "各児童の受給資格の組合せは条件JSONに記載する。"}</p>
    <p>A＝特児2級、B＝特児1級、C＝特児1級及び障害児福祉手当の要件を満たすと仮定した組合せ。医学的重症度を三階層に区分したものではない。</p>
    <p>通所利用の3条件は構造比較のために置いた仮定であり、実測された上限適用前費用の平均・中央値・分位点ではない。</p>
    {condition?.calculation_status === "computed" ? <>
      {seriesError ? <p role="alert">計算系列を読み込めませんでした。欠損値や、現行制度と参考例の対応を確認してください。</p> : series?.conditionId === condition.id ? <><ScenarioChart points={series.points} adjustment={series.adjustment} />{series.adjustment ? <AdjustmentImpact model={series.adjustment} /> : <p>この条件の参考調整例は未計算のため、現行制度のみを表示する。</p>}</> : <p role="status">計算系列を読み込んでいます。</p>}
      <div className="appendix-table-wrap"><table className="appendix-table"><caption>所得逆転と回復に必要な増収額</caption><thead><tr><th>給与（万円）</th><th>作用した制度</th><th>下落幅（万円）</th><th>回復点（万円）</th><th>回復に必要な増収額（万円）</th></tr></thead><tbody>{(condition.result?.reversals || []).map((row, i) => <tr key={i}><td>{row.salary_wan ?? row.x}</td><td>{row.programs?.join("・") || row.cause || "条件JSONを参照"}</td><td>{Number(row.drop_wan ?? row.drop).toFixed(2)}</td><td>{row.recovery_salary_wan ?? row.recovery_x ?? "範囲内未回復"}</td><td>{row.recovery_increase_wan ?? row.recovery_width ?? "―"}</td></tr>)}</tbody></table></div>
    </> : <div className="municipal-method" role="status"><h3>この条件の結果は未確定</h3><p>需要額の必須入力が未確定の場合、便宜的な0円で結果を作らず、計算を保留する。</p><ul>{(condition?.blocking_issues || []).map((issue, i) => <li key={i}>{describeBlockingIssue(issue)}</li>)}</ul></div>}
    <details><summary>条件の根拠と仮定</summary><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify({ scope: data.scope, factors: data.factors, household: condition?.household }, null, 2)}</pre></details>
  </section>;
}
