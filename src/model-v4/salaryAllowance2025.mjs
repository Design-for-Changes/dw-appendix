import { salaryIncomeBeforeAdjustment2025 } from './salaryIncome2025.mjs';
import { PROGRAMS, assessAllowancePerson2026, evaluateAllowanceIncomeRestriction2026 } from './allowanceIncome2026.mjs';
export const SALARY_ALLOWANCE_SOURCES = Object.freeze({
  decree:'https://www.mhlw.go.jp/web/t_doc?dataId=82091000&dataType=0',
  salary:'https://www.nta.go.jp/taxes/shiraberu/shinkoku/tebiki/2025/pdf/Q/Q17.pdf',
  form:'https://www.mhlw.go.jp/content/001708586.pdf',
  allocation:'https://laws.e-gov.go.jp/law/325CO0000000245/20260401_508CO0000000083',
});
const pending = reason => ({status:'pending',reason});
const outside = reason => ({status:'out-of-scope',reason});
const text = s => typeof s === 'string' && s.trim().length > 0;
const evidenced = x => x?.status === 'known' && text(x.evidence?.source) && text(x.evidence?.note);
const yen = x => Number.isSafeInteger(x) && x >= 0;
const period = x => x?.referenceIncomeYear === 2025 && x?.prefecturalTaxFiscalYear === 2026;
const roles = ['recipient','spouse','supportObligor'];

/** Complete tax ledgers, keyed by taxpayer. Never choose an owner from salary ranking. */
export function auditDisabilityTaxClaims2026(ledgers = {}) {
  const byPerson = {}, owners = new Map();
  for (const [id,ledger] of Object.entries(ledgers)) {
    if (!evidenced(ledger) || ledger.taxpayerId !== id || !period(ledger) || !Array.isArray(ledger.entries)) {
      byPerson[id]=pending('Complete evidenced FY2026 disability tax ledger required, including explicit empty entries');continue;
    }
    const seen = new Set(); let reason,unsupported=false;
    for (const c of ledger.entries) {
      if (!evidenced(c) || !period(c) || c.taxpayerId !== id || !text(c.targetPersonId) ||
          c.taxType !== 'prefectural-resident-tax' || c.deductionApplied !== true ||
          !['self','same-livelihood-spouse','dependent'].includes(c.relationship) ||
          (c.relationship === 'self' ? c.targetPersonId !== id : c.allocationConfirmed !== true || c.targetPersonId === id)) {
        reason='Tax application, identity, relationship or exclusive allocation not confirmed';continue;
      }
      if (seen.has(c.targetPersonId)) reason='Duplicate or conflicting disability classifications for one tax target';
      seen.add(c.targetPersonId);
      if (!['ordinary','special'].includes(c.classification)) reason='Disability tax classification unknown';
      if (c.classification === 'special' && c.specialTaxApplicationConfirmed !== true) unsupported=true;
      if (c.relationship !== 'self') {
        const set=owners.get(c.targetPersonId) || new Set();set.add(id);owners.set(c.targetPersonId,set);
      }
    }
    byPerson[id]=reason ? pending(reason) : unsupported ? outside('Special disability tax application requires explicit confirmation in this limited connection') :
      {status:'known',entries:structuredClone(ledger.entries),evidence:structuredClone(ledger.evidence)};
  }
  for (const [target,ids] of owners) if (ids.size > 1)
    for (const id of ids) byPerson[id]=pending(`Conflicting tax allocation for ${target}; no automatic parent selection`);
  return {byPerson};
}

/** Salary-only limited reconstruction; a signed formula result is retained after deductions. */
function reconstruct({program,targetMonth,role,personId,salaryFacts,disabilityTaxClaims}, auditedClaims) {
  if (!Object.values(PROGRAMS).includes(program) || !roles.includes(role)) return pending('Explicit supported program and statutory role required');
  if (typeof targetMonth !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(targetMonth)) return pending('Benefit month must be YYYY-MM');
  if (targetMonth < '2026-08' || targetMonth > '2027-07') return outside('Supported benefit months are August 2026 through July 2027');
  const f=salaryFacts;
  if (!evidenced(f) || f.personId !== personId) return pending('Evidenced individual salary facts required');
  if (!period(f)) return outside('Only 2025 income / FY2026 tax is implemented');
  if (!yen(f.annualGrossTaxableSalaryYen)) return pending('Exact individual annual taxable salary in integer yen required');
  if (f.annualGrossTaxableSalaryYen > 8500000) return outside('Salary above 8500000 yen is not connected');
  if (f.allPayersIncluded !== true) return pending('Complete individual taxable salary across payers must be confirmed');
  if (f.salaryOnlyNoLossNoSpecifiedExpense === false) return outside('Other income, losses or specified-expense deductions are not supported');
  if (f.salaryOnlyNoLossNoSpecifiedExpense !== true) return pending('Salary-only/no loss/no specified-expense conditions unconfirmed');
  const d=f.deductionScope;
  if (!evidenced(d) || !period(d) || d.personId !== personId || d.program !== program || d.role !== role)
    return pending('Role-specific additional deduction scope unconfirmed');
  if (d.unhandledAdditionalDeductionsAbsent === false) return outside('Other statutory additional deductions not supported');
  if (d.unhandledAdditionalDeductionsAbsent !== true) return pending('Absence of other deductions must be explicit');
  const claims=auditedClaims || auditDisabilityTaxClaims2026({[personId]:disabilityTaxClaims}).byPerson[personId];
  if (claims?.status !== 'known') return claims || pending('Disability tax facts missing');
  let W;
  if (f.inputKind === 'gross-taxable-salary') W=salaryIncomeBeforeAdjustment2025(f.annualGrossTaxableSalaryYen);
  else if (f.inputKind === 'confirmed-salary-income') {
    if (!yen(f.confirmedSalaryIncomeYen) || f.confirmedSalaryIncomeYen > 6550000) return pending('Confirmed salary income missing or outside supported range');
    W=f.confirmedSalaryIncomeYen;
  } else return pending('Explicit gross salary or already confirmed salary-income basis required');
  const childSelf=program === PROGRAMS.CHILD && role === 'recipient';
  let insuranceDeductionYen=80000;
  if (childSelf) {
    const s=f.socialInsuranceDeduction;
    if (!evidenced(s) || !period(s) || s.taxpayerId !== personId || s.insuredPersonId !== personId ||
        s.basis !== 'actual-prefectural-social-insurance-deduction' || !yen(s.amountYen) ||
        !['applied','confirmed-none'].includes(s.taxTreatment) || (s.taxTreatment === 'confirmed-none' && s.amountYen !== 0))
      return pending('Child recipient own confirmed FY2026 social-insurance deduction required; no parent amount or fixed substitute');
    insuranceDeductionYen=s.amountYen;
  }
  const eligible=claims.entries.filter(c=>!(childSelf && c.relationship === 'self'));
  const ignored=claims.entries.filter(c=>childSelf && c.relationship === 'self');
  let spouseSpecialDeductionYen=0;
  const spouseSpecial=f.spouseSpecialTaxDeduction;
  if (spouseSpecial !== undefined) {
    if (!evidenced(spouseSpecial) || !period(spouseSpecial) || spouseSpecial.taxpayerId !== personId ||
        spouseSpecial.basis !== 'applied-prefectural-spouse-special-deduction' || !yen(spouseSpecial.amountYen) ||
        !['applied','confirmed-none'].includes(spouseSpecial.taxTreatment) ||
        (spouseSpecial.taxTreatment === 'confirmed-none' && spouseSpecial.amountYen !== 0) ||
        (spouseSpecial.taxTreatment === 'applied' && (!text(spouseSpecial.spousePersonId) || spouseSpecial.spousePersonId === personId || spouseSpecial.amountYen === 0)))
      return pending('Same taxpayer FY2026 prefectural spouse-special tax deduction or confirmed none required; no national/ordinary-spouse substitution');
    if (![0,30000,60000,110000,160000,210000,260000,310000,330000].includes(spouseSpecial.amountYen)) return outside('Prefectural spouse-special deduction is outside the supported salary-only <=8500000 table column');
    spouseSpecialDeductionYen=spouseSpecial.amountYen;
  }
  const P=Math.max(W-100000,0),disabilityDeductionYen=eligible.reduce((s,c)=>s+(c.classification==='special'?400000:270000),0);
  const signedFormulaYen=P-insuranceDeductionYen-disabilityDeductionYen-spouseSpecialDeductionYen;
  if (!Number.isSafeInteger(signedFormulaYen)) return pending('Formula exceeds safe integer range');
  const legalBasis=program === PROGRAMS.TCCA ? 'decree-4-and-5' : childSelf ? 'decree-4-5-as-modified-by-8-self' : 'decree-4-5-as-modified-by-8-counterpart';
  return {status:'known',personId,program,role,referenceIncomeYear:2025,prefecturalTaxFiscalYear:2026,
    salaryIncomeYen:W,afterSalaryPensionAdjustmentYen:P,insuranceDeductionYen,insuranceDeductionKind:childSelf?'actual-own-tax-deduction':'statutory-fixed',
    disabilityDeductionYen,disabilityDeductionBreakdown:eligible.map(c=>({targetPersonId:c.targetPersonId,classification:c.classification,amountYen:c.classification==='special'?400000:270000})),spouseSpecialDeductionYen,spouseSpecialTaxDeduction:spouseSpecial?structuredClone(spouseSpecial):undefined,eligibleTaxClaims:structuredClone(eligible),ignoredSelfTaxClaims:structuredClone(ignored),signedFormulaYen,
    municipalDisplayOfNegative:'unconfirmed',sources:SALARY_ALLOWANCE_SOURCES,inputFacts:structuredClone(f),
    income:{status:'known',personId,program,role,basis:'statutory-assessed-personal-income',legalBasis,
      referenceIncomeYear:2025,prefecturalTaxFiscalYear:2026,annualYen:signedFormulaYen,
      evidence:{source:SALARY_ALLOWANCE_SOURCES.decree,note:'Limited evidenced 2025 salary reconstruction; signed formula retained'}}};
}

/** Standalone calculation audits its supplied per-taxpayer ledger. Use household wrapper to detect cross-parent conflicts. */
export function statutoryIncomeFromSalary2025(input) { return reconstruct(input); }

/** Existing statutory-income inputs bypass reconstruction and all further deductions. */
export function evaluateAllowanceFromSalary2025({program,targetMonth,roles:inputRoles,incomeFactsByPerson={},taxDisabilityClaimsByPerson={}}) {
  const base=evaluateAllowanceIncomeRestriction2026({program,targetMonth,roles:inputRoles});
  if (base.status === 'out-of-scope') return base;
  const next=structuredClone(inputRoles || {}),audit=auditDisabilityTaxClaims2026(taxDisabilityClaimsByPerson),calculations=[];
  for (const role of roles) for (const subject of next[role]?.subjects || []) {
    if (Object.hasOwn(subject,'income')) {calculations.push({role,personId:subject.assignment?.personId,status:'bypassed',reason:'Statutory assessed-income input is authoritative; no reconstruction'});continue;}
    const probe=assessAllowancePerson2026({program,targetMonth,role,subject});
    if (probe.assignment.status !== 'known') {calculations.push({role,...pending('Role assignment unconfirmed')});continue;}
    const personId=probe.assignment.personId;
    const calc=reconstruct({program,targetMonth,role,personId,salaryFacts:incomeFactsByPerson[personId]},
      audit.byPerson[personId] || pending('Complete tax disability ledger missing'));
    calculations.push({role,personId,...calc});subject.income=calc.status === 'known' ? calc.income : pending(calc.reason);
  }
  return {...evaluateAllowanceIncomeRestriction2026({program,targetMonth,roles:next}),
    salaryOrTaxConnection:'limited-evidenced-2025-salary-only',calculations,taxDisabilityAudit:audit,
    connectionScope:'No entitlement, payments, municipal taxable-base inversion, insurance estimates or automatic tax field mapping'};
}
