import{stationaryAnnualizedBenchmark2025}from'./stationaryBenchmark2025.mjs';
import{PROGRAMS}from'./allowanceIncome2026.mjs';
const known=x=>x?.status==='known'&&typeof x.evidence?.source==='string'&&x.evidence.source.trim()&&typeof x.evidence?.note==='string'&&x.evidence.note.trim();
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const text=x=>typeof x==='string'&&x.trim().length>0;
const sorted=x=>Array.isArray(x)?[...x].sort():undefined;
function age(d,at){if(typeof d!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(d))return undefined;return Number(at.slice(0,4))-Number(d.slice(0,4))-(at.slice(5)<d.slice(5)?1:0);}
/** Integrity of independent stipulated records for one fictional point; no clinical or grade classifier. */
export function validateIllustrativeCaseOne2025(input){
 const h=input?.household,p=h?.illustrativeCaseProfile,issues=[],check=(ok,reason)=>{if(!ok)issues.push(reason);};
 check(p?.profileId==='first-legally-specified-fictional-illustration'&&p.syntheticNotRealHousehold===true,'Explicit fictional first-case profile required');
 if(!p)return {status:'pending',issues,reason:issues.join('; ')};
 check(input.salaryByPerson?.['parent-a']===3600000&&input.salaryByPerson?.['parent-b']===1200000&&Object.keys(input.salaryByPerson).length===2&&p.fixedSalaryByPerson?.['parent-a']===3600000&&p.fixedSalaryByPerson?.['parent-b']===1200000,'Only first adopted salary point3600000/1200000; exploration not yet authorized in this case');
 check(p.incomeYear===2025&&p.referenceMonth==='2026-08'&&input.contract?.referenceMonth==='2026-08','Fixed2025 income and August2026 reference month required');
 check(h.municipality==='Funabashi'&&same(h.parents?.map(x=>x.personId),['parent-a','parent-b'])&&h.children?.length===1&&h.children[0].personId==='child-1','Same two-parent/one-child Funabashi identities required');
 for(const id of ['parent-a','parent-b'])check(age(input.scenariosByPerson?.[id]?.birthDate,'2025-12-31')===45&&age(input.scenariosByPerson?.[id]?.birthDate,'2026-08-01')===45,'Parent45 at both specified dates required: '+id);
 check(known(p.residence)&&p.residence.asOf==='2025-12-31'&&p.residence.normalCohabitation===true&&same(sorted(p.residence.personIds),['child-1','parent-a','parent-b']),'Year-end household cohabitation is an independent required fact');
 const school=p.childResidenceAndSchool;
 check(known(school)&&school.childId==='child-1'&&school.referenceMonth==='2026-08'&&school.atHome===true&&school.notInstitutionalized===true&&school.schoolEnrolled===true&&age(school.birthDate,'2025-12-31')===7&&age(school.birthDate,'2026-08-01')===7,'Separate reference-month at-home/school7-year facts required');
 check(known(p.taxAllocation)&&p.taxAllocation.asOf==='2025-12-31'&&p.taxAllocation.claimantId==='parent-a'&&p.taxAllocation.childId==='child-1'&&p.taxAllocation.noDuplicateToB===true&&h.taxDependentsByIncomeYear?.[2025]?.['child-1']?.claimantId==='parent-a','A-only year-end tax allocation required');
 const health=h.children?.[0]?.healthInsuranceDependency,dep=p.healthDependentRecognition;
 check(known(dep)&&dep.childId==='child-1'&&dep.sponsorId==='parent-a'&&dep.asOf==='2025-12-31'&&dep.throughMonth==='2026-08'&&dep.independentOfTaxAllocation===true&&health?.status==='known'&&health.sponsorId==='parent-a'&&health.asOf==='2025-12-31'&&health.recognitionRecordId===dep.recordId,'Separate A health-dependent recognition required; tax allocation cannot substitute');
 const medical=p.medicalDescription,book=p.handbook,bd=p.handbookDiagnosis,t=p.tccaDisabilityAssessment,w=p.childWelfareDisabilityAssessment;
 check(known(medical)&&medical.childId==='child-1'&&medical.description==='両上肢を手関節以上で欠く状態'&&medical.permanentOrFixedConditionConfirmed===true,'Stipulated fixed impairment description required; engine makes no diagnosis');
 check(known(book)&&book.childId==='child-1'&&book.grade===1&&book.lawReference==='physical-disability-rule-appendix5-upper-limbs-grade1'&&known(bd)&&bd.childId==='child-1'&&bd.designatedPhysicianCertificateConfirmed===true&&book.designatedDiagnosticRecordId===bd.recordId,'Independent fictional handbook diagnostic/decision records required');
 check(known(t)&&t.childId==='child-1'&&t.grade===1&&t.designatedSpecialistCertificateConfirmed===true&&t.independentDecisionConfirmed===true&&t.lawReference==='allowance-decree-appendix3-grade1-item4'&&t.notice==='2021-12-24-disability1224-no2','Independent TCCA diagnosis/assessment record required; no handbook-grade conversion');
 check(known(w)&&w.childId==='child-1'&&w.constantCareNeedSeparatelyConfirmed===true&&w.designatedSpecialistCertificateConfirmed===true&&w.independentDecisionConfirmed===true&&w.lawReference==='allowance-decree-appendix1-item3'&&w.notice==='2021-12-24-disability1224-no3','Independent child-welfare assessment and constant-care requirement required');
 check([book?.recordId,t?.recordId,w?.recordId,bd?.recordId,t?.diagnosticCertificateId,w?.diagnosticCertificateId].every(text)&&new Set([book?.recordId,t?.recordId,w?.recordId]).size===3&&new Set([bd?.recordId,t?.diagnosticCertificateId,w?.diagnosticCertificateId]).size===3,'Independent program records/certificates cannot be one generic grade flag');
 const day=p.dayServiceDecision;
 check(known(day)&&day.childId==='child-1'&&day.decisionHolderId==='parent-a'&&day.serviceMonth==='2026-08'&&day.decisionIndependentlyConfirmed===true&&day.serviceKind==='after-school-day-service','Independent same-child/A-holder day-service decision required');
 const rf=h.researchFacts,nA=rf?.nationalTax2025?.byPerson?.['parent-a']?.ordinaryDisabilityTaxClaims,nB=rf?.nationalTax2025?.byPerson?.['parent-b']?.ordinaryDisabilityTaxClaims,cA=nA?.entries?.[0],pA=rf?.prefecturalTax2026?.disabilityTaxClaimsByPerson?.['parent-a'],pB=rf?.prefecturalTax2026?.disabilityTaxClaimsByPerson?.['parent-b'],pc=pA?.entries?.[0];
 check(known(nA)&&nA.entries.length===1&&cA.targetPersonId==='child-1'&&cA.taxpayerPersonId==='parent-a'&&cA.relationship==='dependent'&&cA.classification==='cohabiting-special'&&cA.specialTaxApplicationConfirmed===true&&known(cA.cohabitation)&&cA.cohabitation.withPersonId==='parent-a'&&cA.cohabitation.normalCohabitationConfirmed===true&&known(nB)&&nB.entries.length===0,'National confirmed cohabiting-special claim exactly once atA,none atB required');
 check(h.taxFactsByIncomeYear?.[2025]?.children?.['child-1']?.disabilityCategory==='cohabiting-special'&&known(pA)&&pA.entries.length===1&&pc.classification==='special'&&pc.specialTaxApplicationConfirmed===true&&pc.targetPersonId==='child-1'&&pc.taxpayerId==='parent-a'&&pc.relationship==='dependent'&&known(pc.cohabitingResidentTaxApplication)&&pc.cohabitingResidentTaxApplication.classification==='cohabiting-special'&&known(pB)&&pB.entries.length===0,'Resident530000 and separate allowance400000 tax-application records atA only required');
 for(const [program,assessment]of [[PROGRAMS.TCCA,t],[PROGRAMS.CHILD,w]]){
  const a=rf?.allowances?.[program],m=a?.monthlyByMonth?.['2026-08'];
  const expected=program===PROGRAMS.TCCA?{recipient:['parent-a'],spouse:['parent-b'],supportObligor:[]}:{recipient:['child-1'],spouse:[],supportObligor:['parent-a','parent-b']};
  for(const [role,ids]of Object.entries(expected))check(same(sorted(a?.roles?.[role]?.subjects?.map(s=>s.assignment?.personId)),ids),'Fixed independently confirmed role identities required: '+program+'/'+role);
  check(m?.recognition?.state==='recognized'&&m.recognition.diagnosticCertificateId===assessment?.diagnosticCertificateId&&m.eligibility?.diagnosticCertificateId===assessment?.diagnosticCertificateId&&m.eligibility?.disabilityAssessmentRecordId===assessment?.recordId&&m.recognition.recognitionRecordId===(program===PROGRAMS.TCCA?'fiction-recognition-tcca':'fiction-recognition-child-welfare'),'Program-specific recognition/certificate links required: '+program);
  if(program===PROGRAMS.TCCA)check(m?.confirmedGrade?.grade===1&&m.confirmedGrade.gradeRecordId===t?.recordId,'Confirmed TCCA grade must link to its own assessment');
  for(const g of Object.values(a?.roles||{}))for(const s of g.subjects||[]){const id=s.assignment?.personId,ordinary=s.additions?.categories?.ordinary;check(same(sorted(ordinary),id==='parent-a'?['child-1','parent-b']:[])&&Object.entries(s.additions?.categories||{}).every(([key,v])=>key==='ordinary'||Array.isArray(v)&&v.length===0),'Per-person statutory additions must beA spouse+child2,others0: '+program+'/'+id);}
 }
 const additions=p.statutoryAdditionFacts;
 check(known(additions)&&additions.referenceIncomeYear===2025&&additions.taxpayerId==='parent-a'&&additions.sameLivelihoodSpouseId==='parent-b'&&additions.spouseTotalIncomeYen===550000&&additions.dependentChildId==='child-1'&&additions.dependentChildTotalIncomeYen===0&&additions.BAdditionsExplicitZero===true,'Independent2025 same-livelihood spouse/dependent addition facts required');
 return {status:issues.length?'pending':'known',issues,reason:issues.length?issues.join('; '):undefined,scope:'Consistency checks on separately stipulated fictional records for one point, not clinical judgement, eligibility certification or general grade conversion',profileId:p.profileId};
}
export function evaluateIllustrativeCaseOne2025(input){
 const validation=validateIllustrativeCaseOne2025(input);if(validation.status!=='known')return {status:'pending',validation,reason:validation.reason,indicatorYen:undefined};
 const result=stationaryAnnualizedBenchmark2025(input);
 return {status:result.status,validation,caseId:input.household.caseId,referenceMonth:'2026-08',incomeYear:2025,residentTaxFiscalYear:2026,result,indicatorYen:result.indicatorYen,legalRecordPolicy:'Handbook, medical certificates, benefit recognition and day-service decision are independently stipulated fictional facts. No automatic clinical or grade inference.',scope:'First illustrative point only; no expanded search or representative/full-domain/manuscript conclusion'};
}
