import {compareResearchSalaryBreakdowns} from './researchBreakdown2025.mjs';
/** Component movements at evaluated neighbours, not a disposable-income cliff/recovery estimate. */
export function diagnoseResearchSalaryComparison(before,after,{kind,personId}={}){
 const comparison=compareResearchSalaryBreakdowns(before,after,{kind,personId}),rows=[];
 const annualPeriod=(year,basis)=>({type:'annual',year,basis,label:basis==='income-year'?`${year}年分`:`${year}年度`});
 const add=(category,component,entity,period,left,right,unit,sources)=>{
  const complete=left.status==='known'&&right.status==='known'&&left.value!==undefined&&right.value!==undefined;
  rows.push({category,component,entity,period,unit,status:complete?'known':'pending',before:left.value,after:right.value,
   changed:complete?left.value!==right.value:undefined,delta:complete&&typeof left.value==='number'&&typeof right.value==='number'?right.value-left.value:undefined,
   beforeStatus:left.status,afterStatus:right.status,reason:complete?undefined:[left.reason,right.reason].filter(Boolean).join('; ')||'One or both component values uncomputed',sources});
 };
 const value=(r,v)=>({status:r?.status==='known'?'known':r?.status||'pending',value:r?.status==='known'?v:undefined,reason:r?.reason});
 for(const id of Object.keys(before.salary.byPerson)){
  const a=before.nationalTax.byPerson[id],b=after.nationalTax.byPerson[id];
  add('tax','national-year-end-annual-tax',id,annualPeriod(2025,'income-year'),value(a,a?.yearEndAdjustedAnnualTaxYen),value(b,b?.yearEndAdjustedAnnualTaxYen),'円/年分',before.sources.national);
 }
 const ids=Object.keys(before.localTax.annualResidentTaxByPerson||{});
 for(const id of ids){
  const a=before.localTax.annualResidentTaxByPerson[id],b=after.localTax.annualResidentTaxByPerson?.[id];
  const m=before.localTax.municipalIncomeLevyByPerson[id],n=after.localTax.municipalIncomeLevyByPerson[id];
  // Children are explicit zero-income tax records, not omitted household members.
  add('tax','municipal-income-levy',id,annualPeriod(2026,'fiscal-year'),m?value(m,m.municipalIncomeLevyYen):value(a,a?.municipal?.incomeLevyYen),n?value(n,n.municipalIncomeLevyYen):value(b,b?.municipal?.incomeLevyYen),'円/年度',before.localTax.annualSources);
  add('tax','prefectural-income-levy',id,annualPeriod(2026,'fiscal-year'),value(a,a?.prefectural?.incomeLevyYen),value(b,b?.prefectural?.incomeLevyYen),'円/年度',before.localTax.annualSources);
  for(const [name,key]of [['municipal-per-capita','municipalYen'],['prefectural-per-capita','prefecturalYen']]){
   const p=before.localTax.perCapitaByPerson[id],q=after.localTax.perCapitaByPerson[id];add('tax',name,id,annualPeriod(2026,'fiscal-year'),value(p,p?.[key]),value(q,q?.[key]),'円/年度',before.localTax.annualSources);
  }
  const f=before.localTax.forestEnvironmentNationalTaxByPerson[id],g=after.localTax.forestEnvironmentNationalTaxByPerson[id];
  add('tax','forest-environment-national-tax',id,annualPeriod(2026,'fiscal-year'),value(f,f?.annualYen),value(g,g?.annualYen),'円/年度・国税',before.localTax.annualSources);
 }
 for(const [id,months]of Object.entries(before.dayService.byChild))for(const a of months){
  const b=after.dayService.byChild[id]?.find(x=>x.serviceMonth===a.serviceMonth),period={type:'monthly',month:a.serviceMonth,basis:'service-month',label:a.serviceMonth};
  add('service-cap','day-service-monthly-cap',id,period,value(a.cap,a.cap?.capYen),value(b?.cap,b?.cap?.capYen),'円/月',before.dayService.sources);
  add('service-actual-charge','day-service-actual-charge',id,period,value(a.actualCharge,a.actualCharge?.chargeYen),value(b?.actualCharge,b?.actualCharge?.chargeYen),'円/月',before.dayService.sources);
 }
 for(const [program,group]of Object.entries(before.allowances))for(const a of group.monthly){
  const b=after.allowances[program]?.monthly.find(x=>x.targetMonth===a.targetMonth),period={type:'monthly',month:a.targetMonth,basis:'benefit-right-month',label:a.targetMonth},entity={program,recipientId:a.statutoryAmount.recipientId,childId:a.statutoryAmount.childId};
  add('benefit-income-stop','allowance-income-restriction',entity,period,value(a.incomeRestriction,a.incomeRestriction.restriction),value(b?.incomeRestriction,b?.incomeRestriction?.restriction),'所得制限の状態',before.sources.allowanceIncome);
  add('benefit-entitlement','statutory-monthly-entitlement',entity,period,value(a.statutoryAmount,a.statutoryAmount.entitlementYen),value(b?.statutoryAmount,b?.statutoryAmount?.entitlementYen),'円/月・制度上の権利額',before.sources.allowanceAmount);
 }
 const directions=Object.keys(before.salary.byPerson).map(id=>({personId:id,beforeYen:before.salary.byPerson[id],afterYen:after.salary.byPerson[id],deltaYen:after.salary.byPerson[id]-before.salary.byPerson[id],direction:after.salary.byPerson[id]>before.salary.byPerson[id]?'increase':after.salary.byPerson[id]<before.salary.byPerson[id]?'decrease':'fixed',unit:'円/2025年給与'}));
 const changedAxes=directions.filter(x=>x.deltaYen!==0),oneYenNeighbour=kind==='single-parent-salary-change'&&changedAxes.length===1&&Math.abs(changedAxes[0].deltaYen)===1;
 const categorySummary=Object.fromEntries(['tax','service-cap','service-actual-charge','benefit-income-stop','benefit-entitlement'].map(category=>{const rs=rows.filter(r=>r.category===category);return [category,{status:rs.every(r=>r.status==='known')?'known':'pending',knownChanged:rs.some(r=>r.changed===true),uncomputedComponents:rs.filter(r=>r.status!=='known').map(r=>({component:r.component,entity:r.entity,period:r.period,reason:r.reason}))}];}));
 return {status:'known',comparisonKind:kind,directions,salaryHouseholdBeforeYen:before.salary.householdSalaryYen,salaryHouseholdAfterYen:after.salary.householdSalaryYen,conditionsFingerprint:comparison.conditionsFingerprint,
  interval:{oneYenNeighbour,description:oneYenNeighbour?'Observed 1-yen neighbouring salary points under fixed conditions':'Observed evaluated endpoints only; not an exact boundary',strictBoundaryClaim:false,allThresholdsIndependentlyEnumerated:false},
  categorySummary,rows,scope:'Movements of separate institutional components and periods only; not disposable-income cliffs, recovery earnings, actual cash flows or a sum of unlike periods',grandTotal:'not-calculated'};
}
