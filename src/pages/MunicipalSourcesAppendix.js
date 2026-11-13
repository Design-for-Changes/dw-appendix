import { useEffect, useMemo, useState } from "react";

export default function MunicipalSourcesAppendix() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState("");
  const base = process.env.PUBLIC_URL || ".";

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${base}/data/research/municipal-source-list.json`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`municipal sources: ${response.status}`);
        return response.json();
      })
      .then(setData)
      .catch((cause) => {
        if (cause.name !== "AbortError") setError(true);
      });
    return () => controller.abort();
  }, [base]);

  const rows = useMemo(() => {
    const search = query.trim().toLocaleLowerCase("ja-JP");
    return (data?.municipalities || []).filter((city) =>
      [city.name, city.prefecture, city.classification, ...(city.sources || []).map((source) => source.title)]
        .join(" ").toLocaleLowerCase("ja-JP").includes(search)
    );
  }, [data, query]);

  if (error) return <section className="appendix-panel" role="alert">参照資料を読み込めませんでした。ページを再読み込みしてください。</section>;
  if (!data) return <section className="appendix-panel" role="status">参照資料を読み込んでいます。</section>;

  return (
    <section className="appendix-panel municipal-sources" aria-labelledby="municipal-sources-title">
      <div className="appendix-section-head">
        <div>
          <p className="appendix-kicker">自治体制度の再調査</p>
          <h2 id="municipal-sources-title">調査対象市・参照資料</h2>
          <p>{data.scope.rule}を対象とする。各市の公式な障害福祉案内を、資料名・版とともに示す。</p>
        </div>
        <a className="research-download" href={`${base}/data/research/municipal-source-list.json`} download>市一覧・出典JSON</a>
      </div>
      <div className="municipal-method">
        <p><strong>対象：{data.municipalities.length}市。</strong>{data.scope.population_description}</p>
        <p>{data.observation_note}</p>
        <p>本ページは調査範囲と資料の所在を示すものであり、市別の実施状況の比較表や順位は掲載しない。資料の確認は、掲載されたすべての制度の実施・対象条件を確認したことを意味しない。</p>
        <ul>
          {data.scope.references.map((source) => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a></li>)}
        </ul>
      </div>
      <div className="research-controls">
        <label><span>市名・都道府県・資料名で検索</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <output aria-live="polite">{rows.length}市表示</output>
      </div>
      <div className="appendix-table-wrap">
        <table className="appendix-table municipal-source-table">
          <caption>自治体の公式案内資料（確認日：{data.checked_on}）</caption>
          <thead><tr><th scope="col">市</th><th scope="col">区分</th><th scope="col">資料・公式掲載ページ</th><th scope="col">版・資料の基準時点</th></tr></thead>
          <tbody>
            {rows.map((city) => <tr key={city.code}>
              <th scope="row">{city.name}<small>{city.prefecture}</small></th>
              <td data-label="区分">{city.classification}</td>
              <td data-label="参照資料">{city.sources.length ? city.sources.map((source) => <div key={source.url} className="municipal-source-item"><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a></div>) : "資料確認中"}</td>
              <td data-label="版・基準時点">{city.sources.length ? city.sources.map((source) => <div key={source.url} className="municipal-source-item">{source.edition || "版の表記は確認中"}</div>) : "未確認"}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <p role="status">該当する市はありません。</p>}
      <p className="research-note">URL先の案内は更新される場合がある。確認日と、資料自体の発行・基準時点を区別して記録している。</p>
    </section>
  );
}
