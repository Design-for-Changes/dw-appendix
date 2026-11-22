import {evaluateSalarySection2025} from './salarySections2025.mjs';
import {compareResearchSalaryBreakdowns} from './researchBreakdown2025.mjs';
import {PROGRAMS} from './allowanceIncome2026.mjs';
const text=x=>typeof x==='string'&&x.trim().length>0;
const evidenced=x=>x?.status==='known'&&text(x.evidence?.source)&&text(x.evidence?.note);
const yen=x=>Number.isSafeInteger(x)&&x>=0;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const requireThat=(x,s)=>{if(!x)throw new TypeError(s);};
export const BENCHMARK2025_SOURCES=Object.freeze({law:'https://www.mhlw.go.jp/web/t_doc?dataId=82090000&dataType=0&pageNo=1',incorporatedLaw:'https://www.mhlw.go.jp/web/t_doc?dataId=82082000&dataType=0&pageNo=1',incomeScope:'https://www.mhlw.go.jp/web/t_doc?dataId=82091000&dataType=0'});
export const BENCHMARK2025_EXCLUSIONS=Object.freeze(['medicalOutOfPocket','M01','N04Cost','N04Reimbursement','FunabashiIndependentMonthly8000','otherLegacyModelItems']);
const interpretation='Reference-month-fixed policy comparison prototype; not actual calendar-year cash flow, continuous12-month entitlement, deposits, household disposable income, or the old model';
function validContract(c){return evidenced(c)&&(c.mode==='reference-month-fixed-annualization'||(c.mode==='stationary-reference-month-fixed-annualization'&&c.insuranceInputMode==='stationary-calendar-payroll-estimate'&&c.counterfactualBasis==='separate-stationary-households'))&&c.salaryIncomeYear===2025&&c.nationalTaxIncomeYear===2025&&c.residentTaxFiscalYear===2026&&c.referenceMonth==='2026-08'&&c.monthlyMultiplier===12&&c.nationalTaxBasis==='year-end-adjusted-annual-tax'&&c.benefitBasis==='statutory-right-for-benefit-month'&&c.noBenefitFeedbackToTaxesServiceOrOtherAllowance===true&&c.personalInsuranceBurdenInputComplete===true;}
/** Composition only; no recomputation from cash deposits or aggregate collection totals. */
export function annualizedBenchmarkFromBreakdown2025({breakdown:r,contract,insuranceBurdenByPerson}){
 const context={metric:'Y*',interpretation,formula:'salary2025 - nationalYearEnd2025 - residentTaxFY2026 - forestNationalFY2026 - explicitPersonalInsurance2025 + 12*(TCCA_Aug2026 + childWelfare_Aug2026 - dayServiceCharge_Aug2026)',referenceMonth:'2026-08',monthlyMultiplier:12,contract:structuredClone(contract),sources:BENCHMARK2025_SOURCES,excluded:Object.fromEntries(BENCHMARK2025_EXCLUSIONS.map(k=>[k,{status:'excluded',reason:'Not adopted in this prototype; no zero-effect claim'}])),actualCashFlow:{status:'not-calculated'},recoveryIncome:{status:'not-calculated'}};
 if(!validContract(contract))return {...context,status:'pending',reason:'Explicit supported years, August2026 statutory rights, factor12, tax basis, complete insurance and no-feedback policy required'};
 if(r?.status!=='known'||r.salary?.incomeYear!==2025||r.nationalTax?.incomeYear!==2025||r.localTax?.referenceIncomeYear!==2025||r.localTax?.residentTaxFiscalYear!==2026)return {...context,status:'pending',reason:'Same-household supported source breakdown/year required'};
 const ids=Object.keys(r.salary.byPerson),childIds=Object.keys(r.dayService.byChild||{}),components=[];
 const add=(id,sign,multiplier,status,amount,period,origin)=>components.push({id,sign,multiplier,status:status==='known'&&yen(amount)?'known':'pending',...(status==='known'&&yen(amount)?{amountYen:amount,contributionYen:sign*multiplier*amount}:{}),period,unit:'yen',origin:structuredClone(origin)});
 add('salary',1,1,ids.length===2&&Object.values(r.salary.byPerson).every(yen)&&Object.values(r.salary.byPerson).reduce((s,x)=>s+x,0)===r.salary.householdSalaryYen?'known':'pending',r.salary.householdSalaryYen,{basis:'income-year',year:2025},{byPerson:r.salary.byPerson,source:r.salary.source});
 const n=Object.fromEntries(ids.map(id=>[id,r.nationalTax.byPerson[id]]));
 add('nationalYearEndTax',-1,1,Object.entries(n).every(([id,x])=>x?.status==='known'&&x.personId===id&&x.incomeYear===2025&&yen(x.yearEndAdjustedAnnualTaxYen))?'known':'pending',Object.values(n).reduce((s,x)=>s+(x?.yearEndAdjustedAnnualTaxYen??NaN),0),{basis:'income-year',year:2025},{basis:'year-end-adjusted-annual-tax',byPerson:n,sources:r.nationalTax.sources});
 const a=r.localTax.householdAnnualAssessment;
 const localOK=a?.status==='known'&&a.referenceIncomeYear===2025&&a.residentTaxFiscalYear===2026&&same([...a.personIds].sort(),[...ids,...childIds].sort());
 add('residentTax',-1,1,localOK?'known':'pending',a?.residentTaxAnnualYen,{basis:'fiscal-year',year:2026},{byPerson:r.localTax.annualResidentTaxByPerson,municipal:a?.municipal,prefectural:a?.prefectural,sources:r.localTax.annualSources});
 add('forestNationalTax',-1,1,localOK&&a?.forestEnvironmentNationalTax?.taxType==='national'?'known':'pending',a?.forestEnvironmentNationalTax?.annualYen,{basis:'fiscal-year',year:2026},{byPerson:r.localTax.forestEnvironmentNationalTaxByPerson,sources:r.localTax.annualSources,notIncludedInResidentTax:true});
 const insuranceSet=insuranceBurdenByPerson&&same(Object.keys(insuranceBurdenByPerson).sort(),[...ids].sort());
 const stationary=contract.mode==='stationary-reference-month-fixed-annualization';
 const insuranceOK=insuranceSet&&ids.every(id=>{const x=insuranceBurdenByPerson[id],tax=r.socialInsuranceDeductions?.byPerson?.[id],d=x?.derivation;const originOK=stationary?x?.originKind==='stationary-calendar-payroll-estimate'&&tax?.status==='known'&&tax.originKind===x.originKind&&tax.amountYen===x.amountYen&&same(tax.derivation,d)&&d?.annualSalaryYen===r.salary.byPerson[id]&&d?.basis==='calculated-calendar2025-deduction'&&d?.noActualOrFixedAmountCombined===true:tax?.originKind!=='stationary-calendar-payroll-estimate'&&['actual-record','synthetic-fixed-assumption'].includes(x?.originKind);return evidenced(x)&&x.personId===id&&x.payerPersonId===id&&x.incomeYear===2025&&x.burdenFrom==='2025-01-01'&&x.burdenThrough==='2025-12-31'&&x.basis===(stationary?'calculated-calendar-personal-burden-in-2025':'explicit-personal-burden-in-2025')&&x.scope==='all-explicit-personal-insurance-burden'&&x.includesEmploymentInsurance===true&&originOK&&text(x.originDescription)&&yen(x.amountYen);});
 add('personalInsuranceBurden',-1,1,insuranceOK?'known':'pending',insuranceOK?ids.reduce((s,id)=>s+insuranceBurdenByPerson[id].amountYen,0):undefined,{basis:'explicit-burden-year',year:2025,from:'2025-01-01',through:'2025-12-31'},{byPerson:insuranceBurdenByPerson,notAutomaticallyCopiedFromTaxDeductionOrInsuranceMonthEstimate:true,taxDeductionInputsForAudit:r.socialInsuranceDeductions});
 for(const program of Object.values(PROGRAMS)){
  const rows=r.allowances?.[program]?.monthly,row=rows?.[0],v=row?.statutoryAmount,role=r.fixedRoles?.[program];
  const valid=rows?.length===1&&row.targetMonth==='2026-08'&&v?.status==='known'&&v.program===program&&v.targetMonth==='2026-08'&&v.amountBasis==='statutory-right-for-benefit-month'&&v.referenceIncomeYear===2025&&v.prefecturalTaxFiscalYear===2026&&role?.status==='known'&&v.recipientId===role.recipientId&&childIds.includes(v.childId)&&row.incomeRestriction?.status==='known';
  add(program,1,12,valid?'known':'pending',v?.entitlementYen,{basis:'reference-benefit-right-month-repeated',month:'2026-08',repeat:12},{monthlyResult:row,role,oneAdditionOnly:true,noFeedback:true,sources:r.sources.allowanceAmount});
 }
 const service=childIds.length===1?r.dayService.byChild[childIds[0]]:undefined,row=service?.[0];
 const serviceOK=service?.length===1&&row.serviceMonth==='2026-08'&&row.referenceIncomeYear===2025&&row.residentTaxFiscalYear===2026&&row.actualCharge?.status==='known';
 add('dayServiceCharge',-1,12,serviceOK?'known':'pending',row?.actualCharge?.chargeYen,{basis:'reference-service-month-repeated',month:'2026-08',repeat:12},{childId:childIds[0],monthlyResult:row,sources:r.dayService.sources,notCapUnlessChargeEqualsCap:true});
 for(const item of components)if(item.status==='known'&&!Number.isSafeInteger(item.contributionYen)){item.status='pending';delete item.contributionYen;item.reason='Unsupported integer magnitude';}
 const missingComponents=components.filter(c=>c.status!=='known').map(c=>c.id),total=missingComponents.length?undefined:components.reduce((s,c)=>s+c.contributionYen,0);
 return {...context,status:missingComponents.length||!Number.isSafeInteger(total)?'pending':'known',...(Number.isSafeInteger(total)?{indicatorYen:total}:{}),...(missingComponents.length?{reason:'Mandatory components missing, mismatched or outside supported basis; no total or zero substitution'}:{}),missingComponents,components,caseId:r.caseId,conditionsFingerprint:r.conditionsFingerprint,salaryByPerson:structuredClone(r.salary.byPerson),fixedRoles:structuredClone(r.fixedRoles),sourceBreakdown:r};
}
/** Always evaluate fresh salary coordinates using the section's deduction provenance guards. */
export function annualizedBenchmark2025({household,salaryByPerson,contract,insuranceBurdenByPerson}){
 if(contract?.mode==='stationary-reference-month-fixed-annualization')return {status:'pending',reason:'Use dedicated stationary benchmark path; fixed-input salary sampler cannot supply variable payroll'};
 if(!validContract(contract))return annualizedBenchmarkFromBreakdown2025({contract,insuranceBurdenByPerson});
 const ids=household.parents.map(p=>p.personId);requireThat(ids.length===2&&salaryByPerson&&same(Object.keys(salaryByPerson).sort(),[...ids].sort()),'Both explicit parent salary coordinates required');
 const section=evaluateSalarySection2025({household,varyingPersonId:ids[0],fixedSalaryByPerson:{[ids[1]]:salaryByPerson[ids[1]]},fromYen:salaryByPerson[ids[0]],throughYen:salaryByPerson[ids[0]],stepYen:1,months:[contract.referenceMonth],includeFullPoints:true});
 if(section.status!=='known')return {status:section.status,reason:section.reason,metric:'Y*',interpretation};
 return annualizedBenchmarkFromBreakdown2025({breakdown:section.points[0].fullBreakdown,contract,insuranceBurdenByPerson});
}
export function compareAnnualizedBenchmarks2025(before,after,{kind,personId}={}){
 requireThat(before.contract?.mode!=='stationary-reference-month-fixed-annualization'&&after.contract?.mode!=='stationary-reference-month-fixed-annualization','Use dedicated stationary comparison; fixed insurance comparison cannot reclassify variable payroll');
 requireThat(kind==='single-parent-salary-change','Benchmark comparison only supports one declared salary axis; reallocation requires a separate experiment');
 requireThat(same(before.contract,after.contract),'Different reference month or composition contract');
 requireThat(same(before.components?.find(c=>c.id==='personalInsuranceBurden')?.origin?.byPerson,after.components?.find(c=>c.id==='personalInsuranceBurden')?.origin?.byPerson),'Insurance burden assumptions changed');
 const sourceComparison=compareResearchSalaryBreakdowns(before.sourceBreakdown,after.sourceBreakdown,{kind,personId});
 const common={kind,personId,metric:'Y*',referenceMonth:'2026-08',interpretation,beforeSalaryByPerson:before.salaryByPerson,afterSalaryByPerson:after.salaryByPerson,sourceComparison,
  localOneYenComparison:Math.abs(after.salaryByPerson[personId]-before.salaryByPerson[personId])===1,strictGlobalCliffClaim:false};
 if(before.status!=='known'||after.status!=='known')return {...common,status:'pending',reason:'Both complete benchmark endpoints required; no partial difference'};
 const componentDeltas=before.components.map(c=>{const d=after.components.find(x=>x.id===c.id);return {id:c.id,period:c.period,beforeAmountYen:c.amountYen,afterAmountYen:d.amountYen,contributionDeltaYen:d.contributionYen-c.contributionYen,sign:c.sign,multiplier:c.multiplier};});
 const salaryDeltaYen=componentDeltas.find(x=>x.id==='salary').contributionDeltaYen,indicatorDeltaYen=after.indicatorYen-before.indicatorYen;
 return {...common,status:'known',beforeIndicatorYen:before.indicatorYen,afterIndicatorYen:after.indicatorYen,salaryDeltaYen,indicatorDeltaYen,institutionContributionExcludingSalaryYen:indicatorDeltaYen-salaryDeltaYen,componentDeltas,recoveryIncome:{status:'not-calculated'}};
}
/** Dedicated indicator section with the same fixed-condition salary-axis guards. */
export function evaluateAnnualizedBenchmarkSection2025({contract,insuranceBurdenByPerson,...spec}){
 if(contract?.mode==='stationary-reference-month-fixed-annualization')return {status:'pending',reason:'Use dedicated stationary benchmark path; fixed-input salary sampler cannot supply variable payroll'};
 if(!validContract(contract))return annualizedBenchmarkFromBreakdown2025({contract,insuranceBurdenByPerson});
 if(Object.hasOwn(spec,'months'))requireThat(same(spec.months,[contract.referenceMonth]),'Explicit source months must match the single benchmark reference month');
 const source=evaluateSalarySection2025({...spec,months:[contract.referenceMonth],includeFullPoints:true});
 if(source.status!=='known')return source;
 const points=source.points.map(p=>annualizedBenchmarkFromBreakdown2025({breakdown:p.fullBreakdown,contract,insuranceBurdenByPerson}));
 const intervals=points.slice(1).map((p,i)=>compareAnnualizedBenchmarks2025(points[i],p,{kind:'single-parent-salary-change',personId:source.varyingPersonId}));
 return {status:points.every(p=>p.status==='known')?'known':'pending',metric:'Y*',interpretation,referenceMonth:'2026-08',monthlyMultiplier:12,fromYen:source.fromYen,throughYen:source.throughYen,stepYen:source.stepYen,varyingPersonId:source.varyingPersonId,fixedSalaryByPerson:source.fixedSalaryByPerson,evaluatedPointCount:points.length,points,intervals,staticAssumptions:source.staticAssumptions,deductionValidationHolds:source.deductionValidationHolds,extrapolation:'not-performed',representativeness:'not-claimed',recoveryIncome:{status:'not-calculated'},excluded:BENCHMARK2025_EXCLUSIONS};
}
