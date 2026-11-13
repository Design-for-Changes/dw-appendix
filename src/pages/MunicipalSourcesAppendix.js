import { useEffect, useMemo, useState } from "react";

function separateSources(sources = []) {
  const guides = sources.filter((source) => source.kind === "guide");
  if (guides.length) return { guides, additional: sources.filter((source) => source.kind !== "guide") };
  return { guides: sources.slice(0, 1), additional: sources.slice(1) };
}

function SourceItem({ source }) {
  return (
    <div className="municipal-source-item">
      <a href={source.url} target="_blank" rel="noreferrer">{source.title}</a>
      <small className="municipal-source-meta">
        <span>版・資料の基準時点：{source.edition || "未記録"}</span><br />
        <span>最終確認日：{source.checked_on || "未記録"}</span>
      </small>
    </div>
  );
}

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
      [city.name, city.prefecture, city.classification, ...(city.sources || []).flatMap((source) => [source.title, source.url, source.edition, source.checked_on])]
        .filter(Boolean)
        .join(" ").toLocaleLowerCase("ja-JP").includes(search)
    );
  }, [data, query]);

  const sourceCounts = useMemo(() => {
    const sources = (data?.municipalities || []).flatMap((city) => city.sources || []);
    return { entries: sources.length, unique: new Set(sources.map((source) => source.url)).size };
  }, [data]);

  if (error) return <section className="appendix-panel" role="alert">参照資料を読み込めませんでした。ページを再読み込みしてください。</section>;
  if (!data) return <section className="appendix-panel" role="status">参照資料を読み込んでいます。</section>;

  return (
    <section id="municipal-sources" className="appendix-panel municipal-sources" aria-labelledby="municipal-sources-title">
      <div className="appendix-section-head">
        <div>
          <p className="appendix-kicker">自治体制度の調査</p>
          <h2 id="municipal-sources-title">調査対象市・参照資料</h2>
          <p>{data.scope.rule}を対象とする。基本資料と、制度の確認に使用した追加確認資料（PDF本体、個別制度の案内・要綱等）を示す。</p>
        </div>
        <a className="research-download" href={`${base}/data/research/municipal-source-list.json`} download>市一覧・出典JSON</a>
      </div>
      <div className="municipal-method">
        <p><strong>対象：{data.municipalities.length}市。</strong>資料：{sourceCounts.unique}件（市別掲載{sourceCounts.entries}件）。{data.scope.population_description}</p>
        <p>版・資料の基準時点と最終確認日は、記録された情報のみを示す。記録がない項目は「未記録」とする。</p>
        <ul>
          {data.scope.references.map((source) => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a></li>)}
        </ul>
      </div>
      <div className="research-controls">
        <label><span>市名・都道府県・資料名・版で検索</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <output aria-live="polite">{rows.length}市表示</output>
      </div>
      <div className="appendix-table-wrap">
        <table className="appendix-table municipal-source-table">
          <caption>基本資料と追加確認資料（一覧の基準日：{data.checked_on}）</caption>
          <thead><tr><th scope="col">市</th><th scope="col">区分</th><th scope="col">基本資料</th><th scope="col">追加確認資料</th></tr></thead>
          <tbody>
            {rows.map((city) => {
              const { guides, additional } = separateSources(city.sources);
              return <tr key={city.code}>
                <th scope="row">{city.name}<small>{city.prefecture}</small></th>
                <td data-label="区分">{city.classification}</td>
                <td data-label="基本資料">{guides.length ? guides.map((source) => <SourceItem key={source.url} source={source} />) : "資料確認中"}</td>
                <td data-label="追加確認資料">
                  {additional.length ? <details className="municipal-additional-sources" open={Boolean(query.trim())}>
                    <summary>追加確認資料（{additional.length}件）</summary>
                    {additional.map((source) => <SourceItem key={source.url} source={source} />)}
                  </details> : "追加資料の記録なし"}
                </td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <p role="status">該当する市はありません。</p>}
    </section>
  );
}
