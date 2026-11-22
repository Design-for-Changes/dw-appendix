import{assessStationaryPointApplicability2026,holdUnconfirmedStationaryTcca2026}from'./stationaryPointApplicability2026.mjs';
import{sha256Utf8}from'./sha256.mjs';
import{stationarySalaryResearchBreakdown2025}from'./stationaryResearch2025.mjs';
import{annualizedBenchmarkFromBreakdown2025}from'./annualizedBenchmark2025.mjs';
import{measureBenchmarkRecovery2025}from'./benchmarkRecovery2025.mjs';
import{assessHighSalaryAllowance2025}from'./highSalaryAllowance2025.mjs';
import{PROGRAMS}from'./allowanceIncome2026.mjs';
import{monthlyAllowanceEntitlement2026}from'./monthlyAllowance2026.mjs';
const text=x=>typeof x==='string'&&x.trim().length>0;
const known=x=>x?.status==='known'&&text(x.evidence?.source)&&text(x.evidence?.note);
const yen=x=>Number.isSafeInteger(x)&&x>=0;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const P=reason=>({status:'pending',reason});
const requireThat=(x,m)=>{if(!x)throw new TypeError(m);};
function canonical(x){return Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;}
function signature(input){const h=structuredClone(input.household);for(const p of h.parents)delete p.annualSalaryYenByIncomeYear[2025];if(h.researchFacts?.stationaryPointApplicability2026)delete h.researchFacts.stationaryPointApplicability2026.reviews;return sha256Utf8(JSON.stringify(canonical({household:h,contract:input.contract,scenarios:input.scenariosByPerson,payroll:input.payrollPoliciesByPerson,employment:input.employmentPoliciesByPerson})));}
function pointScope(input){
 const ids=input.household?.parents?.map(p=>p.personId)||[];
 if(input.contract?.referenceMonth!=='2026-08'||(input.months!==undefined&&!same(input.months,['2026-08'])))return P('Single August2026 reference month required; contradictory source-month request rejected');
 if(ids.length!==2||input.contract?.mode!=='stationary-reference-month-fixed-annualization'||input.contract?.insuranceInputMode!=='stationary-calendar-payroll-estimate'||input.contract?.counterfactualBasis!=='separate-stationary-households')return P('Explicit separate stationary Y* contract and two parents required');
 if(Object.hasOwn(input,'insuranceBurdenByPerson'))return P('Actual/fixed insurance burden cannot coexist with derived stationary personal burden');
 if(!same(Object.keys(input.scenariosByPerson||{}).sort(),[...ids].sort())||ids.some(id=>!/^1980-\d{2}-\d{2}$/.test(input.scenariosByPerson[id]?.birthDate)||input.household.taxFactsByIncomeYear?.[2025]?.byPerson?.[id]?.ageOn20251231!==45))return P('Only same-person explicitly45-year-old parents at2025 year end; test35/other ages are separate');
 return {status:'known',ids};
}
/** Replace only unresolved high-income rows by proven branch-invariant restrictions; never a point income. */
function highIncomeMonthly(input,breakdown,month){
 const h=input.household,rf=h.researchFacts,claims=rf.prefecturalTax2026?.disabilityTaxClaimsByPerson||{},issues=[];
 for(const [program,g]of Object.entries(breakdown.allowances)){
  const row=g.monthly[0],roles=rf.allowances?.[program]?.roles,details=[];
  const rows=row.incomeRestriction.rows?.map(original=>{
   const id=original.personId||original.assignment?.personId,G=input.salaryByPerson[id];if(!(G>8500000)||original.status==='known')return original;
   const subject=roles?.[original.role]?.subjects?.find(s=>s.assignment?.personId===id),scope=rf.salaryScopeByPerson?.[id],criteria=rf.stationaryTaxAdjustmentCriteriaByPerson?.[id];
   const taxQ=scope?.incomeAdjustmentQualification,localQ=h.taxFactsByIncomeYear?.[2025]?.byPerson?.[id]?.incomeAdjustmentQualification;
   const keys=['selfSpecialDisability','hasUnder23Dependent','hasSpecialDisabledSameLivelihoodSpouseOrDependent'];
   if(!known(criteria)||criteria.personId!==id||criteria.incomeYear!==2025||criteria.applicationMode!=='recompute-for-each-salary-coordinate'||!keys.every(k=>typeof criteria.criteria?.[k]==='boolean')||taxQ?.qualifies!==keys.some(k=>criteria.criteria[k])||localQ?.qualifies!==taxQ.qualifies||Object.hasOwn(criteria,'amountYen')||Object.hasOwn(criteria,'salaryYen')){const reason='Complete same-person tax adjustment predicate and matching national/local eligibility required; stale salary-bound values not reused';issues.push({personId:id,program,reason});return {...original,...P(reason)};}
   const taxEntry=breakdown.localTax.municipalIncomeLevyByPerson?.[id],sd=taxEntry?.spouseDeduction,prefApp=rf.prefecturalTax2026?.spouseApplicationByPerson?.[id];
   const spouseConfirmedNone=taxEntry?.status==='known'&&sd?.status==='known'&&sd.kind!=='special-spouse'&&known(prefApp)&&prefApp.taxpayerId===id&&prefApp.referenceIncomeYear===2025&&prefApp.prefecturalTaxFiscalYear===2026&&prefApp.sameConfirmedGeneralSpouseElectionAsMunicipal===true&&prefApp.applicationMode==='recompute-for-each-salary-coordinate';
   const spouse=spouseConfirmedNone?{status:'known',evidence:prefApp.evidence,taxpayerId:id,referenceIncomeYear:2025,prefecturalTaxFiscalYear:2026,basis:'applied-prefectural-spouse-special-deduction',taxTreatment:'confirmed-none',amountYen:0}:P('High connection limited to fresh confirmed-none prefectural spouse-special deduction');
   const q={...criteria,salaryYen:G,taxType:'income-tax',kind:'children-special-disability-income-adjustment',qualificationReviewComplete:true,qualifies:taxQ.qualifies,amountYen:taxQ.qualifies?Math.ceil((Math.min(G,10000000)-8500000)/10):0};
   const f={...scope,personId:id,referenceIncomeYear:2025,prefecturalTaxFiscalYear:2026,annualGrossTaxableSalaryYen:G,inputKind:'gross-taxable-salary',noPublicPensionIncome:scope?.noPublicPensionIncome,deductionScope:rf.allowances?.[program]?.salaryDeductionScopeByPerson?.[id],spouseSpecialTaxDeduction:spouse};
   const result=assessHighSalaryAllowance2025({program,targetMonth:month,role:original.role,subject,salaryFacts:f,taxAdjustmentFact:q,taxDisabilityClaimsByPerson:claims});details.push(result);
   return {...original,status:result.status,reason:result.reason,restriction:result.restriction,income:result.income||P(result.reason),incomeYen:result.incomeYen,highConnection:result};
  })||[];
  if(!details.length)continue;
  const complete=Object.values(row.incomeRestriction.roleGroups||{}).every(x=>x.status==='known')&&rows.every(x=>x.status==='known');
  const restricted=rows.some(x=>x.status==='known'&&x.assignment?.status==='known'&&x.restriction==='restricted');
  const restriction=restricted?'restricted':complete?'not-restricted':undefined;
  const result={...row.incomeRestriction,status:restriction?'known':'pending',restriction,rows,allRequiredRolesAndInputsComplete:complete,highConnectionDetails:details,determinationBasis:'Confirmed rows plus branch-invariant high-income restrictions; unknown point incomes retained',reason:restriction?undefined:'Unresolved high-income branches or role data; no guessed income',confirmedRestrictedPersonIds:rows.filter(x=>x.status==='known'&&x.restriction==='restricted').map(x=>x.personId)};
  row.incomeRestriction=result;
  const monthly=structuredClone(rf.allowances?.[program]?.monthlyByMonth?.[month]),application=monthly?.incomeApplication,recipient=rows.find(x=>x.role==='recipient'&&x.assignment?.status==='known');
  const mapped=monthly&&known(application)&&application.program===program&&application.targetMonth===month&&application.recipientId===monthly.recipientId&&application.childId===monthly.childId&&application.useOrdinary2025Result===true&&recipient?.personId===monthly.recipientId;
  const applied=mapped?{...application,status:result.status,program,targetMonth:month,recipientId:monthly.recipientId,childId:monthly.childId,referenceIncomeYear:2025,prefecturalTaxFiscalYear:2026,ordinaryRuleActuallyApplied:true,restriction:result.restriction,determinationBasis:result.determinationBasis}:P('Monthly branch-invariant income result/recipient/exception application unconfirmed');
  row.statutoryAmount=monthly?monthlyAllowanceEntitlement2026({...monthly,program,targetMonth:month,appliedIncomeRestriction:applied}):P('Monthly qualification/recognition absent');
  row.highIncomeCompositionPolicy='A confirmed identical restriction across unresolved income branches can determine the month amount only with separate monthly qualification, recognition, exceptions and rate. No assessed-income point is adopted.';
  breakdown.componentCompleteness.allowances[program]=result.status==='known'&&row.statutoryAmount.status==='known'?'known':'pending';
  g.summary={status:'not-calculated',reason:'Single reference-month composition, not a continuous annual benefit total'};
 }
 return issues;
}
/** Same derived calendar amount is a tax deduction input and one personal-cost component. */
export function stationaryAnnualizedBenchmark2025(input){
 const scope=pointScope(input);if(scope.status!=='known')return {...scope,metric:'Y*',scenarioKind:'stationary'};
 const {ids}=scope,month=input.contract.referenceMonth;
 const working=structuredClone(input),deductionValidationHolds=[];
 for(const id of ids){const app=working.household.researchFacts?.prefecturalTax2026?.spouseApplicationByPerson?.[id];if(!known(app)||app.taxpayerId!==id||app.referenceIncomeYear!==2025||app.prefecturalTaxFiscalYear!==2026||app.syntheticApplication!==true||app.applicationMode!=='recompute-for-each-salary-coordinate'||app.sameConfirmedGeneralSpouseElectionAsMunicipal!==true||['amountYen','deductionYen','inputSalaryProvenanceYen'].some(k=>Object.hasOwn(app,k))){const reason='Fresh same-person/FY2026 modelled spouse-claim conditions required; no literal or old-coordinate deduction';deductionValidationHolds.push({personId:id,reason});if(working.household.researchFacts?.prefecturalTax2026?.spouseApplicationByPerson)working.household.researchFacts.prefecturalTax2026.spouseApplicationByPerson[id]=P(reason);}}
 const evaluated=stationarySalaryResearchBreakdown2025({...working,months:[month]});
 if(!evaluated.breakdown)return {...evaluated,metric:'Y*',scenarioKind:'stationary'};
 const r=evaluated.breakdown,highIssues=highIncomeMonthly(working,r,month),burden={},pointApplicability=assessStationaryPointApplicability2026(input);
 holdUnconfirmedStationaryTcca2026(r,pointApplicability);
 for(const id of ids){const s=evaluated.calendarTaxDeductionInputs[id];burden[id]=s?.status==='known'?{...s,payerPersonId:id,burdenFrom:'2025-01-01',burdenThrough:'2025-12-31',basis:'calculated-calendar-personal-burden-in-2025',scope:'all-explicit-personal-insurance-burden',includesEmploymentInsurance:true}:s;}
 let combined=annualizedBenchmarkFromBreakdown2025({breakdown:r,contract:input.contract,insuranceBurdenByPerson:burden});
 const unresolvedBranches=Object.entries(r.allowances).flatMap(([program,g])=>(g.monthly[0].incomeRestriction.highConnectionDetails||[]).filter(x=>x.status==='pending'&&x.incomeInterval).map(x=>({program,personId:x.personId,...x.incomeInterval,limitYen:x.limitYen,comparisonOperator:x.comparisonOperator})));
 if(combined.status==='pending'&&unresolvedBranches.length)combined={...combined,reason:'Unresolved high-income branch interval: '+unresolvedBranches.map(x=>`${x.program}/${x.personId} ${x.lowerYen}..${x.upperYen}, limit${x.limitYen} (${x.comparisonOperator})`).join('; '),unresolvedBranches};
 const domainIssues=Object.entries(evaluated.insuranceByPerson).filter(([,p])=>p.healthPension.status!=='known').map(([id,p])=>({personId:id,status:p.healthPension.status,reason:p.healthPension.reason}));
 if(domainIssues.some(x=>x.status==='out-of-scope')){combined={...combined,status:'out-of-scope',reason:'Outside explicit steady20h/minimum-wage/equal-monthly salary domain',domainIssues};delete combined.indicatorYen;}
 if(highIssues.length){combined={...combined,status:'pending',reason:'Conflicting/incomplete high-income tax predicate; no composed indicator',highIssues};delete combined.indicatorYen;}
 if(pointApplicability.status!=='known'&&combined.status==='pending')combined={...combined,reason:pointApplicability.reason};
 return {...combined,pointApplicability,scenarioKind:'separate-stationary-households',stationaryConditionsFingerprint:signature(input),domainIssues,insuranceEvaluation:evaluated.insuranceByPerson,calendarTaxDeductionInputs:evaluated.calendarTaxDeductionInputs,deductionValidationHolds,personalBurdenByPerson:burden,derivationPolicy:'Exact same calendar2025 HP+EI amount used for tax deductions and subtracted once in Y*. Insurance-month year totals never substituted.',unsupportedValuePolicy:'No zero or interpolation at missing/unsupported salaries; high-income branches do not yield point incomes'};
}
export function compareStationaryBenchmarks2025(before,after,{personId}={}){
 requireThat(before.scenarioKind==='separate-stationary-households'&&after.scenarioKind===before.scenarioKind&&before.stationaryConditionsFingerprint===after.stationaryConditionsFingerprint,'Different household/role/insurance history or actual/fixed mode rejected');
 const ids=Object.keys(before.salaryByPerson||{}),changed=ids.filter(id=>before.salaryByPerson[id]!==after.salaryByPerson?.[id]);requireThat(changed.length===1&&changed[0]===personId,'One declared salary axis only; no reallocation');
 const salaryDeltaYen=after.salaryByPerson[personId]-before.salaryByPerson[personId],common={personId,salaryDeltaYen,referenceMonth:'2026-08',kind:'stationary-single-parent-salary-change',strictGlobalCliffClaim:false};
 if(before.status!=='known'||after.status!=='known')return {...common,status:'pending',reason:'An endpoint is uncomputed/outside stationary scope; no delta or interpolation'};
 const componentDeltas=before.components.map(a=>{const b=after.components.find(x=>x.id===a.id);return {id:a.id,period:a.period,contributionDeltaYen:b.contributionYen-a.contributionYen};}),indicatorDeltaYen=after.indicatorYen-before.indicatorYen;
 return {...common,status:'known',beforeIndicatorYen:before.indicatorYen,afterIndicatorYen:after.indicatorYen,indicatorDeltaYen,institutionContributionExcludingSalaryYen:indicatorDeltaYen-salaryDeltaYen,componentDeltas};
}
export function evaluateStationaryBenchmarkSection2025({varyingPersonId,fixedSalaryByPerson,fromYen,throughYen,stepYen=30000,maxEvaluationPoints=501,pathId,...input}){
 const ids=input.household?.parents?.map(p=>p.personId)||[],other=ids.find(id=>id!==varyingPersonId);
 requireThat(ids.includes(varyingPersonId)&&fixedSalaryByPerson&&same(Object.keys(fixedSalaryByPerson),[other])&&yen(fixedSalaryByPerson[other]),'Declared single parent and fixed other-parent coordinate required');
 requireThat(yen(fromYen)&&yen(throughYen)&&fromYen<=throughYen&&Number.isSafeInteger(stepYen)&&stepYen>0&&(throughYen-fromYen)%stepYen===0,'Aligned ascending integer salary section required');
 requireThat(stepYen%12===0,'Stationary section step must preserve equal integer monthly salary; no one-yen recovery path');
 requireThat(text(pathId),'Explicit path ID required');
 const count=(throughYen-fromYen)/stepYen+1;if(count<2||count>maxEvaluationPoints)return P('At least two points and explicit execution budget required');
 const points=Array.from({length:count},(_,i)=>stationaryAnnualizedBenchmark2025({...input,salaryByPerson:{[varyingPersonId]:fromYen+i*stepYen,[other]:fixedSalaryByPerson[other]}}));
 if(points.some(p=>!p.salaryByPerson||!p.stationaryConditionsFingerprint))return {status:'pending',reason:'Stationary scope/contract template not ready',points};
 const intervals=points.slice(1).map((p,i)=>compareStationaryBenchmarks2025(points[i],p,{personId:varyingPersonId}));
 const fingerprint=points[0].stationaryConditionsFingerprint;requireThat(points.every(p=>p.stationaryConditionsFingerprint===fingerprint),'Mixed stationary scenarios cannot form a path');
 const path={kind:'single-parent-ascending-salary-path',metric:'Y*',incomeYear:2025,referenceMonth:'2026-08',pathId,varyingPersonId,fixedSalaryByPerson,stepYen,conditionsFingerprint:fingerprint,evidence:{source:'stationaryAnnualizedBenchmark2025',note:'Fixed45-year parents and history policies, fresh payroll at each separate counterfactual; no interpolation or old fixed-cost recovery reuse'},points:points.map(p=>({pathId,referenceMonth:'2026-08',conditionsFingerprint:fingerprint,salaryByPerson:p.salaryByPerson,status:p.status,indicatorYen:p.indicatorYen,reason:p.reason}))};
 return {status:points.every(p=>p.status==='known')?'known':'partial',scenarioKind:'separate-stationary-households',pathId,varyingPersonId,fixedSalaryByPerson,fromYen,throughYen,stepYen,evaluatedPointCount:count,points,intervals,recovery:measureBenchmarkRecovery2025({path}),interpretation:'Coarse evaluated stationary counterfactuals only; not an actual household wage history, old fixed-cost path or exact off-grid recovery'};
}
