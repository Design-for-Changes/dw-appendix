/* global BigInt */
/** FY2026 ordinary Funabashi municipal/prefectural tax. Forest tax is a separate national tax. */
export const RESIDENT_TAX2026_SOURCES=Object.freeze({
 ratesAndAdjustment:'https://www.city.funabashi.lg.jp/kurashi/zei/007/003/p028458.html',
 roundingAndAnnualRates:'https://www.city.funabashi.lg.jp/kurashi/zei/007/003/p000866.html',
 exemption:'https://www.city.funabashi.lg.jp/kurashi/zei/007/001/p000865.html',
 prefecturalRateSplit:'https://www.pref.chiba.lg.jp/zeimu/aramashi/shurui/kojin-kenminzei/',
 lowIncomeAdjustmentLaw:'https://laws.e-gov.go.jp/law/325AC0000000226/20260401_507AC0000000007',
 independentRounding:'https://www.city.kamagaya.chiba.jp/kurashi-tetsuzuki/zeikin/shizei/kojinshi-kenminzei1/r8kojinjumin.html'});
const pending=reason=>({status:'pending',reason});
const outside=reason=>({status:'out-of-scope',reason});
const text=x=>typeof x==='string'&&x.trim().length>0;
const evidenced=x=>x?.status==='known'&&text(x.evidence?.source)&&text(x.evidence?.note);
const yen=x=>Number.isSafeInteger(x)&&x>=0;
function context({referenceIncomeYear,residentTaxFiscalYear,personId}){
 if(referenceIncomeYear!==2025||residentTaxFiscalYear!==2026)return outside('Only 2025 income -> FY2026 Funabashi annual resident tax implemented');
 if(!text(personId))return pending('Explicit individual taxpayer identity required');
 return {personId,referenceIncomeYear:2025,residentTaxFiscalYear:2026,assessmentDate:'2026-01-01',
  residentTaxScope:'municipal plus prefectural income/per-capita levies',forestTaxScope:'separate national tax collected together, not resident tax',
  cashPaymentSchedule:'not-calculated',sources:RESIDENT_TAX2026_SOURCES};
}
function conditionsFor(personId,c){
 if(!evidenced(c)||c.personId!==personId||c.referenceIncomeYear!==2025||c.residentTaxFiscalYear!==2026||c.municipality!=='Funabashi')return pending('Evidenced same-person FY2026 Funabashi annual conditions required');
 const flags=['residentOn20260101','salaryOnlyNoSeparateTaxOrRetirement','noOfficeOnlyAssessment','otherTaxCreditsAndReductionsAbsent','otherAnnualSpecialReliefsAbsent'];
 if(flags.some(k=>c[k]!==true))return pending('Residence, general assessment and absence of other credits/reductions/special reliefs must be explicit');
 return {status:'known',conditions:structuredClone(c)};
}
function assemble(ctx,{municipalIncomeLevyYen,municipalPerCapitaYen,prefecturalIncomeLevyYen,prefecturalPerCapitaYen,forestEnvironmentTaxYen,...detail}){
 const municipalAnnualYen=municipalIncomeLevyYen+municipalPerCapitaYen,prefecturalAnnualYen=prefecturalIncomeLevyYen+prefecturalPerCapitaYen;
 const residentTaxAnnualYen=municipalAnnualYen+prefecturalAnnualYen,annualAssessmentCollectedTogetherYen=residentTaxAnnualYen+forestEnvironmentTaxYen;
 return {...ctx,status:'known',...detail,
  municipal:{incomeLevyYen:municipalIncomeLevyYen,perCapitaYen:municipalPerCapitaYen,annualYen:municipalAnnualYen},
  prefectural:{incomeLevyYen:prefecturalIncomeLevyYen,perCapitaYen:prefecturalPerCapitaYen,annualYen:prefecturalAnnualYen},
  residentTaxAnnualYen,forestEnvironmentNationalTax:{status:'known',annualYen:forestEnvironmentTaxYen,taxType:'national',collectedTogether:true},annualAssessmentCollectedTogetherYen,
  interpretation:'Same-FY tax assessment only, not actual instalments, household net income or a cross-period total'};
}
/** Exact supplementary Article3-3(2)/(5), no-other-credit scope.
 * Article20-4-2(3) truncates the final confirmed tax after this reduction.
 */
export function ordinaryLowIncomeLevyAdjustment2026({referenceIncomeYear,residentTaxFiscalYear,totalIncomeYen,incomeExemptThresholdYen,municipalBeforeFinalRoundingYen,prefecturalBeforeFinalRoundingYen}){
 if(referenceIncomeYear!==2025||residentTaxFiscalYear!==2026)return outside('Only FY2026 low-income adjustment implemented');
 if(![totalIncomeYen,incomeExemptThresholdYen,municipalBeforeFinalRoundingYen,prefecturalBeforeFinalRoundingYen].every(yen))return pending('Confirmed integer pre-final-rounding tax amounts and income/threshold required');
 const M=BigInt(municipalBeforeFinalRoundingYen),P=BigInt(prefecturalBeforeFinalRoundingYen),sum=M+P;
 if(M*2n!==P*3n)return outside('Only verified 6/4 rate and 3/2 personal-credit split without other credits supported');
 if(sum>BigInt(Number.MAX_SAFE_INTEGER))return outside('Combined levy exceeds supported safe integer range');
 if(totalIncomeYen<=incomeExemptThresholdYen&&sum>0n)return pending('Income-exempt inputs must already have zero levies before proportional adjustment');
 const excess=BigInt(Math.max(0,totalIncomeYen-incomeExemptThresholdYen)),retained=excess<sum?excess:sum,applied=sum>0n&&retained<sum;
 const denominator=sum===0n?1n:sum,numeratorM=sum===0n?0n:M*retained,numeratorP=sum===0n?0n:P*retained;
 return {status:'known',referenceIncomeYear:2025,residentTaxFiscalYear:2026,applied,totalIncomeYen,incomeExemptThresholdYen,incomeAboveThresholdYen:Number(excess),municipalBeforeFinalRoundingYen,prefecturalBeforeFinalRoundingYen,
  totalIncomeLevyBeforeFinalRoundingYen:Number(sum),totalReductionBeforeFinalRoundingYen:Number(sum-retained),
  municipalRetainedExact:{numerator:numeratorM.toString(),denominator:denominator.toString()},prefecturalRetainedExact:{numerator:numeratorP.toString(),denominator:denominator.toString()},
  municipalFinalIncomeLevyYen:Number(numeratorM/(denominator*100n)*100n),prefecturalFinalIncomeLevyYen:Number(numeratorP/(denominator*100n)*100n),
  roundingOrder:'Supplementary Article3-3 proportional reduction on pre-final amounts, then Article20-4-2 final 100-yen truncation separately',source:RESIDENT_TAX2026_SOURCES.lowIncomeAdjustmentLaw};
}
/** Conservative detector if annual proof is incomplete. */
export function possibleLowIncomeLevyAdjustment2026(m){
 if(m?.status!=='known'||m.referenceIncomeYear!==2025||m.residentTaxFiscalYear!==2026||m.incomeLevyExempt!==false)return false;
 if(![m.taxableIncomeYen,m.personalDifferenceYen,m.totalIncomeYen,m.incomeLevyExemptThresholdYen].every(yen))return false;
 const base=m.taxableIncomeYen<=2000000?Math.min(m.personalDifferenceYen,m.taxableIncomeYen):Math.max(50000,m.personalDifferenceYen-(m.taxableIncomeYen-2000000));
 const M=Math.max(0,m.taxableIncomeYen*6/100-base*3/100),P=Math.max(0,m.taxableIncomeYen*4/100-base*2/100);
 return m.totalIncomeYen-M-P<m.incomeLevyExemptThresholdYen;
}
/** Receives the existing same-year municipal calculation, never a day-service adjusted levy. */
export function ordinaryAnnualResidentTax2026({referenceIncomeYear,residentTaxFiscalYear,personId,municipalCalculation,conditions}){
 const ctx=context({referenceIncomeYear,residentTaxFiscalYear,personId});if(ctx.status)return ctx;
 const checked=conditionsFor(personId,conditions);if(checked.status!=='known')return {...ctx,...checked};
 if(conditions.profile!=='ordinary-adult-no-special-exemption'||conditions.ordinaryAdultNoSpecialExemptions!==true)return {...ctx,...pending('Only explicitly ordinary adult exemption profile supported here')};
 const m=municipalCalculation;
 if(m?.status!=='known')return {...ctx,...pending(m?.reason||'Existing FY2026 municipal calculation is incomplete')};
 if(m.referenceIncomeYear!==2025||m.residentTaxFiscalYear!==2026||(m.personId!==undefined&&m.personId!==personId)||m.municipalCalculationStage==='after-statutory-low-income-adjustment'||m.scope!=='municipal-income-levy-only; no prefectural tax, forest tax or disposable income'||typeof m.evidence!=='string'||!m.evidence.trim())return {...ctx,...pending('Confirmed original municipal-tax calculation required; no service levy/other year/collection amount substitution')};
 const fields=['totalIncomeYen','taxableBeforeRoundingYen','taxableIncomeYen','personalDifferenceYen','municipalIncomeLevyYen','municipalPerCapitaYen','perCapitaExemptThresholdYen','incomeLevyExemptThresholdYen'];
 if(fields.some(k=>!yen(m[k]))||m.totalIncomeYen>10000000||m.taxableIncomeYen!==Math.floor(m.taxableBeforeRoundingYen/1000)*1000||typeof m.perCapitaTaxable!=='boolean'||typeof m.incomeLevyExempt!=='boolean')return {...ctx,...pending('Salary-only municipal taxable base, statutory personal difference and exemption information incomplete/outside supported scope')};
 const threshold=m.perCapitaExemptThresholdYen;
 if(!(threshold===450000||(threshold>=1010000&&(threshold-310000)%350000===0)))return {...ctx,...pending('Unsupported ordinary per-capita exemption threshold')};
 const expectedIncomeThreshold=threshold===450000?450000:threshold+110000;
 const perCapitaTaxable=m.totalIncomeYen>threshold,incomeLevyExempt=m.totalIncomeYen<=expectedIncomeThreshold;
 if(m.incomeLevyExemptThresholdYen!==expectedIncomeThreshold||m.perCapitaTaxable!==perCapitaTaxable||m.incomeLevyExempt!==incomeLevyExempt||m.municipalPerCapitaYen!==(perCapitaTaxable?3000:0))return {...ctx,...pending('Municipal exemption/per-capita information conflicts with ordinary Funabashi thresholds')};
 const adjustmentBaseYen=m.taxableIncomeYen<=2000000?Math.min(m.personalDifferenceYen,m.taxableIncomeYen):Math.max(50000,m.personalDifferenceYen-(m.taxableIncomeYen-2000000));
 const municipalCredit=adjustmentBaseYen*3/100,prefecturalAdjustmentCreditYen=adjustmentBaseYen*2/100;
 const municipalAfter=incomeLevyExempt?0:Math.max(0,m.taxableIncomeYen*6/100-municipalCredit);
 if(m.municipalIncomeLevyYen!==Math.floor(municipalAfter/100)*100)return {...ctx,...pending('Original municipal levy is inconsistent; adjusted service levy cannot substitute')};
 const prefecturalLevyBeforeCreditsYen=m.taxableIncomeYen*4/100;
 const prefecturalLevyAfterAdjustmentBeforeRoundingYen=incomeLevyExempt?0:Math.max(0,prefecturalLevyBeforeCreditsYen-prefecturalAdjustmentCreditYen);
 const low=ordinaryLowIncomeLevyAdjustment2026({referenceIncomeYear:2025,residentTaxFiscalYear:2026,totalIncomeYen:m.totalIncomeYen,incomeExemptThresholdYen:expectedIncomeThreshold,municipalBeforeFinalRoundingYen:municipalAfter,prefecturalBeforeFinalRoundingYen:prefecturalLevyAfterAdjustmentBeforeRoundingYen});
 if(low.status!=='known')return {...ctx,...low};
 const prefecturalIncomeLevyYen=low.prefecturalFinalIncomeLevyYen,municipalIncomeLevyYen=low.municipalFinalIncomeLevyYen;
 return assemble(ctx,{municipalIncomeLevyYen,municipalPerCapitaYen:m.municipalPerCapitaYen,prefecturalIncomeLevyYen,prefecturalPerCapitaYen:perCapitaTaxable?1000:0,forestEnvironmentTaxYen:perCapitaTaxable?1000:0,
  taxCategory:!perCapitaTaxable?'non-taxable':incomeLevyExempt?'per-capita-only-by-income-exemption':municipalIncomeLevyYen+prefecturalIncomeLevyYen===0?(low.applied?'per-capita-with-zero-income-levy-after-statutory-adjustment':'per-capita-with-zero-calculated-income-levy'):'income-and-per-capita',
  totalIncomeYen:m.totalIncomeYen,taxableBeforeRoundingYen:m.taxableBeforeRoundingYen,taxableIncomeYen:m.taxableIncomeYen,personalDifferenceYen:m.personalDifferenceYen,
  perCapitaExemptThresholdYen:threshold,incomeLevyExemptThresholdYen:expectedIncomeThreshold,incomeLevyExempt,perCapitaTaxable,
  adjustmentBaseYen,municipalAdjustmentCreditYen:municipalCredit,prefecturalAdjustmentCreditYen,prefecturalLevyBeforeCreditsYen,prefecturalLevyAfterAdjustmentBeforeRoundingYen,
  municipalLevyAfterAdjustmentBeforeRoundingYen:municipalAfter,lowIncomeLevyAdjustment:low,
  inputConditions:structuredClone(conditions),originalMunicipalCalculation:structuredClone(m),
  dayServiceBasisPolicy:'Confirmed municipal income levy after statutory low-income reduction only; no prefectural/per-capita/forest tax imported into day-service assessment'});
}
/** The explicit zero-income resident child in the first household; no general disability exemption inference. */
export function zeroIncomeResidentChildTax2026({referenceIncomeYear,residentTaxFiscalYear,personId,conditions,incomeFact}){
 const ctx=context({referenceIncomeYear,residentTaxFiscalYear,personId});if(ctx.status)return ctx;
 const checked=conditionsFor(personId,conditions);if(checked.status!=='known')return {...ctx,...checked};
 if(conditions.profile!=='confirmed-zero-income-resident-child'||conditions.minorOn20260101!==true||!evidenced(incomeFact)||incomeFact.personId!==personId||incomeFact.incomeYear!==2025||incomeFact.salaryYen!==0||incomeFact.otherIncomeYen!==0)return {...ctx,...pending('Confirmed individual zero-income resident minor facts required; missing income is not zero')};
 return assemble(ctx,{municipalIncomeLevyYen:0,municipalPerCapitaYen:0,prefecturalIncomeLevyYen:0,prefecturalPerCapitaYen:0,forestEnvironmentTaxYen:0,
  taxCategory:'non-taxable-confirmed-zero-income-resident-child',reason:'Confirmed total income zero below ordinary non-taxable thresholds; no disability-degree inference',inputConditions:structuredClone(conditions),incomeFact:structuredClone(incomeFact)});
}
export function householdAnnualResidentTax2026({referenceIncomeYear,residentTaxFiscalYear,requiredPersonIds,byPerson}){
 if(referenceIncomeYear!==2025||residentTaxFiscalYear!==2026)return outside('Only FY2026 household resident tax supported');
 if(!Array.isArray(requiredPersonIds)||!requiredPersonIds.length||new Set(requiredPersonIds).size!==requiredPersonIds.length||requiredPersonIds.some(id=>!text(id))||!byPerson||Object.keys(byPerson).length!==requiredPersonIds.length||requiredPersonIds.some(id=>!Object.hasOwn(byPerson,id)))return pending('Complete explicit household person set and all individual records required');
 const rows=requiredPersonIds.map(id=>byPerson[id]);
 if(rows.some((r,i)=>r?.status!=='known'||r?.personId!==requiredPersonIds[i]||r.referenceIncomeYear!==2025||r.residentTaxFiscalYear!==2026))return {referenceIncomeYear:2025,residentTaxFiscalYear:2026,...pending('Some annual tax records are uncomputed or mismatched; no partial amount presented as household assessment'),uncomputedPersonIds:requiredPersonIds.filter((id,i)=>rows[i]?.status!=='known'||rows[i]?.personId!==id||rows[i]?.referenceIncomeYear!==2025||rows[i]?.residentTaxFiscalYear!==2026)};
 const invalid=rows.some(r=>![r.municipal?.incomeLevyYen,r.municipal?.perCapitaYen,r.municipal?.annualYen,r.prefectural?.incomeLevyYen,r.prefectural?.perCapitaYen,r.prefectural?.annualYen,r.forestEnvironmentNationalTax?.annualYen,r.residentTaxAnnualYen,r.annualAssessmentCollectedTogetherYen].every(yen));
 if(invalid)return pending('Some same-FY tax component amounts are missing; no zero or NaN substituted');
 const sum=f=>rows.reduce((s,r)=>s+f(r),0);
 return {status:'known',referenceIncomeYear:2025,residentTaxFiscalYear:2026,personIds:[...requiredPersonIds],
  municipal:{incomeLevyYen:sum(r=>r.municipal.incomeLevyYen),perCapitaYen:sum(r=>r.municipal.perCapitaYen),annualYen:sum(r=>r.municipal.annualYen)},
  prefectural:{incomeLevyYen:sum(r=>r.prefectural.incomeLevyYen),perCapitaYen:sum(r=>r.prefectural.perCapitaYen),annualYen:sum(r=>r.prefectural.annualYen)},
  residentTaxAnnualYen:sum(r=>r.residentTaxAnnualYen),forestEnvironmentNationalTax:{taxType:'national',annualYen:sum(r=>r.forestEnvironmentNationalTax.annualYen)},annualAssessmentCollectedTogetherYen:sum(r=>r.annualAssessmentCollectedTogetherYen),
  scope:'One FY2026 tax assessment, forest national tax separate; not actual annual cash payments or disposable income',sources:RESIDENT_TAX2026_SOURCES};
}
