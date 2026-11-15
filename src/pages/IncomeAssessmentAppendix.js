import { useEffect, useMemo, useState } from "react";

function isConfirmationData(value) {
  return value?.schema_version === "2.0.0" &&
    typeof value.title === "string" && typeof value.table_label === "string" &&
    typeof value.checked_on === "string" &&
    typeof value.scope?.description === "string" &&
    typeof value.scope?.municipal_example === "string" &&
    typeof value.scope?.coverage_note === "string" &&
    Array.isArray(value.scope?.national_law_ids) &&
    Array.isArray(value.scope?.municipal_categories) &&
    Array.isArray(value.notes) && value.notes.every((note) => typeof note === "string") &&
    Array.isArray(value.columns) && value.columns.length === 8 &&
    value.columns.every((column) => typeof column.key === "string" && typeof column.label === "string") &&
    Array.isArray(value.rows) && value.rows.every((row) =>
      typeof row.rule_id === "string" &&
      ["national", "funabashi"].includes(row.scope_group) &&
      ["yes", "no", "pending"].includes(row.income_status) &&
      ["confirmed", "unconfirmed"].includes(row.presence_status) &&
      value.columns.every((column) => typeof row[column.key] === "string") &&
      ["child_application", "coordination", "verification_note", "checked_on"].every((key) => typeof row[key] === "string") &&
      Array.isArray(row.sources) && row.sources.length > 0 &&
      row.sources.every((source) => typeof source.title === "string" && typeof source.url === "string")
    );
}

export default function IncomeAssessmentAppendix() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState("");
  const [scopeFilter, setScopeFilter] = useState("all");
  const [incomeFilter, setIncomeFilter] = useState("all");
  const base = process.env.PUBLIC_URL || ".";
  const dataUrl = `${base}/data/research/income-assessment-rules.json`;

  useEffect(() => {
    const controller = new AbortController();
    fetch(dataUrl, { signal: controller.signal, cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(`income assessment: ${response.status}`);
        return response.json();
      })
      .then((value) => {
        if (!isConfirmationData(value)) throw new Error("income assessment: invalid confirmation data");
        setData(value);
      })
      .catch((cause) => {
        if (cause.name !== "AbortError") setError(true);
      });
    return () => controller.abort();
  }, [dataUrl]);

  const rows = useMemo(() => {
    const normalized = query.normalize("NFKC").toLowerCase().trim();
    return (data?.rows || []).filter((row) =>
      (scopeFilter === "all" || row.scope_group === scopeFilter) &&
      (incomeFilter === "all" || row.income_status === incomeFilter) &&
      JSON.stringify(row).normalize("NFKC").toLowerCase().includes(normalized)
    );
  }, [data, query, scopeFilter, incomeFilter]);

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
          <h2 id="income-assessment-title">{data.title}</h2>
          <p>{data.scope.description}</p>
        </div>
        <a className="research-download" href={dataUrl} download>所得区分・判定方法JSON</a>
      </div>
      <div className="municipal-method">
        <p>自治体制度の確認サンプル：{data.scope.municipal_example}。国の{data.scope.national_law_ids.length}法律と、自治体{data.scope.municipal_categories.length}類型に対応する個別制度を整理する。</p>
        <p>{data.scope.coverage_note}</p>
      </div>
      <div className="research-controls">
        <label><span>制度名・所得指標・確認内容を検索</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <label><span>制度の範囲</span><select value={scopeFilter} onChange={(event) => setScopeFilter(event.target.value)}><option value="all">全件</option><option value="national">国制度</option><option value="funabashi">船橋市のサンプル確認</option></select></label>
        <label><span>所得による区分・制限</span><select value={incomeFilter} onChange={(event) => setIncomeFilter(event.target.value)}><option value="all">全件</option><option value="yes">あり</option><option value="no">なし</option><option value="pending">未確認</option></select></label>
        <output aria-live="polite">{rows.length}項目該当（全{data.rows.length}項目）</output>
      </div>
      <div className="appendix-table-wrap">
        <table className="appendix-table income-assessment-table">
          <caption>{data.table_label}　{data.title}（最終確認日：{data.checked_on}）</caption>
          <thead>
            <tr>{data.columns.map((column) => <th key={column.key} scope="col">{column.label}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.rule_id}>
                {data.columns.map((column) => {
                  if (column.key === "id") return <th key={column.key} scope="row">{row.id}</th>;
                  if (column.key === "program") {
                    const [primarySource, ...additionalSources] = row.sources || [];
                    return (
                      <td key={column.key} data-label={column.label}>
                        {primarySource && row.presence_status === "confirmed"
                          ? <a href={primarySource.url} title={primarySource.title} target="_blank" rel="noreferrer">{row.program}</a>
                          : row.program}
                        {row.presence_status === "unconfirmed" && <small className="income-assessment-sources">船橋市の個別制度・所得要件は未確認。不実施を意味しない。</small>}
                        <details>
                          <summary>児童への適用・調整関係・確認箇所</summary>
                          <p>児童への適用：{row.child_application}</p>
                          <p>併給・代替等：{row.coordination}</p>
                          <p>確認範囲：{row.verification_note}</p>
                          <p>最終確認日：{row.checked_on}</p>
                          {[primarySource, ...additionalSources].filter(Boolean).map((source) => (
                            <small key={`${source.url}-${source.section || ""}`} className="income-assessment-sources">
                              <a href={source.url} target="_blank" rel="noreferrer">{source.title}</a>
                              {source.section && <span>確認箇所：{source.section}</span>}
                            </small>
                          ))}
                        </details>
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
      {rows.length === 0 && <p role="status">条件に一致する制度はありません。</p>}
      <div className="income-assessment-notes">
        {data.notes.map((note) => <p key={note}>{note}</p>)}
      </div>
    </section>
  );
}
