/** Isolated two-salary core. All amounts are integer JPY; no legacy imports. */
export const SOURCES = Object.freeze({
  cap: "https://www.city.funabashi.lg.jp/kodomo/hattatsu/002/p036766.html",
  refund: "https://www.city.funabashi.lg.jp/kenkou/shougaisha/003/01/p082486.html",
  refundExample: "https://www.city.funabashi.lg.jp/kenkou/shougaisha/003/01/p082486_d/fil/kougakuannai.pdf#page=3",
});
export const pending = (reason) => ({ status: "pending", reason });
const known = (value) => ({ status: "known", ...value });
const requireThat = (condition, message) => { if (!condition) throw new TypeError(message); };
const yen = (value) => requireThat(Number.isSafeInteger(value) && value >= 0, "Expected nonnegative safe integer yen");
const year = (value) => requireThat(Number.isInteger(value) && value >= 1900 && value <= 9998, "Invalid income year");
const text = (value) => requireThat(typeof value === "string" && value.trim().length > 0, "Explicit nonempty text required");
const month = (value) => requireThat(typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value), "Expected YYYY-MM");
function freeze(value) {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function decision(value, validate) {
  requireThat(value && ["known", "pending"].includes(value.status), "Explicit decision required");
  if (value.status === "pending") text(value.reason);
  else validate(value);
}
function members(value, ids) {
  requireThat(Array.isArray(value) && new Set(value).size === value.length, "Unique explicit member IDs required");
  value.forEach(id => requireThat(ids.includes(id), "Unknown member ID"));
}
/** Validate a case without assigning roles from salary rank or filling missing years. */
export function createCase(input) {
  const c = structuredClone(input);
  requireThat(c.municipality === "Funabashi", "This slice covers Funabashi only");
  text(c.caseId);
  requireThat(c.comparisonKind === "fixed-employment-salary-only", "Separate employment/transition/allocation comparisons required");
  requireThat(Array.isArray(c.parents) && c.parents.length === 2, "Two explicit parents required");
  const parentIds = c.parents.map(p => p.personId);
  parentIds.forEach(text);
  requireThat(new Set(parentIds).size === 2, "Duplicate parent ID");
  c.parents.forEach(p => {
    requireThat(p.annualSalaryYenByIncomeYear && Object.keys(p.annualSalaryYenByIncomeYear).length > 0, "Salary history required");
    Object.entries(p.annualSalaryYenByIncomeYear).forEach(([y, amount]) => { year(Number(y)); yen(amount); });
    decision(p.employment, d => { text(d.conditionsId); text(d.description); });
    decision(p.employeeInsurance, d => { text(d.scheme); text(d.evidence); });
  });
  requireThat(Array.isArray(c.children) && c.children.length > 0, "Explicit children required");
  const childIds = c.children.map(ch => ch.personId);
  childIds.forEach(text);
  requireThat(new Set([...parentIds, ...childIds]).size === parentIds.length + childIds.length, "Duplicate person ID");
  c.children.forEach(ch => {
    decision(ch.healthInsuranceDependency, d => {
      requireThat(d.sponsorId === null || parentIds.includes(d.sponsorId), "Unknown insurance sponsor"); text(d.evidence);
    });
    decision(ch.dayServiceUse, d => {
      requireThat(typeof d.uses === "boolean", "Explicit service use required");
      requireThat(d.service === "after-school-day-service", "Only school-age after-school day service supported");
      requireThat(d.schoolAgeConfirmed === true, "Preschool exemptions are outside this slice");
    });
  });
  requireThat(c.taxDependentsByIncomeYear && Object.keys(c.taxDependentsByIncomeYear).length > 0, "Explicit tax allocation required");
  Object.entries(c.taxDependentsByIncomeYear).forEach(([y, allocation]) => {
    year(Number(y));
    requireThat(Object.keys(allocation).length === childIds.length && childIds.every(id => Object.hasOwn(allocation, id)), "Every child's tax allocation required");
    Object.values(allocation).forEach(d => decision(d, v => {
      requireThat(v.claimantId === null || parentIds.includes(v.claimantId), "Unknown tax claimant"); text(v.evidence);
    }));
  });
  requireThat(c.allowanceRoles && Object.keys(c.allowanceRoles).length === 2, "Separate national allowance roles required");
  for (const program of ["specialChildRearingAllowance", "disabledChildWelfareAllowance"]) {
    decision(c.allowanceRoles[program], d => {
      const ids = [...parentIds, ...childIds];
      requireThat(ids.includes(d.recipientId), "Unknown allowance recipient");
      members(d.spouseIds, ids); members(d.supportObligorIds, ids);
      requireThat(![...d.spouseIds, ...d.supportObligorIds].includes(d.recipientId), "Recipient must be separate from tested counterparts");
      text(d.evidence);
    });
  }
  requireThat(Array.isArray(c.dayServiceAssessments), "Explicit assessments array required (may be empty)");
  c.dayServiceAssessments.forEach(a => {
    year(a.referenceIncomeYear); year(a.residentTaxFiscalYear);
    requireThat(a.residentTaxFiscalYear === a.referenceIncomeYear + 1, "Resident tax year must follow income year");
    month(a.appliesFrom); month(a.appliesThrough);
    requireThat(a.appliesFrom <= a.appliesThrough, "Reversed assessment period");
    text(a.periodEvidence);
    decision(a.result, d => {
      text(d.evidence);
      requireThat(d.basis === "adjusted-household-municipal-income-levy", "Do not inject gross salary or tax collection amount");
      requireThat(["taxable", "non-taxable", "public-assistance"].includes(d.taxCategory), "Explicit household tax category required");
      yen(d.adjustedMunicipalLevyYen);
      requireThat(d.taxCategory === "taxable" || d.adjustedMunicipalLevyYen === 0, "Non-taxable category conflicts with positive levy");
      requireThat(d.basedOnAnnualSalaryYen && Object.keys(d.basedOnAnnualSalaryYen).length === 2, "Both salary provenance entries required");
      c.parents.forEach(p => {
        const actual = p.annualSalaryYenByIncomeYear[a.referenceIncomeYear];
        requireThat(actual !== undefined && d.basedOnAnnualSalaryYen[p.personId] === actual, "Assessment salary provenance mismatch");
      });
    });
  });
  const sorted = [...c.dayServiceAssessments].sort((a,b) => a.appliesFrom.localeCompare(b.appliesFrom));
  sorted.forEach((a,i) => { if (i) requireThat(sorted[i-1].appliesThrough < a.appliesFrom, "Overlapping assessment periods"); });
  return freeze(c);
}
/** Change one parent's salary in one income year; invalidate only dependent assessments. */
export function withSalary(c, personId, incomeYear, annualSalaryYen) {
  c = createCase(c); year(incomeYear); yen(annualSalaryYen);
  const next = structuredClone(c);
  const p = next.parents.find(p => p.personId === personId);
  requireThat(p && Object.hasOwn(p.annualSalaryYenByIncomeYear, incomeYear), "Explicit person/year required");
  if (p.annualSalaryYenByIncomeYear[incomeYear] !== annualSalaryYen) {
    p.annualSalaryYenByIncomeYear[incomeYear] = annualSalaryYen;
    next.dayServiceAssessments.filter(a => a.referenceIncomeYear === incomeYear).forEach(a => {
      a.result = pending("Reference-year salary changed: independent reassessment required");
    });
  }
  return createCase(next);
}
/** Resolve only an explicitly supplied application period. Never extrapolate by calendar year. */
export function assessmentForMonth(c, serviceMonth) {
  month(serviceMonth);
  const a = c.dayServiceAssessments.find(a => a.appliesFrom <= serviceMonth && serviceMonth <= a.appliesThrough);
  if (!a) return pending("No confirmed assessment for service month");
  if (a.result.status !== "known") return a.result;
  return known({ referenceIncomeYear: a.referenceIncomeYear, residentTaxFiscalYear: a.residentTaxFiscalYear,
    appliesFrom: a.appliesFrom, appliesThrough: a.appliesThrough, periodEvidence: a.periodEvidence, ...a.result });
}
/** P036766: taxable levy < 280000 => 4600; equality => 37200. */
export function dayServiceCap(assessment) {
  decision(assessment, a => {
    yen(a.adjustedMunicipalLevyYen);
    requireThat(a.basis === "adjusted-household-municipal-income-levy", "Adjusted household levy required");
    requireThat(["taxable", "non-taxable", "public-assistance"].includes(a.taxCategory), "Tax category required");
    requireThat(a.taxCategory === "taxable" || a.adjustedMunicipalLevyYen === 0, "Inconsistent category");
    text(a.evidence);
  });
  if (assessment.status === "pending") return assessment;
  return known({ capYen: assessment.taxCategory !== "taxable" ? 0 : assessment.adjustedMunicipalLevyYen < 280000 ? 4600 : 37200,
    source: SOURCES.cap });
}
/** One child's eligible monthly service cost, excluding meals and other non-covered costs. */
export function singleChildCharge({ assessment, eligibleServiceCostYen }) {
  yen(eligibleServiceCostYen);
  const cap = dayServiceCap(assessment);
  if (cap.status === "pending") return cap;
  if (cap.capYen === 0) return known({ ...cap, chargeYen: 0, eligibleServiceCostYen });
  // No invented yen rounding. Exact integer-tenth examples only until rounding is sourced.
  if (eligibleServiceCostYen % 10 !== 0) return pending("Fractional-yen 10% charge: rounding rule not yet verified");
  return known({ ...cap, eligibleServiceCostYen, chargeYen: Math.min(eligibleServiceCostYen / 10, cap.capYen) });
}
/** Narrow refund route: confirmed same-household disabled siblings, no prosthetics/other adjustments. */
export function siblingRefund({ eligibility, payments }) {
  decision(eligibility, e => { text(e.evidence); requireThat(e.route === "disabled-siblings-no-prosthetics-or-other-adjustments", "Unsupported refund route"); });
  if (eligibility.status === "pending") return eligibility;
  requireThat(Array.isArray(payments) && payments.length >= 2, "Two or more sibling payments required");
  const ids = payments.map(p => p.childId);
  requireThat(new Set(ids).size === ids.length, "Aggregate certificates per child before sibling refund");
  payments.forEach(p => {
    text(p.childId); text(p.householdId); month(p.serviceMonth); text(p.evidence);
    yen(p.paidYen); requireThat([0,4600,37200].includes(p.certificateCapYen), "Unsupported certificate cap");
    requireThat(p.paidYen <= p.certificateCapYen, "Payment exceeds certificate cap");
    requireThat(p.householdId === payments[0].householdId && p.serviceMonth === payments[0].serviceMonth, "Do not combine households or months");
  });
  const totalPaidYen = payments.reduce((sum,p) => sum + p.paidYen, 0); yen(totalPaidYen);
  const thresholdYen = Math.max(...payments.map(p => p.certificateCapYen));
  const eligibleRefundYen = Math.max(0, totalPaidYen - thresholdYen);
  return known({ totalPaidYen, thresholdYen, eligibleRefundYen,
    afterApprovedClaimNetYen: totalPaidYen - eligibleRefundYen,
    settlement: "conditional-on-application-and-approval", source: SOURCES.refund });
}
/** Aggregate an explicitly selected set of service months, separately from income years. */
export function evaluateDayService(c, { childId, months, eligibleServiceCostYenByMonth }) {
  c = createCase(c);
  requireThat(Array.isArray(months) && months.length > 0 && new Set(months).size === months.length, "Unique aggregation months required");
  months.forEach(month);
  const child = c.children.find(ch => ch.personId === childId);
  requireThat(child, "Unknown child");
  const rows = months.map(serviceMonth => {
    let result;
    if (child.dayServiceUse.status === "pending") result = child.dayServiceUse;
    else if (!child.dayServiceUse.uses) result = known({ chargeYen: 0, reason: "Explicitly no service use" });
    else if (!Object.hasOwn(eligibleServiceCostYenByMonth, serviceMonth)) result = pending("Monthly eligible cost missing");
    else result = singleChildCharge({ assessment: assessmentForMonth(c, serviceMonth), eligibleServiceCostYen: eligibleServiceCostYenByMonth[serviceMonth] });
    return { serviceMonth, assessment: assessmentForMonth(c, serviceMonth), result };
  });
  const total = rows.every(r => r.result.status === "known")
    ? known({ chargeYen: rows.reduce((sum,r) => sum + r.result.chargeYen, 0) })
    : pending("Some aggregation months are unconfirmed; no partial sum presented as total");
  if (total.status === "known") yen(total.chargeYen);
  return { aggregationMonths: [...months], childId, rows, total,
    coverage: { scope: "single-child-day-service-before-refund", disposableIncome: pending("Tax, insurance and allowances not implemented"),
      oldMedicalExpense: { status: "excluded", reason: "User research scope" },
      M01: { status: "excluded", reason: "User research scope" },
      N04Cost: { status: "excluded", reason: "Research scope unresolved; no zero effect asserted" },
      N04Reimbursement: { status: "excluded", reason: "Research scope unresolved; no zero effect asserted" } } };
}

/** Compare only one person's one income-year salary, holding all non-salary case conditions fixed. */
export function compareSalaryOnlyCases(base, alternative, { personId, incomeYear }) {
  base = createCase(base); alternative = createCase(alternative); year(incomeYear);
  requireThat(base.parents.some(p => p.personId === personId), "Unknown salary comparison target");
  const normalise = c => {
    const copy = structuredClone(c);
    delete copy.caseId;
    // Independently revalidated assessment results may change, but periods/reference years may not.
    copy.dayServiceAssessments.forEach(a => { delete a.result; });
    const p = copy.parents.find(p => p.personId === personId);
    requireThat(p && Object.hasOwn(p.annualSalaryYenByIncomeYear,incomeYear), "Target salary year missing");
    delete p.annualSalaryYenByIncomeYear[incomeYear];
    return copy;
  };
  const canonical = value => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(k => [k,canonical(value[k])]));
    return value;
  };
  requireThat(JSON.stringify(canonical(normalise(base))) === JSON.stringify(canonical(normalise(alternative))),
    "Separate comparison required: employment, allocation, history, or other case conditions changed");
  const beforeYen = base.parents.find(p => p.personId === personId).annualSalaryYenByIncomeYear[incomeYear];
  const afterYen = alternative.parents.find(p => p.personId === personId).annualSalaryYenByIncomeYear[incomeYear];
  return { comparisonKind: "one-person-one-income-year-salary-change", personId, incomeYear, beforeYen, afterYen,
    deltaYen: afterYen - beforeYen, assessmentResultsMustBeIndependentlyConfirmed: true };
}
