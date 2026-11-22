/** National allowance income restrictions only. No salary, tax, payment or eligibility imports. */
export const ALLOWANCE_SOURCES = Object.freeze({
  law:"https://www.mhlw.go.jp/web/t_doc?dataId=82090000&dataType=0&pageNo=1",
  decree:"https://www.mhlw.go.jp/web/t_doc?dataId=82091000&dataType=0",
  revision2026:"https://www.mhlw.go.jp/web/t_doc?dataId=00td0377&dataType=1&pageNo=1",
  specialKin:"https://www.mhlw.go.jp/web/t_doc?dataId=00tc9387&dataType=1&pageNo=1",
  cityTcca:"https://www.city.funabashi.lg.jp/kenkou/shougaisha/004/03/p042515.html",
  cityChild:"https://www.city.funabashi.lg.jp/kenkou/shougaisha/004/03/p042516.html",
});
export const PROGRAMS = Object.freeze({ TCCA:"specialChildRearingAllowance", CHILD:"disabledChildWelfareAllowance" });
export const ADDITION_CATEGORIES = Object.freeze([
  "ordinary", "elderlyDependent", "sameLivelihoodSpouse70Plus", "specifiedDependent",
  "maintenanceChildOnlyTccaRecipient", "excludedNonDeductibleAge30To69", "specialKinDeductionOnly",
]);
const GROUPS = ["recipient","spouse","supportObligor"];
const LEGAL_ROLES = {
  [PROGRAMS.TCCA]: {
    recipient:["tcca-parent-recipient","tcca-caregiver-recipient"],
    spouse:["tcca-parent-spouse","tcca-caregiver-spouse"],
    supportObligor:["tcca-parent-same-livelihood-obligor","tcca-caregiver-maintaining-obligor"],
  },
  [PROGRAMS.CHILD]: {
    recipient:["disabled-child-recipient"],spouse:["disabled-child-spouse"],supportObligor:["disabled-child-maintaining-obligor"],
  },
};
const known = data => ({status:"known",...data});
const pending = reason => ({status:"pending",reason});
function requireThat(value,message) { if (!value) throw new TypeError(message); }
function nonempty(value) { return typeof value === "string" && value.trim().length > 0; }
function evidenced(value) { return value?.status === "known" && nonempty(value.evidence?.source) && nonempty(value.evidence?.note); }
function context(program,targetMonth,role) {
  requireThat(Object.values(PROGRAMS).includes(program),"Unknown allowance program");
  requireThat(typeof targetMonth === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(targetMonth),"Target benefit month must be YYYY-MM");
  if (role !== undefined) requireThat(GROUPS.includes(role),"Unknown statutory role group");
  const metadata = {program,targetMonth,referenceIncomeYear:2025,prefecturalTaxFiscalYear:2026,
    appliesFrom:"2026-08",appliesThrough:"2027-07",scope:"ordinary-income-restriction-only",
    finalEligibility:"not-assessed",paymentAmount:"not-calculated",disasterException:"not-assessed",
    salaryOrTaxConnection:"not-implemented",sources:ALLOWANCE_SOURCES};
  if (targetMonth < "2026-08" || targetMonth > "2027-07") {
    const {referenceIncomeYear,prefecturalTaxFiscalYear,...supported}=metadata;
    return {...supported,supportedReferenceIncomeYear:referenceIncomeYear,supportedPrefecturalTaxFiscalYear:prefecturalTaxFiscalYear,
      status:"out-of-scope",reason:"Outside confirmed benefit-month window; no extrapolation"};
  }
  return metadata;
}
function operator(program,role) { return program === PROGRAMS.CHILD && role === "recipient" ? ">" : ">="; }
function incomeBasis(program,role) {
  return program === PROGRAMS.TCCA ? "decree-4-and-5" : role === "recipient" ? "decree-4-5-as-modified-by-8-self" : "decree-4-5-as-modified-by-8-counterpart";
}
/** Limit from per-person legal classifications. Array lengths are statutory counts, never inferred ages. */
export function allowanceIncomeLimit2026({program,targetMonth,role,additions,personId}) {
  requireThat(GROUPS.includes(role),"Explicit statutory role group required");
  const ctx=context(program,targetMonth,role);
  if (ctx.status === "out-of-scope") return ctx;
  if (!evidenced(additions)) return pending("Confirmed per-person statutory additions and source required, including all-zero classifications");
  if (additions.referenceIncomeYear !== 2025) return pending("Additions must refer to 2025 statutory classifications");
  if (!nonempty(personId) || !nonempty(additions.personId)) return pending("Person ID missing from statutory additions");
  requireThat(additions.personId === personId,"Addition classifications belong to a different or unspecified person");
  if (!additions.categories || ADDITION_CATEGORIES.some(key => !Array.isArray(additions.categories[key])))
    return pending("Every statutory addition category must be explicit, including empty categories");
  requireThat(Object.keys(additions.categories).every(key => ADDITION_CATEGORIES.includes(key)),"Unknown statutory addition category");
  const seen=new Set();
  for (const key of ADDITION_CATEGORIES) for (const id of additions.categories[key]) {
    if (!nonempty(id)) return pending("Classified-person identity missing from additions");
    requireThat(!seen.has(id),"Addition categories must not overlap or duplicate a person");seen.add(id);
  }
  const counts=Object.fromEntries(ADDITION_CATEGORIES.map(key => [key,additions.categories[key].length]));
  requireThat(!counts.maintenanceChildOnlyTccaRecipient || (program === PROGRAMS.TCCA && role === "recipient"),
    "Law6 maintenance-child exception is exclusive to TCCA recipient");
  let limitYen,baseYen,allElderlyReductionYen=0,ordinaryCount,elderlyCount,specifiedCount;
  if (role === "recipient") {
    baseYen=program === PROGRAMS.TCCA ? 4596000 : 3758000;
    ordinaryCount=counts.ordinary+counts.maintenanceChildOnlyTccaRecipient;
    elderlyCount=counts.elderlyDependent+counts.sameLivelihoodSpouse70Plus;
    specifiedCount=counts.specifiedDependent;
    limitYen=baseYen+ordinaryCount*380000+elderlyCount*480000+specifiedCount*630000;
  } else {
    ordinaryCount=counts.ordinary+counts.sameLivelihoodSpouse70Plus+counts.specifiedDependent;
    elderlyCount=counts.elderlyDependent;specifiedCount=0;
    if (!ordinaryCount && !elderlyCount) {baseYen=6287000;limitYen=baseYen;}
    else {
      baseYen=6323000;allElderlyReductionYen=ordinaryCount === 0 ? 60000 : 0;
      limitYen=baseYen+ordinaryCount*213000+elderlyCount*273000-allElderlyReductionYen;
    }
  }
  requireThat(Number.isSafeInteger(limitYen),"Statutory limit exceeds safe integer range");
  return known({personId,referenceIncomeYear:2025,limitYen,baseYen,counts,rateBandCounts:{ordinary:ordinaryCount,elderly:elderlyCount,specified:specifiedCount},
    allElderlyReductionYen,excludedCount:counts.excludedNonDeductibleAge30To69+counts.specialKinDeductionOnly,
    additions:structuredClone(additions),source:ALLOWANCE_SOURCES.decree});
}
function assignmentFor(program,role,assignment) {
  if (!evidenced(assignment)) return pending("Statutory role/person assignment not confirmed with source");
  if (!nonempty(assignment.personId) || !nonempty(assignment.legalRole)) return pending("Person or statutory legal role missing from assignment");
  requireThat(LEGAL_ROLES[program][role].includes(assignment.legalRole),"Legal role conflicts with program/group; no parent/child/spouse substitution");
  if (role !== "recipient") {
    if (!nonempty(assignment.relativeToRecipientId)) return pending("Counterpart recipient link is missing");
    requireThat(assignment.relativeToRecipientId !== assignment.personId,"Counterpart role must explicitly identify its recipient");
  }
  return structuredClone(assignment);
}
function assessedIncomeFor(program,role,personId,income) {
  if (!evidenced(income)) return pending("Confirmed individual statutory assessed income and source required; zero is not a default");
  if (!nonempty(income.personId)) return pending("Person ID missing from assessed income");
  requireThat(income.personId === personId,"Income belongs to a different person");
  if (income.program !== program || income.role !== role || income.basis !== "statutory-assessed-personal-income" || income.legalBasis !== incomeBasis(program,role))
    return pending("Income basis must match program and role; gross salary, tax display, household sum or another allowance cannot be substituted");
  if (income.referenceIncomeYear !== 2025 || income.prefecturalTaxFiscalYear !== 2026)
    return pending("Confirmed 2025 income / FY2026 prefectural income information required for every month in window");
  if (income.annualYen === null || income.annualYen === undefined) return pending("Statutory assessed income amount is missing");
  requireThat(Number.isSafeInteger(income.annualYen),"Statutory assessed income must be integer yen");
  // Already adjusted statutory income: no additional deduction or floor is applied here.
  return structuredClone(income);
}
/** A confirmed role's individual income comparison, retaining independently pending income/limit layers. */
export function assessAllowancePerson2026({program,targetMonth,role,subject}) {
  requireThat(GROUPS.includes(role),"Explicit statutory role group required");
  const ctx=context(program,targetMonth,role);if (ctx.status === "out-of-scope") return ctx;
  const comparisonOperator=operator(program,role);
  const assignment=assignmentFor(program,role,subject?.assignment);
  const common={program,targetMonth,role,referenceIncomeYear:2025,prefecturalTaxFiscalYear:2026,comparisonOperator,assignment};
  if (assignment.status !== "known") return {...common,...pending(assignment.reason)};
  const personId=assignment.personId;
  const income=assessedIncomeFor(program,role,personId,subject?.income);
  const limit=allowanceIncomeLimit2026({program,targetMonth,role,personId,additions:subject?.additions});
  if (income.status !== "known" || limit.status !== "known") return {...common,personId,income,limit,
    ...pending([income,limit].filter(x=>x.status !== "known").map(x=>x.reason).join("; "))};
  const restricted=comparisonOperator === ">" ? income.annualYen > limit.limitYen : income.annualYen >= limit.limitYen;
  return {...common,personId,income,limit,...known({restriction:restricted ? "restricted" : "not-restricted"}),
    incomeYen:income.annualYen,limitYen:limit.limitYen,source:ALLOWANCE_SOURCES.law};
}
/** Existential confirmed restriction wins over missing family data; all-pass requires complete roles. */
export function evaluateAllowanceIncomeRestriction2026({program,targetMonth,roles}) {
  const ctx=context(program,targetMonth);if (ctx.status === "out-of-scope") return structuredClone(ctx);
  const rows=[],roleGroups={};let complete=true;
  for (const role of GROUPS) {
    const group=roles?.[role];
    const groupComplete=evidenced(group);
    if (!groupComplete) complete=false;
    const subjects=group?.subjects;
    if (subjects !== undefined && subjects !== null) requireThat(Array.isArray(subjects),"Role subjects must be an explicit array");
    if (!Array.isArray(subjects)) complete=false;
    if (groupComplete && Array.isArray(subjects)) {
      if (role === "recipient") requireThat(subjects.length === 1,"A complete recipient role requires exactly one person");
      if (role === "spouse") requireThat(subjects.length <= 1,"Resolve the single statutory spouse before this comparison");
    }
    roleGroups[role]={status:groupComplete && Array.isArray(subjects) ? "known" : "pending",
      completeness:groupComplete && Array.isArray(subjects) ? "complete" : "incomplete",
      knownAbsent:groupComplete && Array.isArray(subjects) && subjects.length === 0,
      evidence:group?.evidence ? structuredClone(group.evidence) : undefined,
      reason:groupComplete && Array.isArray(subjects) ? undefined : group?.reason || "Required role set not confirmed complete"};
    for (const subject of subjects || []) {
      const row=assessAllowancePerson2026({program,targetMonth,role,subject});rows.push(row);
      if (row.status !== "known") complete=false;
    }
  }
  const confirmed=rows.filter(row=>row.assignment.status === "known");const ids=new Set();
  for (const row of confirmed) {requireThat(!ids.has(row.personId || row.assignment.personId),"Same person assigned to multiple income-test roles");ids.add(row.personId || row.assignment.personId);}
  requireThat(confirmed.filter(row=>row.role === "recipient").length <= 1,"Conflicting confirmed recipients; resolve roles first");
  requireThat(confirmed.filter(row=>row.role === "spouse").length <= 1,"Conflicting confirmed statutory spouses");
  requireThat(new Set(confirmed.filter(row=>row.role !== "recipient").map(row=>row.assignment.relativeToRecipientId)).size <= 1,
    "Confirmed counterparts refer to different recipients");
  const recipient=confirmed.find(row=>row.role === "recipient");
  if (recipient) {
    const recipientId=recipient.assignment.personId;
    for (const row of confirmed.filter(row=>row.role !== "recipient")) {
      requireThat(row.assignment.relativeToRecipientId === recipientId,"Counterpart points to a different recipient");
      if (program === PROGRAMS.TCCA) {
        const caregiver=recipient.assignment.legalRole === "tcca-caregiver-recipient";
        requireThat(row.assignment.legalRole.startsWith(caregiver ? "tcca-caregiver-" : "tcca-parent-"),"Parent/caregiver legal routes conflict");
      }
    }
  }
  const restricted=rows.filter(row=>row.status === "known" && row.restriction === "restricted");
  const result=restricted.length ? known({restriction:"restricted"}) : complete ? known({restriction:"not-restricted"}) : pending("No confirmed restriction, but role sets or individual income/additions are incomplete");
  return structuredClone({...ctx,...result,roleGroups,rows,allRequiredRolesAndInputsComplete:complete,
    confirmedRestrictedPersonIds:restricted.map(row=>row.personId),
    interpretation:"Income restriction only; no-income-restriction does not establish entitlement or payment"});
}
