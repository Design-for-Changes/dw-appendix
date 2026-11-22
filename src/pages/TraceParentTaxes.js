import { PAPER_SALARY_POLICY_2029 } from "../calc/paperSalaryTaxInputs2029";
import { CALCULATION_SOURCES } from "../calc/calculationSources";
import { REVISION_SPOUSE_DEDUCTION_TABLE } from "../calc/revisionEngine";
import { TraceTable } from "./TraceTable";

const n = value => value.toLocaleString("ja-JP", {maximumFractionDigits:3});
const yen = value => n(value) + "円";
const pair = (it, lt) => "所得税 " + yen(it) + "／住民税 " + yen(lt);

// 選択点に該当する別表第五の行を表示する。結果欄はここで再計算せず、計算器が返した値を使う。
function salaryBranch(s) {
  if (s < 691000) return ["給与 < 691,000：0", n(s) + " < 691,000"];
  if (s < 2026000) return ["691,000 ≤ 給与 < 2,026,000：給与 − 690,000", n(s) + " − 690,000"];
  if (s < 2028000) return ["2,026,000 ≤ 給与 < 2,028,000：表の定額", n(s) + " → 1,336,000"];
  if (s < 2032000) return ["2,028,000 ≤ 給与 < 2,032,000：表の定額", n(s) + " → 1,338,000"];
  if (s < 2036000) return ["2,032,000 ≤ 給与 < 2,036,000：表の定額", n(s) + " → 1,342,000"];
  if (s < 3600000) return ["2,036,000 ≤ 給与 < 3,600,000：⌊給与 ÷ 4,000⌋ × 2,800 − 80,000", "⌊" + n(s) + " ÷ 4,000⌋ × 2,800 − 80,000"];
  if (s < 6600000) return ["3,600,000 ≤ 給与 < 6,600,000：⌊給与 ÷ 4,000⌋ × 3,200 − 440,000", "⌊" + n(s) + " ÷ 4,000⌋ × 3,200 − 440,000"];
  if (s < 8500000) return ["6,600,000 ≤ 給与 < 8,500,000：⌊給与 × 90%⌋ − 1,100,000", "⌊" + n(s) + " × 90%⌋ − 1,100,000"];
  return ["8,500,000 ≤ 給与：給与 − 1,950,000", n(s) + " − 1,950,000"];
}

function spouseLookup(own, partner, claimed) {
  if (!claimed) return "この親を申告者に指定していない";
  if (own > 10000000) return "本人所得 " + n(own) + " > 10,000,000";
  if (partner > 1330000) return "配偶者所得 " + n(partner) + " > 1,330,000";
  const ownBand = own <= 9000000 ? "900万円以下" : own <= 9500000 ? "900万円超950万円以下" : "950万円超1,000万円以下";
  const cutoffs = [62, ...REVISION_SPOUSE_DEDUCTION_TABLE.map(([upper])=>upper)];
  const i = cutoffs.findIndex(high => partner <= high * 10000);
  const partnerBand = (i ? cutoffs[i-1] + "万円超" : "") + cutoffs[i] + "万円以下";
  return "本人所得 " + n(own) + "（" + ownBand + "）× 配偶者所得 " + n(partner) + "（" + partnerBand + "）："
    + (i === 0 ? "配偶者控除" : "配偶者特別控除");
}

function parentRows({point, inputs, id}) {
  const details = point.details, t = details[id+"Tax"], partner = details[id === "head" ? "spouseTax" : "headTax"];
  const s = t.salaryTaxInputs, national = t.nationalTax, local = t.residentTax, ex = local.exemption;
  const income = t.currentIncomeYen, sp = t.spouseDeduction.current;
  const dependents = inputs.children.filter((_, i) => details.roles.taxDependentOf[i] === id);
  const older = t.olderDependentCount;
  const ordinary = dependents.filter(c => c.taxStatus === "ordinary").length;
  const special = dependents.filter(c => c.taxStatus === "special").length;
  const childIT = 380000*older + 270000*ordinary + 750000*special;
  const childLT = 330000*older + 260000*ordinary + 530000*special;
  const difference = Math.round(local.personalDeductionDifferenceWan*10000);
  const gross = n(s.annualSalaryYen), lbase = n(local.taxableYen);
  const beforeThreshold = n(local.incomeLevyBeforeThresholdAdjustmentYen);
  const afterThreshold = n(local.incomeLevyAfterThresholdAdjustmentYen);
  const thresholdAdjustment = ex.incomeLevyExempt ? "所得割非課税 → 0"
    : "min("+beforeThreshold+", "+n(income)+" − "+n(ex.incomeLevyExemptionThresholdYen)+")";
  const thousand = (terms) => "1,000 × ⌊max(0, " + terms.map(n).join(" − ") + ") ÷ 1,000⌋";
  const familySpouse = Number(partner.currentIncomeYen <= 620000);
  const threshold = (variable) => ex.dependentCount ? "350,000 × (" + ex.dependentCount + " + 1) + " + variable : "450,000（扶養等0人）";
  const adjustmentBranch = ex.incomeLevyExempt ? "所得割非課税 → 0" : local.taxableYen <= 2000000
    ? "min(" + n(difference) + ", " + lbase + ") × 5%"
    : "max(2,500, [" + n(difference) + " − (" + lbase + " − 2,000,000)] × 5%)";
  return [
    ["給与所得（所得金額調整控除前）", ...salaryBranch(s.annualSalaryYen), yen(s.salaryIncomeBeforeAdjustmentYen)],
    ["給与所得控除相当額", "給与収入 − 調整前給与所得", gross+" − "+n(s.salaryIncomeBeforeAdjustmentYen), yen(s.annualSalaryYen-s.salaryIncomeBeforeAdjustmentYen)],
    ["所得金額調整控除", "⌈max(0, min(給与, 10,000,000) − 8,500,000) × 10%⌉", "⌈max(0, min("+gross+", 10,000,000) − 8,500,000) × 10%⌉", yen(s.incomeAdjustmentDeductionYen)],
    ["給与所得（調整後）", "調整前給与所得 − 所得金額調整控除", n(s.salaryIncomeBeforeAdjustmentYen)+" − "+n(s.incomeAdjustmentDeductionYen), yen(income)],
    ["基礎控除", "この給与範囲では、所得税は所得132万円以下99万円・超62万円。住民税は43万円。", n(income)+(income<=1320000?" ≤ ":" > ")+"1,320,000", pair(t.basicITYen,430000)],
    ["社会保険料控除", "この親が負担する年間社会保険料（全額）", "この親の保険料 "+yen(t.socialYen), yen(t.socialYen)],
    ["扶養控除・障害者控除", "所得税：16歳以上×38万＋普通×27万＋同居特別×75万。住民税：同じ人数に33万・26万・53万。", older+" × 380,000 + "+ordinary+" × 270,000 + "+special+" × 750,000 ／ "+older+" × 330,000 + "+ordinary+" × 260,000 + "+special+" × 530,000", pair(childIT,childLT)],
    ["配偶者控除・配偶者特別控除", "指定した申告者の本人所得帯と配偶者所得帯の交点の控除額。指定なし・限度超過は0円。", spouseLookup(income,partner.currentIncomeYen,details.roles.spouseDeductionClaimant === id), pair(sp.it,sp.lt)],
    ["所得税の課税所得", "給与所得 − 社会保険料 − 子の控除 − 配偶者等控除 − 基礎控除。負値は0、1,000円未満切捨て。", thousand([income,t.socialYen,childIT,sp.it,t.basicITYen]), yen(national.taxableYen)],
    ["基準所得税額", "max(0, ⌊課税所得 × 速算税率 − 速算控除額⌋)", "max(0, ⌊"+n(national.taxableYen)+" × "+n(national.rate*100)+"% − "+n(national.deductionYen)+"⌋)", yen(national.baseTaxYen)],
    ["所得税等（年調年税額）", "基準所得税 ×（100%＋復興1.1%＋防衛1%）。合計で100円未満切捨て。", "100 × ⌊"+n(national.baseTaxYen)+" × 1.021 ÷ 100⌋", yen(t.incomeTaxYen)],
    ["住民税の課税所得", "給与所得 − 社会保険料 − 子の控除 − 配偶者等控除 − 430,000。負値は0、1,000円未満切捨て。", thousand([income,t.socialYen,childLT,sp.lt,430000]), yen(local.taxableYen)],
    ["住民税の非課税判定人数", "申告した扶養児童＋同一生計配偶者（配偶者所得62万円以下）。配偶者控除の申告者とは別判定。", dependents.length+" + "+familySpouse+"（配偶者所得 "+yen(partner.currentIncomeYen)+"）", ex.dependentCount+"人"],
    ["均等割等の非課税判定", "扶養等0人は45万円、それ以外は35万円×(人数＋1)＋31万円。所得が限度額以下なら非課税。", threshold("310,000")+" = "+n(ex.perCapitaExemptionThresholdYen)+"；所得 "+n(income), ex.perCapitaExempt?"非課税":"課税"],
    ["所得割の非課税判定", "扶養等0人は45万円、それ以外は35万円×(人数＋1)＋42万円。所得が限度額以下なら非課税。", threshold("420,000")+" = "+n(ex.incomeLevyExemptionThresholdYen)+"；所得 "+n(income), ex.incomeLevyExempt?"非課税":"課税"],
    ["住民税の人的控除差", "基礎差5万円＋子の控除差＋配偶者控除の差（配偶者特別控除の差は0）。", "50,000 + ("+n(childIT)+" − "+n(childLT)+") + "+n(sp.difference), yen(difference)],
    ["住民税の調整控除", "所得割非課税は0。課税所得200万円以下：min(人的控除差, 課税所得)×5%。超：max(2,500, [差−(課税所得−200万)]×5%)。", adjustmentBranch, yen(local.adjustmentDeductionYen)],
    ["所得割（市・県計、減額前）","所得割非課税なら0。課税なら課税所得×10%から人的控除差の調整控除を差し引く。",ex.incomeLevyExempt?"所得割非課税 → 0":lbase+" × 10% − "+n(local.adjustmentDeductionYen),yen(local.incomeLevyBeforeThresholdAdjustmentYen)],
    ["所得割（非課税限度額による減額後）","給与所得から非課税限度額を引いた額を所得割の上限とする（地方税法附則第3条の3）。",thresholdAdjustment,yen(local.incomeLevyAfterThresholdAdjustmentYen)],
    ["市民税所得割", "減額後の市・県計のうち市の分（本稿では60%）。100円未満切捨て。", "100 × ⌊"+afterThreshold+" × 60% ÷ 100⌋", yen(local.municipalIncomeLevyYen)],
    ["県民税所得割", "減額後の市・県計のうち県の分（本稿では40%）。100円未満切捨て。", "100 × ⌊"+afterThreshold+" × 40% ÷ 100⌋", yen(local.prefecturalIncomeLevyYen)],
    ["均等割・森林環境税", "課税時は均等割4,000円＋森林環境税1,000円。本モデルは両方に均等割の非課税判定を使用。", ex.perCapitaExempt?"非課税：0 + 0":"課税：4,000 + 1,000", yen(local.perCapitaYen+local.forestEnvironmentTaxYen)],
    ["住民税等（森林環境税込み）", "市・県の所得割（各0以上）＋均等割＋森林環境税", [Math.max(0,local.municipalIncomeLevyYen),Math.max(0,local.prefecturalIncomeLevyYen),local.perCapitaYen,local.forestEnvironmentTaxYen].map(n).join(" + "), yen(t.residentTaxYen)],
    ["この親の税負担", "所得税等＋住民税等", n(t.incomeTaxYen)+" + "+n(t.residentTaxYen), yen(t.totalTaxYen)],
  ];
}

export default function TraceParentTaxes({point, inputs}) {
  if (point?.protocol !== "paper-2029" || point?.status !== "calculated" || !inputs?.children ||
      !point.details?.headTax?.salaryTaxInputs || !point.details?.spouseTax?.salaryTaxInputs) {
    return <p>この給与点には親別の税額計算明細がありません。</p>;
  }
  return <section aria-label="親別の税額の計算過程">
    <p>金額は年額・円。⌊ ⌋は切捨て、⌈ ⌉は切上げです。親は45歳、給与以外の所得はなく、子は全員同居・23歳未満として、税の扶養申告先とは別に両親の所得金額調整控除を判定します。表示するのは本稿の2029年末想定の計算で、将来の実税額ではありません。</p>
    {["head","spouse"].map((id) => {
      const name = id === "head" ? "世帯主" : "配偶者";
      return <details key={id}><summary>{name}の給与所得・所得税・住民税の計算式</summary>
        <TraceTable caption={name+"の税額計算（円／年）"} rows={parentRows({point, inputs, id})} />
      </details>;
    })}
    <p>参照：<a href={PAPER_SALARY_POLICY_2029.salarySource}>給与所得の法定表</a>、<a href={PAPER_SALARY_POLICY_2029.adjustmentSource}>所得金額調整控除</a>、<a href={PAPER_SALARY_POLICY_2029.basicSource}>基礎控除（令和10年分以後）</a>、<a href="https://www.nta.go.jp/publication/pamph/pdf/0026005-024_03.pdf">国税庁・防衛／復興特別所得税Q8</a>、<a href={CALCULATION_SOURCES.residentTax.url}>船橋市・所得割と税額控除</a>、<a href="https://laws.e-gov.go.jp/law/325AC0000000226">地方税法附則第3条の3</a>。</p>
  </section>;
}
