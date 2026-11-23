import { healthGradeBandYen } from "../calc/revisionPayroll";
import { TraceTable } from "./TraceTable";

const n = value => value.toLocaleString("ja-JP");
const yen = value => n(value)+"円";
const rate = bps => n(bps/100)+"％";

function parentRows(p, policy) {
  const a=p.annualPayYen, m=p.monthly;
  if (p.status === "dependent") return [
    ["加入判定", "本人給与が0円、他方が就労する場合は被扶養者とする", yen(a)+" ＝ 0円", "被扶養者・第3号"],
    ["本人保険料（年額）", "被扶養者の本人負担 × 12", "0 × 12", yen(p.annual.totalYen)],
  ];
  const band=healthGradeBandYen(p.healthGrade);
  const monthlyPay=n(a)+" ÷ 12";
  const inBand=n(band.lower)+" ≦ "+monthlyPay+(band.upper === null ? "" : " ＜ "+n(band.upper));
  return [
    ["加入判定", "本人給与が正で、賃金以外の加入要件を満たすと仮定", yen(a)+" ＞ 0円", "勤務先で加入"],
    ["健康保険の標準報酬月額", "年間給与 ÷ 12 を等級表に照合（丸め前）", inBand, "第"+p.healthGrade+"級・"+yen(p.healthStandardYen)],
    ["厚生年金の標準報酬月額", "健保標準報酬を厚年の下限・上限に収める", "min(750,000, max(88,000, "+n(p.healthStandardYen)+"))", "第"+p.pensionGrade+"級・"+yen(p.pensionStandardYen)],
    ["健保・介護・子ども子育て支援金（月額）", "端数処理［健保標準報酬 ×（健保率 ＋ 介護率 ＋ 支援金率）÷ 2］", n(p.healthStandardYen)+" ×（"+[policy.healthBps,policy.careBps,policy.childSupportBps].map(rate).join(" ＋ ")+"）÷ 2", yen(m.healthCareSupportYen)],
    ["厚生年金（月額）", "端数処理［厚年標準報酬 × 保険料率 ÷ 2］", n(p.pensionStandardYen)+" × "+rate(policy.pensionBps)+" ÷ 2", yen(m.pensionYen)],
    ["雇用保険（月額）", "端数処理［年間給与 ÷ 12 × 労働者負担率］", monthlyPay+" × "+rate(policy.employeeEmploymentBps), yen(m.employmentYen)],
    ["本人保険料（月額）", "健保等 ＋ 厚生年金 ＋ 雇用保険", [m.healthCareSupportYen,m.pensionYen,m.employmentYen].map(n).join(" ＋ "), yen(m.totalYen)],
    ["本人保険料（年額）", "月額本人負担 × 12", n(m.totalYen)+" × 12", yen(p.annual.totalYen)],
  ];
}

export default function TraceInsurance({point}) {
  const ins=point.details.insurance;
  return <>
    {[["head","世帯主"],["spouse","配偶者"]].map(([key,name])=><TraceTable key={key}
      caption={name+"の社会保険料（本人負担）"} rows={parentRows(ins[key],ins.policy)}/>)}
    <p><a href={ins.policy.sources.healthGradesAndProxyRates}>協会けんぽ千葉の等級・料率表</a> ／ <a href={ins.policy.sources.pensionAmounts}>厚生年金の等級上限</a></p></>;
}
