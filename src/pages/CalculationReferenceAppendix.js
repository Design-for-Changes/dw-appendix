import { useEffect, useMemo, useState } from "react";
import functionCatalog from "../data/calculation-function-catalog.json";

// 完全ID（ファイル＋階層名）で結ぶ。同名の補助関数を別ファイルの説明へ誤接続しない。
const FLOW = [
  { id: "household", name: "世帯と給与系列", description: "世帯条件を正規化し、世帯主給与を1万円刻みで変化させる。", functions: ["src/calc/household.js:buildHousehold", "src/calc/computePoint.js:computeSeries"] },
  { id: "payroll", name: "給与所得・社会保険料", description: "給与所得控除、所得金額調整控除、年齢別の社会保険料を計算する。", functions: ["src/calc/household.js:calcOne", "src/calc/socialInsurance.js:calculateSocialInsuranceComponents"] },
  { id: "tax", name: "所得控除・税額", description: "本人・配偶者・扶養親族の控除から所得税・住民税を計算する。", functions: ["src/calc/deductions.js:calcDependentDeductionFromRows", "src/calc/deductions.js:calcSpouseDeductionFromRows", "src/calc/taxes.js:getIncomeTaxParts", "src/calc/taxes.js:getResidentTaxParts"] },
  { id: "cash", name: "現金給付", description: "制度固有の判定所得・扶養人数から手当の支給可否と額を求める。児童手当等の処理は統合集計内にある。", functions: ["src/calc/allowances.js:calcTccaComputedLocal", "src/calc/computePoint.js:computePoint.calcWelfareAdjustedIncomeDetail", "src/calc/allowances.js:calcBasicDisabilityPensionYenFor", "src/calc/computePoint.js:computePoint"] },
  { id: "medical", name: "医療費助成", description: "所得割額と対象人数から、設定した医療費助成の対象・自己負担を求める。", functions: ["src/calc/medicalAid.js:calcM01Detail"] },
  { id: "education", name: "就学奨励費", description: "世帯収入額と生活保護基準による需要額の比率から支弁区分を判定する。新プロフィールの需要測定で必須入力が欠けた場合は計算を停止する。", functions: ["src/calc/educationAid.js:calcN04Detail", "src/calc/educationAid.js:validateN04EducationProfile"] },
  { id: "service", name: "通所利用料と世帯合算", description: "税徴収額とは別に判定用の所得割額を求める。児童別の上限適用前負担を合計してから世帯上限を適用する。", functions: ["src/calc/computePoint.js:computePoint.serviceTaxableFor", "src/calc/computePoint.js:computePoint"] },
  { id: "disposable", name: "可処分所得の集計", description: "税・社会保険料控除後の手取額に給付と費用負担を合成する。", functions: ["src/calc/computePoint.js:computePoint"] },
  { id: "cliffs", name: "低下・回復の抽出", description: "表示用はdetectCliffsからexplainCliffCausesを呼び、原因とQ/R点を記録する。detectCliffCauseRowsは別の報告用処理である。", functions: ["src/calc/cliffCauseAnalysis.js:explainCliffCauses", "scripts/generate-appendix-data.mjs:detectCliffs", "src/calc/cliffCauseAnalysis.js:detectCliffCauseRows"] },
  { id: "optimal", name: "探索的調整モデル", description: "旧係数モデルと新しい条件付き比較例を区別する。いずれも最適性・財政中立を推定するものではない。", functions: ["src/calc/optimalModel.js:computeOptimalModel", "src/calc/illustrativeAdjustment.js:computeIllustrativeAdjustment", "src/calc/illustrativeAdjustment.js:summarizeAdjustmentImpact"] },
  { id: "conditions", name: "拡張条件の生成と欠損確認", description: "家族31構成、配偶者給与3条件、利用額3条件を列挙する。N04必須入力の未確定を0円に置き換えず、結果未算出として保持する。", functions: ["scripts/generate-revision-scenarios.mjs:enumerateFamilyProfiles", "scripts/generate-revision-scenarios.mjs:generateRevisionScenarios"] },
  { id: "data", name: "表示データ生成", description: "計算内訳を必要項目に整理し、曲線と給与点別内訳を圧縮JSONに保存する。", functions: ["scripts/generate-appendix-data.mjs:compactBreakdown", "scripts/generate-appendix-data.mjs:writeGzipJSON"] },
];

const functionAnchor = (entry) => `calculation-function-${entry.id}`;
const flowAnchor = (flow) => `calculation-flow-${flow.id}`;
const anchorHref = (id) => `#${encodeURIComponent(id)}`;

/** 計算処理→関数の説明→ソース、および対応する処理への逆リンクを表示する。 */
export default function CalculationReferenceAppendix({ catalog = functionCatalog }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [pendingTarget, setPendingTarget] = useState(null);
  const entries = useMemo(() => new Map(catalog.functions.map((f) => [f.id, f])), [catalog]);
  const categories = useMemo(() => [...new Set(catalog.functions.map((f) => f.category))], [catalog]);
  const rows = useMemo(() => {
    const search = query.trim().toLocaleLowerCase("ja-JP");
    return catalog.functions.filter((f) => (!category || f.category === category) &&
      [f.name, f.qualifiedName, f.file, f.description, f.signature, ...f.params, f.returns]
        .join(" ").toLocaleLowerCase("ja-JP").includes(search));
  }, [catalog, query, category]);
  const jsonHref = useMemo(() => "data:application/json;charset=utf-8," + encodeURIComponent(JSON.stringify(catalog, null, 2)), [catalog]);

  // フィルターで隠れている宛先も、リンク移動・直接URLの両方から必ず表示する。
  const revealTarget = (id) => {
    setQuery("");
    setCategory("");
    setPendingTarget(id);
  };
  useEffect(() => {
    const followHash = () => {
      let id;
      try { id = decodeURIComponent(window.location.hash.slice(1)); } catch { return; }
      if (id.startsWith("calculation-function") || id.startsWith("calculation-flow")) {
        setQuery("");
        setCategory("");
        setPendingTarget(id);
      }
    };
    followHash();
    window.addEventListener("hashchange", followHash);
    return () => window.removeEventListener("hashchange", followHash);
  }, []);
  useEffect(() => {
    if (!pendingTarget) return;
    const target = document.getElementById(pendingTarget);
    if (target) {
      target.scrollIntoView?.({ block: "start" });
      target.focus({ preventScroll: true });
    }
    setPendingTarget(null);
  }, [pendingTarget, rows]);

  const internalLink = (id, label, key) => <a key={key || id} href={anchorHref(id)} onClick={() => revealTarget(id)}>{label}</a>;
  const parentEntry = (f) => {
    const index = f.qualifiedName.lastIndexOf(".");
    return index < 0 ? null : entries.get(`${f.file}:${f.qualifiedName.slice(0, index)}`);
  };

  return <section id="calculation-functions" className="appendix-panel function-reference" aria-labelledby="function-reference-title" tabIndex={-1}>
    <div className="appendix-section-head">
      <div>
        <p className="appendix-kicker">計算仕様と実装の対応</p>
        <h2 id="function-reference-title">表A3　計算処理・関数一覧</h2>
      </div>
      <a className="research-download" href={jsonHref} download="calculation-function-catalog.json">関数一覧JSON</a>
    </div>
    <p>対応表の関数名から、このページ内の説明へ移動できます。各関数の説明には、対応する処理への戻り先と、実装ソースへのリンクを付しています。</p>
    <nav className="function-reference-nav" aria-label="関数資料内の移動">
      {internalLink("calculation-flow", "計算処理との対応")}
      {internalLink("calculation-function-list", `関数・クラス一覧（${catalog.functionCount}関数・${catalog.classCount}クラス）`)}
    </nav>
    <p>{catalog.scope}</p>
    <p>{catalog.unitNote}</p>
    <p>表示用の低下点一覧は、ケースごとの抽出閾値を超える税制由来の低下も含む。論文で扱う制度による所得逆転の選別とは区別する。</p>
    <h3 id="calculation-flow" tabIndex={-1}>計算処理との対応</h3>
    <div className="appendix-table-wrap">
      <table className="appendix-table function-flow-table">
        <caption>入力から計算・集計・表示用データ生成まで</caption>
        <thead><tr><th scope="col">処理</th><th scope="col">計算内容</th><th scope="col">主な関数の説明</th></tr></thead>
        <tbody>{FLOW.map((flow) => <tr key={flow.id} id={flowAnchor(flow)} tabIndex={-1}>
          <th scope="row">{flow.name}</th><td data-label="計算内容">{flow.description}</td>
          <td data-label="主な関数の説明">{flow.functions.map((id) => {
            const entry = entries.get(id);
            return <span className="function-source-link" key={id}>{entry ? internalLink(functionAnchor(entry), <code>{entry.name}</code>) : <code>{id}</code>}</span>;
          })}</td>
        </tr>)}</tbody>
      </table>
    </div>
    <h3 id="calculation-function-list" tabIndex={-1}>名前付き関数・クラスの一覧</h3>
    <div className="research-controls">
      <label><span>関数名・計算内容で検索</span><input type="search" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
      <label><span>計算処理の区分</span><select value={category} onChange={(e) => setCategory(e.target.value)}><option value="">すべての処理</option>{categories.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
      <output aria-live="polite">{rows.length}件該当（全{catalog.functions.length}件）</output>
    </div>
    <div className="appendix-table-wrap">
      <table className="appendix-table function-catalog-table">
        <caption>ソースコードの注記と関数の対応</caption>
        <thead><tr><th scope="col">区分・対応する処理</th><th scope="col">関数・クラス名</th><th scope="col">計算・処理内容</th><th scope="col">入力</th><th scope="col">返却値</th><th scope="col">ソース</th></tr></thead>
        <tbody>{rows.map((f) => {
          const flows = FLOW.filter((flow) => flow.functions.includes(f.id));
          const parent = parentEntry(f);
          return <tr key={f.id} id={functionAnchor(f)} tabIndex={-1}>
            <td data-label="区分・対応する処理">{f.category}<small>{f.role}</small>
              <div className="function-backlinks">{flows.length ? flows.map((flow) => internalLink(flowAnchor(flow), `↩ ${flow.name}`)) : internalLink("calculation-flow", "↩ 計算処理との対応")}</div>
            </td>
            <th scope="row"><code>{f.qualifiedName}</code>{parent && <small>内包元：{internalLink(functionAnchor(parent), parent.qualifiedName)}</small>}</th>
            <td data-label="計算・処理内容">{f.description}</td>
            <td data-label="入力">{f.params.length ? f.params.map((p) => <p key={p}>{p}</p>) : <code>{f.signature}</code>}</td>
            <td data-label="返却値">{f.returns || "ソースのreturnを参照"}</td>
            <td data-label="ソース"><a href={f.sourceUrl} target="_blank" rel="noreferrer">{f.file}:{f.line}</a></td>
          </tr>;
        })}</tbody>
      </table>
    </div>
    {rows.length === 0 && <p role="status">該当する関数はありません。</p>}
    <p className="research-note">一覧はソースのJSDocから生成し、関数の所在・行番号・内容ハッシュを自動照合している。「内包元」はコード上の定義の階層を示し、実行時の呼出関係を示すものではない。</p>
  </section>;
}
