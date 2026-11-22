/* global BigInt */
import {salaryIncomeBeforeAdjustment2025} from './salaryIncome2025.mjs';
export const NATIONAL_TAX2025_SOURCES=Object.freeze({
 reform:'https://www.nta.go.jp/users/gensen/2025kiso/index.htm',
 guide:'https://www.nta.go.jp/taxes/shiraberu/shinkoku/tebiki/2025/pdf/001.pdf',
 salary:'https://www.nta.go.jp/taxes/shiraberu/shinkoku/tebiki/2025/pdf/Q/Q17.pdf',
 adjustment:'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1411.htm',
 disability:'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1160.htm',
 rates:'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2260.htm',
 yearend:'https://www.nta.go.jp/taxes/shiraberu/taxanswer/gensen/2662.htm',
 return:'https://www.nta.go.jp/taxes/shiraberu/shinkoku/tebiki/2025/pdf/060.pdf'});
const pending=reason=>({status:'pending',reason});
const outside=reason=>({status:'out-of-scope',reason});
const text=x=>typeof x==='string'&&x.trim().length>0;
const known=x=>x?.status==='known'&&text(x.evidence?.source)&&text(x.evidence?.note);
const yen=x=>Number.isSafeInteger(x)&&x>=0;
function requireYen(x){if(!yen(x))throw new TypeError('Nonnegative safe integer yen required');}

/** Statutory tables only: no claim eligibility inferred. Each upper endpoint is included. */
export function basicDeduction2025(totalIncomeYen){
 requireYen(totalIncomeYen);
 const row=[[1320000,950000],[3360000,880000],[4890000,680000],[6550000,630000],[23500000,580000],[24000000,480000],[24500000,320000],[25000000,160000]].find(([max])=>totalIncomeYen<=max);
 return row?row[1]:0;
}
export function generalSpouseDeduction2025({taxpayerTotalIncomeYen,spouseTotalIncomeYen}){
 requireYen(taxpayerTotalIncomeYen);requireYen(spouseTotalIncomeYen);
 if(taxpayerTotalIncomeYen>10000000||spouseTotalIncomeYen>1330000)return {kind:'none',deductionYen:0};
 const col=taxpayerTotalIncomeYen<=9000000?0:taxpayerTotalIncomeYen<=9500000?1:2;
 if(spouseTotalIncomeYen<=580000)return {kind:'spouse',deductionYen:[380000,260000,130000][col]};
 const rows=[[950000,[380000,260000,130000]],[1000000,[360000,240000,120000]],[1050000,[310000,210000,110000]],[1100000,[260000,180000,90000]],[1150000,[210000,140000,70000]],[1200000,[160000,110000,60000]],[1250000,[110000,80000,40000]],[1300000,[60000,40000,20000]],[1330000,[30000,20000,10000]]];
 return {kind:'special-spouse',deductionYen:rows.find(([max])=>spouseTotalIncomeYen<=max)[1][col]};
}
/** Standard comprehensive-tax rate only. Input is already rounded taxable income. */
export function standardIncomeTax2025(taxableIncomeYen){
 requireYen(taxableIncomeYen);if(taxableIncomeYen%1000)throw new TypeError('Taxable income must already be rounded to 1000 yen');
 if(taxableIncomeYen>330000000)return outside('High-income minimum-tax exception not implemented');
 const [rate,deduction]=taxableIncomeYen<1950000?[5,0]:taxableIncomeYen<3300000?[10,97500]:taxableIncomeYen<6950000?[20,427500]:taxableIncomeYen<9000000?[23,636000]:taxableIncomeYen<18000000?[33,1536000]:taxableIncomeYen<40000000?[40,2796000]:[45,4796000];
 return {status:'known',taxableIncomeYen,ratePercent:rate,quickDeductionYen:deduction,baseIncomeTaxYen:taxableIncomeYen*rate/100-deduction};
}
/** Separate metrics: return-line reconstruction and year-end adjusted annual amount. */
export function nationalAnnualAmounts2025(baseIncomeTaxYen){
 requireYen(baseIncomeTaxYen);
 const b=BigInt(baseIncomeTaxYen),reconstructionTaxReturnYen=Number(b*21n/1000n);
 const returnCombinedTaxYen=baseIncomeTaxYen+reconstructionTaxReturnYen;
 const yearEndAdjustedAnnualTaxYen=Number(b*1021n/100000n*100n);
 if(!yen(returnCombinedTaxYen)||!yen(yearEndAdjustedAnnualTaxYen))throw new TypeError('Annual amount exceeds safe integer range');
 return {baseIncomeTaxYen,reconstructionTaxReturnYen,returnCombinedTaxYen,yearEndAdjustedAnnualTaxYen,
  scope:'2025 only; no tax credits; reconstruction return line is not derived by subtracting base from year-end amount'};
}
/** Illustrative return settlement, requiring actual withholding/prepayment, no other credits. */
export function nationalReturnSettlement2025({incomeYear,baseIncomeTaxYen,actualWithholding,actualPrepayment,otherReturnCreditsAbsent}){
 if(incomeYear!==2025)return outside('Only 2025 return settlement implemented');
 for(const x of [actualWithholding,actualPrepayment])if(!known(x)||x.incomeYear!==2025||!yen(x.amountYen))return pending('Confirmed actual 2025 withholding and prepayment, including zero, required');
 if(!known(otherReturnCreditsAbsent)||otherReturnCreditsAbsent.incomeYear!==2025||otherReturnCreditsAbsent.absent!==true)return pending('Other return credits must be confirmed absent');
 const annual=nationalAnnualAmounts2025(baseIncomeTaxYen),beforeRoundingYen=annual.returnCombinedTaxYen-actualWithholding.amountYen;
 const declarationTaxYen=beforeRoundingYen>0?Math.floor(beforeRoundingYen/100)*100:beforeRoundingYen;
 const settlementYen=declarationTaxYen-actualPrepayment.amountYen;
 if(!Number.isSafeInteger(settlementYen))return pending('Settlement exceeds safe integer yen range');
 return {status:'known',incomeYear:2025,...annual,beforeRoundingYen,declarationTaxYen,prepaymentYen:actualPrepayment.amountYen,settlementYen,
  additionalPaymentYen:Math.max(0,settlementYen),refundYen:Math.max(0,-settlementYen),evidence:{actualWithholding,actualPrepayment,otherReturnCreditsAbsent}};
}
export function nationalSalaryIncome2025({incomeYear,personId,salaryFacts}){
 if(incomeYear!==2025)return outside('Only 2025 national salary-income calculation implemented');
 const f=salaryFacts;
 if(!known(f)||!text(personId)||f.personId!==personId||f.incomeYear!==2025||!yen(f.salaryYen))return pending('Evidenced individual taxable salary for 2025 required');
 if(f.salaryOnlyNoLossNoSpecifiedExpense===false)return outside('Other income, loss or specified-expense deduction not implemented');
 if(f.salaryOnlyNoLossNoSpecifiedExpense!==true||f.allPayersIncluded!==true||f.domesticResident!==true)return pending('Salary-only, all payers and domestic resident must be confirmed');
 const salaryIncomeBeforeAdjustmentYen=salaryIncomeBeforeAdjustment2025(f.salaryYen);let incomeAdjustmentDeductionYen=0;
 if(f.salaryYen>8500000){
  const q=f.incomeAdjustmentQualification;
  if(!known(q)||q.personId!==personId||q.incomeYear!==2025||typeof q.qualifies!=='boolean')return pending('Explicit 2025 income-adjustment qualification required above 8500000 yen');
  if(q.qualifies)incomeAdjustmentDeductionYen=Math.ceil((Math.min(f.salaryYen,10000000)-8500000)/10);
 }
 return {status:'known',incomeYear:2025,personId,salaryYen:f.salaryYen,salaryIncomeBeforeAdjustmentYen,incomeAdjustmentDeductionYen,totalIncomeYen:salaryIncomeBeforeAdjustmentYen-incomeAdjustmentDeductionYen,evidence:structuredClone(f.evidence)};
}
/** Narrow salary-only annual tax. No tax payments or benefit amounts enter deductions. */
export function nationalSalaryTax2025({incomeYear,personId,salaryFacts,actualSocialInsurancePaid,ordinaryDisabilityTaxClaims,spouseClaim,otherDeductionsAndCreditsAbsent,yearEndAdjustmentEligibility}){
 const w=nationalSalaryIncome2025({incomeYear,personId,salaryFacts});if(w.status!=='known')return w;
 if(w.salaryYen>20000000)return outside('Salary over 20000000 yen is outside year-end-adjusted comparison scope');
 if(!known(yearEndAdjustmentEligibility)||yearEndAdjustmentEligibility.personId!==personId||yearEndAdjustmentEligibility.incomeYear!==2025||yearEndAdjustmentEligibility.eligible!==true)return pending('Year-end adjustment eligibility must be explicitly confirmed');
 if(!known(otherDeductionsAndCreditsAbsent)||otherDeductionsAndCreditsAbsent.personId!==personId||otherDeductionsAndCreditsAbsent.incomeYear!==2025||otherDeductionsAndCreditsAbsent.absent!==true)return pending('Other national deductions/credits must be explicitly confirmed absent');
 const s=actualSocialInsurancePaid;
 if(!known(s)||s.incomeYear!==2025||s.payerPersonId!==personId||s.basis!=='actual-paid-in-2025'||!yen(s.amountYen))return pending('Actual social insurance paid by this taxpayer in 2025 required; no insurance-year estimate');
 const claims=ordinaryDisabilityTaxClaims;
 if(!known(claims)||claims.taxpayerPersonId!==personId||claims.incomeYear!==2025||!Array.isArray(claims.entries))return pending('Complete national-tax disability claims required, including explicit empty set');
 const targets=new Set();
 for(const c of claims.entries){
  if(!known(c)||c.taxpayerPersonId!==personId||c.incomeYear!==2025||!text(c.targetPersonId)||c.deductionApplied!==true||!['self','same-livelihood-spouse','dependent'].includes(c.relationship))return pending('Disability tax application/identity/relationship unconfirmed');
  if(targets.has(c.targetPersonId))return pending('Conflicting or duplicate disability tax claims');targets.add(c.targetPersonId);
  if(!['ordinary','cohabiting-special'].includes(c.classification))return outside('Only ordinary or explicitly confirmed cohabiting-special disability tax claims supported');
  if(c.classification==='cohabiting-special'){
   const residence=c.cohabitation;
   if(c.relationship==='self'||c.specialTaxApplicationConfirmed!==true||!known(residence)||residence.taxpayerPersonId!==personId||residence.targetPersonId!==c.targetPersonId||residence.incomeYear!==2025||residence.asOf!=='2025-12-31'||residence.normalCohabitationConfirmed!==true||residence.withPersonId!==personId)return pending('Confirmed special tax application and normal cohabitation with this taxpayer at2025 year end required; no self cohabiting deduction');
  }
  if(c.relationship==='self'?c.targetPersonId!==personId:c.targetPersonId===personId||c.exclusiveTaxAllocationConfirmed!==true)return pending('Tax disability ownership unconfirmed');
 }
 if(!known(spouseClaim)||spouseClaim.claimantPersonId!==personId||spouseClaim.incomeYear!==2025||typeof spouseClaim.applies!=='boolean')return pending('Explicit spouse claim/election required, including none');
 let spouseDeduction={kind:'none',deductionYen:0};
 if(spouseClaim.applies){
  if(!text(spouseClaim.spousePersonId)||spouseClaim.spousePersonId===personId||spouseClaim.generalSpouseConditionsConfirmed!==true||!yen(spouseClaim.spouseTotalIncomeYen))return pending('General spouse qualification and 2025 total income unconfirmed');
  spouseDeduction=generalSpouseDeduction2025({taxpayerTotalIncomeYen:w.totalIncomeYen,spouseTotalIncomeYen:spouseClaim.spouseTotalIncomeYen});
 }
 const basicDeductionYen=basicDeduction2025(w.totalIncomeYen),ordinaryDisabilityDeductionYen=claims.entries.filter(c=>c.classification==='ordinary').length*270000,cohabitingSpecialDisabilityDeductionYen=claims.entries.filter(c=>c.classification==='cohabiting-special').length*750000,disabilityDeductionYen=ordinaryDisabilityDeductionYen+cohabitingSpecialDisabilityDeductionYen;
 const totalDeductionsYen=basicDeductionYen+s.amountYen+disabilityDeductionYen+spouseDeduction.deductionYen;
 if(!Number.isSafeInteger(totalDeductionsYen))return pending('Deduction sum exceeds safe integer yen range');
 const taxableBeforeRoundingYen=Math.max(0,w.totalIncomeYen-totalDeductionsYen),taxableIncomeYen=Math.floor(taxableBeforeRoundingYen/1000)*1000;
 const tax=standardIncomeTax2025(taxableIncomeYen);
 return {status:'known',incomeYear:2025,reformEffectiveDate:'2025-12-01',annualIncomePeriod:{from:'2025-01-01',through:'2025-12-31'},personId,salary:w,basicDeductionYen,ordinaryDisabilityDeductionYen,cohabitingSpecialDisabilityDeductionYen,disabilityDeductionYen,actualSocialInsurancePaidYen:s.amountYen,spouseDeduction,
  totalDeductionsYen,taxableBeforeRoundingYen,taxableIncomeYen,...nationalAnnualAmounts2025(tax.baseIncomeTaxYen),
  inputFacts:structuredClone({salaryFacts,actualSocialInsurancePaid,ordinaryDisabilityTaxClaims,spouseClaim,otherDeductionsAndCreditsAbsent,yearEndAdjustmentEligibility}),
  scope:'2025 annual national tax only; no monthly withholding, filing/refund prediction or benefit qualification',sources:NATIONAL_TAX2025_SOURCES};
}
/** Two explicit married adults; catches mutual spouse claims and duplicated dependent ownership. */
export function nationalMarriedSalaryTax2025({incomeYear,people}){
 if(incomeYear!==2025)return outside('Only income year 2025 is implemented');
 if(!Array.isArray(people)||people.length!==2)return pending('Exactly two explicit married-adult tax records required');
 const ids=people.map(p=>p.personId);if(new Set(ids).size!==2||ids.some(id=>!text(id)))return pending('Distinct taxpayer IDs required');
 const rows=people.map(p=>nationalSalaryTax2025({...p,incomeYear}));
 if(people.every(p=>p.spouseClaim?.applies===true))return pending('Mutual spouse claims are not supported; confirmed claimant election required');
 const seen=new Map();
 for(const p of people){
  const c=p.spouseClaim,other=people.find(x=>x.personId!==p.personId),otherIncome=nationalSalaryIncome2025({...other,incomeYear});
  if(c?.applies&&(c.spousePersonId!==other.personId||otherIncome.status!=='known'||c.spouseTotalIncomeYen!==otherIncome.totalIncomeYen))return pending('Spouse income/link does not match the other confirmed taxpayer');
  for(const claim of p.ordinaryDisabilityTaxClaims?.entries||[])if(claim.relationship!=='self'){
   if(seen.has(claim.targetPersonId)&&seen.get(claim.targetPersonId)!==p.personId)return pending('Same dependent/spouse disability deduction allocated to both taxpayers');
   seen.set(claim.targetPersonId,p.personId);
  }
 }
 const complete=rows.every(r=>r.status==='known');
 return {status:complete?'known':'pending',incomeYear,rows,yearEndAdjustedAnnualTaxSumYen:complete?rows.reduce((s,r)=>s+r.yearEndAdjustedAnnualTaxYen,0):undefined,
  reason:complete?undefined:'One or both individual national-tax calculations incomplete',scope:'Only same-2025 individual national annual taxes added; no cross-period household total'};
}
