import "./income-difference.css";
import allRanges from "../data/disabilityDifferenceRange.json";

const integer = n => n.toLocaleString("ja-JP");
const signed = n => (n > 0 ? "＋" : n < 0 ? "−" : "") + integer(Math.abs(n)) + "円";
const amount = n => integer(n) + "円";

/** 選択した世帯の面とは別に、Gで選択できる全設定を通じた年額の範囲を示す。 */
export function DifferenceAllCases(){
  return <details className="income-difference-all">
    <summary>全設定での最低差・最高差</summary>
    <table><caption>子どもの人数別にみた年間可処分所得差（設定世帯 − 障害のない対照世帯）</caption>
      <thead><tr><th scope="col">子どもの人数</th><th scope="col">最低差</th><th scope="col">最高差</th></tr></thead>
      <tbody>{allRanges.map(r=><tr key={r.children}><th scope="row">{r.children}人</th><td>{signed(r.minimumYen)}</td><td>{signed(r.maximumYen)}</td></tr>)}</tbody></table>
    <p>年間のサービス自己負担が、増える手当と軽くなる税額の合計を上回ると、差は負になります。最低差は、手当・税額の差がなく、月37,200円の世帯負担が12か月続く場合です。</p>
    <p>子ども3人の最高差の一例は、世帯主944万円・配偶者100万円、子ども7・10・12歳です。3人とも特児1級・児福該当・税法上の同居特別障害者とし、通所負担はなく、配偶者控除は申告しない設定です。給与の高い世帯主が特児の受給資格者となり、3人を税扶養に取ります。手当の増額2,700,360円と税負担の軽減598,700円の合計が差額です。</p>
    <p>給与は夫婦それぞれ0～1,500万円の1万円刻み（ともに0円を除く）。同じ計算になる設定をまとめ、最低差と最高差が実際に生じることを元のシミュレーターで照合しました。各金額はこのモデルで到達できる値で、世帯の実態分布ではありません。</p>
    <a href="https://github.com/Design-for-Changes/dw-appendix/blob/main/scripts/audit-difference-global-minimum.mjs">最低差の検算</a> ／ <a href="https://github.com/Design-for-Changes/dw-appendix/blob/main/scripts/audit-difference-global-maximum.mjs">最高差の検算</a>
  </details>;
}

/** 符号は全て「設定世帯の可処分所得を増やす方向」を正とする。金額は万円表示から戻さず円で読む。 */
export function IncomeDifferencePoint({point}) {
  if (point.status !== "calculated") return <p>{point.status === "excluded" ? "この給与点は試算対象外です。" : "この給与点の差額は未算定です。"}</p>;
  return <div className="income-difference-point" aria-live="polite">
    <dl className="income-difference-totals">
      <div><dt>設定した世帯</dt><dd>{amount(point.withYen)}</dd></div>
      <div><dt>同じ子どもに障害がない世帯</dt><dd>{amount(point.withoutYen)}</dd></div>
      <div className="income-difference-net"><dt>可処分所得差（年額）</dt><dd>{signed(point.differenceYen)}</dd></div>
    </dl>
    <details><summary>差額の内訳</summary><dl className="income-difference-breakdown">
      <div><dt>現金給付の増減</dt><dd>{signed(point.extraBenefitsYen)}</dd></div>
      <div><dt>税負担の軽減</dt><dd>{signed(point.taxSavingYen)}</dd></div>
      <div><dt>社会保険料の軽減</dt><dd>{signed(point.insuranceSavingYen)}</dd></div>
      <div><dt>サービス自己負担の増加による差</dt><dd>{signed(-point.extraServiceYen)}</dd></div>
    </dl></details>
  </div>;
}

export function DifferenceExtrema({surface, onSelectSalary, fixedTotal}) {
  const {minimum,maximum,negativeCount,validCount} = surface;
  if (!minimum || !maximum) return null;
  const flat=minimum.differenceYen===maximum.differenceYen;
  return <section className="income-difference-extrema" aria-label="差額の最低点と最高点">
    <p>{flat ? "全給与点で可処分所得差は"+signed(minimum.differenceYen)+"（最低＝最高）です。"
      : negativeCount ? "設定した世帯の可処分所得が下回るのは、全"+integer(validCount)+"給与点のうち"+integer(negativeCount)+"点です。"
      : "設定した給与範囲に、障害がない世帯の可処分所得を下回る点はありません。"}</p>
    {!flat && <div className="income-difference-range">{[["最低点",minimum],["最高点",maximum]].map(([label,v])=>{
      const locked=fixedTotal!=null && v.headWan+v.spouseWan!==fixedTotal;
      return <div key={label}><span>{label}</span> <strong>{signed(v.differenceYen)}／年</strong>
        <p>世帯主 {integer(v.headWan)}万円・配偶者 {integer(v.spouseWan)}万円
          {v.count>1 ? "（同額 "+integer(v.count)+"点の一例）" : ""}</p>
        <button type="button" disabled={locked} title={locked?"点Pの世帯給与総額の固定を解除すると選択できます。":undefined}
          onClick={()=>onSelectSalary(v.headWan,v.spouseWan)}>{label}を点Pに表示</button>
      </div>;})}</div>}
  </section>;
}
