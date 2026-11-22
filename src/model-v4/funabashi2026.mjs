import { salaryIncomeBeforeAdjustment2025 } from "./salaryIncome2025.mjs";
import { createCase, pending } from "./core.mjs";

export const TAX2026_SOURCES = Object.freeze({
  salary: "https://www.city.funabashi.lg.jp/kurashi/zei/007/003/p000868.html",
  deductions: "https://www.city.funabashi.lg.jp/kurashi/zei/007/003/p000869.html",
  credits: "https://www.city.funabashi.lg.jp/kurashi/zei/007/003/p028458.html",
  rounding: "https://www.city.funabashi.lg.jp/kurashi/zei/007/003/p000866.html",
  nonTaxable: "https://www.city.funabashi.lg.jp/kurashi/zei/007/001/p000865.html",
  adjustment: "https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1411.htm",
  salaryRounding: "https://www.city.mito.lg.jp/page/3322.html",
  adjustmentRounding: "https://www.city.kofu.lg.jp/k034/p001907.html",
  period: "https://www.mhlw.go.jp/web/t_doc?dataId=82061000&dataType=0&pageNo=2",
  serviceRule: "https://www.mhlw.go.jp/web/t_doc?dataId=82062000&dataType=0&pageNo=3",
  restorationExample: "https://www.cao.go.jp/bunken-suishin/teianbosyu/doc/tb_h28fu_11mhlw_300e.pdf",
});
const ok = data => ({ status: "known", ...data });
function requireThat(condition,message) { if (!condition) throw new TypeError(message); }
function yen(n) { requireThat(Number.isSafeInteger(n) && n >= 0,"Expected nonnegative integer yen"); }
function hasEvidence(d) { return d?.status === "known" && typeof d.evidence === "string" && d.evidence.trim().length > 0; }
function amount(d) {
  if (!hasEvidence(d)) return pending("Explicit evidenced amount required, including zero");
  yen(d.amountYen); return d;
}
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);

/** 2025 salary -> 2026 resident-tax salary income. No allowance-side 100000 adjustment. */
export function salaryIncome2025({ incomeYear, salaryYen, adjustmentQualification }) {
  if (incomeYear !== 2025) return pending("Only income year 2025 / resident tax FY2026 is implemented");
  if (salaryYen === undefined) return pending("Salary for 2025 is missing");
  yen(salaryYen);
  const beforeAdjustmentYen = salaryIncomeBeforeAdjustment2025(salaryYen);
  let incomeAdjustmentDeductionYen = 0;
  if (salaryYen > 8500000) {
    if (!hasEvidence(adjustmentQualification) || typeof adjustmentQualification.qualifies !== "boolean")
      return pending("Income-adjustment qualification must be explicit; tax-dependent allocation does not determine it");
    if (adjustmentQualification.qualifies) incomeAdjustmentDeductionYen = Math.ceil((Math.min(salaryYen,10000000) - 8500000) / 10);
  }
  return ok({ incomeYear:2025, residentTaxFiscalYear:2026, salaryYen, salaryIncomeBeforeAdjustmentYen:beforeAdjustmentYen,
    incomeAdjustmentDeductionYen, salaryIncomeYen:beforeAdjustmentYen-incomeAdjustmentDeductionYen,
    sources:[TAX2026_SOURCES.salary,TAX2026_SOURCES.adjustment,TAX2026_SOURCES.salaryRounding,TAX2026_SOURCES.adjustmentRounding] });
}

/** R8 resident-tax table; conditions/election are checked separately by household orchestration. */
export function spouseDeduction2026({ residentTaxFiscalYear, taxpayerTotalIncomeYen, spouseTotalIncomeYen, spouseAgeOn20251231 }) {
  if (residentTaxFiscalYear !== 2026) return pending("Spouse deduction table implemented only for FY2026");
  yen(taxpayerTotalIncomeYen); yen(spouseTotalIncomeYen);
  requireThat(Number.isInteger(spouseAgeOn20251231) && spouseAgeOn20251231 >= 18,"Adult spouse age required");
  if (taxpayerTotalIncomeYen > 10000000 || spouseTotalIncomeYen > 1330000)
    return ok({ kind:"none", deductionYen:0, personalDifferenceYen:0, source:TAX2026_SOURCES.deductions });
  const col = taxpayerTotalIncomeYen <= 9000000 ? 0 : taxpayerTotalIncomeYen <= 9500000 ? 1 : 2;
  if (spouseTotalIncomeYen <= 580000) {
    const elderly = spouseAgeOn20251231 >= 70;
    return ok({ kind:"spouse", deductionYen:(elderly ? [380000,260000,130000] : [330000,220000,110000])[col],
      personalDifferenceYen:(elderly ? [100000,60000,30000] : [50000,40000,20000])[col], source:TAX2026_SOURCES.deductions });
  }
  const table = [
    [1000000,[330000,220000,110000]], [1050000,[310000,210000,110000]],
    [1100000,[260000,180000,90000]], [1150000,[210000,140000,70000]],
    [1200000,[160000,110000,60000]], [1250000,[110000,80000,40000]],
    [1300000,[60000,40000,20000]], [1330000,[30000,20000,10000]],
  ];
  return ok({ kind:"special-spouse", deductionYen:table.find(([max]) => spouseTotalIncomeYen <= max)[1][col],
    personalDifferenceYen:0, source:TAX2026_SOURCES.deductions, creditSource:TAX2026_SOURCES.credits });
}

/** General adult, salary-only, total income <=10m. Intermediate city levy before supplementary Art3-3 low-income relief.
 * Complete final ordinary FY2026 tax via residentTax2026/researchBreakdown2025 before using threshold-adjacent amounts. */
export function municipalTax2026({ totalIncomeYen, socialInsurancePaid, otherDeductionsAbsent, otherTaxCreditsAbsent,
  spouseDeduction, childDeductions, dependentCount, ordinaryAdultResidentConfirmed }) {
  yen(totalIncomeYen);
  if (totalIncomeYen > 10000000) return pending("Full municipal tax route currently limited to total income <= 10000000 yen");
  if (!hasEvidence(ordinaryAdultResidentConfirmed) || ordinaryAdultResidentConfirmed.value !== true)
    return pending("Adult resident with no special non-taxability grounds must be explicitly confirmed");
  for (const d of [otherDeductionsAbsent,otherTaxCreditsAbsent]) {
    if (!hasEvidence(d) || d.absent !== true) return pending("Other deductions/credits missing or outside this slice; no zero substituted");
  }
  const paid = amount(socialInsurancePaid); if (paid.status !== "known") return paid;
  if (spouseDeduction?.status !== "known") return pending("Spouse deduction/election unconfirmed");
  requireThat(Array.isArray(childDeductions),"Explicit child deductions required");
  requireThat(Number.isInteger(dependentCount) && dependentCount >= 0,"Explicit dependent count required");
  yen(spouseDeduction.deductionYen); yen(spouseDeduction.personalDifferenceYen);
  childDeductions.forEach(d => { yen(d.deductionYen); yen(d.personalDifferenceYen); });
  const basicDeductionYen = 430000;
  const totalDeductionYen = basicDeductionYen + paid.amountYen + spouseDeduction.deductionYen + childDeductions.reduce((sum,d) => sum+d.deductionYen,0);
  const taxableBeforeRoundingYen = Math.max(0,totalIncomeYen-totalDeductionYen);
  const taxableIncomeYen = Math.floor(taxableBeforeRoundingYen/1000)*1000;
  const personalDifferenceYen = 50000 + spouseDeduction.personalDifferenceYen + childDeductions.reduce((sum,d) => sum+d.personalDifferenceYen,0);
  const adjustmentBaseYen = taxableIncomeYen <= 2000000 ? Math.min(personalDifferenceYen,taxableIncomeYen)
    : Math.max(50000,personalDifferenceYen-(taxableIncomeYen-2000000));
  // Municipal share is 3%, not the full municipal + prefectural credit of 5%.
  const municipalAdjustmentCreditYen = adjustmentBaseYen * 3/100;
  const perCapitaExemptThresholdYen = dependentCount ? 350000*(1+dependentCount)+310000 : 450000;
  const incomeLevyExemptThresholdYen = dependentCount ? 350000*(1+dependentCount)+420000 : 450000;
  const perCapitaTaxable = totalIncomeYen > perCapitaExemptThresholdYen;
  const incomeLevyExempt = totalIncomeYen <= incomeLevyExemptThresholdYen;
  const municipalLevyBeforeCreditsYen = taxableIncomeYen*6/100;
  const municipalLevyAfterAdjustmentBeforeRoundingYen = incomeLevyExempt ? 0 : Math.max(0,municipalLevyBeforeCreditsYen-municipalAdjustmentCreditYen);
  const municipalIncomeLevyYen = Math.floor(municipalLevyAfterAdjustmentBeforeRoundingYen/100)*100;
  return ok({ referenceIncomeYear:2025,residentTaxFiscalYear:2026,totalIncomeYen,basicDeductionYen,
    socialInsurancePaidYen:paid.amountYen,spouseDeduction,childDeductions,totalDeductionYen,taxableBeforeRoundingYen,taxableIncomeYen,
    personalDifferenceYen,municipalAdjustmentCreditYen,municipalLevyBeforeCreditsYen,municipalLevyAfterAdjustmentBeforeRoundingYen,
    municipalIncomeLevyYen, serviceBasisLevyBeforeOldDependentReliefYen:municipalIncomeLevyYen,
    serviceLevyBasis:"after-adjustment-before-disregarded-credits",
    taxCategory:perCapitaTaxable ? "taxable" : "non-taxable",perCapitaTaxable,incomeLevyExempt,
    municipalPerCapitaYen:perCapitaTaxable ? 3000 : 0,perCapitaExemptThresholdYen,incomeLevyExemptThresholdYen,
    scope:"municipal-income-levy-only; no prefectural tax, forest tax or disposable income",
    evidence:"Computed FY2026 salary-only municipal levy; no credits other than adjustment confirmed",
    sources:[TAX2026_SOURCES.deductions,TAX2026_SOURCES.credits,TAX2026_SOURCES.rounding,TAX2026_SOURCES.nonTaxable] });
}

/** Post-tax adjustment, per taxpayer. No change to the tax assessment itself. */
export function oldDependentRelief2026({ municipalLevyYen, declarations }) {
  yen(municipalLevyYen);
  if (!Array.isArray(declarations)) return pending("Explicit old-definition dependent declarations required");
  declarations.forEach(d => requireThat(d && typeof d.childId === "string" && d.childId.trim().length > 0,"Explicit dependent ID required"));
  const ids = declarations.map(d => d.childId);
  requireThat(new Set(ids).size === ids.length,"Duplicate dependent relief declaration");
  let reliefYen = 0;
  for (const d of declarations) {
    if (!hasEvidence(d) || typeof d.qualifiesUnderOldDefinition !== "boolean") return pending("Old-definition dependent qualification unconfirmed");
    requireThat(Number.isInteger(d.ageOn20251231) && d.ageOn20251231 >= 0,"Dependent age at 2025-12-31 required");
    if (d.qualifiesUnderOldDefinition) reliefYen += d.ageOn20251231 < 16 ? 19800 : d.ageOn20251231 < 19 ? 7200 : 0;
  }
  return ok({ municipalLevyYen,oldDependentReliefYen:reliefYen,adjustedMunicipalLevyYen:Math.max(0,municipalLevyYen-reliefYen),
    source:TAX2026_SOURCES.serviceRule, exampleSource:TAX2026_SOURCES.restorationExample });
}

/** Confirmed tax information -> FY2026 day-service assessment. Missing members are never omitted. */
export function dayServiceAssessment2026({ taxRows, householdMemberIds, declarationsByPerson }) {
  if (!hasEvidence(householdMemberIds) || !Array.isArray(householdMemberIds.ids)) return pending("Complete service-assessment household membership must be confirmed");
  requireThat(new Set(householdMemberIds.ids).size === householdMemberIds.ids.length && householdMemberIds.ids.length > 0,"Unique household members required");
  if (!taxRows || !same(Object.keys(taxRows).sort(),[...householdMemberIds.ids].sort())) return pending("Tax information required for every household member");
  const seen = new Set(); const byPerson = {};
  for (const id of householdMemberIds.ids) {
    const t = taxRows[id];
    if (!hasEvidence(t) || t.referenceIncomeYear !== 2025 || t.residentTaxFiscalYear !== 2026)
      return pending("Confirmed FY2026 tax information missing for household member");
    if (!["taxable","non-taxable"].includes(t.taxCategory)) return pending("Unsupported or missing tax category");
    if (t.serviceLevyBasis !== "after-adjustment-before-disregarded-credits") return pending("Service tax-credit addback basis not confirmed; tax collection amount cannot be reused");
    yen(t.serviceBasisLevyBeforeOldDependentReliefYen);
    requireThat(t.taxCategory !== "non-taxable" || t.serviceBasisLevyBeforeOldDependentReliefYen === 0,"Non-taxable category conflicts with positive levy");
    const list = declarationsByPerson?.[id];
    if (!Array.isArray(list)) return pending("Dependent declarations missing for household member");
    for (const d of list) { requireThat(!seen.has(d.childId),"Child claimed by multiple taxpayers for old dependent relief"); seen.add(d.childId); }
    const r = oldDependentRelief2026({ municipalLevyYen:t.serviceBasisLevyBeforeOldDependentReliefYen,declarations:list });
    if (r.status !== "known") return r;
    byPerson[id] = r;
  }
  return ok({ basis:"adjusted-household-municipal-income-levy",referenceIncomeYear:2025,residentTaxFiscalYear:2026,
    appliesFrom:"2026-07",appliesThrough:"2027-06",
    taxCategory:householdMemberIds.ids.some(id => taxRows[id].taxCategory === "taxable") ? "taxable" : "non-taxable",
    adjustedMunicipalLevyYen:Object.values(byPerson).reduce((sum,r) => sum+r.adjustedMunicipalLevyYen,0),byPerson,
    evidence:"FY2026 municipal levy after ordinary adjustment credit; old-dependent relief applied per taxpayer under Rule18-3-2",
    periodEvidence:TAX2026_SOURCES.period, sources:[TAX2026_SOURCES.period,TAX2026_SOURCES.serviceRule] });
}

/** Two salary histories -> municipal intermediate rows and service input before supplementary low-income relief.
 * Research/full annual consumers must use the residentTax2026 completion layer for the low-income band. */
export function calculateFunabashi2026(input, { incomeYear=2025,residentTaxFiscalYear=2026 } = {}) {
  if (incomeYear !== 2025 || residentTaxFiscalYear !== 2026) return { salaryByPerson:pending("Unsupported income/tax year"),
    municipalTaxByPerson:pending("Only 2025 income -> FY2026 is implemented"),dayServiceAssessment:pending("Unsupported year; no FY2027 extrapolation") };
  const c = createCase(input); const facts = c.taxFactsByIncomeYear?.[2025];
  const salaryByPerson = Object.fromEntries(c.parents.map(p => [p.personId,salaryIncome2025({ incomeYear:2025,
    salaryYen:p.annualSalaryYenByIncomeYear[2025],adjustmentQualification:facts?.byPerson?.[p.personId]?.incomeAdjustmentQualification })]));
  const stop = reason => ({ referenceIncomeYear:2025,residentTaxFiscalYear:2026,salaryByPerson,
    municipalTaxByPerson:pending(reason),dayServiceAssessment:pending(reason) });
  if (Object.values(salaryByPerson).some(r => r.status !== "known")) return stop("Salary income/adjustment eligibility unconfirmed");
  if (!facts || !hasEvidence(facts.householdScope) || facts.householdScope.profile !== "married-two-salary-parents-zero-income-minor-children")
    return stop("Explicit supported household/tax scope required");
  if (!hasEvidence(facts.spouseElection) || !(facts.spouseElection.claimantId === null || c.parents.some(p => p.personId === facts.spouseElection.claimantId)))
    return stop("Explicit spouse deduction election required; never select by salary rank");
  if (!hasEvidence(facts.marriageConditions) || facts.marriageConditions.sameLivelihoodAndNoBusinessEmployeeOrOtherClaimant !== true)
    return stop("Spouse deduction conditions unconfirmed");
  if (!same(Object.keys(facts.byPerson || {}).sort(),c.parents.map(p => p.personId).sort()) ||
      !same(Object.keys(facts.children || {}).sort(),c.children.map(ch => ch.personId).sort())) return stop("Complete person/child tax facts required");
  const childDeductionsByPerson = Object.fromEntries(c.parents.map(p => [p.personId,[]]));
  const declarationsByPerson = Object.fromEntries(c.parents.map(p => [p.personId,[]]));
  const childCounts = Object.fromEntries(c.parents.map(p => [p.personId,0]));
  for (const child of c.children) {
    const f = facts.children[child.personId];
    if (!hasEvidence(f) || !Number.isInteger(f.ageOn20251231) || f.ageOn20251231 < 0 || f.ageOn20251231 > 18 ||
        f.totalIncomeYen !== 0 || f.sameLivelihoodNoBusinessEmployee !== true) return stop("Child facts missing or outside zero-income age0..18 scope");
    if (!["none","ordinary","special","cohabiting-special"].includes(f.disabilityCategory)) return stop("Child disability classification missing/unsupported");
    const allocation = c.taxDependentsByIncomeYear[2025]?.[child.personId];
    if (allocation?.status !== "known") return stop("Tax-dependent allocation unconfirmed");
    if (allocation.claimantId === null) continue;
    const id = allocation.claimantId; childCounts[id]++;
    const disability = { none:[0,0],ordinary:[260000,10000],special:[300000,100000],"cohabiting-special":[530000,220000] }[f.disabilityCategory];
    childDeductionsByPerson[id].push({ childId:child.personId,kind:"disability",deductionYen:disability[0],personalDifferenceYen:disability[1] });
    childDeductionsByPerson[id].push({ childId:child.personId,kind:"dependent",deductionYen:f.ageOn20251231 < 16 ? 0 : 330000,
      personalDifferenceYen:f.ageOn20251231 < 16 ? 0 : 50000 });
    const declaration = f.oldDefinitionDependent;
    declarationsByPerson[id].push({ ...(declaration || pending("Old-definition dependent qualification missing")),childId:child.personId,ageOn20251231:f.ageOn20251231 });
  }
  const municipalTaxByPerson = {};
  for (const p of c.parents) {
    const id=p.personId; const other=c.parents.find(p => p.personId !== id); const pf=facts.byPerson[id];
    const of=facts.byPerson[other.personId];
    if (!hasEvidence(pf?.salaryOnly) || pf.salaryOnly.value !== true) return stop("Other income/unsupported tax status cannot be silently omitted");
    if (!Number.isInteger(of?.ageOn20251231) || of.ageOn20251231 < 18) return stop("Explicit adult spouse age required");
    const totalIncomeYen=salaryByPerson[id].salaryIncomeYen, spouseIncomeYen=salaryByPerson[other.personId].salaryIncomeYen;
    let sd=ok({kind:"not-elected",deductionYen:0,personalDifferenceYen:0});
    if (facts.spouseElection.claimantId === id) {
      sd=spouseDeduction2026({residentTaxFiscalYear:2026,taxpayerTotalIncomeYen:totalIncomeYen,
        spouseTotalIncomeYen:spouseIncomeYen,spouseAgeOn20251231:of.ageOn20251231});
    }
    // Same-livelihood spouse status for non-taxability is separate from electing a spouse deduction.
    const spouseDependentCount = spouseIncomeYen <= 580000 ? 1 : 0;
    municipalTaxByPerson[id]=municipalTax2026({totalIncomeYen,socialInsurancePaid:pf.socialInsurancePaid,
      otherDeductionsAbsent:pf.otherDeductionsAbsent,otherTaxCreditsAbsent:pf.otherTaxCreditsAbsent,
      spouseDeduction:sd,childDeductions:childDeductionsByPerson[id],dependentCount:childCounts[id]+spouseDependentCount,
      ordinaryAdultResidentConfirmed:pf.ordinaryAdultResidentConfirmed});
  }
  const taxRows={...municipalTaxByPerson};
  // Children are explicit zero-income residents in this narrow scope, not omitted household members.
  for (const child of c.children) {
    taxRows[child.personId]=ok({referenceIncomeYear:2025,residentTaxFiscalYear:2026,taxCategory:"non-taxable",
      serviceBasisLevyBeforeOldDependentReliefYen:0,serviceLevyBasis:"after-adjustment-before-disregarded-credits",evidence:facts.children[child.personId].evidence});
    declarationsByPerson[child.personId]=[];
  }
  const dayServiceAssessment=dayServiceAssessment2026({taxRows,householdMemberIds:facts.serviceHouseholdMembers,declarationsByPerson});
  return { referenceIncomeYear:2025,residentTaxFiscalYear:2026,salaryByPerson,municipalTaxByPerson,dayServiceAssessment };
}

/** Attach only the recomputed FY2026 period to the isolated case; never overwrite FY2027. */
export function attachFunabashi2026Assessment(input) {
  const c=createCase(input); const result=calculateFunabashi2026(c); const next=structuredClone(c);
  const a=result.dayServiceAssessment;
  const record={referenceIncomeYear:2025,residentTaxFiscalYear:2026,appliesFrom:"2026-07",appliesThrough:"2027-06",
    periodEvidence:TAX2026_SOURCES.period,result:a.status === "known" ? {...a,
      basedOnAnnualSalaryYen:Object.fromEntries(c.parents.map(p => [p.personId,p.annualSalaryYenByIncomeYear[2025]]))} : a};
  next.dayServiceAssessments=next.dayServiceAssessments.filter(a => a.appliesFrom !== record.appliesFrom || a.appliesThrough !== record.appliesThrough);
  next.dayServiceAssessments.push(record);
  return {case:createCase(next),calculation:result};
}
