import { useMemo, useState } from "react";
import "./CalculationCallMap.css";
const NO_CALLS = [];

// 「内包元」と「呼出元」は別物。表示する線は構文解析で解決できた呼出箇所だけにする。
export default function CalculationCallMap({ catalog, entries, detailLink }) {
  const preferred = "src/calc/revisionEngine.js:createRevisionCalculator.evaluate";
  const [focusId, setFocusId] = useState(preferred);
  const focus = entries.get(focusId);
  const calls = catalog.calls || NO_CALLS;
  const neighbours = useMemo(() => {
    const incoming = new Map(), outgoing = new Map();
    const collect = (map, id, call) => map.set(id, [...(map.get(id) || []), call]);
    for (const edge of calls) {
      if (edge.to === focusId) collect(incoming, edge.from, edge);
      if (edge.from === focusId) collect(outgoing, edge.to, edge);
    }
    return [incoming, outgoing];
  }, [calls, focusId]);
  if (!focus) return null;
  function column(map, side) {
    return <section className="ccm-side"><h4>{side === 0 ? "呼出元" : "呼出先"}</h4>
      {map.size === 0 ? <p>集計対象内に直接呼出はありません。</p> :
        <ul>{Array.from(map, ([id, edges]) => <li key={id}>
          <button type="button" onClick={() => setFocusId(id)}>{entries.get(id)?.qualifiedName || id}</button>
          <details><summary>渡す値を見る（{edges.length}箇所）</summary>
            {edges.map((e) => <div className="ccm-args" key={e.line + ":" + e.column}>
              <code>{entries.get(e.to)?.name}({e.arguments.join(", ")})</code>
              {e.resultUse && <small>返り値：{e.resultUse}</small>}
              {e.sourceUrl ? <a href={e.sourceUrl} target="_blank" rel="noreferrer">呼出箇所：{e.line}行</a> : <small>呼出箇所：{e.line}行（ローカル版）</small>}
            </div>)}</details>
        </li>)}</ul>}
    </section>;
  }
  return <section className="ccm" aria-labelledby="calculation-flow-map">
    <h3 id="calculation-flow-map" tabIndex={-1}>関数の受け渡し図</h3>
    <p>中央の関数を選ぶと、呼び出す側と呼ばれる側をたどれます。矢印は直接呼び出す向きです。返り値は逆向きに戻ります。</p>
    <label>調べる関数 <select value={focusId} onChange={(e) => setFocusId(e.target.value)}>
      {catalog.functions.map((f) => <option key={f.id} value={f.id}>{f.qualifiedName} · {f.file}</option>)}
    </select></label>
    <div className="ccm-map">
      {column(neighbours[0], 0)}<span className="ccm-arrow" aria-hidden="true">→</span>
      <section className="ccm-node" aria-live="polite"><small>選択中の関数</small><h4><code>{focus.name}</code></h4>
        <p>{focus.description}</p><p><b>入力</b><br/><code>{focus.signature}</code></p>
        <p><b>返り値</b><br/>{focus.returns || "下の実装ソースを参照"}</p>
        {detailLink(focus)}</section>
      <span className="ccm-arrow" aria-hidden="true">→</span>{column(neighbours[1], 1)}
    </div>
    <small>対象は一覧内の名前付き関数です。動的な呼出し、匿名関数経由の間接呼出し、画面部品からの呼出しは線として推定しません。</small>
  </section>;
}
