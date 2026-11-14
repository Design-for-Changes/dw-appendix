import {useMemo,useState} from "react";
import functionCatalog from "../data/calculation-function-catalog.json";

const FLOW = [
  ["世帯と給与系列", "世帯条件を正規化し、世帯主給与を1万円刻みで変化させる。", ["buildHousehold", "computeSeries"]],
  ["給与所得・社会保険料", "給与所得控除、所得金額調整控除、年齢別の社会保険料を計算する。", ["calcOne", "calculateSocialInsuranceComponents"]],
  ["所得控除・税額", "本人・配偶者・扶養親族の控除から所得税・住民税を計算する。", ["calcDependentDeductionFromRows", "calcSpouseDeductionFromRows", "getIncomeTaxParts", "getResidentTaxParts"]],
  ["現金給付", "制度固有の判定所得・扶養人数から手当の支給可否と額を求める。児童手当等の処理は統合集計内にある。", ["calcTccaComputedLocal", "calcWelfareAdjustedIncomeDetail", "calcBasicDisabilityPensionYenFor", "computePoint"]],
  ["医療費助成", "所得割額と対象人数から、設定した医療費助成の対象・自己負担を求める。", ["calcM01Detail"]],
  ["就学奨励費", "世帯収入額と生活保護基準による需要額の比率から支弁区分を判定する。", ["calcN04Detail"]],
  ["可処分所得の集計", "税・社会保険料控除後の手取額に給付と費用負担を合成する。", ["computePoint"]],
  ["低下・回復の抽出", "表示用はdetectCliffsからexplainCliffCausesを呼び、原因とQ/R点を記録する。detectCliffCauseRowsは別の報告用処理である。", ["explainCliffCauses", "detectCliffs", "detectCliffCauseRows"]],
  ["探索的調整モデル", "需要Dに基づく支給G、支給後資源に基づく上限Uと精算後所得を計算する。", ["computeOptimalModel"]],
  ["表示データ生成", "計算内訳を必要項目に整理し、曲線と給与点別内訳を圧縮JSONに保存する。", ["compactBreakdown", "writeGzipJSON"]],
];

/** 計算値ではなく、実装の役割・関数・ソース行の対応を表示する。 */
export default function CalculationReferenceAppendix({catalog=functionCatalog}) {
  const [query,setQuery]=useState("");
  const [category,setCategory]=useState("");
  const categories=useMemo(()=>[...new Set(catalog.functions.map(f=>f.category))],[catalog]);
  const rows=useMemo(()=>{
    const search=query.trim().toLocaleLowerCase("ja-JP");
    return catalog.functions.filter(f=>(!category||f.category===category)&&[f.name,f.qualifiedName,f.file,f.description,f.signature,...f.params,f.returns].join(" ").toLocaleLowerCase("ja-JP").includes(search));
  },[catalog,query,category]);
  const jsonHref=useMemo(()=>"data:application/json;charset=utf-8,"+encodeURIComponent(JSON.stringify(catalog,null,2)),[catalog]);
  const linkFor=(name)=>catalog.functions.find(f=>f.name===name);

  return <section id="calculation-functions" className="appendix-panel function-reference" aria-labelledby="function-reference-title">
    <div className="appendix-section-head">
      <div>
        <p className="appendix-kicker">計算仕様と実装の対応</p>
        <h2 id="function-reference-title">表A3　計算処理・関数一覧</h2>
      </div>
      <a className="research-download" href={jsonHref} download="calculation-function-catalog.json">関数一覧JSON</a>
    </div>
    <details className="function-reference-details">
      <summary>計算の流れと関数一覧を開く（{catalog.functionCount}関数・{catalog.classCount}クラス）</summary>
      <p>{catalog.scope}</p>
      <p>{catalog.unitNote}</p>
      <p>表示用の低下点一覧は、ケースごとの抽出閾値を超える税制由来の低下も含む。論文で扱う制度による所得逆転の選別とは区別する。</p>
      <h3>計算処理との対応</h3>
      <div className="appendix-table-wrap">
        <table className="appendix-table function-flow-table">
          <caption>入力から計算・集計・表示用データ生成まで</caption>
          <thead><tr><th scope="col">処理</th><th scope="col">計算内容</th><th scope="col">主な関数（ソース）</th></tr></thead>
          <tbody>{FLOW.map(([name,description,names])=><tr key={name}>
            <th scope="row">{name}</th><td data-label="計算内容">{description}</td>
            <td data-label="主な関数（ソース）">{names.map(functionName=>{
              const entry=linkFor(functionName);
              return <span className="function-source-link" key={functionName}>{entry?<a href={entry.sourceUrl} target="_blank" rel="noreferrer"><code>{functionName}</code></a>:<code>{functionName}</code>}</span>;
            })}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <h3>名前付き関数・クラスの一覧</h3>
      <div className="research-controls">
        <label><span>関数名・計算内容で検索</span><input type="search" value={query} onChange={e=>setQuery(e.target.value)} /></label>
        <label><span>計算処理の区分</span><select value={category} onChange={e=>setCategory(e.target.value)}><option value="">すべての処理</option>{categories.map(name=><option key={name} value={name}>{name}</option>)}</select></label>
        <output aria-live="polite">{rows.length}件該当（全{catalog.functions.length}件）</output>
      </div>
      <div className="appendix-table-wrap">
        <table className="appendix-table function-catalog-table">
          <caption>ソースコードの注記と関数の対応</caption>
          <thead><tr><th scope="col">区分</th><th scope="col">関数・クラス名</th><th scope="col">計算・処理内容</th><th scope="col">入力</th><th scope="col">返却値</th><th scope="col">ソース</th></tr></thead>
          <tbody>{rows.map(f=><tr key={f.id}>
            <td data-label="区分">{f.category}<small>{f.role}</small></td>
            <th scope="row"><code>{f.qualifiedName}</code></th>
            <td data-label="計算・処理内容">{f.description}</td>
            <td data-label="入力">{f.params.length?f.params.map(p=><p key={p}>{p}</p>):<code>{f.signature}</code>}</td>
            <td data-label="返却値">{f.returns||"ソースのreturnを参照"}</td>
            <td data-label="ソース"><a href={f.sourceUrl} target="_blank" rel="noreferrer">{f.file}:{f.line}</a></td>
          </tr>)}</tbody>
        </table>
      </div>
      {rows.length===0&&<p role="status">該当する関数はありません。</p>}
      <p className="research-note">一覧はソースのJSDocから生成し、関数の所在・行番号・内容ハッシュを自動照合している。</p>
    </details>
  </section>;
}
