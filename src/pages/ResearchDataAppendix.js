import { useEffect, useMemo, useState } from "react";

function useResearchData() {
  const [state, setState] = useState({ laws: null, municipal: null, error: null });

  useEffect(() => {
    let ignore = false;
    const base = process.env.PUBLIC_URL || ".";
    Promise.all([
      fetch(`${base}/data/research/egov-law-screening.json`).then((response) => {
        if (!response.ok) throw new Error(`law screening: ${response.status}`);
        return response.json();
      }),
      fetch(`${base}/data/research/municipal-program-types.json`).then((response) => {
        if (!response.ok) throw new Error(`municipal program types: ${response.status}`);
        return response.json();
      }),
    ])
      .then(([laws, municipal]) => {
        if (!ignore) setState({ laws, municipal, error: null });
      })
      .catch((error) => {
        if (!ignore) setState({ laws: null, municipal: null, error });
      });
    return () => {
      ignore = true;
    };
  }, []);

  return state;
}

function ScreeningStatus({ screening }) {
  const included = screening?.status === "included";
  return (
    <span className={`research-status ${included ? "included" : "excluded"}`}>
      {included ? "採用" : "除外"}
    </span>
  );
}

function DataDownload({ href, children }) {
  return (
    <a className="research-download" href={href} download>
      {children}
    </a>
  );
}

function LawScreeningTable({ data }) {
  const [query, setQuery] = useState("");
  const [includedOnly, setIncludedOnly] = useState(false);
  const normalizedQuery = query.trim().toLocaleLowerCase("ja-JP");
  const rows = useMemo(
    () =>
      (data?.laws || []).filter((law) => {
        if (includedOnly && law.screening?.status !== "included") return false;
        if (!normalizedQuery) return true;
        const haystack = [
          law.law_id,
          law.law_num,
          law.law_title,
          ...(law.matched_keywords || []),
          law.screening?.id,
          law.screening?.effect,
          law.screening?.summary,
        ]
          .filter(Boolean)
          .join("\n")
          .toLocaleLowerCase("ja-JP");
        return haystack.includes(normalizedQuery);
      }),
    [data, includedOnly, normalizedQuery]
  );

  const base = process.env.PUBLIC_URL || ".";
  return (
    <section className="appendix-panel research-section" aria-labelledby="research-table-1-title">
      <div className="appendix-section-head">
        <div>
          <p className="appendix-kicker">使用データ：法令抽出</p>
          <h2 id="research-table-1-title">表1　e-Gov法令検索による抽出母集団と採否（186件）</h2>
          <p>
            「障害者」「障害児」「特別支援学校」を含む現行法律を本則に限定して抽出し、法令ID単位で重複を除いた。
          </p>
        </div>
        <DataDownload href={`${base}/data/research/egov-law-screening.json`}>
          JSONをダウンロード
        </DataDownload>
      </div>
      <div className="research-controls">
        <label>
          <span>表内検索</span>
          <input
            type="search"
            value={query}
            placeholder="法令名・法令番号・検索語"
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
        </label>
        <label className="research-check">
          <input
            type="checkbox"
            checked={includedOnly}
            onChange={(event) => setIncludedOnly(event.currentTarget.checked)}
          />
          採用8件のみ表示
        </label>
        <output>{rows.length}件表示</output>
      </div>
      <div className="appendix-table-wrap research-law-table-wrap">
        <table className="appendix-table research-law-table">
          <thead>
            <tr>
              <th>No.</th>
              <th>法令ID</th>
              <th>法令名</th>
              <th>法令番号</th>
              <th>一致語</th>
              <th>採否</th>
              <th>採否理由</th>
              <th>原文</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((law) => (
              <tr key={law.law_id}>
                <td className="appendix-mono" data-label="No.">{data.laws.indexOf(law) + 1}</td>
                <td className="appendix-mono" data-label="法令ID">{law.law_id}</td>
                <td data-label="法令名">{law.law_title}</td>
                <td data-label="法令番号">{law.law_num}</td>
                <td data-label="一致語">{(law.matched_keywords || []).join("、")}</td>
                <td data-label="採否"><ScreeningStatus screening={law.screening} /></td>
                <td data-label="採否理由">{law.screening?.reason}</td>
                <td data-label="原文">
                  <a href={law.source_url} target="_blank" rel="noreferrer">e-Gov</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="research-note">
        基準日：{data.research_as_of}。取得元はe-Gov法令API Version 2。検索結果の全文一致から
        MainProvision（本則）の一致だけを再判定している。
      </p>
    </section>
  );
}

export default function ResearchDataAppendix() {
  const { laws, municipal, error } = useResearchData();
  if (error) {
    return (
      <section className="appendix-panel">
        <div className="appendix-empty">使用データを読み込めませんでした。</div>
      </section>
    );
  }
  if (!laws || !municipal) {
    return (
      <section className="appendix-panel">
        <div className="appendix-empty">使用データを読み込んでいます。</div>
      </section>
    );
  }

  const base = process.env.PUBLIC_URL || ".";
  return (
    <>
      <section className="appendix-panel research-overview">
        <div>
          <p className="appendix-kicker">再現可能性のための使用データ</p>
          <h2>法令・自治体制度の抽出データ</h2>
          <p>
            抽出母集団186件の全件と採否を表1に示す。採用8法と自治体制度19類型は
            本文の表1・表2に掲載し、公開用JSONも併せて提供する。
          </p>
          <div className="research-resource-links">
            <DataDownload href={`${base}/data/research/egov-law-screening.json`}>
              本文表1対応JSON
            </DataDownload>
            <DataDownload href={`${base}/data/research/municipal-program-types.json`}>
              本文表2対応JSON
            </DataDownload>
          </div>
        </div>
        <dl>
          <div><dt>法令母集団</dt><dd>{laws.counts.total_laws}件</dd></div>
          <div><dt>採用法律</dt><dd>{laws.counts.included_laws}件</dd></div>
          <div><dt>自治体制度</dt><dd>{municipal.counts.program_types}類型</dd></div>
        </dl>
      </section>
      <LawScreeningTable data={laws} />
    </>
  );
}
