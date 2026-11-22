import { annualEmployeePremiums, annualEmploymentPremium, resolveEmploymentContract } from "./revisionPayroll.js";
import { estimateFunabashiNational } from "./funabashiNational.js";

// 45歳、同居、障害年金等の180万円基準に該当しない夫婦。給与は同額で前年から
// 定常、賞与なし。被扶養判定では契約による収入見込＝入力給与、他の認定対象収入なし
// と置く。所得税の所得・扶養申告を用いない。契約→職域加入→扶養の順に各年別に判定。
export const COVERAGE_SOURCES = {
  workplace: "https://www.nenkin.go.jp/service/kounen/tekiyo/jigyosho/tanjikan.html",
  dependent: "https://www.nenkin.go.jp/oshirase/taisetu/jigyosho/2026/202605/0501.html",
  dependentPrior: "https://www.nenkin.go.jp/service/learn/seidosetsumei.files/kounen2025_01.pdf",
  nationalPension: "https://www.nenkin.go.jp/service/kokunen/kanyu/20140710-04.html",
  householdHealth: "https://www.city.funabashi.lg.jp/kenkou/kokuho/002/p001880.html",
  previousFunabashiHealth: "https://www.city.funabashi.lg.jp/kenkou/kokuho/002/p145350.html",
  taxPayer: "https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1130.htm",
  employment: "https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/0000108634.html",
  jointChildren: "https://www.mhlw.go.jp/web/t_doc?dataId=00tc5892&dataType=1&pageNo=1",
  tokyo: "https://www.kyoukaikenpo.or.jp/assets/R8_13tokyo.pdf",
};

const roles = ["head", "spouse"];
const names = { head: "世帯主", spouse: "配偶者" };
/** 直接入力された保険料等が0以上の整数円かを確かめる。 */
const isAmount = x => Number.isSafeInteger(x) && x >= 0;
/** 判定対象ではない側の配偶者を取得する。 */
const opposite = role => role === "head" ? "spouse" : "head";

// 給与があることと職場の被保険者であることを区別する。年収だけによる「106万円」
// 判定や、例外の扶養認定・一時的な超過を自動採用することはしない。
/** 個別契約を指定した旧比較条件で、各親の加入先または認定に不足する条件を返す。 */
function coverageStatus(role, plan, wages) {
  const mode = plan[role]?.mode, partner = opposite(role);
  if (mode === "employee") return wages[role] > 0
    ? {status:"employee"} : {status:"undetermined", issue:"給与0円時の本人加入・休業等をこの勤務ケースでは算定しません。"};
  if (mode !== "outside") return {status:"undetermined", issue:plan[role]?.reason || "この給与点に適用できる勤務先の加入条件が未確定です。"};
  if (wages[role] >= 130 || plan[partner]?.mode === "outside") return {status:"national"};
  if (plan[partner]?.mode !== "employee" || wages[partner] === 0)
    return {status:"undetermined", issue:"扶養する側の職場保険加入を確認できません。"};
  if (2 * wages[role] < wages[partner]) return {status:"dependent"};
  if (wages[role] <= wages[partner])
    return {status:"undetermined", issue:"給与見込が扶養者の2分の1以上で、個別の生計維持認定が必要です。"};
  return {status:"national"};
}

// 給与点ごとに職域→扶養を先に判定してから、国保の加入者だけを渡す。居住地と
// 勤務先健保の支部は別入力。加入先不明の子どもを「未加入」とみなすことはしない。
/** 旧比較条件の船橋市国保料を、加入先を確認できた世帯員についてのみ推計する。 */
function regionalNational(plan, fiscalYear, wages, states) {
  const assumptions = plan.nationalEstimate;
  const nationalRoles = roles.filter(role=>states[role].status === "national");
  /** 資料不足を0円に置かず、その理由を返す。 */
  const fail = message=>({known:false,reasons:[message]});
  if (roles.some(role=>states[role].status === "undetermined"))
    return fail("夫婦の国保加入者を確定できず、船橋市の国保料を推計できません。");
  let children = assumptions.children;
  if (assumptions.childrenMode === "follow-parents") {
    // 給与のみ・前年から同額という研究仮定の下で、混合加入時も見込年収を比較する。
    // 同額時の生計維持認定は推測しない。税扶養・特児受給者からは導出しない。
    const employee = roles.find(role=>states[role].status === "employee");
    const national = nationalRoles[0];
    if (nationalRoles.length === 1 && employee && wages[national] === wages[employee])
      return fail("被用者保険と国保の親の見込年収が同額のため、子どもの生計維持認定を確認する必要があります。");
    const inNational = nationalRoles.length === 2 || (nationalRoles.length === 1 && employee && wages[national] > wages[employee]);
    children = Array.isArray(children) ? children.map(c=>({...c,national:Boolean(inNational)})) : children;
  }
  if (!Array.isArray(children) || !children.length ||
      children.some(c=>!c || !Number.isInteger(c.age) || c.age<0 || c.age>17 || typeof c.national !== "boolean"))
    return fail("船橋市の国保に加入する子どもと年齢区分を確認してください。");
  if (nationalRoles.length === 2 && children.some(c=>!c.national))
    return fail("両親とも国保の給与点です。他の保険がない前提では、同居する子どもも国保の加入者に指定してください。");
  if (!nationalRoles.length) {
    if (children.some(c=>c.national))
      return fail("今回の世帯条件では、国保の親がいない給与点で子どもだけの国保加入は想定していません。");
    return null;
  }
  return estimateFunabashiNational({fiscalYear,headWan:wages.head,spouseWan:wages.spouse,
    nationalRoles,children,payer:assumptions.payer,standardPension:true});
}

/**
 * 夫婦それぞれの勤務条件を固定して、一つの給与点での当年・前年の保険料を求める。
 * contract＝固定した契約から年度ごとに職域加入を判定。employee＝健康保険・厚生年金の本人加入を前提とする勤務、outside＝当該勤務先の
 * 両保険には加入しない勤務・無職。雇用保険は独立。国保・国民年金には給与比例の
 * 代用値を流用せず、当該給与点の実支払額（又は根拠のある試算額）を要する。
 * @param {object} insurance head/spouse の mode, employmentInsurance, currentNationalYen, previousNationalYen。
 * 国保等の入力には measuredAt:{headWan,spouseWan} が必須。国保がある場合、
 * nationalHealth:{payer,currentYen,previousYen} で世帯保険料を一回だけ計上できる。
 * この形では currentNationalYen 等は本人が払った本人国民年金額のみ（夫婦別）。
 * 国保加入が一人のみで nationalHealth を省略した場合は当該本人が国保・国民年金
 * を双方払う前提の合計額。子の国保分があれば世帯額に含める。
 * residence:"funabashi" かつ nationalEstimate:{confirmed:true,payer,children:[{age,national}]}
 * なら、通常納付を想定する船橋市の年度別国保・国民年金の計算値を使う。給与点で
 * 実支払額の入力がある年は、世帯全体でそちらを優先（一部だけの混在は許さない）。
 * @param {number} headWan 世帯主の給与（万円／年、整数）。
 * @param {number} spouseWan 配偶者の給与（万円／年、整数）。
 * @returns {object} known, head, spouse, reasons。social/prevSocial は各人が負担・控除
 * する額（円／年）。入力不足・認定不明は null。国保世帯額は実際の支払者に一度だけ加える。
 */
export function calculateHouseholdCoverage(insurance, headWan, spouseWan) {
  if (![headWan,spouseWan].every(w => Number.isSafeInteger(w) && w >= 0 && w <= 1500))
    throw new RangeError("社会保険の計算には各人の0～1,500万円の整数給与を指定してください。");
  const plan = insurance ?? {};
  const wages = {head:headWan,spouse:spouseWan};
  const reasons = new Set();
  const measuredHere = plan.measuredAt?.headWan === headWan && plan.measuredAt?.spouseWan === spouseWan;
  const health = plan.nationalHealth;
  const regionalRequested = plan.residence === "funabashi" && plan.nationalEstimate?.confirmed === true;
  const regionalEstimates = {current:null,previous:null};
  const result = Object.fromEntries(roles.map(role=>[role,{status:null,previousStatus:null,social:null,prevSocial:null,current:null,previous:null}]));
  for (const [key,year,field,socialKey] of [
    ["current",2026,"currentNationalYen","social"],["previous",2025,"previousNationalYen","prevSocial"],
  ]) {
    const current = key === "current", period = current ? "当年" : "前年";
    const plans = Object.fromEntries(roles.map(role=>{
      const profile = plan[role] ?? {};
      // 国保の住所から協会けんぽ支部を逆算しない。職域加入の保険料・就労地域別最低賃金は
      // 調査した勤務先地域（船橋＝千葉支部、東京支部）を明示したときだけ使う。
      if (wages[role] > 0 && (profile.mode === "employee" || profile.mode === "contract") &&
          !["chiba","tokyo"].includes(profile.workRegion))
        return [role,{...profile,mode:"unknown",reason:"勤務先の地域（協会けんぽの支部）が未指定・対象外です。"}];
      return [role, profile.mode === "contract" ? {...profile,...resolveEmploymentContract(profile,wages[role],year)} : profile];
    }));
    const states = Object.fromEntries(roles.map(role => [role,coverageStatus(role,plans,wages)]));
    const nationalRoles = roles.filter(role => states[role].status === "national");
    const nationalCount = nationalRoles.length;
    const declared = measuredHere && nationalCount > 0 && (
      nationalRoles.some(role=>plans[role][field]!=null) || health?.[current ? "currentYen" : "previousYen"] != null
    );
    const regional = regionalRequested && !declared ? regionalNational(plan,year,wages,states) : null;
    regionalEstimates[key] = regional;
    const householdAmountRequired = nationalCount > 1 || (nationalCount > 0 && health != null);
    const invalidShared = !regional && householdAmountRequired && (!health || !roles.includes(health.payer));
    if (invalidShared) reasons.add(period + "の国保世帯分の実際の支払者と世帯保険料を一組だけ入力してください。");
    for (const role of roles) {
      const out = result[role], person = plans[role], state = states[role];
      out[current ? "status" : "previousStatus"] = state.status;
      if (state.issue) reasons.add(names[role] + "（" + period + "）：" + state.issue);
      if (state.status === "undetermined") continue;
      if (regional && !regional.known) {
        regional.reasons.forEach(message=>reasons.add(period + "：" + message));
        continue;
      }
      if (typeof person.employmentInsurance !== "boolean" && wages[role] > 0) {
        reasons.add(names[role] + "：雇用保険の加入条件が未設定です。");
        continue;
      }
      // 賞与なし・均等な月給とし、東京の各年度の標準報酬等級から12か月を算定する。
      // 雇用保険は加入時のみ別経路で足す。給与ゼロは雇用保険だけが必ずゼロ。
      const payroll = state.status === "employee" ? annualEmployeePremiums(wages[role],year,person.employmentInsurance,person.healthBranch ?? person.workRegion) : null;
      const employmentYen = payroll ? payroll.employmentYen : person.employmentInsurance ? annualEmploymentPremium(wages[role],year) : 0;
      const workplaceYen = payroll ? payroll.totalYen - payroll.employmentYen : 0;
      let nationalYen = 0, familyHealthYen = 0;
      if (regional) {
        nationalYen = regional.pensionYen[role] ?? 0;
        if (plan.nationalEstimate.payer === role) familyHealthYen = regional.healthYen;
      } else if (state.status === "national") {
        if (!measuredHere || !isAmount(person[field]) || invalidShared) {
          reasons.add(names[role] + "：" + period + "のこの給与点での国保・国民年金の支払額を確認できません。");
          continue;
        }
        nationalYen = person[field];
      }
      if (!regional && householdAmountRequired && !invalidShared && health.payer === role) {
        const amount = health[current ? "currentYen" : "previousYen"];
        if (!measuredHere || !isAmount(amount)) {
          reasons.add(period + "のこの給与点での国保世帯分の支払額が未設定です。");
          continue;
        }
        familyHealthYen = amount;
      }
      const sum = workplaceYen + employmentYen + nationalYen + familyHealthYen;
      if (!Number.isSafeInteger(sum)) throw new RangeError("保険料の入力額が大きすぎます。");
      out[key] = {workplaceYen, employmentYen, nationalYen, householdHealthYen:familyHealthYen,
        nationalMethod:regional ? "funabashi-estimate" : nationalCount ? "entered" : "not-applicable",payroll,totalYen:sum};
      out[socialKey] = sum;
    }
  }
  const currentKnown = roles.every(role=>result[role].social !== null);
  const previousKnown = roles.every(role=>result[role].prevSocial !== null);
  return {...result, known:currentKnown && previousKnown, currentKnown, previousKnown, regionalEstimates, reasons:[...reasons]};
}
