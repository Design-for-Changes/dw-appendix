import { useEffect, useMemo, useState } from "react";
import functionCatalog from "../data/calculation-function-catalog.json";
import CalculationCallMap from "./CalculationCallMap";

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
  { id: "optimal", name: "参考：旧版の調整モデル", description: "提出稿の再現用。今回の現行制度のケース比較には使用しない。", functions: ["src/calc/optimalModel.js:computeOptimalModel", "src/calc/illustrativeAdjustment.js:computeIllustrativeAdjustment", "src/calc/illustrativeAdjustment.js:summarizeAdjustmentImpact"] },
  { id: "conditions", name: "拡張条件の生成と欠損確認", description: "家族31構成、配偶者給与3条件、利用額3条件を列挙する。N04必須入力の未確定を0円に置き換えず、結果未算出として保持する。", functions: ["scripts/generate-revision-scenarios.mjs:enumerateFamilyProfiles", "scripts/generate-revision-scenarios.mjs:generateRevisionScenarios"] },
  { id: "data", name: "表示データ生成", description: "計算内訳を必要項目に整理し、曲線と給与点別内訳を圧縮JSONに保存する。", functions: ["scripts/generate-appendix-data.mjs:compactBreakdown", "scripts/generate-appendix-data.mjs:writeGzipJSON"] },
];

const functionAnchor = (entry) => `calculation-function-${entry.id}`;
const flowAnchor = (flow) => `calculation-flow-${flow.id}`;
const anchorHref = (id) => `#${encodeURIComponent(id)}`;
// The revised two-income engine is distinct from the archived one-income series.
const currentFlow = [
  ["household","両親の給与（各万円／年）、児童別条件","範囲と組合せを検証し、給与点ごとの計算器を作る。","validateRevisionHousehold","createRevisionCalculator"],
  ["payroll","各人の給与 → 給与所得・保険料（円／年）","給与控除と所得金額調整控除を適用する。保険料は年収を12等分して親ごとの標準報酬等級と本人負担額を求める。","revisionSalaryRecord","src/calc/paperSalaryTaxInputs2029.js:calculatePaperSalaryTaxInputs2029","src/calc/householdInsurance2029.js:calculateHouseholdInsurance2029"],
  ["tax","各人の所得・扶養 → 税額と制度判定用所得割（円／年）","所得税、住民税、森林環境税を算定。前年所得による通所の判定額は給与から差し引く税額とは分ける。","revisionParentTax"],
  ["cash","各親の判定所得・扶養人数＋各児の障害要件 → 年間手当（円）","特児は受給資格者と配偶者等、児福は児童本人と生計維持者等の所得を個別に判定する。児童手当は年齢・出生順に応じて加える。","revisionCashBenefits","src/calc/specialChildAllowance.js:calculateSpecialChildAllowance","src/calc/disabledChildWelfareAllowance.js:calculateDisabledChildWelfareAllowance"],
  ["service","世帯の判定用所得割＋対象負担（円／月）→ 利用者負担（円／年）","本モデルの同一保護者に係る合算対象額に世帯の月額上限を適用し、12か月分を差し引く。","revisionServiceBurden"],
  ["disposable","夫婦の給与－税・保険料＋各手当－サービスの自己負担","上記で算定した項目のみを合算し、年額を万円で表示する。夫婦とも給与0円の点では値を返さない。","createRevisionCalculator.evaluate"],
  ["reverse","片方の給与を固定した断面 → 下落幅・回復点・回復幅","隣接する給与点で収支が下がった場合、その差と下落前の水準に初めて戻る給与点を求める。紙面の表5には、このうち福祉制度の給付減・負担増を伴う低下を掲載する。","evaluateRevisionSlice","classifyRevisionFalls"],
  ["level","選んだ下落直前の可処分所得 → 給与平面の同水準線","隣接する給与点のうち一方だけが基準額以上になる境界を両軸で結ぶ。未算定点はまたがない。","src/calc/salaryLevelContour.js:buildSalaryLevelContour"],
];
const discussionFlow = [
  ["隣接する給与点の判定区分 → 制度別・判定対象者別の変化点","収支が下がったか否かを問わず、判定区分が変わった点を抽出する。判定できない区間をまたいで変化を推定しない。","src/calc/paperChangePoints.js:scanPaperChangePoints"],
  ["就学奨励費（N04）：所定の月収入額・月需要額 → 支弁区分","特別支援学校小学部の通常判定に必要な測定値が揃う場合だけ区分を判定する。支給額を推定せず、主試算の収支に加えない。","src/calc/paperEducationAssessment.js:assessPaperEducationClass"],
  ["船橋市の医療費助成（M01）・子ども医療：各制度の要件 → 適用状況","同一医療保険単位の所得割・障害要件等によるM01の判定と、年齢や診療条件等による子ども医療の判定を分ける。窓口の実支払額は推定しない。","src/calc/paperMedicalCoverage.js:assessFunabashiMedicalCoverage"],
];

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

  return <section id="calculation-functions" className="appendix-panel function-reference" aria-label="表A3　計算処理・関数一覧" tabIndex={-1}>
    <div className="appendix-section-head">
      <a className="research-download" href={jsonHref} download="calculation-function-catalog.json">関数一覧JSON</a>
    </div>
    <nav className="function-reference-nav" aria-label="関数資料内の移動">
      {internalLink("calculation-flow-current", "新稿の計算式")}
      {internalLink("calculation-flow-discussion", "考察：制度の変化点")}
      {internalLink("calculation-flow-map", "呼出元・呼出先")}
      {internalLink("calculation-flow-example", "値を追う：通所支援")}
      {internalLink("calculation-flow", "計算処理との対応")}
      {internalLink("calculation-function-list", `関数・クラス一覧（${catalog.functionCount}関数・${catalog.classCount}クラス）`)}
    </nav>
    <h3 id="calculation-flow-current" tabIndex={-1}><a href="#revision-scenarios">Appendix Dの給与2軸シミュレーター</a>の計算式</h3>
    <div className="appendix-table-wrap"><table className="appendix-table"><caption>入力から年額への計算表（現行制度のみ）</caption>
    <thead><tr><th scope="col">入力 → 出力</th><th scope="col">計算内容</th><th scope="col">担当する関数</th></tr></thead>
    <tbody>{currentFlow.map(([id,values,rule,...functions])=><tr key={id}><th scope="row">{values}</th><td data-label="計算内容">{rule}</td><td data-label="関数">{functions.map(name=>{
      const target=name.includes(":")?name:"src/calc/revisionEngine.js:"+name;
      return <div key={target}>{internalLink("calculation-function-"+target,target.split(":")[1])}</div>;
    })}</td></tr>)}</tbody></table></div>
    <h3 id="calculation-flow-discussion" tabIndex={-1}>考察：給与の増加で、どの制度の判定が変わるか</h3>
    <div className="appendix-table-wrap"><table className="appendix-table"><caption>収支の下落幅とは別に調べる制度上の変化点</caption>
      <thead><tr><th scope="col">入力 → 出力</th><th scope="col">判定内容</th><th scope="col">担当する関数</th></tr></thead>
      <tbody>{discussionFlow.map(([values,rule,id])=><tr key={id}><th scope="row">{values}</th><td data-label="判定内容">{rule}</td><td data-label="関数">{internalLink("calculation-function-"+id,id.split(":")[1])}</td></tr>)}</tbody>
    </table></div>
    <CalculationCallMap catalog={catalog} entries={entries} detailLink={(f) => internalLink(functionAnchor(f), "関数の説明とソース")} />
    <h3 id="calculation-flow-example" tabIndex={-1}>値を追う：住民税から通所支援の年間負担まで</h3>
    <p>住民税額は利用料ではなく、世帯の月額上限を判定するために使う。</p>
    <ol className="ccm-steps" aria-label="通所支援の計算順">
      <li><b>各人の住民税</b>{internalLink("calculation-function-src/calc/taxes.js:getResidentTaxParts", "getResidentTaxParts")}<small>市町村民税所得割額を渡す（円／年）。</small></li>
      <li><b>制度判定用の所得割</b>{internalLink("calculation-function-src/calc/serviceBurdenLimits.js:calcServiceAssessmentLevyYen", "calcServiceAssessmentLevyYen")}<small>扶養する子の年齢を使って各親の額を調整する。世帯額は両親分の合計。</small></li>
      <li><b>世帯の月額上限</b>{internalLink("calculation-function-src/calc/serviceBurdenLimits.js:getChildDayServiceCapYen", "getChildDayServiceCapYen")}<small>判定用所得割と世帯の課税の有無から上限を返す（円／月）。</small></li>
      <li><b>自己負担と世帯収支</b>{internalLink("calculation-function-src/calc/revisionEngine.js:revisionServiceBurden", "revisionServiceBurden")}<small>世帯の対象負担と上限の小さい方を年換算し、収支から差し引く。</small></li>
    </ol>
    <div className="appendix-table-wrap"><table className="appendix-table"><caption>計算例：学齢児1人、上限適用前の負担12,000円／月、12か月利用</caption>
      <thead><tr><th scope="col">世帯の課税状況</th><th scope="col">月額上限</th><th scope="col">月額自己負担</th><th scope="col">年間負担</th></tr></thead>
      <tbody>{[["非課税","0円","0円","0円"],["課税・判定用所得割28万円未満","4,600円","4,600円","55,200円"],["課税・同28万円以上","37,200円","12,000円","144,000円"]].map(([a,b,c,d])=><tr key={a}><th scope="row">{a}</th><td data-label="上限">{b}</td><td data-label="月額">{c}</td><td data-label="年額">{d}</td></tr>)}</tbody></table></div>
    <h3 id="calculation-flow" tabIndex={-1}>既存系列・提出稿の計算処理との対応</h3>
    <p>旧版の一覧には、税制による収支の低下も含む。</p>
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
    <h3 id="calculation-function-list" tabIndex={-1}>表A3　計算処理・関数一覧</h3>
    <p>{catalog.scope}</p>
    <p>{catalog.unitNote}</p>
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
              <div className="function-backlinks">{discussionFlow.some(row=>row[2]===f.id) ? internalLink("calculation-flow-discussion","↩ 考察：制度の変化点") : f.file.includes("revisionEngine") || currentFlow.some(row=>row.slice(3).includes(f.id)) ? internalLink("calculation-flow-current","↩ 新稿の計算式") : flows.length ? flows.map((flow) => internalLink(flowAnchor(flow), `↩ ${flow.name}`)) : internalLink("calculation-flow", "↩ 計算処理との対応")}</div>
            </td>
            <th scope="row"><code>{f.qualifiedName}</code>{parent && <small>内包元：{internalLink(functionAnchor(parent), parent.qualifiedName)}</small>}</th>
            <td data-label="計算・処理内容">{f.description}</td>
            <td data-label="入力">{f.params.length ? f.params.map((p) => <p key={p}>{p}</p>) : <code>{f.signature}</code>}</td>
            <td data-label="返却値">{f.returns || "ソースのreturnを参照"}</td>
            <td data-label="ソース">{f.localSource && <details><summary>この版の実装を読む</summary><pre className="ccm-source">{f.localSource}</pre></details>}{f.sourceUrl ? <a href={f.sourceUrl} target="_blank" rel="noreferrer">{f.file}:{f.line}</a> : <small>{f.file}:{f.line}（ローカル版）</small>}</td>
          </tr>;
        })}</tbody>
      </table>
    </div>
    {rows.length === 0 && <p role="status">該当する関数はありません。</p>}
    <p className="research-note">「内包元」は関数を定義した場所を示し、実行時の呼出元とは異なる。</p>
  </section>;
}
