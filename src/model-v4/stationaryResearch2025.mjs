import{stationaryEmployeeInsurance2025,stationaryEmploymentInsurance2025}from'./stationaryInsurance2025.mjs';
import{researchSalaryBreakdown2025}from'./researchBreakdown2025.mjs';
const known=x=>x?.status==='known';
const pending=reason=>({status:'pending',reason});
/** Explicit replacement mode only; legacy actual/fixed inputs may never be added or silently overwritten. */
export function prepareStationaryResearchInsurance2025({household,salaryByPerson,scenariosByPerson,payrollPoliciesByPerson,employmentPoliciesByPerson}){
 const c=structuredClone(household),rf=c.researchFacts,ids=c.parents.map(p=>p.personId);
 if(rf?.insuranceInputMode!=='stationary-calendar-payroll-estimate')return pending('Separate stationary research insurance mode required; actual/fixed mode cannot be combined');
 if(Object.keys(rf.socialInsuranceDeductions2025||{}).length||ids.some(id=>Object.hasOwn(c.taxFactsByIncomeYear?.[2025]?.byPerson?.[id]||{},'socialInsurancePaid')))return pending('Actual or fixed social deduction records coexist with stationary mode; explicit clean scenario required, no addition or overwrite');
 if(!salaryByPerson||Object.values(salaryByPerson).some(v=>!Number.isSafeInteger(v)||v<0)||JSON.stringify(Object.keys(salaryByPerson).sort())!==JSON.stringify([...ids].sort()))return pending('Both exact individual salary coordinates required');
 const insuranceByPerson={},social={};
 for(const id of ids){
  const s=scenariosByPerson?.[id],r=stationaryEmployeeInsurance2025({personId:id,annualSalaryYen:salaryByPerson[id],scenario:s,payrollPolicy:payrollPoliciesByPerson?.[id]}),e=stationaryEmploymentInsurance2025({stationaryResult:r,policy:employmentPoliciesByPerson?.[id]});
  insuranceByPerson[id]={healthPension:r,employment:e};
  let ageMatches=false;
  if(s?.birthDate){const age=2025-Number(s.birthDate.slice(0,4));ageMatches=c.taxFactsByIncomeYear?.[2025]?.byPerson?.[id]?.ageOn20251231===age;}
  if(!ageMatches||r.status!=='known'||r.payrollYear?.total?.status!=='known'||e.total?.status!=='known')social[id]=pending(!ageMatches?'Stationary birthdate conflicts with same-person existing tax age;35-year test cannot replace paper age':r.reason||r.payrollYear?.total?.reason||e.reason||e.total?.reason||'Mandatory calendar payroll/employment result incomplete');
  else social[id]={status:'known',personId:id,incomeYear:2025,amountYen:r.payrollYear.total.amountYen+e.total.amountYen,originKind:'stationary-calendar-payroll-estimate',originDescription:'Separate synthetic stationary salary history: calculated2025 withholding, not insurance-month annual total or company actuals; no existing amount added',evidence:{source:'stationaryInsurance2025.mjs with separately evidenced history/payroll/employment inputs',note:'Same-person calendar-year health/pension+employment estimate; actual/fixed mode is absent'},derivation:{scenarioId:s.scenarioId,annualSalaryYen:salaryByPerson[id],incomeYear:2025,payrollYear:2025,basis:'calculated-calendar2025-deduction',healthPensionPayrollYearYen:r.payrollYear.total.amountYen,employmentPayrollYearYen:e.total.amountYen,noActualOrFixedAmountCombined:true}};
 }
 rf.socialInsuranceDeductions2025=social;
 for(const p of c.parents){p.employment=insuranceByPerson[p.personId].healthPension.status!=='known'?{status:'pending',reason:'Stationary employment/qualification/minimum wage scope not established at this coordinate'}:{status:'known',conditionsId:scenariosByPerson?.[p.personId]?.scenarioId||'stationary-scope-unconfirmed',description:'Separate synthetic stationary20h indefinite employment scenario; no within-year salary change'};}
 return {status:'known',household:c,insuranceByPerson,calendarTaxDeductionInputs:social};
}
export function stationarySalaryResearchBreakdown2025(input){
 const prepared=prepareStationaryResearchInsurance2025(input);if(prepared.status!=='known')return prepared;
 const {household:c,insuranceByPerson,calendarTaxDeductionInputs:social}=prepared;
 const breakdown=researchSalaryBreakdown2025({household:c,salaryByPerson:input.salaryByPerson,months:input.months});
 return {status:'known',scenarioKind:'separate-stationary-coordinate-research',insuranceByPerson,calendarTaxDeductionInputs:social,breakdown,interpretation:'Tax components retain independent completeness. Unsupported stationary salary/history never becomes zero insurance; no Y*, recovery or actual household income asserted'};
}
