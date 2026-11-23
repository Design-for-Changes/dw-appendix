import { TraceTable } from "./TraceTable";
import { serviceChargeName } from "../data/paperBenefitTerms";
import TraceInsurance from "./TraceInsurance";
import TraceParentTaxes from "./TraceParentTaxes";
import TraceAllowances, { TraceServiceBurden } from "./TraceAllowanceService";

const n=value=>value.toLocaleString("ja-JP");
const yen=value=>n(value)+"円";
const add=(...values)=>values.map(n).join(" ＋ ");

/** 選択中の点だけを表示する。金額を再推計せず、同じ evaluate の整数円を小計・総計に渡す。 */
export default function HouseholdCalculationTrace({point, inputs}) {
  if (point?.status !== "calculated") return null;
  const {insurance:i,headTax:h,spouseTax:s,benefits:b,service:u}=point.details;
  const salary=Math.round(point.breakdown.salaryWan*10000), tax=Math.round(point.breakdown.taxWan*10000);
  const net=Math.round(point.studyDisposableWan*10000);
  const chargeName=serviceChargeName(u.otherServiceMonthlyYen);
  const rows=[
    ["世帯の可処分所得（試算対象分）", "世帯の給与総額 − 税額 − 社会保険料 ＋ 現金給付 − "+chargeName,
      n(salary)+" − "+n(tax)+" − "+n(i.totalYen)+" ＋ ("+add(b.tcca,b.welfare,b.childAllowance)+") − "+n(u.annual), yen(net)],
    ["世帯の給与総額", "世帯主の年間給与 ＋ 配偶者の年間給与", add(i.head.annualPayYen,i.spouse.annualPayYen), yen(salary)],
    ["社会保険料", "世帯主の本人負担 ＋ 配偶者の本人負担", add(i.head.annual.totalYen,i.spouse.annual.totalYen), yen(i.totalYen)],
    ["税額", "世帯主の所得税等・住民税等 ＋ 配偶者の所得税等・住民税等", "("+add(h.incomeTaxYen,h.residentTaxYen)+") ＋ ("+add(s.incomeTaxYen,s.residentTaxYen)+")", yen(tax)],
    ["現金給付", "特児 ＋ 児福 ＋ 児童手当", add(b.tcca,b.welfare,b.childAllowance), yen(b.tcca+b.welfare+b.childAllowance)],
    [chargeName, "世帯上限適用後の月額 × 12", n(u.monthly)+" × 12", yen(u.annual)],
  ];
  return <section className="revision-calculation-trace" aria-label="計算式と内訳">
    <TraceTable caption="世帯の可処分所得（円／年）" rows={rows}/>
    <section aria-label="夫婦それぞれの社会保険料（船橋市在住、船橋市勤務想定）"><h4>夫婦それぞれの社会保険料（船橋市在住、船橋市勤務想定）</h4>
      <TraceInsurance point={point}/>
    </section>
    <section aria-label="夫婦それぞれの給与所得・控除・税額"><h4>夫婦それぞれの給与所得・控除・税額</h4>
      <TraceParentTaxes point={point} inputs={inputs}/>
    </section>
    <section aria-label="各手当の所得判定・支給額"><h4>各手当の所得判定・支給額</h4>
      <TraceAllowances point={point} inputs={inputs}/>
    </section>
    <section aria-label={chargeName}>
      <TraceServiceBurden point={point} inputs={inputs}/>
    </section>
  </section>;
}
