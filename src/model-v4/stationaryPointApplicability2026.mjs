import{PROGRAMS}from'./allowanceIncome2026.mjs';
export const POINT_APPLICABILITY2026_SOURCES=Object.freeze({tccaRecipient:'https://www.mhlw.go.jp/web/t_doc?dataId=82090000&dataType=0&pageNo=1',separateHealthJointSupport:'https://www.mhlw.go.jp/web/t_doc?dataId=00tc5892&dataType=1&pageNo=1'});
const text=x=>typeof x==='string'&&x.trim().length>0,known=x=>x?.status==='known'&&text(x.evidence?.source)&&text(x.evidence?.note),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b),sort=x=>Array.isArray(x)?[...x].sort():undefined;
/** A point-specific stipulated administrative applicability record, never a wage-rank classifier. */
export function assessStationaryPointApplicability2026(input){
 const h=input?.household,month=input?.contract?.referenceMonth,ledger=h?.researchFacts?.stationaryPointApplicability2026,ids=h?.parents?.map(x=>x.personId)||[],children=h?.children?.map(x=>x.personId)||[],salary=input?.salaryByPerson,issues=[],parts={},byChild=Object.fromEntries(children.map(id=>[id,[]]));
 const fail=(part,reason,childId)=>{issues.push(reason);(parts[part]||=[]).push(reason);if(childId&&byChild[childId])byChild[childId].push(reason);};
 const bound=s=>s&&same(sort(Object.keys(s)),sort(ids))&&ids.every(id=>s[id]===salary?.[id]);
 if(!known(ledger)||!Array.isArray(ledger.reviews))fail('record','Explicit point-specific applicability ledger absent');
 const matches=(Array.isArray(ledger?.reviews)?ledger.reviews:[]).filter(x=>x.caseId===h?.caseId&&x.targetMonth===month&&x.salaryIncomeYear===2025&&bound(x.salaryByPerson));
 if(matches.length!==1)fail('record','Exactly one review for this household, salary coordinate and benefit month required; baseline or another salary point cannot substitute');
 const r=matches.length===1?matches[0]:undefined;
 if(!known(r)||r.reviewComplete!==true||!text(r.reviewId))fail('record','Complete evidenced independent review for this point required');
 if(r){
  const tax=r.taxDependentAssignment,health=r.childHealthDependency;
  if(!known(tax)||tax.incomeYear!==2025||tax.asOf!=='2025-12-31'||tax.independentOfTccaAndHealth!==true||!text(tax.recordId)||!same(sort(Object.keys(tax.claimantByChild||{})),sort(children))||!children.every(id=>h.taxDependentsByIncomeYear?.[2025]?.[id]?.status==='known'&&tax.claimantByChild[id]===h.taxDependentsByIncomeYear[2025][id].claimantId))fail('tax','Independent same-year same-child tax-dependent assignment review missing or conflicting');
  if(!known(health)||health.targetMonth!==month||health.independentOfTccaAndTax!==true||health.basis!=='separately-confirmed-health-insurer-record-for-this-scenario'||!text(health.recordId)||!same(sort(Object.keys(health.sponsorByChild||{})),sort(children))||!children.every(id=>{const f=h.children.find(c=>c.personId===id).healthInsuranceDependency;return f?.status==='known'&&f.sponsorId===health.sponsorByChild[id]&&text(f.recognitionRecordId)&&f.recognitionRecordId===health.recognitionRecordIdByChild?.[id]&&/^\d{4}-(0[1-9]|1[0-2])$/.test(f.confirmedThroughMonth)&&f.confirmedThroughMonth>=month;}))fail('health','Independent child-health recognition review required;2025 salaries are not the next-year income forecasts in the joint-support notice');
  const t=r.tccaByChild;
  if(!t||!same(sort(Object.keys(t)),sort(children)))fail('tccaCoverage','Explicit recipient/recognition applicability for each TCCA target child required');
  for(const id of children){
   const x=t?.[id],selection=x?.recipientSelection,recognition=x?.recognition,a=h.researchFacts?.allowances?.[PROGRAMS.TCCA],m=h.children.length===1?a?.monthlyByMonth?.[month]:a?.monthlyByChild?.[id],holder=h.allowanceRoles?.[PROGRAMS.TCCA]?.recipientId;
   if(!ids.includes(holder)||h.allowanceRoles?.[PROGRAMS.TCCA]?.status!=='known'||!known(selection)||selection.childId!==id||selection.targetMonth!==month||selection.selectedRecipientId!==holder||selection.bothParentsCareForChildConfirmed!==true||selection.selectionReviewComplete!==true||selection.legalBasis!=='law3-2-main-livelihood-maintainer'||selection.mainLivelihoodMaintainerId!==holder||selection.independentOfTaxAndHealth!==true||selection.notAssignedBySalaryRank!==true||!text(selection.recordId))fail('tcca','Independent TCCA main-livelihood-maintainer/recipient determination for this child and point required: '+id,id);
   if(!known(recognition)||recognition.program!==PROGRAMS.TCCA||recognition.targetMonth!==month||recognition.childId!==id||recognition.recipientId!==holder||recognition.recognizedForThisScenario!==true||!text(recognition.recordId)||!text(recognition.administrativeRecognitionRecordId)||!known(m?.recognition)||m.recognition.state!=='recognized'||m.recognition.program!==PROGRAMS.TCCA||m.recognition.childId!==id||m.recognition.recipientId!==holder||recognition.administrativeRecognitionRecordId!==m.recognition.recognitionRecordId)fail('tcca','Scenario-effective TCCA recognition record required, not an inherited general flag: '+id,id);
   if(selection?.recordId===recognition?.recordId||[tax?.recordId,health?.recordId].includes(selection?.recordId)||[tax?.recordId,health?.recordId].includes(recognition?.recordId))fail('tcca','TCCA selection, recognition, tax and health records must remain independent: '+id,id);
  }
  if(tax?.recordId===health?.recordId)fail('record','Tax and child-health reviews cannot share one inferred record');
 }
 return{status:issues.length?'pending':'known',targetMonth:month,salaryIncomeYear:2025,salaryByPerson:structuredClone(salary),reviewId:r?.reviewId,purpose:r?.purpose,parts,byChild,issues,reason:issues.length?issues.join('; '):undefined,sources:POINT_APPLICABILITY2026_SOURCES,policy:'Exact point and month only. No salary-rank recipient switch, income-ratio proxy, tax-to-health mapping or baseline extrapolation.'};
}
/** Preserve conditional mathematical outputs while withholding unsupported benefit and Y*. */
export function holdUnconfirmedStationaryTcca2026(breakdown,applicability){
 if(applicability.status==='known')return;
 const g=breakdown.allowances?.[PROGRAMS.TCCA];if(!g)return;
 for(const row of g.monthly||[]){row.statutoryAmount={status:'pending',program:PROGRAMS.TCCA,targetMonth:row.targetMonth,state:'point-recipient-applicability-unconfirmed',reason:applicability.reason};row.pointApplicability=applicability;row.incomeRestriction.qualificationScope='Conditional calculation under supplied roles; not a point-effective recipient determination';}
 g.summary={status:'pending',reason:'Point-effective TCCA recipient/recognition applicability unconfirmed; no sum'};
 if(breakdown.componentCompleteness?.allowances)breakdown.componentCompleteness.allowances[PROGRAMS.TCCA]='pending';
}
