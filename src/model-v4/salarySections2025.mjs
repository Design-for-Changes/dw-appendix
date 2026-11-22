import {createCase}from'./core.mjs';
import {researchSalaryBreakdown2025}from'./researchBreakdown2025.mjs';
import {diagnoseResearchSalaryComparison}from'./researchDiagnostics2026.mjs';
import {standardIncomeTax2025}from'./nationalTax2025.mjs';
const text=x=>typeof x==='string'&&x.trim().length>0;
const evidenced=x=>x?.status==='known'&&text(x.evidence?.source)&&text(x.evidence?.note);
const yen=x=>Number.isSafeInteger(x)&&x>=0;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function requireThat(x,reason){if(!x)throw new TypeError(reason);}
/** Sampling uses modelled application conditions, never a literal deduction from an older salary vector. */
function samplingHousehold(input){
 const household=structuredClone(createCase(input)),holds=[];
 for(const p of household.parents){
  const f=household.researchFacts?.prefecturalTax2026?.spouseApplicationByPerson?.[p.personId];
  const valid=evidenced(f)&&f.taxpayerId===p.personId&&f.referenceIncomeYear===2025&&f.prefecturalTaxFiscalYear===2026&&
   f.sameConfirmedGeneralSpouseElectionAsMunicipal===true&&f.syntheticApplication===true&&f.applicationMode==='recompute-for-each-salary-coordinate'&&
   !Object.hasOwn(f,'amountYen')&&!Object.hasOwn(f,'deductionYen')&&!Object.hasOwn(f,'inputSalaryProvenanceYen');
  if(!valid){
   const reason='Section requires evidenced same-person/FY2026 modelled spouse-tax application conditions for fresh calculation; literal/old-coordinate deductions are not reused';
   holds.push({personId:p.personId,component:'allowance-spouse-special-deduction',reason});
   if(household.researchFacts?.prefecturalTax2026?.spouseApplicationByPerson)household.researchFacts.prefecturalTax2026.spouseApplicationByPerson[p.personId]={...f,status:'pending',reason};
  }
 }
 return {household,holds};
}
function observations(p){
 const out=[];
 const unit=(component,period)=>component==='national-rate-percent'?'％':component==='national-spouse-deduction-kind'||component==='resident-tax-category'?'区分':component==='allowance-income-restriction'?'所得制限の状態':period.type==='monthly'?'円/月':period.basis==='income-year'?'円/年分':'円/年度';
 const add=(component,entity,period,kind,r,value,sourceSet)=>out.push({unit:unit(component,period),key:JSON.stringify([component,entity,period]),component,entity,period,kind,
  status:r?.status==='known'?(value!==undefined?'known':'pending'):(r?.status==='out-of-scope'?'out-of-scope':'pending'),value:r?.status==='known'?value:undefined,reason:r?.reason||(r?.status==='known'&&value===undefined?'Component value not provided':undefined),sourceSet});
 const year={type:'annual',year:2025,basis:'income-year'},fy={type:'annual',year:2026,basis:'fiscal-year'};
 for(const id of Object.keys(p.salary.byPerson)){
  const n=p.nationalTax.byPerson[id];
  add('national-basic-deduction',id,year,'tax-policy',n,n.basicDeductionYen,'national');
  add('national-spouse-deduction-kind',id,year,'tax-policy',n,n.spouseDeduction?.kind,'national');
  add('national-spouse-deduction-amount',id,year,'tax-policy',n,n.spouseDeduction?.deductionYen,'national');
  const rate=n.status==='known'?standardIncomeTax2025(n.taxableIncomeYen):n;
  add('national-rate-percent',id,year,'tax-policy',rate,rate.ratePercent,'national');
  add('national-year-end-annual-tax',id,year,'tax-amount',n,n.yearEndAdjustedAnnualTaxYen,'national');
  // This is an already reconstructed deduction trace, not an additional subtraction.
  const traces=Object.values(p.allowances).flatMap(g=>g.monthly[0]?.incomeRestriction.calculations||[]).filter(x=>x.personId===id);
  const trace=traces.find(x=>x.status==='known')||traces[0]||{status:'pending',reason:'No reconstructed tax-deduction trace'};
  add('prefectural-spouse-special-deduction',id,fy,'tax-policy',trace,trace.spouseSpecialDeductionYen,'prefecturalSpouseSpecial');
 }
 for(const [id,annual]of Object.entries(p.localTax.annualResidentTaxByPerson)){
  const m=p.localTax.municipalIncomeLevyByPerson[id]||{status:annual.status,municipalIncomeLevyYen:annual.municipal?.incomeLevyYen,reason:annual.reason};
  add('resident-tax-category',id,fy,'tax-policy',annual,annual.taxCategory,'annualResidentTax');
  add('municipal-income-levy',id,fy,'tax-amount',m,m.municipalIncomeLevyYen,'annualResidentTax');
  add('prefectural-income-levy',id,fy,'tax-amount',annual,annual.prefectural?.incomeLevyYen,'annualResidentTax');
  const cap=p.localTax.perCapitaByPerson[id],forest=p.localTax.forestEnvironmentNationalTaxByPerson[id];
  add('municipal-per-capita',id,fy,'tax-policy',cap,cap.municipalYen,'annualResidentTax');
  add('prefectural-per-capita',id,fy,'tax-policy',cap,cap.prefecturalYen,'annualResidentTax');
  add('forest-national-tax',id,fy,'tax-policy',forest,forest.annualYen,'annualResidentTax');
 }
 for(const [id,rs]of Object.entries(p.dayService.byChild))for(const r of rs){
  const period={type:'monthly',month:r.serviceMonth,basis:'service-month'};
  add('day-service-cap',id,period,'service-cap',r.cap,r.cap.capYen,'dayService');
  add('day-service-charge',id,period,'service-charge',r.actualCharge,r.actualCharge.chargeYen,'dayService');
 }
 for(const [program,g]of Object.entries(p.allowances))for(const r of g.monthly){
  const period={type:'monthly',month:r.targetMonth,basis:'benefit-right-month'};
  add('allowance-income-restriction',program,period,'benefit-income-stop',r.incomeRestriction,r.incomeRestriction.restriction,'allowanceIncome');
  add('allowance-entitlement',program,period,'benefit-entitlement',r.statutoryAmount,r.statutoryAmount.entitlementYen,'allowanceAmount');
 }
 return out;
}
function project(p){
 const deductions={};
 for(const [program,g]of Object.entries(p.allowances))deductions[program]=(g.monthly[0]?.incomeRestriction.calculations||[]).map(c=>({personId:c.personId,role:c.role,status:c.status,reason:c.reason,
  salaryInputYen:c.inputFacts?.annualGrossTaxableSalaryYen,referenceIncomeYear:c.referenceIncomeYear,prefecturalTaxFiscalYear:c.prefecturalTaxFiscalYear,
  spouseSpecialDeductionYen:c.spouseSpecialDeductionYen,spouseSpecialTaxDeduction:c.spouseSpecialTaxDeduction,
  signedFormulaYen:c.signedFormulaYen,bypassReason:c.status==='bypassed'?c.reason:undefined}));
 return {salaryByPerson:p.salary.byPerson,conditionsFingerprint:p.conditionsFingerprint,componentCompleteness:p.componentCompleteness,
  observations:observations(p),deductionRecalculation:{salaryCoordinates:p.salary.byPerson,byProgram:deductions,policy:'Fresh reconstructed FY2026 prefectural special-spouse amount from modelled tax conditions at this salary vector; no national or ordinary-spouse amount substitution'},
  socialInsuranceInputs:p.socialInsuranceDeductions,annualHouseholdReadiness:{status:p.localTax.householdAnnualAssessment.status,reason:p.localTax.householdAnnualAssessment.reason,uncomputedPersonIds:p.localTax.householdAnnualAssessment.uncomputedPersonIds},roles:p.fixedRoles};
}
/** A salary section changes one parent only. One-yen sampling and coarse intervals are different evidence. */
export function evaluateSalarySection2025({household,varyingPersonId,fixedSalaryByPerson,fromYen,throughYen,stepYen,months,incomeYear=2025,maxEvaluationPoints=1001,includeFullPoints=false}){
 if(incomeYear!==2025)return {status:'out-of-scope',reason:'Only 2025 salary sections implemented'};
 const base=createCase(household),ids=base.parents.map(p=>p.personId);
 requireThat(ids.includes(varyingPersonId),'Explicit parent salary axis required');
 const other=ids.find(id=>id!==varyingPersonId);
 requireThat(fixedSalaryByPerson&&Object.keys(fixedSalaryByPerson).length===1&&Object.hasOwn(fixedSalaryByPerson,other)&&yen(fixedSalaryByPerson[other]),'Only the other parent fixed salary must be explicit');
 requireThat(yen(fromYen)&&yen(throughYen)&&fromYen<=throughYen&&Number.isSafeInteger(stepYen)&&stepYen>0,'Inclusive integer salary bounds and positive integer step required');
 requireThat((throughYen-fromYen)%stepYen===0,'Range endpoints must align with the constant step; no irregular endpoint appended');
 requireThat(Number.isSafeInteger(maxEvaluationPoints)&&maxEvaluationPoints>0,'Positive integer execution limit required');
 const count=(throughYen-fromYen)/stepYen+1;
 if(throughYen>8500000||fixedSalaryByPerson[other]>8500000)return {status:'out-of-scope',reason:'Salary sections are capped at 8500000 yen for both parents; no extrapolation or silent truncation'};
 if(count>maxEvaluationPoints)return {status:'pending',reason:'Requested section exceeds explicit execution limit; split the interval or choose another step',requestedPointCount:count,maxEvaluationPoints};
 if(base.parents.some(p=>p.employment.status!=='known'))return {status:'pending',reason:'Fixed employment conditions must be confirmed before salary-section evaluation'};
 requireThat(Array.isArray(months)&&months.length>0&&new Set(months).size===months.length,'Explicit unique service/benefit months required; no thesis common period is selected');
 const prepared=samplingHousehold(base),points=[],intervals=[],switchCandidates=[],availabilityChanges=[];let previous,previousProjection;
 const isPolicy=new Set(['tax-policy','service-cap','service-charge','benefit-income-stop','benefit-entitlement']);
 for(let G=fromYen;G<=throughYen;G+=stepYen){
  const salaryByPerson=Object.fromEntries(ids.map(id=>[id,id===varyingPersonId?G:fixedSalaryByPerson[id]]));
  const current=researchSalaryBreakdown2025({household:prepared.household,salaryByPerson,months});
  if(current.status!=='known'||!current.salary)return {status:'pending',reason:current.reason||'Household research scope is not ready',uncomputedSalaryByPerson:salaryByPerson};
  const projected=project(current);if(includeFullPoints)projected.fullBreakdown=current;
  if(previous){
   const diagnostic=diagnoseResearchSalaryComparison(previous,current,{kind:'single-parent-salary-change',personId:varyingPersonId});
   requireThat(previous.conditionsFingerprint===current.conditionsFingerprint,'Non-salary condition drift within section');
   const before=new Map(previousProjection.observations.map(r=>[r.key,r])),changes=[];
   requireThat(before.size===projected.observations.length,'Component set drift within section');
   for(const after of projected.observations){
    const prior=before.get(after.key);requireThat(prior,'Component/period identity drift within section');
    const known=prior.status==='known'&&after.status==='known',changed=known?!same(prior.value,after.value):prior.status!==after.status||prior.reason!==after.reason;
    if(!changed)continue;
    const event={component:after.component,entity:after.entity,period:after.period,kind:known?after.kind:'data-availability',unit:after.unit,
     varyingPersonId,beforeSalaryYen:G-stepYen,afterSalaryYen:G,stepYen,before:prior.value,after:after.value,beforeStatus:prior.status,afterStatus:after.status,
     delta:known&&typeof prior.value==='number'&&typeof after.value==='number'?after.value-prior.value:undefined,
     reason:known?undefined:[prior.reason,after.reason].filter(Boolean).join('; '),sourceSet:after.sourceSet,
     resolution:known?(stepYen===1?'one-yen-neighbour-observation':'coarse-endpoint-interval'):'availability-change-not-a-policy-boundary',
     localExactKnownTransition:known&&stepYen===1,strictGlobalBoundaryClaim:false,interiorEvaluated:stepYen===1,interiorMayContainAdditionalTransitions:stepYen>1};
    changes.push(event);
    if(!known)availabilityChanges.push(event);else if(isPolicy.has(after.kind))switchCandidates.push(event);
   }
   intervals.push({beforeSalaryYen:G-stepYen,afterSalaryYen:G,stepYen,categorySummary:diagnostic.categorySummary,changes,
    inference:'Observed endpoints only; no interpolation, monotonicity assumption, threshold enumeration or mixed-period sum'});
  }
  points.push(projected);previous=current;previousProjection=projected;
 }
 return {status:'known',kind:'fixed-other-parent-salary-section',caseId:base.caseId,incomeYear:2025,varyingPersonId,fixedSalaryByPerson:{...fixedSalaryByPerson},
  fromYen,throughYen,stepYen,evaluatedPointCount:points.length,direction:'ascending',months:[...months],conditionsFingerprint:points[0].conditionsFingerprint,
  temporalPolicy:'Explicit diagnostic months only; not an adopted thesis common period or synthesis rule. Annual tax and monthly service/benefit values remain separate.',
  samplingPolicy:'All aligned coordinates evaluated; unsampled interior points may contain additional transitions or unimplemented bands. No extrapolation beyond8500000.',
  staticAssumptions:{employment:base.parents.map(p=>({personId:p.personId,...p.employment})),employeeInsuranceByPerson:Object.fromEntries(base.parents.map(p=>[p.personId,p.employeeInsurance])),childInsuranceDependencies:Object.fromEntries(base.children.map(c=>[c.personId,c.healthInsuranceDependency])),taxDependentAllocation2025:base.taxDependentsByIncomeYear[2025],roles:base.allowanceRoles,
   socialInsurance:base.researchFacts?.socialInsuranceDeductions2025,benefitAndServicePolicy:'Recognition, other eligibility, effective grade, service use/cost and actual monthly application facts held as explicitly supplied; not re-inferred from salary'},
  deductionValidationHolds:prepared.holds,points,intervals,switchCandidates,availabilityChanges,
  sources:{...previous.sources,dayService:previous.dayService.sources,prefecturalSpouseSpecial:{law:previous.sources.allowanceIncome.decree,table:previous.sources.local.deductions}},excluded:['M01','medicalOutOfPocket','N04Cost','N04Reimbursement'],
  populationOrRepresentativeCaseSelection:'not-performed',fullThresholdEnumeration:false,grandTotal:'not-calculated',recoveryIncome:'not-calculated'};
}
