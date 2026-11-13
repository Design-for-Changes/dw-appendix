import { useEffect, useState } from "react";

export default function IncomeAssessmentAppendix() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const base = process.env.PUBLIC_URL || ".";
  const dataUrl = `${base}/data/research/income-assessment-rules.json`;

  useEffect(() => {
    const controller = new AbortController();
    fetch(dataUrl, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`income assessment: ${response.status}`);
        return response.json();
      })
      .then(setData)
      .catch((cause) => {
        if (cause.name !== "AbortError") setError(true);
      });
    return () => controller.abort();
  }, [dataUrl]);

  if (error) {
    return <section id="income-assessment" className="appendix-panel income-assessment" role="alert">所得判定の資料を読み込めませんでした。ページを再読み込みしてください。</section>;
  }
  if (!data) {
    return <section id="income-assessment" className="appendix-panel income-assessment" role="status">所得判定の資料を読み込んでいます。</section>;
  }

  return (
    <section id="income-assessment" className="appendix-panel income-assessment" aria-labelledby="income-assessment-title">
      <div className="appendix-section-head">
        <div>
          <p className="appendix-kicker">制度の判定方法</p>
          <h2 id="income-assessment-title">所得判定の対象・指標・変動方法</h2>
          <p>{data.scope.description}</p>
        </div>
        <a className="research-download" href={dataUrl} download>所得判定・変動方法JSON</a>
      </div>
      <div className="municipal-method">
        <p>自治体制度の例示：{data.scope.municipal_example}</p>
      </div>
      <div className="appendix-table-wrap">
        <table className="appendix-table income-assessment-table">
          <caption>{data.table_label}　{data.title}（最終確認日：{data.checked_on}）</caption>
          <thead>
            <tr>{data.columns.map((column) => <th key={column.key} scope="col">{column.label}</th>)}</tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr key={`${row.id}-${row.program}`}>
                {data.columns.map((column) => {
                  if (column.key === "id") return <th key={column.key} scope="row">{row.id}</th>;
                  if (column.key === "program") {
                    const [primarySource, ...additionalSources] = row.sources || [];
                    return (
                      <td key={column.key} data-label={column.label}>
                        {primarySource
                          ? <a href={primarySource.url} title={primarySource.title} target="_blank" rel="noreferrer">{row.program}</a>
                          : row.program}
                        {additionalSources.map((source) => (
                          <small key={source.url} className="income-assessment-sources">
                            <a href={source.url} target="_blank" rel="noreferrer">{source.title}</a>
                          </small>
                        ))}
                      </td>
                    );
                  }
                  return <td key={column.key} data-label={column.label}>{row[column.key]}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="income-assessment-notes">
        {data.notes.map((note) => <p key={note}>{note}</p>)}
      </div>
    </section>
  );
}
