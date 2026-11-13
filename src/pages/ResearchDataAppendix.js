import { useEffect, useMemo, useState } from "react";

const TABLE_TITLE = "表A2　e-Gov法令検索による抽出結果と採否";

function reviewCategory(law) {
  if (law.screening?.review_status !== "verified") return "pending";
  if (["candidate", "included"].includes(law.screening.status)) return "candidate";
  if (law.screening.status === "excluded") return "excluded";
  return "pending";
}

function ScreeningStatus({ law }) {
  const category = reviewCategory(law);

  return (
    <>
      <span className={`research-status ${category}`}>
        {category === "candidate" ? "採用候補" : category === "excluded" ? "除外" : "原典確認中"}
      </span>
      {category !== "pending" && <small className="research-review-note">原典確認済み</small>}
      {category === "candidate" && law.screening?.scope_review_required &&
        <small className="research-review-note">適用条件の確認が必要</small>}
    </>
  );
}

function ScreeningReason({ law }) {
  const reason = law.screening?.reason;
  return (
    <>
      <p>{reason || "法令ごとの理由は未記載です。"}</p>
      {reviewCategory(law) === "pending" && <small className="research-review-note">原典との照合が完了していません。</small>}
    </>
  );
}

function ScreeningEvidence({ law }) {
  const evidence = law.screening?.evidence || [];
  return (
    <>
      {reviewCategory(law) === "pending" && <p>確認根拠を原典と照合中です。</p>}
      {evidence.length > 0 && <details className="research-evidence-details">
        <summary>根拠条文・原文（{evidence.length}件）</summary>
        {evidence.map((item, index) => (
          <div className="research-evidence" key={`${item.article || "evidence"}-${index}`}>
            {item.article && <p>{item.article}</p>}
            {item.text && <p>{item.text}</p>}
            {item.source_url && <a href={item.source_url} target="_blank" rel="noreferrer">{item.article ? `${item.article}の原文` : "確認根拠の原文"}</a>}
          </div>
        ))}
      </details>}
      {evidence.length === 0 && reviewCategory(law) !== "pending" && <p>条文・確認根拠の記載はありません。</p>}
      {law.source_url && <p><a href={law.source_url} target="_blank" rel="noreferrer">法令原文（e-Gov）</a></p>}
    </>
  );
}

function LawScreeningTable({ data, dataUrl }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const normalizedQuery = query.trim().toLocaleLowerCase("ja-JP");
  const laws = useMemo(() => data.laws || [], [data.laws]);

  const statistics = useMemo(() => laws.reduce((counts, law) => {
    const category = reviewCategory(law);
    counts[category] += 1;
    if (category === "candidate" && law.screening?.scope_review_required) counts.scopeReview += 1;
    if (law.current_status?.is_current === true) counts.current += 1;
    if (law.current_status?.is_current === false) counts.noncurrent += 1;
    return counts;
  }, { candidate: 0, excluded: 0, pending: 0, scopeReview: 0, current: 0, noncurrent: 0 }), [laws]);
  const hasCompleteCurrentStatus = statistics.current + statistics.noncurrent === laws.length;
  const currentCount = hasCompleteCurrentStatus ? statistics.current : data.counts?.current_laws;
  const noncurrentCount = hasCompleteCurrentStatus ? statistics.noncurrent : data.counts?.noncurrent_laws;

  const rows = useMemo(() => laws.filter((law) => {
    if (filter === "scope-review") {
      if (reviewCategory(law) !== "candidate" || !law.screening?.scope_review_required) return false;
    } else if (filter !== "all" && reviewCategory(law) !== filter) return false;
    const haystack = [
      law.law_id,
      law.law_num,
      law.law_title,
      ...(law.matched_keywords || []),
      law.screening?.id,
      law.screening?.effect,
      law.screening?.summary,
      law.screening?.reason,
      ...(law.screening?.evidence || []).flatMap((item) => [item.article, item.text]),
    ].filter(Boolean).join("\n").toLocaleLowerCase("ja-JP");
    return haystack.includes(normalizedQuery);
  }), [laws, filter, normalizedQuery]);

  return (
    <section id="law-screening" className="appendix-panel research-section" aria-labelledby="law-screening-title">
      <div className="appendix-section-head">
        <div>
          <p className="appendix-kicker">法令抽出の記録</p>
          <h2 id="law-screening-title">e-Gov法令検索による抽出結果と採否</h2>
          <p>抽出した法律を法令ID単位で示し、検索語、法令ごとの採否理由及び確認根拠を追跡できるようにする。</p>
        </div>
        <a className="research-download" href={dataUrl} download>法令抽出・採否JSONをダウンロード</a>
      </div>
      <div className="municipal-method">
        <p>基準日：{data.research_as_of || "未記載"}。取得元：{data.source?.name || "e-Gov法令検索"}。</p>
        {data.method?.keywords && <p>検索語：{data.method.keywords.join("、")}。</p>}
        {data.method?.combination && <p>集計方法：{data.method.combination}。</p>}
        {data.method?.inclusion_criterion && <p>候補抽出基準：{data.method.inclusion_criterion}</p>}
        {data.method?.exclusion_criterion && <p>除外基準：{data.method.exclusion_criterion}</p>}
        {data.method?.review_status_note && <p>{data.method.review_status_note}</p>}
      </div>
      <dl className="law-screening-counts">
        <div><dt>抽出法令数</dt><dd aria-label="抽出法令数">{data.counts?.total_laws ?? laws.length}件</dd></div>
        <div><dt>現行法令数</dt><dd aria-label="現行法令数">{currentCount == null ? "未確認" : `${currentCount}件`}</dd></div>
        <div><dt>採用候補</dt><dd aria-label="採用候補">{statistics.candidate}件</dd></div>
        <div><dt>除外</dt><dd aria-label="除外">{statistics.excluded}件</dd></div>
        <div><dt>候補のうち適用条件要確認</dt><dd aria-label="候補のうち適用条件要確認">{statistics.scopeReview}件</dd></div>
        <div><dt>非現行法令数</dt><dd aria-label="非現行法令数">{noncurrentCount == null ? "未確認" : `${noncurrentCount}件`}</dd></div>
        <div><dt>原典確認中</dt><dd aria-label="原典確認中">{statistics.pending}件</dd></div>
      </dl>
      <p className="research-note">
        採用候補は、障害児世帯の給付・負担に作用する可能性のある法律を含み、モデル世帯への試算採用を意味しない。
        「適用条件の確認が必要」は、原典を確認したうえで対象年齢や研究範囲等の判断が必要な候補を示し、「原典確認中」とは区別する。
        除外件数には非現行の法律を含む。
      </p>
      <div className="research-controls">
        <label>
          <span>法令・採否根拠を検索</span>
          <input type="search" value={query} placeholder="法令ID・法令名・法令番号・検索語・採否理由・条文" onChange={(event) => setQuery(event.currentTarget.value)} />
        </label>
        <label>
          <span>採否の表示</span>
          <select value={filter} onChange={(event) => setFilter(event.currentTarget.value)}>
            <option value="all">全件</option>
            <option value="candidate">採用候補</option>
            <option value="excluded">除外のみ</option>
            <option value="pending">原典確認中</option>
            <option value="scope-review">適用条件要確認</option>
          </select>
        </label>
        <output aria-live="polite">{rows.length}件表示（全{laws.length}件）</output>
      </div>
      <div className="appendix-table-wrap research-law-table-wrap">
        <table className="appendix-table research-law-table">
          <caption>{TABLE_TITLE}</caption>
          <thead>
            <tr>
              <th scope="col">法令ID</th>
              <th scope="col">法令名</th>
              <th scope="col">検索語</th>
              <th scope="col">採否・確認状況</th>
              <th scope="col">法令ごとの採否理由</th>
              <th scope="col">確認根拠（条文・原文リンク）</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((law) => (
              <tr key={law.law_id}>
                <th scope="row" className="appendix-mono">{law.law_id}</th>
                <td data-label="法令名">
                  {law.law_title}
                  {law.law_num && <small className="research-law-number">{law.law_num}</small>}
                  {law.current_status?.is_current === false && <small className="research-review-note">非現行{law.current_status.repeal_date ? `（e-Gov API記録日：${law.current_status.repeal_date}）` : ""}</small>}
                </td>
                <td data-label="検索語">{(law.matched_keywords || []).join("、")}</td>
                <td data-label="採否・確認状況"><ScreeningStatus law={law} /></td>
                <td data-label="法令ごとの採否理由"><ScreeningReason law={law} /></td>
                <td data-label="確認根拠（条文・原文リンク）"><ScreeningEvidence law={law} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <p role="status">該当する法令はありません。</p>}
    </section>
  );
}

export default function ResearchDataAppendix() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const base = process.env.PUBLIC_URL || ".";
  const dataUrl = `${base}/data/research/egov-law-screening.json`;

  useEffect(() => {
    const controller = new AbortController();
    fetch(dataUrl, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`law screening: ${response.status}`);
        return response.json();
      })
      .then(setData)
      .catch((cause) => {
        if (cause.name !== "AbortError") setError(true);
      });
    return () => controller.abort();
  }, [dataUrl]);

  if (error) {
    return <section id="law-screening" className="appendix-panel" role="alert"><div className="appendix-empty">法令抽出資料を読み込めませんでした。ページを再読み込みしてください。</div></section>;
  }
  if (!data) {
    return <section id="law-screening" className="appendix-panel" role="status"><div className="appendix-empty">法令抽出資料を読み込んでいます。</div></section>;
  }
  return <LawScreeningTable data={data} dataUrl={dataUrl} />;
}
