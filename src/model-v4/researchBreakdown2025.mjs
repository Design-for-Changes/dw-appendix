import {ordinaryAnnualResidentTax2026,zeroIncomeResidentChildTax2026,householdAnnualResidentTax2026,possibleLowIncomeLevyAdjustment2026,RESIDENT_TAX2026_SOURCES} from './residentTax2026.mjs';
import {sha256Utf8} from './sha256.mjs';
import {createCase,withSalary,dayServiceCap,singleChildCharge,SOURCES} from './core.mjs';
import {calculateFunabashi2026,spouseDeduction2026,TAX2026_SOURCES} from './funabashi2026.mjs';
import {nationalMarriedSalaryTax2025,nationalSalaryIncome2025,NATIONAL_TAX2025_SOURCES} from './nationalTax2025.mjs';
import {evaluateAllowanceFromSalary2025,SALARY_ALLOWANCE_SOURCES} from './salaryAllowance2025.mjs';
import {PROGRAMS} from './allowanceIncome2026.mjs';
import {monthlyAllowanceEntitlement2026,summarizeAllowanceMonths2026,MONTHLY_ALLOWANCE_SOURCES} from './monthlyAllowance2026.mjs';
const K=(evidence,data)=>({status:'known',evidence:structuredClone(evidence),...data});
const pending=reason=>({status:'pending',reason});
const outside=reason=>({status:'out-of-scope',reason});
const text=x=>typeof x==='string'&&x.trim().length>0;
const known=x=>x?.status==='known'&&text(x.evidence?.source)&&text(x.evidence?.note);
const yen=x=>Number.isSafeInteger(x)&&x>=0;
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
function canonical(x){return Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;}
function requireThat(x,reason){if(!x)throw new TypeError(reason);}
const years={referenceIncomeYear:2025,prefecturalTaxFiscalYear:2026};
function conditionFingerprint(c){const n=structuredClone(c);delete n.caseId;for(const p of n.parents)delete p.annualSalaryYenByIncomeYear[2025];for(const a of n.dayServiceAssessments)delete a.result;
 return sha256Utf8(JSON.stringify(canonical(n)));}
function socialFact(c,id){
 const f=c.researchFacts?.socialInsuranceDeductions2025?.[id];
 const stationary=f?.originKind==='stationary-calendar-payroll-estimate';
 if(c.researchFacts?.insuranceInputMode==='stationary-calendar-payroll-estimate'&&!stationary)return pending('Stationary mode cannot combine actual-record or fixed-amount social deductions');
 if(stationary){const d=f.derivation;if(c.researchFacts.insuranceInputMode!=='stationary-calendar-payroll-estimate'||!d||d.incomeYear!==2025||d.payrollYear!==2025||d.basis!=='calculated-calendar2025-deduction'||d.annualSalaryYen!==c.parents.find(p=>p.personId===id)?.annualSalaryYenByIncomeYear[2025]||!text(d.scenarioId)||d.noActualOrFixedAmountCombined!==true||!yen(d.healthPensionPayrollYearYen)||!yen(d.employmentPayrollYearYen)||f.amountYen!==d.healthPensionPayrollYearYen+d.employmentPayrollYearYen)return pending('Complete same-coordinate stationary calendar payroll derivation required; insurance-month totals/actual additions cannot substitute');}
 if(!known(f)||f.personId!==id||f.incomeYear!==2025||!yen(f.amountYen)||(!stationary&&!['actual-record','synthetic-fixed-assumption'].includes(f.originKind))||!text(f.originDescription))return pending('Actual-record, explicit synthetic fixed or separately validated stationary calendar2025 deduction provenance required; insurance-month premiums are not accepted');
 return structuredClone(f);
}
function national(c){
 const rf=c.researchFacts,n=rf?.nationalTax2025;
 if(!known(n))return pending('Evidenced independent national tax application facts required');
 const people=c.parents.map(p=>{
  const f=n.byPerson?.[p.personId],s=socialFact(c,p.personId);
  if(!f)return {personId:p.personId};
  // The spouse total comes from the same confirmed salary-only history, via the national salary function below.
  let disability=structuredClone(f.ordinaryDisabilityTaxClaims);
  if(disability?.entries?.some(cl=>c.children.some(ch=>ch.personId===cl.targetPersonId)&&c.taxDependentsByIncomeYear[2025]?.[cl.targetPersonId]?.claimantId!==p.personId))disability=pending('National disability claim conflicts with the shared confirmed 2025 dependent allocation');
  return {personId:p.personId,salaryFacts:known(rf.salaryScopeByPerson?.[p.personId])?{...structuredClone(rf.salaryScopeByPerson[p.personId]),salaryYen:p.annualSalaryYenByIncomeYear[2025]}:pending('Salary scope missing'),
   actualSocialInsurancePaid:s.status==='known'?K(s.evidence,{incomeYear:2025,payerPersonId:p.personId,basis:'actual-paid-in-2025',amountYen:s.amountYen,inputOriginKind:s.originKind,inputOriginDescription:s.originDescription}):s,
   ordinaryDisabilityTaxClaims:disability,spouseClaim:structuredClone(f.spouseClaim),otherDeductionsAndCreditsAbsent:structuredClone(f.otherDeductionsAndCreditsAbsent),yearEndAdjustmentEligibility:structuredClone(f.yearEndAdjustmentEligibility)};
 });
 // Exact salary-income-only value; not municipal taxable income. Missing salary scope remains pending.
 for(const p of people)if(p.spouseClaim?.applies){
  const other=people.find(q=>q.personId!==p.personId),w=nationalSalaryIncome2025({incomeYear:2025,personId:other.personId,salaryFacts:other.salaryFacts});
  if(w.status==='known')p.spouseClaim.spouseTotalIncomeYen=w.totalIncomeYen;else p.spouseClaim=pending('Other spouse salary-income scope incomplete');
 }
 return nationalMarriedSalaryTax2025({incomeYear:2025,people});
}
function municipal(c){
 const copy=structuredClone(c);
 if(!copy.taxFactsByIncomeYear?.[2025]?.byPerson||copy.parents.some(p=>!copy.taxFactsByIncomeYear[2025].byPerson[p.personId]))return calculateFunabashi2026(copy);
 for(const p of copy.parents){const s=socialFact(c,p.personId);const scope=c.researchFacts?.salaryScopeByPerson?.[p.personId];copy.taxFactsByIncomeYear[2025].byPerson[p.personId].salaryOnly=known(scope)&&scope.salaryOnlyNoLossNoSpecifiedExpense===true?{status:'known',value:true,evidence:scope.evidence.source}:pending('Shared salary-only scope missing or outside this slice');copy.taxFactsByIncomeYear[2025].byPerson[p.personId].socialInsurancePaid=s.status==='known'?{status:'known',amountYen:s.amountYen,evidence:`${s.originKind}: ${s.originDescription}; ${s.evidence.source}; ${s.evidence.note}`}:s;}
 return calculateFunabashi2026(copy);
}
/** Explicit modelled prefectural claim application, same taxpayer/FY and table as confirmed local election. */
function spouseSpecialFact(c,id,municipalResult){
 const f=c.researchFacts?.prefecturalTax2026?.spouseApplicationByPerson?.[id];
 if(!known(f)||f.taxpayerId!==id||f.referenceIncomeYear!==2025||f.prefecturalTaxFiscalYear!==2026||f.sameConfirmedGeneralSpouseElectionAsMunicipal!==true)return pending('Same-person FY2026 prefectural spouse-claim application/mapping is unconfirmed');
 const other=c.parents.find(p=>p.personId!==id),tax=c.taxFactsByIncomeYear?.[2025];
 if(!tax?.marriageConditions||tax.marriageConditions.status!=='known'||tax.marriageConditions.sameLivelihoodAndNoBusinessEmployeeOrOtherClaimant!==true||tax.spouseElection?.status!=='known')return pending('Confirmed matching spouse conditions/election missing');
 if(tax.spouseElection.claimantId!==null&&!c.parents.some(p=>p.personId===tax.spouseElection.claimantId))return pending('Unknown spouse election claimant');
 if(!Number.isInteger(tax.byPerson?.[other.personId]?.ageOn20251231)||tax.byPerson[other.personId].ageOn20251231<18)return pending('Explicit adult spouse age required for matching tax table');
 const own=municipalResult.salaryByPerson?.[id],partner=municipalResult.salaryByPerson?.[other.personId];
 if(own?.status!=='known'||partner?.status!=='known')return pending('Matching salary-income scope incomplete');
 const sd=tax.spouseElection.claimantId===id?spouseDeduction2026({residentTaxFiscalYear:2026,taxpayerTotalIncomeYen:own.salaryIncomeYen,spouseTotalIncomeYen:partner.salaryIncomeYen,spouseAgeOn20251231:tax.byPerson?.[other.personId]?.ageOn20251231}):{status:'known',kind:'not-elected',deductionYen:0};
 return K(f.evidence,{...years,taxpayerId:id,spousePersonId:other.personId,basis:'applied-prefectural-spouse-special-deduction',
  taxTreatment:sd.kind==='special-spouse'&&sd.deductionYen>0?'applied':'confirmed-none',amountYen:sd.kind==='special-spouse'?sd.deductionYen:0,
  derivation:'Confirmed FY2026 prefectural general-spouse conditions/election share the existing resident-tax deduction table; ordinary spouse deduction is not subtracted',
  localTableResult:structuredClone(sd),source:TAX2026_SOURCES.deductions});
}
function allowance(c,program,m,local){
 const a=c.researchFacts?.allowances?.[program],rf=c.researchFacts,pref=rf?.prefecturalTax2026;
 if(!a)return {incomeRestriction:pending('Program-specific confirmed roles/facts missing'),statutoryAmount:pending('Program-specific eligibility/recognition facts missing')};
 const incomeFactsByPerson={},roles=structuredClone(a.roles);
 const declared=c.allowanceRoles[program];
 if(declared?.status==='known'){
  const expected={recipient:[declared.recipientId],spouse:declared.spouseIds,supportObligor:declared.supportObligorIds};
  for(const role of ['recipient','spouse','supportObligor']){
   const group=roles?.[role],subjects=group?.subjects||[],assigned=subjects.filter(s=>s.assignment?.status==='known').map(s=>s.assignment.personId);
   const conflicting=assigned.some(id=>!expected[role].includes(id))||(known(group)&&subjects.every(s=>s.assignment?.status==='known')&&!same([...assigned].sort(),[...expected[role]].sort()));
   if(conflicting)return {incomeRestriction:pending('Conflicting canonical and statutory role assignments'),statutoryAmount:pending('Resolve role conflict; no automatic reassignment')};
  }
 }
 for(const role of ['recipient','spouse','supportObligor'])for(const subject of roles?.[role]?.subjects||[]){
  const id=subject.assignment?.personId,scope=rf.salaryScopeByPerson?.[id],f=a.salaryDeductionScopeByPerson?.[id],parent=c.parents.find(p=>p.personId===id),child=c.children.find(p=>p.personId===id);
  if(subject.income?.status==='known'&&!same(subject.income.inputSalaryProvenanceYen,Object.fromEntries(c.parents.map(p=>[p.personId,p.annualSalaryYenByIncomeYear[2025]]))))subject.income=pending('Direct assessed-income input not bound to current two-salary coordinates; no stale reuse across grid');
  if(!known(scope)||scope.personId!==id||scope.incomeYear!==2025||scope.salaryOnlyNoLossNoSpecifiedExpense!==true||scope.allPayersIncluded!==true){incomeFactsByPerson[id]=pending('Matching person/year salary-only scope missing');continue;}
  const G=parent?.annualSalaryYenByIncomeYear[2025]??(child&&known(rf.childIncome2025?.[id])&&rf.childIncome2025[id].otherIncomeYen===0?rf.childIncome2025[id].salaryYen:undefined);
  const special=parent?spouseSpecialFact(c,id,local):pref?.childSpouseSpecialNone?.[id];
  incomeFactsByPerson[id]=K(scope.evidence,{personId:id,...years,annualGrossTaxableSalaryYen:G,inputKind:'gross-taxable-salary',allPayersIncluded:true,salaryOnlyNoLossNoSpecifiedExpense:true,
   deductionScope:structuredClone(f),spouseSpecialTaxDeduction:special,
   ...(program===PROGRAMS.CHILD&&role==='recipient'?{socialInsuranceDeduction:structuredClone(pref?.childSocialInsuranceDeduction?.[id])}:{})});
 }
 const claims=structuredClone(pref?.disabilityTaxClaimsByPerson||{});
 for(const [id,ledger]of Object.entries(claims))if(ledger.entries?.some(cl=>c.children.some(ch=>ch.personId===cl.targetPersonId)&&c.taxDependentsByIncomeYear[2025]?.[cl.targetPersonId]?.claimantId!==id))claims[id]=pending('Prefectural disability claim conflicts with shared confirmed dependent allocation');
 const incomeRestriction=evaluateAllowanceFromSalary2025({program,targetMonth:m,roles,incomeFactsByPerson,taxDisabilityClaimsByPerson:claims});
 const monthly=a.monthlyByMonth?.[m];
 if(!monthly)return {incomeRestriction,statutoryAmount:pending('No separately confirmed program qualification/recognition input for this benefit month')};
 const ctx={program,targetMonth:m,recipientId:monthly.recipientId,childId:monthly.childId};
 const application=monthly.incomeApplication;
 let applied=pending('Monthly actual application of income result/exception treatment is unconfirmed');
 if(known(application)&&same(Object.fromEntries(Object.keys(ctx).map(k=>[k,application[k]])),ctx)&&application.useOrdinary2025Result===true){
  applied={...K(application.evidence,{...ctx,...years,ordinaryRuleActuallyApplied:true}),status:incomeRestriction.status,restriction:incomeRestriction.restriction,reason:incomeRestriction.reason,
   sourceResult:{program:incomeRestriction.program,targetMonth:incomeRestriction.targetMonth,restriction:incomeRestriction.restriction,status:incomeRestriction.status}};
 }
 const recipient=incomeRestriction.rows?.find(r=>r.role==='recipient'&&r.assignment.status==='known');
 if(recipient&&recipient.personId!==monthly.recipientId)applied=pending('Recognition recipient conflicts with confirmed income-test recipient');
 const statutoryAmount=monthlyAllowanceEntitlement2026({...structuredClone(monthly),...ctx,appliedIncomeRestriction:applied});
 return {incomeRestriction,statutoryAmount};
}
/** Same explicit household, salary vector only; unsupported components remain independently visible. */
export function researchSalaryBreakdown2025({household,salaryByPerson,incomeYear=2025,months}){
 if(incomeYear!==2025)return outside('Only 2025 salary / FY2026 local tax / supported benefit months implemented');
 let c=createCase(household);const rf=c.researchFacts;
 if(!known(rf)||rf.profile!=='same-explicit-salary-only-family-2025')return pending('Confirmed supported research-household scope required');
 if(c.children.length!==1)return outside('First unified breakdown supports one explicitly identified child; siblings remain separate');
 requireThat(Array.isArray(months)&&months.length>0&&new Set(months).size===months.length&&months.every(m=>/^\d{4}-(0[1-9]|1[0-2])$/.test(m)),'Explicit unique YYYY-MM aggregation months required');
 const ids=c.parents.map(p=>p.personId);requireThat(same(Object.keys(salaryByPerson||{}).sort(),[...ids].sort())&&Object.values(salaryByPerson).every(yen),'Both exact parent salary coordinates required');
 for(const id of ids)c=withSalary(c,id,2025,salaryByPerson[id]);
 const {nationalTax,local,socialByPerson,annualByPerson,householdAnnual}=researchFiscalComponents2025(c);
 const serviceByChild={};
 for(const child of c.children){
  serviceByChild[child.personId]=months.map(m=>{
   const period=local.dayServiceAssessment;const assessment=period?.status==='known'&&period.appliesFrom<=m&&m<=period.appliesThrough?period:pending('No computed assessment for this service month; FY2027 is not inferred');
   const cap=dayServiceCap(assessment),cost=rf?.dayServiceCostsByChild?.[child.personId]?.[m];
   let actualCharge;
   if(child.dayServiceUse.status!=='known')actualCharge=pending('Service use unconfirmed');
   else if(!child.dayServiceUse.uses)actualCharge={status:'known',chargeYen:0,reason:'Explicit no service use'};
   else if(!known(cost)||cost.childId!==child.personId||cost.serviceMonth!==m||!yen(cost.eligibleServiceCostYen))actualCharge=pending('Explicit eligible monthly service cost and source required');
   else actualCharge=singleChildCharge({assessment,eligibleServiceCostYen:cost.eligibleServiceCostYen});
   return {serviceMonth:m,referenceIncomeYear:assessment.referenceIncomeYear,residentTaxFiscalYear:assessment.residentTaxFiscalYear,assessment,cap,actualCharge,costInput:structuredClone(cost),source:SOURCES.cap};
  });
 }
 const allowances=Object.fromEntries(Object.values(PROGRAMS).map(program=>{
  const monthly=months.map(m=>({targetMonth:m,...allowance(c,program,m,local)}));
  const recipientId=rf?.allowances?.[program]?.monthlyByMonth?.[months[0]]?.recipientId,childId=rf?.allowances?.[program]?.monthlyByMonth?.[months[0]]?.childId;
  const chronological=[...months].sort(),summary=summarizeAllowanceMonths2026({program,recipientId,childId,fromMonth:chronological[0],throughMonth:chronological.at(-1),monthlyResults:monthly.map(r=>r.statutoryAmount)});
  return [program,{program,referenceIncomeYear:2025,prefecturalTaxFiscalYear:2026,monthly,summary}];
 }));
 const knownLocal=Object.values(local.municipalTaxByPerson||{}).every(r=>r?.status==='known')&&Object.hasOwn(local.municipalTaxByPerson||{},ids[0]);
 const excluded=Object.fromEntries(['M01','medicalOutOfPocket','N04Cost','N04Reimbursement'].map(k=>[k,{status:'excluded',reason:'Outside authorized research calculation; no zero effect asserted'}]));
 return {status:'known',caseId:c.caseId,calculationScope:'Research component breakdown, not a finalized thesis value or real household disposable income',conditionsFingerprint:conditionFingerprint(c),
  salary:{incomeYear:2025,byPerson:structuredClone(salaryByPerson),householdSalaryYen:Object.values(salaryByPerson).reduce((a,b)=>a+b,0),source:'Explicit salary coordinates; no employment/insurance/role inference'},
  fixedRoles:structuredClone(c.allowanceRoles),fixedEmployment:ids.map(id=>({personId:id,...c.parents.find(p=>p.personId===id).employment})),
  otherIncomeYearSalaries:Object.fromEntries(c.parents.map(p=>[p.personId,Object.fromEntries(Object.entries(p.annualSalaryYenByIncomeYear).filter(([y])=>y!=='2025'))])),
  socialInsuranceDeductions:{incomeYear:2025,byPerson:socialByPerson,scope:'Actual-record or explicit synthetic paid deduction inputs; stationary calendar estimates only in their explicit separate mode, never insurance-month annual totals'},
  nationalTax:{incomeYear:2025,byPerson:nationalTax.rows?Object.fromEntries(nationalTax.rows.map((r,i)=>[r.personId||ids[i],{...r,personId:r.personId||ids[i]}])):Object.fromEntries(ids.map(id=>[id,pending(nationalTax.reason)])),result:nationalTax,sources:NATIONAL_TAX2025_SOURCES},
  localTax:{referenceIncomeYear:2025,residentTaxFiscalYear:2026,municipalIncomeLevyByPerson:Object.fromEntries(ids.map(id=>[id,local.municipalTaxByPerson?.[id]||pending(local.municipalTaxByPerson?.reason||'Individual municipal tax incomplete')])),
   householdMunicipalIncomeLevy:knownLocal?{status:'known',amountYen:Object.values(local.municipalTaxByPerson).reduce((s,r)=>s+r.municipalIncomeLevyYen,0)}:pending('Some municipal levies are uncomputed'),
   annualResidentTaxByPerson:annualByPerson,householdAnnualAssessment:householdAnnual,
   prefecturalIncomeLevy:{status:Object.values(annualByPerson).every(r=>r.status==='known')?'known':'pending',byPerson:Object.fromEntries(Object.entries(annualByPerson).map(([id,r])=>[id,annualItem(r,'prefectural')]))},
   perCapitaByPerson:Object.fromEntries(Object.entries(annualByPerson).map(([id,r])=>[id,r.status==='known'?{status:'known',municipalYen:r.municipal.perCapitaYen,prefecturalYen:r.prefectural.perCapitaYen}:r.knownNonIncomeTaxComponents?{status:'known',municipalYen:r.knownNonIncomeTaxComponents.municipalPerCapitaYen,prefecturalYen:r.knownNonIncomeTaxComponents.prefecturalPerCapitaYen}:pending(r.reason)])),
   forestEnvironmentNationalTaxByPerson:Object.fromEntries(Object.entries(annualByPerson).map(([id,r])=>[id,r.status==='known'?r.forestEnvironmentNationalTax:r.knownNonIncomeTaxComponents?{status:'known',taxType:'national',annualYen:r.knownNonIncomeTaxComponents.forestEnvironmentNationalTaxYen}:pending(r.reason)])),
   annualSources:RESIDENT_TAX2026_SOURCES,sources:TAX2026_SOURCES},
  dayService:{householdAssessment:local.dayServiceAssessment,byChild:serviceByChild,siblingRefund:outside('Single-child first pass; sibling application/refund remains a separate calculation'),sources:SOURCES},
  allowances,excluded,householdDisposableIncome:{status:'not-calculated',reason:'No cross-period tax/social insurance/service/allowance grand total'},
  sources:{national:NATIONAL_TAX2025_SOURCES,local:TAX2026_SOURCES,annualResidentTax:RESIDENT_TAX2026_SOURCES,allowanceIncome:SALARY_ALLOWANCE_SOURCES,allowanceAmount:MONTHLY_ALLOWANCE_SOURCES},
  componentCompleteness:{nationalTax:nationalTax.status,municipalTax:knownLocal?'known':'pending',annualResidentTax:householdAnnual.status,dayService: Object.values(serviceByChild).flat().every(r=>r.actualCharge.status==='known'&&r.cap.status==='known')?'known':'pending',
   allowances:Object.fromEntries(Object.entries(allowances).map(([k,v])=>[k,v.summary.status==='known'&&v.monthly.every(r=>r.incomeRestriction.status==='known'&&r.statutoryAmount.status==='known')?'known':'pending']))}};
}
function evidencedMembers(m,ids){return known(m)&&m.referenceIncomeYear===2025&&m.residentTaxFiscalYear===2026&&Array.isArray(m.ids)&&same([...m.ids].sort(),[...ids].sort());}
function indicators(r){
 const out={};for(const [id,p]of Object.entries(r.nationalTax.byPerson))out[`national/${id}/2025`]={status:p.status,salaryIncomeYen:p.salary?.totalIncomeYen,spouseDeductionYen:p.spouseDeduction?.deductionYen,yearEndAnnualYen:p.yearEndAdjustedAnnualTaxYen};
 for(const [id,p]of Object.entries(r.localTax.municipalIncomeLevyByPerson||{}))if(p&&typeof p==='object')out[`municipal/${id}/FY2026`]={status:p.status,incomeLevyYen:p.municipalIncomeLevyYen};
 for(const [id,p]of Object.entries(r.localTax.annualResidentTaxByPerson||{}))out[`annualResident/${id}/FY2026`]={status:p.status,municipalIncomeYen:p.municipal?.incomeLevyYen,municipalPerCapitaYen:p.municipal?.perCapitaYen,prefecturalIncomeYen:p.prefectural?.incomeLevyYen,prefecturalPerCapitaYen:p.prefectural?.perCapitaYen,residentTaxAnnualYen:p.residentTaxAnnualYen,forestNationalYen:p.forestEnvironmentNationalTax?.annualYen,annualCollectedAssessmentYen:p.annualAssessmentCollectedTogetherYen};
 for(const [id,rows]of Object.entries(r.dayService.byChild))for(const p of rows)out[`dayService/${id}/${p.serviceMonth}`]={status:p.actualCharge.status,assessmentYen:p.assessment.adjustedMunicipalLevyYen,capYen:p.cap.capYen,chargeYen:p.actualCharge.chargeYen};
 for(const [program,p]of Object.entries(r.allowances))for(const row of p.monthly){out[`allowance/${program}/${row.targetMonth}`]={incomeStatus:row.incomeRestriction.status,restriction:row.incomeRestriction.restriction,amountStatus:row.statutoryAmount.status,entitlementYen:row.statutoryAmount.entitlementYen};
  for(const person of row.incomeRestriction.rows||[])out[`allowanceIncome/${program}/${person.role}/${person.personId}/${row.targetMonth}`]={status:person.status,incomeYen:person.incomeYen,limitYen:person.limitYen,restriction:person.restriction};}
 return out;
}
/** Comparison kinds are explicit; no role/condition changes can hide in a salary comparison. */
export function compareResearchSalaryBreakdowns(before,after,{kind,personId}={}){
 requireThat([...before.fixedEmployment,...after.fixedEmployment].every(p=>p.status==='known'),'Fixed employment conditions unconfirmed; separate employment study required');
 requireThat(before.conditionsFingerprint===after.conditionsFingerprint,'Different employment, tax/insurance/benefit roles, inputs, or other-year salary conditions; separate experiment required');
 const ids=Object.keys(before.salary.byPerson),changed=ids.filter(id=>before.salary.byPerson[id]!==after.salary.byPerson[id]);
 if(kind==='single-parent-salary-change')requireThat(changed.length===1&&changed[0]===personId,'Single-parent comparison must change only the declared salary');
 else if(kind==='fixed-total-reallocation')requireThat(changed.length===2&&before.salary.householdSalaryYen===after.salary.householdSalaryYen,'Reallocation comparison requires both salaries to change with identical household salary');
 else throw new TypeError('Explicit single-parent-salary-change or fixed-total-reallocation kind required');
 const a=indicators(before),b=indicators(after),changes=[];
 requireThat(same(Object.keys(a).sort(),Object.keys(b).sort()),'Different component/month sets cannot be compared as salary-only');
 for(const key of Object.keys(a))if(!same(a[key],b[key]))changes.push({component:key,before:a[key],after:b[key],numericDeltas:Object.fromEntries(Object.keys(a[key]).filter(k=>typeof a[key][k]==='number'&&typeof b[key][k]==='number').map(k=>[k,b[key][k]-a[key][k]]))});
 return {status:'known',kind,personId,conditionsFingerprint:before.conditionsFingerprint,beforeSalary:before.salary,afterSalary:after.salary,changedPersonIds:changed,changes,
  rolePolicy:'Explicit roles retained; salary ranking never selects recipient, tax dependent or insurance sponsor',crossPeriodTotal:'not-calculated'};
}
export function researchTwoSalaryGrid2025({household,axesByPerson,months}){
 const c=createCase(household),ids=c.parents.map(p=>p.personId);
 if(c.parents.some(p=>p.employment.status!=='known'))return pending('Fixed employment conditions must be confirmed before salary-axis comparison');
 requireThat(same(Object.keys(axesByPerson||{}).sort(),[...ids].sort()),'Two person-keyed salary axes required');
 for(const id of ids)requireThat(Array.isArray(axesByPerson[id])&&axesByPerson[id].length>0&&new Set(axesByPerson[id]).size===axesByPerson[id].length&&axesByPerson[id].every(yen),'Unique nonnegative integer salary coordinates required');
 const points=[];for(const A of axesByPerson[ids[0]])for(const B of axesByPerson[ids[1]])points.push(researchSalaryBreakdown2025({household:c,salaryByPerson:{[ids[0]]:A,[ids[1]]:B},months}));
 const adjacentComparisons=[];
 for(let axis=0;axis<2;axis++)for(let i=1;i<axesByPerson[ids[axis]].length;i++)for(const fixed of axesByPerson[ids[1-axis]]){
  const find=n=>points.find(p=>p.salary.byPerson[ids[axis]]===axesByPerson[ids[axis]][n]&&p.salary.byPerson[ids[1-axis]]===fixed);
  adjacentComparisons.push(compareResearchSalaryBreakdowns(find(i-1),find(i),{kind:'single-parent-salary-change',personId:ids[axis]}));
 }
 return {status:'known',kind:'two-axis-fixed-employment-salary-sensitivity',incomeYear:2025,axesByPerson:structuredClone(axesByPerson),months:[...months],points,adjacentComparisons,
  scope:'Separate salary axes; no grand total or automatic fixed-total/transition/employment comparison'};
}

/** Existing narrow components exposed for explicit child-scoped research orchestration; no role extraction. */
export {national as researchNationalTax2025,municipal as researchMunicipalTax2026,allowance as researchAllowanceForChild2025};

function annualItem(r,key){return r.status==='known'?{status:'known',amountYen:r[key].incomeLevyYen}:pending(r.reason);}
/** Shared fiscal and service-assessment math, independently of benefit recognition. */
export function researchFiscalComponents2025(c){
 const rf=c.researchFacts,ids=c.parents.map(p=>p.personId);
 const nationalTax=national(c),local=municipal(c),socialByPerson=Object.fromEntries(ids.map(id=>[id,socialFact(c,id)]));
 const annualFacts=rf.annualResidentTax2026,annualByPerson={};
 for(const id of ids)annualByPerson[id]=ordinaryAnnualResidentTax2026({referenceIncomeYear:2025,residentTaxFiscalYear:2026,personId:id,municipalCalculation:local.municipalTaxByPerson?.[id]||local.municipalTaxByPerson,conditions:annualFacts?.byPerson?.[id]});
 for(const ch of c.children)annualByPerson[ch.personId]=zeroIncomeResidentChildTax2026({referenceIncomeYear:2025,residentTaxFiscalYear:2026,personId:ch.personId,conditions:annualFacts?.byPerson?.[ch.personId],incomeFact:rf.childIncome2025?.[ch.personId]});
 const members=annualFacts?.householdMembers,expectedIds=[...ids,...c.children.map(ch=>ch.personId)];
 const householdAnnual=evidencedMembers(members,expectedIds)?householdAnnualResidentTax2026({referenceIncomeYear:2025,residentTaxFiscalYear:2026,requiredPersonIds:members.ids,byPerson:annualByPerson}):pending('Complete FY2026 research-household membership unconfirmed; no partial annual sum');

 let municipalCorrected=false;
 for(const id of ids){
  const annual=annualByPerson[id],original=local.municipalTaxByPerson?.[id];
  if(annual.status==='known'&&annual.lowIncomeLevyAdjustment?.applied){
   local.municipalTaxByPerson[id]={...original,municipalIncomeLevyBeforeLowAdjustmentYen:original.municipalIncomeLevyYen,
    municipalIncomeLevyYen:annual.municipal.incomeLevyYen,serviceBasisLevyBeforeOldDependentReliefYen:annual.municipal.incomeLevyYen,
    municipalCalculationStage:'after-statutory-low-income-adjustment',lowIncomeLevyAdjustment:annual.lowIncomeLevyAdjustment};municipalCorrected=true;
  }else if(annual.status!=='known'&&possibleLowIncomeLevyAdjustment2026(original)){
   local.municipalTaxByPerson[id]={...pending('Possible statutory low-income adjustment, annual no-other-credit proof incomplete'),provisionalMunicipalCalculation:original};
   local.dayServiceAssessment=pending('Municipal low-income adjustment proof incomplete; no confirmed day-service assessment');
  }
 }
 if(municipalCorrected&&local.dayServiceAssessment?.status==='known'){
  const old=local.dayServiceAssessment;
  for(const id of ids){const row=old.byPerson[id],levy=local.municipalTaxByPerson[id].municipalIncomeLevyYen;row.municipalLevyYen=levy;row.adjustedMunicipalLevyYen=Math.max(0,levy-row.oldDependentReliefYen);}
  old.adjustedMunicipalLevyYen=Object.values(old.byPerson).reduce((sum,r)=>sum+r.adjustedMunicipalLevyYen,0);
  old.evidence+='; confirmed statutory low-income adjustment before service-only old-dependent relief';old.lowIncomeAdjustmentSource=RESIDENT_TAX2026_SOURCES.lowIncomeAdjustmentLaw;
 }
 return{nationalTax,local,socialByPerson,annualByPerson,householdAnnual};
}

export {spouseSpecialFact as researchPrefecturalSpouseSpecial2026};
