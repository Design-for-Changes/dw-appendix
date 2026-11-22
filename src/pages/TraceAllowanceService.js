import { TraceTable } from "./TraceTable";

const n = value => value.toLocaleString("ja-JP");
const yen = value => n(value) + "円";
const sum = values => values.map(n).join(" ＋ ") || "0";
const who = id => ({head:"世帯主",spouse:"配偶者"}[id] || id.replace(/^child(\d+)$/, "子$1"));
const otherLimit = count => count === 0 ? "扶養0人：6,287,000" : "6,323,000 ＋ 213,000 × " + n(count);
const gradeAmount = {not:0, "1":58450, "2":38930};
const checkResult = stop => stop ? "該当（所得で停止）" : "非該当（所得で停止せず）";

// Use the income, limit, decision and payment returned for this point. Earning-age
// and disability counts below explain those values; they do not determine eligibility again.
function incomeRow(title, actual, tax, dependents) {
  if (!tax) return [title,"子の前年所得（無所得）","0",yen(actual)];
  const wage=tax.salaryTaxInputs.salaryIncomeBeforeAdjustmentYen;
  const ordinary=dependents.filter(c=>c.taxStatus==="ordinary").length, special=dependents.filter(c=>c.taxStatus==="special").length;
  return [title, "所得金額調整控除前の給与所得 − 給与所得からの控除（最大10万円）− 一律8万円 − 配偶者特別控除 − 障害者控除（27万・40万円／人）。下限0円",
    "max(0, "+n(wage)+" − "+n(Math.min(100000,wage))+" − 80,000 − "+n(tax.spouseDeduction.previous.specialLT)+" − 270,000 × "+ordinary+" − 400,000 × "+special+")", yen(actual)];
}

export default function TraceAllowances({point,inputs}) {
  if (point?.status!=="calculated" || point.protocol!=="paper-2029" || !inputs?.children) return null;
  const {benefits:b,roles,headTax,spouseTax}=point.details;
  const tcca=b.specialChildAllowance, children=inputs.children;
  const parents={head:headTax,spouse:spouseTax};
  const dependents=id=>children.filter((c,i)=>roles.taxDependentOf[i]===id);

  const t=[];
  for (const check of tcca.checks) {
    const name=who(check.id), tax=parents[check.id];
    const claimant=check.role==="claimant";
    const role={claimant:"受給資格者",spouse:"受給資格者の配偶者",obligor:"扶養義務者"}[check.role];
    t.push(incomeRow(name+"の判定所得",check.assessmentIncomeYen,tax,dependents(check.id)));
    t.push([name+"の限度額",claimant?"4,596,000 ＋ 380,000 ×（扶養親族等数 ＋ 税扶養外の生計維持児童数）＋ 250,000 × 対象となる16～18歳の扶養人数":"扶養0人は6,287,000、1人以上は6,323,000 ＋ 213,000 × 扶養人数",
      claimant?"4,596,000 ＋ 380,000 × ("+check.dependentCount+" ＋ "+b.additionalSupportedCount+") ＋ 250,000 × "+tax.olderDependentCount:otherLimit(check.dependentCount),yen(check.limitYen)]);
    t.push([name+"（"+role+"）の停止判定","判定所得 ≥ 限度額なら停止",n(check.assessmentIncomeYen)+" ≥ "+n(check.limitYen)+" か",checkResult(check.stopped)]);
  }
  const amounts=children.map(c=>gradeAmount[c.tccaGrade]);
  t.push(["所得判定前の月額","児童別の月額を合計（1級58,450円、2級38,930円、非該当0円）",children.map((c,i)=>"子"+(i+1)+"（"+(c.tccaGrade==="not"?"非該当":c.tccaGrade+"級")+"）"+n(amounts[i])).join(" ＋ "),yen(tcca.monthlyBeforeIncomeYen)]);
  t.push(["特別児童扶養手当の年額","所得停止なら0円、停止がなければ月額 × 12",n(tcca.monthlyYen)+" × 12"+(tcca.stoppedBy.length?"（停止："+tcca.stoppedBy.map(c=>who(c.id)).join("・")+"）":""),yen(tcca.annualYen)]);

  const welfare=[];
  function appendWelfareCheck(check) {
    const recipient=check.role==="recipient", person=who(check.id);
    const name=recipient?person+"（本人）":"扶養義務者（"+person+"）";
    const op=check.stopComparison===">"?">":"≥";
    welfare.push(incomeRow(name+"の判定所得",check.incomeYen,parents[check.id],dependents(check.id)));
    welfare.push([name+"の限度額",recipient?"本人：3,758,000 ＋ 380,000 × 扶養人数":"扶養0人は6,287,000、1人以上は6,323,000 ＋ 213,000 × 扶養人数",recipient?"3,758,000 ＋ 380,000 × "+check.dependentCount:otherLimit(check.dependentCount),yen(check.limitYen)]);
    welfare.push([name+"の停止判定","判定所得 "+op+" 限度額なら停止",
      n(check.incomeYen)+" "+op+" "+n(check.limitYen)+" か",checkResult(!check.passes)]);
  }
  // 全児童が同じ両親と同居するモデル。両親の限度額判定を各児について重複表示しない。
  for (const id of ["head","spouse"]) {
    const check=b.welfareChildren[0].checks.find(c=>c.role==="maintainer" && c.id===id);
    if (check) appendWelfareCheck(check);
  }
  b.welfareChildren.forEach((result,i)=>{
    const child="子"+(i+1);
    for (const check of result.checks) if (check.role==="recipient") appendWelfareCheck(check);
    welfare.push([child+"の年額","障害要件に該当し、所得停止がなければ月額16,560円 × 12",
      "障害要件："+(children[i].welfareEligible?"該当":"非該当")+"、所得停止："+(result.incomeEligible?"なし":"あり")+"；"+n(result.monthlyYen)+" × 12",yen(result.annualYen)]);
  });
  welfare.push(["障害児福祉手当の年額","児童別の年額合計",sum(b.welfareChildren.map(c=>c.annualYen)),yen(b.welfare)]);

  const ranked=children.map((c,i)=>({age:c.age,id:i+1})).sort((a,b)=>b.age-a.age);
  const monthly=ranked.map((c,i)=>i>=2?30000:c.age<3?15000:10000);
  const general=ranked.map((c,i)=>["子"+c.id+"の児童手当月額","第3子以降30,000円、それ以外は3歳未満15,000円・3歳以上10,000円",
    "第"+(i+1)+"子・"+c.age+"歳",yen(monthly[i])]);
  general.push(["児童手当の年額","児童別月額の合計 × 12","("+sum(monthly)+") × 12",yen(b.childAllowance)]);

  return <>
    <TraceTable caption="特別児童扶養手当" rows={t}/>
    <TraceTable caption="障害児福祉手当" rows={welfare}/>
    <TraceTable caption="児童手当" rows={general}/>
  </>;
}

/** 点Pのサービス負担を、所得割の計算と世帯の課税区分を区別して表示する。 */
export function TraceServiceBurden({point,inputs}) {
  if (point?.status!=="calculated" || point.protocol!=="paper-2029" || !inputs?.children) return null;
  const {service:s,roles,headTax,spouseTax}=point.details;
  const children=inputs.children, parents={head:headTax,spouse:spouseTax};
  const service=[];
  for (const [id,tax] of Object.entries(parents)) {
    const dep=children.filter((c,i)=>roles.taxDependentOf[i]===id), under=dep.filter(c=>c.age<16).length, older=dep.length-under;
    service.push([who(id)+"の判定用所得割","市町村民税所得割 − 19,800 × 16歳未満の扶養人数 − 7,200 × 16～18歳の扶養人数（下限0円）",
      "max(0, "+n(tax.residentTax.municipalIncomeLevyYen)+" − 19,800 × "+under+" − 7,200 × "+older+")",yen(tax.serviceLevyYen)]);
  }
  service.push(["世帯の判定用所得割","両親の判定用所得割の合計",sum([headTax.serviceLevyYen,spouseTax.serviceLevyYen]),yen(s.assessmentLevyYen)]);
  const taxable=headTax.serviceTaxable||spouseTax.serviceTaxable;
  const parentStatus=Object.entries(parents).map(([id,tax])=>who(id)+"："+(!tax.serviceTaxable?"非課税":
    tax.residentTax.perCapitaYen>0 && tax.residentTax.incomeLevyYen===0?"課税（均等割のみ）":"課税")).join("、");
  service.push(["世帯の月額上限","非課税世帯は0円。課税世帯は判定用所得割28万円未満なら4,600円、以上なら37,200円",
    parentStatus+" → "+(taxable?"課税世帯（判定用所得割"+yen(s.assessmentLevyYen)+(s.assessmentLevyYen<280000?" < ":" ≥ ")+"280,000円）":"非課税世帯"),yen(s.householdCapYen)]);
  const day=children.map((c,i)=>{
    const free=c.age>=3&&c.age<=5, value=c.serviceUser&&!free?(c.serviceAmountYen??inputs.serviceAmountYen):0;
    service.push(["子"+(i+1)+"の通所負担（月・上限前）","不利用または3～5歳の無償対象なら0円、それ以外は入力額",
      !c.serviceUser?"不利用":free?c.age+"歳・無償対象":"利用・"+n(c.serviceAmountYen??inputs.serviceAmountYen)+"円",yen(value)]);
    return value;
  });
  const before=s.dayMonthlyBeforeCapYen+s.otherServiceMonthlyYen;
  service.push(["合算対象の月額（上限前）",s.otherServiceMonthlyYen?"児童別の通所負担 ＋ 同じ保護者のその他合算対象負担":"児童別の通所負担の合計",
    sum([...day,s.otherServiceMonthlyYen].filter(v=>v!==0)),yen(before)]);
  service.push(["上限適用による軽減相当額（月）","max(0, 合算対象額 − 世帯上限)","max(0, "+n(before)+" − "+n(s.householdCapYen)+")",yen(before-s.monthly)]);
  service.push(["上限適用後の月額自己負担","min(合算対象額, 世帯上限)","min("+n(before)+", "+n(s.householdCapYen)+")",yen(s.monthly)]);
  service.push(["サービス利用者負担の年額","最終月額 × 12",n(s.monthly)+" × 12",yen(s.annual)]);

  return <TraceTable caption="サービス利用者負担" rows={service}/>;
}
