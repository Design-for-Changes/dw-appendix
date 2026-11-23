import "./income-difference.css";
import {calculatePaperSalaryTaxInputs2029} from "../calc/paperSalaryTaxInputs2029";
import {UNKNOWN_PLANE_NET_YEN} from "../calc/salaryPlaneRecovery";

const integer = n => n.toLocaleString("ja-JP");
const signed = n => (n > 0 ? "＋" : n < 0 ? "−" : "") + integer(Math.abs(n)) + "円";
const known = n => Number.isSafeInteger(n) && n !== UNKNOWN_PLANE_NET_YEN;
const yen = n => known(n) ? integer(n)+"円" : "—";
// 全ケースに23歳未満の子がいるため、各親の給与所得は点Pと同じ調整控除の条件で求める。
const salaryIncome = wan => calculatePaperSalaryTaxInputs2029({annualSalaryYen:wan*10000,eligibleForIncomeAdjustment:true}).salaryIncomeYen;

export function DifferenceExtrema({surface,grid,shown,lookupPair}) {
  const {minimum,maximum,negativeCount,validCount,width} = surface;
  const extremes=!!(minimum&&maximum),flat=extremes&&minimum.differenceYen===maximum.differenceYen;
  const rows=[];
  if(shown) rows.push(["図上の点",shown]);
  if(extremes) rows.push(...(flat?[["最小＝最大",minimum]]:[["最小点",minimum],["最大点",maximum]]));
  if(!rows.length)return null;
  return <section className="income-difference-extrema" aria-label="給与点の比較">
    {extremes&&<p>{flat ? "全給与点で可処分所得差は"+signed(minimum.differenceYen)+"（最小＝最大）です。"
      : negativeCount ? "設定した世帯の可処分所得が下回るのは、全"+integer(validCount)+"給与点のうち"+integer(negativeCount)+"点です。"
      : "設定した給与範囲に、障害がない世帯の可処分所得を下回る点はありません。"}</p>}
    <div className="diff-point-table-wrap"><table className="diff-point-table">
      <caption>給与点別の年間収入・可処分所得</caption>
      <thead><tr><th scope="col">給与点</th><th scope="col">世帯主の<br/>年間給与</th><th scope="col">配偶者の<br/>年間給与</th>
        <th scope="col">世帯の<br/>給与総額</th><th scope="col">世帯所得<br/>（夫婦の給与所得の合計）</th>
        <th scope="col">設定した世帯の<br/>可処分所得</th><th scope="col">子に障害がない世帯の<br/>可処分所得</th><th scope="col">可処分所得差</th></tr></thead>
      <tbody>{rows.map(([label,p])=>{
        const {headWan,spouseWan}=p,i=spouseWan*width+headWan;
        // 両世帯の年額は同一給与点の整数円から読む。ヒートマップ描画用の色・高さから推定しない。
        const pair=!grid&&lookupPair?lookupPair(headWan,spouseWan):null;
        const difference=grid?grid.differenceYen[i]:pair?pair.differenceYen:p.differenceYen;
        const net=grid?grid.netYen[i]:pair?.withYen;
        const baseline=known(net)&&known(difference)?net-difference:null;
        return <tr key={label}><th scope="row">{label}{p.count>1&&<small>同額 {integer(p.count)}点の一例</small>}</th>
          <td>{integer(headWan)}万円</td><td>{integer(spouseWan)}万円</td><td>{integer(headWan+spouseWan)}万円</td>
          <td>{yen(salaryIncome(headWan)+salaryIncome(spouseWan))}</td><td>{yen(net)}</td><td>{yen(baseline)}</td>
          <td><strong>{known(difference)?signed(difference):"—"}</strong></td></tr>;
      })}</tbody></table></div>
  </section>;
}
