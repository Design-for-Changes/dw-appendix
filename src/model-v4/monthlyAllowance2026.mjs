import {PROGRAMS} from './allowanceIncome2026.mjs';
export const MONTHLY_ALLOWANCE_SOURCES=Object.freeze({
 law:'https://www.mhlw.go.jp/web/t_doc?dataId=82090000&dataType=0&pageNo=1',
 decree:'https://www.mhlw.go.jp/web/t_doc?dataId=82091000&dataType=0',
 incorporatedLaw:'https://www.mhlw.go.jp/web/t_doc?dataId=82082000&dataType=0&pageNo=1',
 revision:'https://www.mhlw.go.jp/stf/newpage_71570.html',
 tcca:'https://www.city.funabashi.lg.jp/kenkou/shougaisha/004/03/p042515.html',
 child:'https://www.city.funabashi.lg.jp/kenkou/shougaisha/004/03/p042516.html'});
const text=x=>typeof x==='string'&&x.trim().length>0;
const known=x=>x?.status==='known'&&text(x.evidence?.source)&&text(x.evidence?.note);
const month=x=>typeof x==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(x);
const date=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&!Number.isNaN(Date.parse(x))&&new Date(x).toISOString().slice(0,10)===x;
const pending=(reason,state)=>({status:'pending',state,reason});
const outside=reason=>({status:'out-of-scope',reason});
function nextMonth(s){const [y,m]=s.split('-').map(Number);return `${y+(m===12?1:0)}-${String(m===12?1:m+1).padStart(2,'0')}`;}
/** Ordinary recognized claim only. Dates retained separately from confirmed right months. */
export function ordinaryRecognizedAllowancePeriod({program,recipientId,childId,recognition}){
 const r=recognition;
 if(!Object.values(PROGRAMS).includes(program)||!text(recipientId)||!text(childId))return pending('Explicit program/recipient/child required','recognition-unconfirmed');
 if(program===PROGRAMS.CHILD&&recipientId!==childId)return pending('Disabled-child allowance recipient must be the target child','recognition-unconfirmed');
 if(!known(r)||r.program!==program||r.recipientId!==recipientId||r.childId!==childId||r.state!=='recognized')return pending('Recognized individual record required','recognition-unconfirmed');
 if(r.ordinaryRulesConfirmed!==true)return pending('Delayed-claim/retroactive or other period exceptions need separate confirmed treatment','period-exception-unconfirmed');
 if(!date(r.claimDate)||!date(r.decisionDate)||r.decisionDate<r.claimDate||!month(r.benefitStartMonth))return pending('Claim date, decision date and confirmed benefit start month required','recognition-unconfirmed');
 if(r.benefitStartMonth!==nextMonth(r.claimDate.slice(0,7)))return pending('Confirmed start month conflicts with ordinary next-month rule','period-conflict');
 const end=r.benefitEnd;
 if(!known(end)||!(end.month===null||month(end.month)))return pending('Final benefit month or confirmed open end required','recognition-unconfirmed');
 if(end.month!==null&&(!date(r.extinctionDate)||end.month!==r.extinctionDate.slice(0,7)||end.month<r.benefitStartMonth||r.extinctionDate<r.claimDate))return pending('Extinction date/final month conflict; special period cases need separate treatment','period-conflict');
 if(end.month===null&&r.extinctionDate!==null)return pending('Confirmed no extinction date required for open end','recognition-unconfirmed');
 return {status:'known',program,recipientId,childId,benefitStartMonth:r.benefitStartMonth,benefitEndMonth:end.month,
  claimDate:r.claimDate,decisionDate:r.decisionDate,extinctionDate:r.extinctionDate,evidence:structuredClone(r.evidence)};
}
/** Forward rate table deliberately bounded; April2027 revision is unconfirmed. */
export function allowanceMonthlyRate2026({program,targetMonth,childId,confirmedGrade}){
 if(!Object.values(PROGRAMS).includes(program)||!month(targetMonth))return outside('Explicit program and YYYY-MM required');
 if(targetMonth<'2026-08'||targetMonth>'2027-07')return outside('Only August2026-July2027 connection implemented');
 if(program===PROGRAMS.CHILD&&targetMonth>='2027-04')return pending('FY2027 revised amount not verified; current rate not extended','revised-rate-unconfirmed');
 if(program===PROGRAMS.CHILD)return {status:'known',program,targetMonth,monthlyRateYen:16560,rateEffectiveFrom:'2026-04',confirmedThrough:'2027-03',source:MONTHLY_ALLOWANCE_SOURCES.decree};
 const g=confirmedGrade;
 if(!known(g)||g.program!==program||g.targetMonth!==targetMonth||g.childId!==childId||![1,2].includes(g.grade))return pending('Confirmed TCCA grade for this child and effective benefit month required','grade-unconfirmed');
 if(targetMonth>='2027-04')return pending('FY2027 revised amount not verified; current rate not extended','revised-rate-unconfirmed');
 return {status:'known',program,targetMonth,monthlyRateYen:g.grade===1?58450:38930,grade:g.grade,rateEffectiveFrom:'2026-04',confirmedThrough:'2027-03',source:MONTHLY_ALLOWANCE_SOURCES.decree};
}
/** One program/recipient/child/month. Cash transfers are never inferred from entitlement. */
export function monthlyAllowanceEntitlement2026(input){
 const {program,targetMonth,recipientId,childId,recognition,eligibility,appliedIncomeRestriction,exceptions,administrativeNonpayment,paymentHold,confirmedGrade}=input;
 if(!Object.values(PROGRAMS).includes(program)||!month(targetMonth))return outside('Explicit supported program and YYYY-MM required');
 if(targetMonth<'2026-08'||targetMonth>'2027-07')return outside('Outside supported benefit-month window');
 const meta={program,targetMonth,recipientId,childId,referenceIncomeYear:2025,prefecturalTaxFiscalYear:2026,
  amountBasis:'statutory-right-for-benefit-month',cashAmountYen:undefined,cashTransferDate:undefined,
  paymentState:known(paymentHold)&&paymentHold.program===program&&paymentHold.targetMonth===targetMonth&&paymentHold.recipientId===recipientId&&paymentHold.childId===childId?paymentHold.state:'unconfirmed',sources:MONTHLY_ALLOWANCE_SOURCES};
 const result=x=>({...meta,...x,inputFacts:structuredClone(input)});
 const zero=(state,reason)=>result({status:'known',state,entitlementYen:0,reason,eligibilityLost:state==='income-restricted'?false:undefined});
 const scoped=x=>known(x)&&x.program===program&&x.targetMonth===targetMonth&&x.recipientId===recipientId&&x.childId===childId;
 if(!text(recipientId)||!text(childId)||program===PROGRAMS.CHILD&&recipientId!==childId)return result(pending('Recipient/target identity not confirmed','identity-unconfirmed'));
 const period=ordinaryRecognizedAllowancePeriod({program,recipientId,childId,recognition});
 if(period.status==='known'&&(targetMonth<period.benefitStartMonth||period.benefitEndMonth!==null&&targetMonth>period.benefitEndMonth))return zero('outside-confirmed-benefit-period','Before confirmed start or after inclusive final benefit month');
 if(scoped(eligibility)){
  const failed=['disability','residency','facility','disabilityPension','otherConditions'].filter(key=>eligibility.criteria?.[key]===false);
  if(failed.length)return zero('eligibility-failed',`Confirmed eligibility failure: ${failed.join(', ')}`);
 }
 const admin=scoped(administrativeNonpayment)?administrativeNonpayment:undefined;
 if(admin?.kind==='full')return zero('administrative-full-nonpayment','Confirmed full nonpayment decision for this benefit month');
 const income=scoped(appliedIncomeRestriction)?appliedIncomeRestriction:undefined;
 const exception=scoped(exceptions)?exceptions:undefined;
 const incomeValid=income?.referenceIncomeYear===2025&&income?.prefecturalTaxFiscalYear===2026&&income.ordinaryRuleActuallyApplied===true;
 if(incomeValid&&income.restriction==='restricted'&&income.ordinaryRuleActuallyApplied===true&&exception?.disasterIncomeException==='none')return zero('income-restricted','Ordinary income restriction actually applied; disaster exemption confirmed absent');
 if(!exception||exception.disasterIncomeException!=='none'||exception.otherRightsAffectingExceptions!=='none')return result(pending('Rights-affecting exception treatment incomplete; no ordinary amount assumed','exception-unconfirmed'));
 if(!admin||!['none','partial'].includes(admin.kind))return result(pending('Administrative nonpayment treatment unconfirmed','administrative-treatment-unconfirmed'));
 if(period.status!=='known')return result(pending(period.reason,'recognition-unconfirmed'));
 const required=['disability','residency','facility','disabilityPension','otherConditions'];
 if(!scoped(eligibility)||required.some(k=>eligibility.criteria?.[k]!==true))return result(pending('Eligibility criteria incomplete for this month','eligibility-unconfirmed'));
 if(!incomeValid||income.restriction!=='not-restricted')return result(pending('Applied monthly income restriction result unconfirmed','income-unconfirmed'));
 const rate=allowanceMonthlyRate2026({program,targetMonth,childId,confirmedGrade});
 if(rate.status!=='known')return result({...rate,entitlementConditions:'passed',recognitionPeriod:period});
 let withheldYen=0;
 if(admin.kind==='partial'){
  if(!Number.isSafeInteger(admin.withheldYen)||admin.withheldYen<0||admin.withheldYen>rate.monthlyRateYen)return result(pending('Confirmed partial nonpayment amount inconsistent with applicable rate','administrative-treatment-unconfirmed'));
  withheldYen=admin.withheldYen;
 }
 return result({status:'known',state:admin.kind==='partial'?'administrative-partial-nonpayment':'entitled',entitlementYen:rate.monthlyRateYen-withheldYen,
  applicableRateYen:rate.monthlyRateYen,administrativeWithheldYen:withheldYen,recognitionPeriod:period,rate,
  cashInterpretation:'Temporary payment hold or lack of deposit does not set entitlement to zero; no transfer schedule inferred'});
}
/** All rows must enumerate every requested program/child/month; incomplete periods have no sum. */
export function summarizeAllowanceMonths2026({program,recipientId,childId,fromMonth,throughMonth,monthlyResults}){
 if(!Object.values(PROGRAMS).includes(program)||!text(recipientId)||!text(childId)||!month(fromMonth)||!month(throughMonth)||fromMonth>throughMonth||fromMonth<'2026-08'||throughMonth>'2027-07')return outside('Summary requires one program/person/child in supported bounded window');
 const expected=[];for(let m=fromMonth;m<=throughMonth;m=nextMonth(m))expected.push(m);
 if(!Array.isArray(monthlyResults))return pending('Explicit monthly results required','period-incomplete');
 const seen=new Set();for(const r of monthlyResults){
  if(r.program!==program||r.recipientId!==recipientId||r.childId!==childId||!expected.includes(r.targetMonth)||seen.has(r.targetMonth))return pending('Mixed program/person/child, unexpected or duplicate month','period-conflict');seen.add(r.targetMonth);
 }
 const knownRows=monthlyResults.filter(r=>r.status==='known'&&Number.isSafeInteger(r.entitlementYen)&&r.entitlementYen>=0);
 const knownSubtotalYen=knownRows.reduce((s,r)=>s+r.entitlementYen,0),missingMonths=expected.filter(m=>!knownRows.some(r=>r.targetMonth===m));
 return {status:missingMonths.length?'pending':'known',program,recipientId,childId,fromMonth,throughMonth,knownSubtotalYen,
  knownMonthCount:knownRows.length,missingMonthCount:missingMonths.length,missingMonths,
  periodEntitlementYen:missingMonths.length?undefined:knownSubtotalYen,
  scope:'Statutory entitlement for stated period only; not deposits or a household calendar-year total'};
}
