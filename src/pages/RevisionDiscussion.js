import { PAPER_EDUCATION_ASSESSMENT_BASIS, PAPER_EDUCATION_PUBLISHED_EXAMPLES } from "../calc/paperEducationAssessment";
import { funabashiMedicalBoundaryExample, funabashiMedicalSources } from "../calc/paperMedicalCoverage";

const number = n => n.toLocaleString("ja-JP");
const person = id => ({head:"世帯主",spouse:"配偶者",household:"世帯"}[id] ?? id.replace(/^child(\d+)$/, "子$1"));
const range = (a,b) => a===b ? number(a) : number(a)+"～"+number(b);

/** 給与ベースの判定変化と、給与換算できない制度指標の例を分ける。給付額や家計への差額は計算しない。 */
export default function RevisionDiscussion({boundaries}) {
  if (!boundaries) return null;
  const {axis,fixedWan,events,pointGaps,unknownRanges}=boundaries;
  const moving=axis==="head" ? "世帯主" : "配偶者", fixed=axis==="head" ? "配偶者" : "世帯主";
  const school=PAPER_EDUCATION_PUBLISHED_EXAMPLES;
  return <section aria-label="考察：制度の判定が変わる給与区間">
    <h5>考察：制度の判定が変わる給与区間</h5>
    <p>{fixed}の給与を年{number(fixedWan)}万円に固定し、{moving}の給与を1万円ずつ増やしたときの判定を比べました。前後の給与は観測点であり、円単位の境界額ではありません。判定が変わっても、世帯収支が減るとは限りません。</p>
    {events.length ? <div style={{overflowX:"auto"}}><table className="appendix-table">
      <caption>{moving}の給与と制度別の判定変化</caption>
      <thead><tr><th scope="col">年間給与：前→後（万円）</th><th scope="col">制度・判定対象</th><th scope="col">変化前</th><th scope="col">変化後</th></tr></thead>
      <tbody>{events.map(e=><tr key={[e.fromWan,e.atWan,e.system,e.subject].join(":")}>
        <td data-label="年間給与（万円）">{number(e.fromWan)} → {number(e.atWan)}</td><th scope="row">{e.system}　{e.label}</th>
        <td data-label="変化前">{e.before}{e.beforePerson && "（"+person(e.beforePerson)+"）"}</td><td data-label="変化後">{e.after}{e.afterPerson && "（"+person(e.afterPerson)+"）"}</td>
      </tr>)}</tbody>
    </table></div> : <p>判定の変化を確認できた区間はありません。未判定の区間まで「変化なし」とするものではありません。</p>}
    {(pointGaps.length>0 || unknownRanges.length>0) && <details><summary>比較できなかった給与区間</summary>
      <p>判定できない給与点の前後はつないでいません。「未判定」は、制度に該当しないという意味ではありません。</p>
      <ul>{pointGaps.map(g=><li key={"all:"+g.fromWan}>世帯全体の試算対象外・未算定：{range(g.fromWan,g.toWan)}万円</li>)}
        {unknownRanges.map(g=><li key={[g.system,g.subject,g.fromWan].join(":")}>{g.system}（{person(g.subject)}）の判定条件不足：{range(g.fromWan,g.toWan)}万円</li>)}</ul>
    </details>}
    <p>就学奨励費と医療費助成については、この世帯の給与いくらで区分が変わるかは未確定です。以下は、給与とは別の制度上の指標で見た判定例です。</p>
    <details><summary>就学奨励費：収入額と需要額による3例</summary>
      <p><a href={PAPER_EDUCATION_ASSESSMENT_BASIS.order}>施行令第2条</a>の通常判定では、制度所定の収入額が需要額の1.5倍未満なら第1区分、1.5倍以上2.5倍未満なら第2区分、2.5倍以上なら第3区分です。ここでいう収入額は給与の額面ではありません。</p>
      <p>{school.householdLabel} この1世帯の所得条件だけを変えた県の例です。{school.yearLabel}</p>
      <div style={{overflowX:"auto"}}><table className="appendix-table"><caption>{school.title}（月需要額{number(school.measuredMonthlyNeedYen)}円）</caption>
        <thead><tr><th scope="col">年間所得（円）</th><th scope="col">年間の所得控除（円）</th><th scope="col">制度所定の月収入額（円）</th><th scope="col">支弁区分</th></tr></thead>
        <tbody>{school.rows.map(r=><tr key={r.annualIncomeYen}><th scope="row">年間所得 {number(r.annualIncomeYen)}円</th><td data-label="年間所得控除（円）">{number(r.annualDeductionYen)}</td><td data-label="月収入額（円）">{number(r.measuredMonthlyIncomeYen)}</td><td data-label="支弁区分">{r.classification}</td></tr>)}</tbody>
      </table></div><p>出典：<a href={school.sourceUrl}>埼玉県教育委員会「支弁区分について」</a></p>
    </details>
    <details><summary>船橋市の医療費助成：所得割の基準をまたぐ2例</summary>
      <p>船橋市在住の10歳児で、障害要件を満たし、所得制限の特例はないと仮定します。課税世帯で、受診は保険診療の外来初回、ほかの優先公費はない場合です。</p>
      <div style={{overflowX:"auto"}}><table className="appendix-table"><caption>同一医療保険単位の所得割と2制度の適用</caption>
        <thead><tr><th scope="col">調整済み市町村民税所得割（円）</th><th scope="col">重度心身障害者医療費助成（M01）</th><th scope="col">子ども医療費助成</th></tr></thead>
        <tbody>{funabashiMedicalBoundaryExample().map(r=><tr key={r.adjustedInsuranceUnitLevyYen}><th scope="row">所得割 {number(r.adjustedInsuranceUnitLevyYen)}円</th><td data-label="障害者医療">{r.m01Status}</td><td data-label="子ども医療">{r.childStatus}（{r.childCopayClass}）</td></tr>)}</tbody>
      </table></div><p>この例では所得割が235,000円に達するとM01は対象外になりますが、子ども医療は引き続き対象です。助成は重複計上せず、実際の受診費用や世帯の自己負担額は推計しません。出典：船橋市「<a href={funabashiMedicalSources.m01}>重度心身障害者医療費助成</a>」「<a href={funabashiMedicalSources.child}>子ども医療費助成</a>」。</p>
    </details>
  </section>;
}
