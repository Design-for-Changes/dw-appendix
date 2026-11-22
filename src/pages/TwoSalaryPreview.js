import { useState } from 'react';
import one from '../research-presets/case-one2025.json';
import two from '../research-presets/case-two2025.json';
import three from '../research-presets/case-three2025.json';
import premises from '../research-presets/conditional-premises2025.json';
import { evaluateSimulatorPreview2025 } from '../model-v4/simulatorPreview2025.mjs';
import './TwoSalaryPreview.css';
const presets={cases:{1:one,2:two,3:three},premises};
const labels={'confirmed-example':'確認済み架空例',conditional:'条件付き',calculated:'研究条件下で算定',pending:'未確認・未算定','out-of-scope':'対象外',invalid:'入力を確認'};
const money=v=>Number.isSafeInteger(v)?v.toLocaleString('ja-JP')+'円':'未算定';
const compute=spec=>{try{return evaluateSimulatorPreview2025(spec,presets);}catch(e){return{status:'pending',reason:'計算に必要な条件を確認できませんでした。0円で補いません。',components:[]};}};
export default function TwoSalaryPreview(){
 const [caseNumber,setCase]=useState(1),[axis,setAxis]=useState('b'),[salaryYen,setSalary]=useState('1200000'),[recognitionMode,setMode]=useState('confirmed-point'),[result,setResult]=useState(()=>compute({caseNumber:1,axis:'b',salaryYen:'1200000',recognitionMode:'confirmed-point'})),[dirty,setDirty]=useState(false),[count,setCount]=useState(1);
 const run=spec=>{setResult(compute(spec));setDirty(false);setCount(n=>n+1);};
 const spec={caseNumber,axis,salaryYen,recognitionMode};
 const change=(setter,value)=>{setter(value);setDirty(true);};
 const step=delta=>{if(!/^\d+$/.test(salaryYen))return;const next=String(Math.max(0,Number(salaryYen)+delta));setSalary(next);run({...spec,salaryYen:next});};
 return <main className="two-salary-preview">
  <header><p className="v4-kicker">Web Appendix</p><h1>二給与モデル・検証版</h1><p>夫婦別の給与から、新しい計算本体をその都度実行します。旧版の数値系列とは別です。</p></header>
  <section className="v4-scope" aria-label="計算の範囲"><strong>基準月固定の指標 Y*</strong><p>2025年給与・国税・暦年本人保険、2026年度住民税と森林税、2026年8月の国二手当・放デイを使用。月の条件を12倍する研究指標で、実際の年間現金収支ではありません。</p><p>両親45歳・週20時間の定常勤務。配偶者給与ゼロは無職・被扶養者と自動判定せず、この画面の対象外です。</p></section>
  <form onSubmit={e=>{e.preventDefault();run(spec);}} className="v4-form">
   <label>架空の例<select value={caseNumber} onChange={e=>change(setCase,Number(e.target.value))}><option value={1}>第1例：7歳1人・二手当の適合を別記録</option><option value={2}>第2例：7歳1人・国児福は非該当を別記録</option><option value={3}>第3例：7歳は児福適合・10歳は非該当</option></select></label>
   <label>給与を動かす人<select value={axis} onChange={e=>{setAxis(e.target.value);setSalary(e.target.value==='b'?'1200000':'3600000');setDirty(true);}}><option value="b">B（配偶者）給与／A360万円を固定</option><option value="a">A給与／B120万円を固定</option></select></label>
   <label>{axis==='b'?'B（配偶者）':'A'}の2025年給与収入（円）<input type="text" inputMode="numeric" pattern="[0-9]*" autoComplete="off" value={salaryYen} onChange={e=>change(setSalary,e.target.value)} aria-describedby="v4-range" /></label>
   <p id="v4-range">評価範囲：{axis==='b'?'B117〜840万円':'A117〜900万円'}、3万円刻み。117万円は就労条件の対象外です。範囲端や未算定を制度の崖と読み替えません。</p>
   <label>給付認定の扱い<select value={recognitionMode} onChange={e=>change(setMode,e.target.value)}><option value="confirmed-point">確認済み架空一点のみ（認定を延長しない）</option><option value="if-a">Aが認定された場合（条件付き）</option><option value="if-b">Bが認定された場合（条件付き）</option></select></label>
   <p>A/Bの認定は給与順位から選びません。条件付きでは税扶養A・子の保険扶養A・通所保護者Aをそれぞれ独立の仮定として固定します。</p>
   <div className="v4-buttons"><button type="submit">再計算</button><button type="button" onClick={()=>step(-30000)}>3万円減らして再計算</button><button type="button" onClick={()=>step(30000)}>3万円増やして再計算</button><button type="button" onClick={()=>{const g=axis==='b'?'1200000':'3600000';setSalary(g);setMode('confirmed-point');run({...spec,salaryYen:g,recognitionMode:'confirmed-point'});}}>確認済み一点へ戻す</button></div>
  </form>
  <section aria-label="再計算結果" aria-live="polite" aria-busy={dirty} className="v4-results">
   {dirty?<p role="status" className="v4-hold">入力が変わりました。「再計算」で結果を更新してください。前の値は非表示にしています。</p>:<>
    <p className={'v4-state v4-'+result.status} data-testid="model-state">{labels[result.status]}</p>
    <h2>Y*：<span data-testid="indicator">{money(result.indicatorYen)}</span></h2>
    <p>{result.reason}</p><p>計算済み給与：A {money(result.salaryByPerson?.['parent-a'])}／B {money(result.salaryByPerson?.['parent-b'])}</p>
    <p className="v4-count">再計算 #{count}。給付の認定・振込額はこの表示から確定しません。</p>
    {result.components?.length>0&&<div className="v4-table-wrap"><table><caption>同じ入力から計算した期間別の内訳</caption><thead><tr><th>成分</th><th>期間・単位</th><th>金額</th><th>状態</th></tr></thead><tbody>{result.components.map(c=><tr key={c.id}><th scope="row">{c.label}</th><td>{c.period}</td><td data-testid={'amount-'+c.id}>{money(c.amountYen)}</td><td>{labels[c.status]||'未確認'}<small>{c.reason||c.basis}</small></td></tr>)}</tbody></table></div>}
    {result.dayCap?.status==='known'&&<p>放デイ：判定用市民税所得割 {money(result.dayAssessment?.adjustedMunicipalLevyYen)}／月上限 {money(result.dayCap.capYen)}。上限と実負担は別です。二児の世帯上限は一度だけ使用します。</p>}
    {result.healthDependency&&<p className="v4-hold">子の健康保険扶養：{result.healthDependency.status==='confirmed-example'?'確認済み架空一点の記録':'実認定は未確認'}。{result.healthDependency.reason}</p>}
    <details><summary>固定した条件・未算定理由・原典</summary><p>{result.sourceEvidence?.conditions}</p><p>児の診断・等級・受給資格は独立した架空記録／条件。手帳級から自動認定しません。法6条の維持児加算や850万円超の未接続部分は保留します。</p><p>{result.branchReason}</p><ul><li><a href="https://www.city.funabashi.lg.jp/kodomo/hattatsu/002/p036766.html">船橋市の通所負担</a></li><li><a href="https://www.city.funabashi.lg.jp/kurashi/zei/007/003/p000869.html">船橋市の所得控除</a></li><li><a href="https://www.mhlw.go.jp/web/t_doc?dataId=82091000&amp;dataType=0">国二手当の施行令</a></li></ul></details>
   </>}
  </section>
  <footer className="v4-scope"><strong>主計算に入れていない項目</strong><p>医療自己負担・M01、N04の費用と補填、市独自手当、児童手当等の未採用費目、未選択の政策三候補。効果が0と確認した意味ではありません。</p><p>就労・保険資格の異動、実際の12か月収支、全域1万円格子は未実装です。</p></footer>
 </main>;
}
