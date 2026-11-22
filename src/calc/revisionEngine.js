import { calcWelfareAllowanceLimitObligorYen } from "./allowances.js";
import { calculateSpecialChildAllowance, salaryOnlySpecialChildIncome } from "./specialChildAllowance.js";
import { calculateDisabledChildWelfareAllowance, calculateWelfareSalaryAssessment } from "./disabledChildWelfareAllowance.js";
import { calculateHouseholdInsurance2029 } from "./householdInsurance2029.js";
import { calculatePaperSalaryTaxInputs2029, PAPER_SALARY_POLICY_2029 } from "./paperSalaryTaxInputs2029.js";
import { calcServiceAssessmentLevyYen, getChildDayServiceCapYen, isFreeDayServiceAge, MAX_SERVICE_YEN } from "./serviceBurdenLimits.js";
import { calculateSocialInsuranceComponents } from "./socialInsurance.js";
import { calculateHouseholdCoverage } from "./revisionCoverage.js";
import { calcBasicIncomeTaxDeductionR8FinalWan } from "./taxDescriptions.js";
import { childOrDisabilityIncomeAdjustmentYen, salaryIncomeBeforeAdjustmentYen } from "./employmentIncome.js";
import { getIncomeTaxParts, getResidentTaxParts } from "./taxes.js";

// 給与入力は万円、内部の所得・収支計算は円。静学比較であって、年度移行時の月別支給予測ではない。
const WAN = 10000;
const AGE_OF_PARENTS = 45;
const MAX_WAGE = 1500;
// 国税庁 No.1195、地方税法上の配偶者特別控除。各行は高所得側の合計所得が
// 900万円以下、950万円以下、1,000万円以下の順。帯の上端は「以下」。
export const REVISION_SPOUSE_DEDUCTION_TABLE = [
  [95, [38,26,13], [33,22,11]], [100, [36,24,12], [33,22,11]],
  [105, [31,21,11], [31,21,11]], [110, [26,18,9], [26,18,9]],
  [115, [21,14,7], [21,14,7]], [120, [16,11,6], [16,11,6]],
  [125, [11,8,4], [11,8,4]], [130, [6,4,2], [6,4,2]], [133, [3,2,1], [3,2,1]],
];

// 論文の世帯条件。児福の本人は無所得・配偶者なしの児童、父母はともに児童の生計を維持すると仮定する。
// 税扶養の帰属や特児の受給資格者の選定とは別の判定であり、両親の所得を合算しない。
export const PAPER_ALLOWANCE_ROLES = Object.freeze({allowanceRecipient:"highest-salary", welfareMaintainer:"both"});

/** 円額・年齢・給与点の空欄や小数を暗黙にゼロまたは近い給与点として扱わない。 */
function requireInteger(value, min, max, label) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new RangeError(label + "が設定範囲外です。");
  return value;
}

/**
 * 世帯条件を走査に先立ち検査する。サービスの利用を手当等級から導出しない。
 * @param {object} input 児童別の年齢・2手当・税区分・通所利用、月額利用料（円）。
 * @returns {object} 検証済み児童配列・合算対象の利用料・人的関係・保険条件等。対象外の費目は取り込まない。
 */
export function validateRevisionHousehold(input) {
  if (!input || !Array.isArray(input.children) || input.children.length < 1 || input.children.length > 3) throw new RangeError("子どもは1～3人を指定してください。");
  const protocol = input.protocol ?? "v3";
  if (!["paper-2029","v3","legacy-v2"].includes(protocol)) throw new RangeError("算定仕様が不明です。");
  const paper = protocol === "paper-2029";
  const requestedRecipient = input.roles?.allowanceRecipient ?? (paper ? "highest-salary" : "head");
  if (!(paper ? ["head","spouse","highest-salary"] : ["head","spouse"]).includes(requestedRecipient)) throw new RangeError("受給資格者の指定が不正です。");
  const requestedMaintainer = input.roles?.welfareMaintainer ?? "both";
  if (!["head","spouse","highest-salary","both"].includes(requestedMaintainer))
    throw new RangeError("障害児福祉手当の生計維持者の仮定が不正です。");
  const roles = {
    spouseDeductionClaimant:input.roles?.spouseDeductionClaimant ?? (paper ? "highest-salary" : "head"),
    ...(paper ? PAPER_ALLOWANCE_ROLES : {allowanceRecipient:requestedRecipient,welfareMaintainer:requestedMaintainer}),
  };
  if (!(paper ? ["highest-salary","head","spouse","none"] : ["head","spouse","none"]).includes(roles.spouseDeductionClaimant))
    throw new RangeError("配偶者控除の申告者の指定が不正です。");
  if (protocol === "paper-2029" && input.insurance !== undefined)
    throw new RangeError("このモデルには旧版の勤務条件・国保入力を使用できません。");
  const serviceAmountYen = requireInteger(input.serviceAmountYen, 0, MAX_SERVICE_YEN, "利用額");
  const otherServiceMonthlyYen = requireInteger(input.otherServiceMonthlyYen ?? 0, 0, MAX_SERVICE_YEN, "同じ保護者に係るその他の合算対象負担");
  const children = input.children.map((c, i) => {
    const age = requireInteger(c?.age, 0, 17, "子どもの年齢");
    if (!["not","2","1"].includes(c.tccaGrade) || !["none","ordinary","special"].includes(c.taxStatus) ||
        typeof c.welfareEligible !== "boolean" || typeof c.serviceUser !== "boolean") throw new RangeError("子ども" + (i+1) + "の制度別条件が未指定です。");
    if (c.welfareEligible && c.tccaGrade === "not") throw new RangeError("法第2条第2項の重度障害児は同条第1項の障害児に含まれます。所得停止前の特児の障害等級を指定してください。");
    const individual = requireInteger(c.serviceAmountYen ?? serviceAmountYen, 0, MAX_SERVICE_YEN, "児童別利用額");
    const record = { age, tccaGrade:c.tccaGrade, taxStatus:c.taxStatus, welfareEligible:c.welfareEligible, serviceUser:c.serviceUser, serviceAmountYen:individual };
    // 論文用は各給与点で全児童の税扶養先を定める。旧画面の固定扶養先・追加申告は引き継がない。
    if (paper) return record;
    const taxDependentOf = c.taxDependentOf ?? "head", maintainedByRecipient = c.maintainedByRecipient ?? false;
    if (!["head","spouse"].includes(taxDependentOf) || typeof maintainedByRecipient !== "boolean") throw new RangeError("児童の扶養関係の指定が不正です。");
    return {...record, taxDependentOf, maintainedByRecipient};
  });
  const insurance = input.insurance?.nationalEstimate?.childrenMode === "follow-parents" ? {
    ...input.insurance, nationalEstimate:{...input.insurance.nationalEstimate,children:children.map(c=>({age:c.age}))},
  } : input.insurance;
  return { children, otherServiceMonthlyYen, roles, protocol, insurance };
}

/**
 * 給与1本から当年と前年の給与所得を作る。本人の加入・相手の扶養を給与所得には混ぜない。
 * @param {number} salaryWan 45歳の親1人の給与（万円／年）。
 * @returns {object} 当年・前年の給与収入及び所得（円／年）。保険料は後段で別々に渡す。
 */
function revisionSalaryRecord(salaryWan, steady2029=false) {
  const salaryYen = salaryWan*WAN;
  if (steady2029) {
    const s = calculatePaperSalaryTaxInputs2029({annualSalaryYen:salaryYen, eligibleForIncomeAdjustment:true});
    // 前年から昇給なし、同一の制度・料率を12か月続けた静学比較。過年度の天引き実績ではない。
    return {salaryYen, income:s.salaryIncomeYen, prevIncome:s.salaryIncomeYen,
      prevGrossIncome:s.salaryIncomeBeforeAdjustmentYen, steady2029, salaryTaxInputs:s};
  }
  // 所得金額調整控除は扶養控除の一人限定とは異なり、23歳未満の子がいれば両親とも適用可能。
  const adjustment = childOrDisabilityIncomeAdjustmentYen(salaryYen, true);
  // 既存の比較シナリオでは両年に同額の給与を渡す。個人の給与所得計算自体は暦年別。
  const prevGrossIncome = salaryIncomeBeforeAdjustmentYen(salaryYen, 2025);
  return {
    salaryYen, income:salaryIncomeBeforeAdjustmentYen(salaryYen, 2026)-adjustment,
    prevIncome:prevGrossIncome-adjustment, prevGrossIncome,
  };
}

/** v2の再現専用。新しい世帯条件からこの規則を自動選択しない。 */
function archivedPremiums(salaryWan) {
  return {social:Math.round(calculateSocialInsuranceComponents(salaryWan,AGE_OF_PARENTS,"s4").totalWan*WAN),
    prevSocial:Math.round(calculateSocialInsuranceComponents(salaryWan,AGE_OF_PARENTS,"s2").totalWan*WAN)};
}

/**
 * 1人の所得と配偶者所得から普通／特別の配偶者控除を選択する。
 * @param {number} own 本人の合計所得（円）。
 * @param {number} partner 相手の合計所得（円）。扶養しない側からの申告にはInfinity。
 * @param {number} ordinaryLimit 同一生計配偶者の所得要件（当年62万円、前年58万円）。
 * @returns {object} 所得税・住民税の控除、うち住民税の配偶者特別控除、調整控除用の人的控除差（円）。
 */
function revisionSpouseDeduction(own, partner, ordinaryLimit) {
  const band = own <= 9000000 ? 0 : own <= 9500000 ? 1 : own <= 10000000 ? 2 : -1;
  const row = REVISION_SPOUSE_DEDUCTION_TABLE.find(entry => partner <= entry[0] * WAN);
  if (band < 0 || !row) return {kind:"none", it:0, lt:0, specialLT:0, difference:0};
  const it = row[1][band]*WAN, lt = row[2][band]*WAN;
  const ordinary = partner <= ordinaryLimit;
  return {kind:ordinary ? "ordinary" : "special", it, lt, specialLT:ordinary ? 0 : lt, difference:ordinary ? it-lt : 0};
}

/**
 * 個人別に税を算定し、当年所得対応の税と、2026年度のサービス負担判定に用いる前年所得割を区別する。
 * @param {object} person 当該納税者の給与・当年所得・前年所得・保険料。
 * @param {object} partner 他方の親の給与記録。
 * @param {Array<object>} dependents この親が税の扶養を申告した児童のみ（扶養控除の年齢要件は別判定）。
 * @param {boolean} claimsSpouse 当該成人が配偶者控除・配偶者特別控除を申告する設定か。
 * @param {boolean} archived 旧仕様に限り、同一生計配偶者の人数も申告者の一方に寄せる。
 * @returns {object} 所得税、住民税（うち森林環境税）、サービス判定用所得割、手当判定所得・扶養人数。
 */
function revisionParentTax(person, partner, dependents, claimsSpouse, archived) {
  const older = dependents.filter(c => c.age >= 16).length;
  const ordinary = dependents.filter(c => c.taxStatus === "ordinary").length;
  const special = dependents.filter(c => c.taxStatus === "special").length;
  const childIT = (older*38 + ordinary*27 + special*75)*WAN;
  const childLT = (older*33 + ordinary*26 + special*53)*WAN;
  const spouse = revisionSpouseDeduction(person.income, claimsSpouse ? partner.income : Infinity, 620000);
  const previousOrdinaryLimit = person.steady2029 ? 620000 : 580000;
  const prevSpouse = revisionSpouseDeduction(person.prevIncome, claimsSpouse ? partner.prevIncome : Infinity, previousOrdinaryLimit);
  // 「同一生計配偶者」の有無は、配偶者控除額そのものではない。本研究は夫婦同居・同一生計・給与のみ。
  const familySpouse = (!archived || claimsSpouse) && partner.income <= 620000;
  const prevFamilySpouse = (!archived || claimsSpouse) && partner.prevIncome <= previousOrdinaryLimit;
  // 所得・控除を整数円で差し引いてから税計算器に渡す。万円単位での減算は境界で
  // 999.999…円を作り、課税所得の千円未満切捨てが一段ずれることがある。
  const basicITYen = person.steady2029 ? person.salaryTaxInputs.basicIncomeTaxDeductionYen : calcBasicIncomeTaxDeductionR8FinalWan(person.income/WAN)*WAN;
  const itBase = person.income-person.social-childIT-spouse.it-basicITYen;
  const it = getIncomeTaxParts(itBase/WAN, {includeReconstruction:true, includeDefense:person.steady2029===true});
  const resident = getResidentTaxParts((person.income-person.social-childLT-spouse.lt-430000)/WAN, {
    totalIncomeWan:person.income/WAN, dependentCount:dependents.length + Number(familySpouse),
    applySalaryOnlyExemptionAdjustment:person.steady2029 === true,
    personalDeductionDifferenceWan:5+(childIT-childLT+spouse.difference)/WAN,
  });
  const prevResident = getResidentTaxParts((person.prevIncome-person.prevSocial-childLT-prevSpouse.lt-430000)/WAN, {
    totalIncomeWan:person.prevIncome/WAN, dependentCount:dependents.length + Number(prevFamilySpouse),
    applySalaryOnlyExemptionAdjustment:person.steady2029 === true,
    personalDeductionDifferenceWan:5+(childIT-childLT+prevSpouse.difference)/WAN,
  });
  return {
    currentIncomeYen:person.income, previousIncomeYen:person.prevIncome, socialYen:person.social, previousSocialYen:person.prevSocial,
    ...(person.steady2029 ? {salaryTaxInputs:person.salaryTaxInputs, basicITYen, nationalTax:it, residentTax:resident} : {}),
    spouseDeduction:{current:spouse, previous:prevSpouse}, taxDependentCount:dependents.length, olderDependentCount:older,
    totalTaxYen:it.taxYen+Math.round(resident.totalWan*WAN), incomeTaxYen:it.taxYen, residentTaxYen:Math.round(resident.totalWan*WAN),
    forestTaxYen:resident.forestEnvironmentTaxYen, spouseDeductionITYen:spouse.it, disabilityDeductionITYen:(ordinary*27+special*75)*WAN,
    serviceLevyYen:calcServiceAssessmentLevyYen(prevResident.municipalIncomeLevyYen, dependents.map(c => c.age)),
    serviceTaxable:prevResident.perCapitaYen > 0 || prevResident.incomeLevyYen > 0,
    // 施行令第5条の給与所得（所得税法28条2項）から給与10万円・一律8万円等。税の同居特障75万は使わない。
    allowanceIncomeYen:salaryOnlySpecialChildIncome({salaryIncomeBeforeAdjustmentYen:person.prevGrossIncome,
      spouseSpecialDeductionYen:prevSpouse.specialLT,ordinaryDisabilityCount:ordinary,specialDisabilityCount:special}),
    welfareMaintainerIncomeYen:calculateWelfareSalaryAssessment({role:"maintainer", salaryIncomeYen:person.prevGrossIncome,
      ordinaryDisabledDependents:ordinary,specialDisabledDependents:special,otherAllowedDeductionsYen:prevSpouse.specialLT}).incomeYen,
    allowanceFuyo:dependents.length + Number(prevFamilySpouse),
  };
}

/**
 * N01の本人・配偶者・扶養義務者を個人ごとに判定し、対象児の等級別額を年換算する。
 * @param {Array<object>} children 無所得で在宅の児童。各手当は認定済みの障害要件を指定。
 * @param {object} claimant 当該給与点で受給資格者とする親の判定所得・扶養人数。
 * @param {object} other 他方の親の判定所得・扶養人数。
 * @param {number} additionalSupportedCount 受給資格者の税扶養に数えていない前年末生計維持児童の人数。
 * @param {string} claimantId 当該点で解決済みの受給資格者（head又はspouse）。この人に法6条、他方の親に7条を適用する。
 * @param {string} maintainerId 児福で所得を判定する扶養義務者。"both"なら父母をそれぞれの限度額と照合する。
 * @returns {object} 各手当の支給額（円／年）、本人と扶養義務者の限度額・可否。
 */
function revisionCashBenefits(children, claimant, other, additionalSupportedCount, claimantId, maintainerId) {
  const spouseId = claimantId === "head" ? "spouse" : "head";
  const specialChildAllowance = calculateSpecialChildAllowance({
    grades:children.map(c=>c.tccaGrade),
    claimant:{id:claimantId,assessmentIncomeYen:claimant.allowanceIncomeYen,dependentCount:claimant.allowanceFuyo},
    spouse:{id:spouseId,assessmentIncomeYen:other.allowanceIncomeYen,dependentCount:other.allowanceFuyo},
    // この世帯では子は全員無所得で親に扶養されるため、特児の停止判定は両親分だけで足りる。
    additionalMaintainedChildren:additionalSupportedCount, claimantOlderTaxDependents:claimant.olderDependentCount,
  });
  const limit = specialChildAllowance.checks[0].limitYen;
  const obligorLimit = calcWelfareAllowanceLimitObligorYen(claimant.allowanceFuyo);
  const otherLimit = calcWelfareAllowanceLimitObligorYen(other.allowanceFuyo);
  const tccaOK = specialChildAllowance.incomeEligible;
  // 障害児福祉手当の本人は無所得の児童。本人は限度額超、扶養義務者は限度額以上で停止。
  const tcca = specialChildAllowance.annualYen;
  // 特児の判定結果は流用せず、児福の生計維持者には児福の扶養義務者の所得算式・限度額を適用する。
  const maintainers = [[claimantId,claimant],[spouseId,other]].filter(([id])=>maintainerId==="both" || id===maintainerId)
    .map(([id,tax])=>({id,incomeYen:tax.welfareMaintainerIncomeYen,dependentCount:tax.allowanceFuyo}));
  const welfareChildren = children.map((c,i)=>calculateDisabledChildWelfareAllowance({eligible:c.welfareEligible,
    recipient:{id:"child"+(i+1), incomeYen:0, dependentCount:0}, spouse:null, maintainers}));
  const welfareOK = welfareChildren.every(c=>c.incomeEligible);
  const welfare = welfareChildren.reduce((sum,c)=>sum+c.annualYen,0);
  // 第3子以降は出生順（高年齢順）。年齢でソートしても子どもごとの入力対応は維持される。
  const childAllowance = [...children].sort((a,b)=>b.age-a.age).reduce((s,c,i)=>s+(i>=2 ? 30000 : c.age<3 ? 15000 : 10000),0)*12;
  return {tcca, welfare, childAllowance, specialChildAllowance, welfareChildren, additionalSupportedCount, claimantLimitYen:limit, obligorLimitYen:obligorLimit, otherLimitYen:otherLimit, tccaOK, welfareOK};
}

/**
 * 在宅の同一保護者・同一負担区分に限り、利用額と世帯の最終月額上限の小さい方を年換算する。
 * @param {Array<object>} children 児童別の年齢、多子軽減等適用後の通所・上限前負担（円／月）。
 * @param {number} otherServiceMonthlyYen 同じ保護者・上限下にあるその他の合算対象額（円／月）。
 * @param {Array<object>} adults 両親が個別に算定したサービス判定用所得割と課税状況。
 * @returns {object} 年間最終負担（円）、月額・上限（円／月）、判定所得割（円／年）。
 */
function revisionServiceBurden(children, otherServiceMonthlyYen, adults) {
  const levy = adults.reduce((sum,t)=>sum+t.serviceLevyYen,0);
  const cap = getChildDayServiceCapYen(levy, adults.some(t=>t.serviceTaxable));
  // 各児入力は多子軽減等を適用した後・上限前。3～5歳は年度当初年齢に基づく無償対象通所のみを仮定。
  const day = children.reduce((sum,c)=>sum + (c.serviceUser && !isFreeDayServiceAge(c.age) ? c.serviceAmountYen : 0),0);
  const monthly = Math.min(day+otherServiceMonthlyYen,cap);
  // 就学前無償だけの利用を除く。利用料0円という入力も「利用していない」ことは意味しない。
  const hasCapApplicableServiceUse=otherServiceMonthlyYen>0 || children.some(c=>c.serviceUser && !isFreeDayServiceAge(c.age));
  return {annual:monthly*12, monthly, dayMonthlyBeforeCapYen:day, otherServiceMonthlyYen, householdCapYen:cap,
    assessmentLevyYen:levy, hasCapApplicableServiceUse};
}

/**
 * 任意の二給与点に対する収支を返す計算器を用意する。世帯条件を固定し、同じ給与の基礎計算を再利用する。
 * @param {object} input validateRevisionHouseholdで検証する世帯条件。
 * @returns {object} evaluate(世帯主給与, 配偶者給与) を持つ計算器。二つの引数の単位は万円／年。
 */
export function createRevisionCalculator(input) {
  const {children, otherServiceMonthlyYen, protocol, roles, insurance} = validateRevisionHousehold(input);
  const archived = protocol === "legacy-v2";
  const steady2029 = protocol === "paper-2029";
  const wages = new Map();
  /** 一度計算した個人給与の基礎値を二つの軸で共有する。親の扶養・給付の判定値は共有しない。 */
  function wageRecord(w) {
    requireInteger(w,0,MAX_WAGE,"給与収入（万円、1万円刻み）");
    if (!wages.has(w)) wages.set(w, archived ? {...revisionSalaryRecord(w), ...archivedPremiums(w)} : revisionSalaryRecord(w,steady2029));
    return wages.get(w);
  }
  /**
   * 同じ給与点で全制度を評価し、年間収支（万円）と各判定（円）を返す。
   * @param {number} headWan 世帯主の年間給与収入（整数、0～1,500万円）。
   * @param {number} spouseWan 配偶者の年間給与収入（整数、0～1,500万円）。
   * @returns {object} 試算対象制度のみの年間可処分所得（未算定ならnull）、内訳（万円）、判定根拠。
   */
  function evaluate(headWan, spouseWan) {
    const headWage = wageRecord(headWan), spouseWage = wageRecord(spouseWan);
    // 法3条2項の「主として生計を維持する者」を本試算では給与収入の多い親で近似（同額は世帯主）。
    // 本試算ではこの親に子全員の税扶養と配偶者等控除の判定を割り当てる。控除額には別途双方の所得要件を適用。
    const higher = headWan >= spouseWan ? "head" : "spouse";
    const recipient = archived || steady2029 ? higher : roles.allowanceRecipient;
    const filing = archived || roles.spouseDeductionClaimant==="highest-salary" ? higher : roles.spouseDeductionClaimant;
    const taxDependentOf = children.map(c => archived || steady2029 ? higher : c.taxDependentOf);
    const maintainerId = roles.welfareMaintainer === "highest-salary" ? higher : roles.welfareMaintainer;
    const assigned = {allowanceRecipient:recipient, spouseDeductionClaimant:filing, taxDependentOf,
      ...(steady2029 ? {allowanceRecipientAssumption:"highest-salary",welfareMaintainer:maintainerId,welfareMaintainerAssumption:roles.welfareMaintainer} : {})};
    const fixedInsurance = steady2029 ? calculateHouseholdInsurance2029({headAnnualYen:headWage.salaryYen,spouseAnnualYen:spouseWage.salaryYen}) : null;
    if (fixedInsurance?.status === "excluded") return {status:"excluded", protocol, reasons:["夫婦とも給与0円の原点は試算対象外です。"], recipient,
      studyDisposableWan:null, disposableWan:null, breakdown:null, details:{insurance:fixedInsurance,roles:assigned}};
    const coverage = steady2029 ? {known:true, protocol, reasons:[],
      head:{...fixedInsurance.head,social:fixedInsurance.head.annual.totalYen,prevSocial:fixedInsurance.head.annual.totalYen},
      spouse:{...fixedInsurance.spouse,social:fixedInsurance.spouse.annual.totalYen,prevSocial:fixedInsurance.spouse.annual.totalYen}} :
      archived ? {known:true, protocol, head:{social:headWage.social,prevSocial:headWage.prevSocial},
      spouse:{social:spouseWage.social,prevSocial:spouseWage.prevSocial}, reasons:[]} :
      calculateHouseholdCoverage(insurance, headWan, spouseWan);
    if (!coverage.known) return {status:"insufficient", protocol, reasons:coverage.reasons, recipient,
      studyDisposableWan:null, disposableWan:null, breakdown:null, details:{coverage,insurance:coverage,roles:assigned}};
    const head = {...headWage, social:coverage.head.social, prevSocial:coverage.head.prevSocial};
    const spouse = {...spouseWage, social:coverage.spouse.social, prevSocial:coverage.spouse.prevSocial};
    const ht = revisionParentTax(head,spouse,children.filter((_,i)=>taxDependentOf[i] === "head"),filing === "head", archived);
    const st = revisionParentTax(spouse,head,children.filter((_,i)=>taxDependentOf[i] === "spouse"),filing === "spouse", archived);
    // 論文用では全児童が受給資格者の税扶養。税扶養外の維持児童として重複加算しない。
    const additional = steady2029 ? 0 : children.filter((c,i)=>taxDependentOf[i] !== recipient && c.maintainedByRecipient).length;
    if (steady2029) assigned.additionalMaintainedChildren = additional;
    const benefits = revisionCashBenefits(children,recipient === "head" ? ht : st,recipient === "head" ? st : ht, additional, recipient, maintainerId);
    const service = revisionServiceBurden(children,otherServiceMonthlyYen,[ht,st]);
    const salary = head.salaryYen+spouse.salaryYen, tax = ht.totalTaxYen+st.totalTaxYen, social = head.social+spouse.social;
    const disposableWan = (salary-tax-social+benefits.tcca+benefits.welfare+benefits.childAllowance-service.annual)/WAN;
    return {status:"calculated", protocol, reasons:[], studyDisposableWan:disposableWan, disposableWan, recipient,
      breakdown:{ salaryWan:salary/WAN, taxWan:tax/WAN, socialWan:social/WAN, tccaWan:benefits.tcca/WAN,
        welfareWan:benefits.welfare/WAN, childAllowanceWan:benefits.childAllowance/WAN, serviceWan:service.annual/WAN },
      ...(steady2029 ? {basis:{salaryTaxPolicy:PAPER_SALARY_POLICY_2029.id,
        insuranceRateProxyFiscalYear:fixedInsurance.policy.proxyRateFiscalYear, indexedAllowanceAmountsAsOf:"2026-04"}} : {}),
      details:{headTax:ht, spouseTax:st, benefits, service, coverage,insurance:fixedInsurance ?? coverage,roles:assigned}};
  }
  return {evaluate};
}

/**
 * 隣り合う給与点を比較し、可処分所得の逆転とその初回回復を検出する。
 * @param {Array<object>} points 同一世帯について片方の給与を0万円から1万円ずつ増加させて評価した点列。
 * @returns {object} valuesは各点の年額（万円）。fallsは福祉制度の給付減・負担増を伴う逆転、allFallsは税・保険料のみの逆転を含む。給付の変動額と所得の下落幅は異なる。
 */
export function classifyRevisionFalls(points) {
  const values = points.map(p => {
    if (!p || p.status === "insufficient") return null;
    const value = p.disposableWan;
    return Number.isFinite(value) ? value : null;
  });
  // 年間収支は円の整数。万円での二進小数の減算により比較・下落幅がぶれないようにする。
  const yen = values.map(v => v === null ? null : Math.round(v*WAN));
  const allFalls = [];
  for (let i=1; i<points.length; i++) {
    if (yen[i] === null || yen[i-1] === null || yen[i] >= yen[i-1]) continue;
    const a=points[i-1].breakdown, b=points[i].breakdown;
    const causes=[];
    if (b.tccaWan < a.tccaWan) causes.push("特別児童扶養手当");
    if (b.welfareWan < a.welfareWan) causes.push("障害児福祉手当");
    if (b.serviceWan > a.serviceWan) causes.push("障害福祉サービス・障害児通所支援の利用者負担");
    let j = i+1;
    // 取り戻す対象は「直前の給与点での世帯収支」。手当額だけの穴埋めではない。
    while (j<yen.length && yen[j] !== null && yen[j]<yen[i-1]) j++;
    const gap = j<yen.length && yen[j] === null;
    allFalls.push({at:i,delta:(yen[i-1]-yen[i])/WAN,recovered:j<yen.length && !gap ? j : null, ...(gap ? {recoveryStatus:"gap"} : {}),causes});
  }
  return {values, falls:allFalls.filter(f=>f.causes.length), allFalls};
}

/**
 * 二つの給与軸のどちらかを固定し、0～1,500万円（両端を含む）の全点で逆転の位置・幅を得る。
 * @param {object} calculator createRevisionCalculatorで条件を確定した計算器。
 * @param {string} axis 変化させる給与軸（headまたはspouse）。
 * @param {number} fixedWan 他方の給与、万円／年。
 * @returns {object} classifyRevisionFallsと同じ、1万円断面と下落・回復の記録。
 */
export function evaluateRevisionSlice(calculator, axis, fixedWan) {
  if (!["head","spouse"].includes(axis)) throw new RangeError("断面の給与軸が不正です。");
  const points=[];
  for (let i=0;i<=MAX_WAGE;i++) points.push(axis === "head" ? calculator.evaluate(i,fixedWan) : calculator.evaluate(fixedWan,i));
  return classifyRevisionFalls(points);
}
