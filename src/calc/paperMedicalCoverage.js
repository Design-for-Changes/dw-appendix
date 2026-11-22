// 考察用。船橋市の児童に係る二つの制度の判定を並べる。家計の金額計算からは呼ばない。
export const funabashiMedicalSources=Object.freeze({
  m01:"https://www.city.funabashi.lg.jp/kenkou/shougaisha/004/01/p009691.html",
  m01Exception:"https://www.city.funabashi.lg.jp/kenkou/shougaisha/004/01/p009691_d/fil/tokurei.pdf",
  child:"https://www.city.funabashi.lg.jp/kodomo/teate/002/p004273a.html",
});
const thresholdYen=235000;
const claimKinds=["ordinary-insured","uninsured","insurer-paid-portion","school-sport-covered","third-party"];

// 金額例ではなく、課税世帯の児童1人の通常の保険診療に限った条件例。受給者証・手帳は独立に確認する。
export const standardFunabashiChildVisit=Object.freeze({
  funabashiRegistered:true, insured:true, publicAssistance:false, ageAtVisit:10,
  m01DisabilityConfirmed:true, m01ExceptionConfirmed:false,
  claimKind:"ordinary-insured", otherPriorPublicAid:false, childHouseholdLevyTaxable:true,
  visitType:"outpatient", ordinalAtSameProviderInMonth:1,
});

/** M01の資格を保険単位・調整済み所得割で判定。給与・通所の課税額・特児認定からは推定しない。 */
function severeMedicalStatus(p) {
  if (p.funabashiRegistered===false || p.insured===false || p.publicAssistance===true || p.m01DisabilityConfirmed===false) return "対象外";
  if (p.funabashiRegistered!==true || p.insured!==true || p.publicAssistance!==false || p.m01DisabilityConfirmed!==true) return null;
  const levy=p.adjustedInsuranceUnitLevyYen;
  if (levy==null) return null;
  if (levy<thresholdYen) return "対象";
  if (p.m01ExceptionConfirmed===true) return "対象（特例）";
  if (p.m01ExceptionConfirmed===false) return "対象外（所得制限）";
  return null;
}

/** 児童向け助成の年齢は、18歳到達後最初の3月31日まで。18歳は年度末との関係を別に入力する。 */
function childAgeEligible(p) {
  if (p.ageAtVisit==null) return null;
  if (p.ageAtVisit<18) return true;
  return p.ageAtVisit===18 ? p.withinEndOfFiscalYearAt18 ?? null : false;
}

/** 対象本人と当該請求費目の二つの要件を判定。保険者給付のある受診全体ではなく、その給付分が対象外。 */
function childMedicalStatus(p) {
  const age=childAgeEligible(p);
  if (p.funabashiRegistered===false || p.insured===false || p.publicAssistance===true || age===false) return "対象外";
  if (p.claimKind && p.claimKind!=="ordinary-insured") return "対象外（当該費用）";
  if (p.funabashiRegistered!==true || p.insured!==true || p.publicAssistance!==false || age!==true || !p.claimKind) return null;
  return "対象";
}

/** 子ども医療利用時の自己負担区分のみ。受給券の使用・他公費適用後の実際の窓口負担を計算しない。 */
function childCopayClass(p) {
  if (p.visitType==="pharmacy" || p.childHouseholdLevyTaxable===false) return "無料区分";
  const freeAfter=p.visitType==="outpatient"?6:p.visitType==="inpatient"?11:null;
  if (freeAfter==null || p.ordinalAtSameProviderInMonth==null) return null;
  if (p.ordinalAtSameProviderInMonth>=freeAfter) return "無料区分";
  return p.childHouseholdLevyTaxable===true ? "一部負担区分" : null;
}

/**
 * 船橋市の重度心身障害者医療費助成(M01)の受給要件と、子ども医療の当該費用の適用を独立に判定。
 * @param {object} p 船橋市に住民登録があるか・保険加入・生活保護・児童の年齢と診療条件。
 * adjustedInsuranceUnitLevyYenは、当該児童と同一医療保険単位の寄附金税額控除戻し等を反映した市町村民税所得割（円）。
 * 生計や住所が同じでも異なる医療保険単位は合算しない。m01DisabilityConfirmedは手帳等の所定要件の確認結果。
 * m01ExceptionConfirmedは市の高額治療継続者特例の該当可否（単なる自立支援医療受給とは別）。未確認はnull。
 * childHouseholdLevyTaxableは子ども医療所定の世帯の所得割（定額減税を加味しない）の課税有無。
 * @returns {object} m01Statusは児童の受給要件、childStatusは指定した費目の対象・対象外、childCopayClassは子ども医療利用時の区分。
 * coordinationは両方の判定を踏まえた利用可能性の記述（券の選択・実支払・家計差額の推定ではない）。不明はnull。
 */
export function assessFunabashiMedicalCoverage(p={}) {
  if (!p || typeof p!=="object" || Array.isArray(p)) throw new TypeError("医療費助成の判定条件を指定してください。");
  for (const key of ["funabashiRegistered","insured","publicAssistance","withinEndOfFiscalYearAt18","m01DisabilityConfirmed",
    "m01ExceptionConfirmed","otherPriorPublicAid","childHouseholdLevyTaxable"]) {
    if (p[key]!=null && typeof p[key]!=="boolean") throw new TypeError(key+"は真偽値または未確認です。");
  }
  for (const [key,min,max] of [["ageAtVisit",0,19],["adjustedInsuranceUnitLevyYen",0,Number.MAX_SAFE_INTEGER],
    ["ordinalAtSameProviderInMonth",1,Number.MAX_SAFE_INTEGER]]) {
    if (p[key]!=null && (!Number.isSafeInteger(p[key]) || p[key]<min || p[key]>max)) throw new RangeError(key+"の範囲外です。");
  }
  if (p.claimKind!=null && !claimKinds.includes(p.claimKind)) throw new TypeError("未定義の費目区分です。");
  if (p.visitType!=null && !["outpatient","inpatient","pharmacy"].includes(p.visitType)) throw new TypeError("未定義の診療区分です。");
  const m01Status=severeMedicalStatus(p),childStatus=childMedicalStatus(p);
  let coordination=null;
  if (childStatus==="対象") {
    if (p.otherPriorPublicAid===true) coordination="他公費優先。残る自己負担は子ども医療で調整しうる";
    else if (p.otherPriorPublicAid===false && m01Status!==null) coordination=m01Status.startsWith("対象外")
      ? "M01対象外・子ども医療は対象" : "両制度の要件に該当（重複計上しない）";
  } else if (childStatus!==null) coordination="子ども医療による代替の対象外";
  return {m01Status,childStatus,childCopayClass:childStatus==="対象"?childCopayClass(p):null,coordination};
}

/** 例示された同一医療保険単位の調整済み所得割2点で、M01境界前後と子ども医療の状態を対照する。 */
export function funabashiMedicalBoundaryExample() {
  return [234900,235000].map(adjustedInsuranceUnitLevyYen=>({adjustedInsuranceUnitLevyYen,
    ...assessFunabashiMedicalCoverage({...standardFunabashiChildVisit,adjustedInsuranceUnitLevyYen})}));
}
