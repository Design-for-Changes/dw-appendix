import{compareAnnualizedBenchmarks2025,evaluateAnnualizedBenchmarkSection2025}from'./annualizedBenchmark2025.mjs';
const text=x=>typeof x==='string'&&x.trim().length>0;
const yen=x=>Number.isSafeInteger(x)&&x>=0;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const requireThat=(x,s)=>{if(!x)throw new TypeError(s);};
/** Mechanical first return to the pre-drop Y* on a single ascending evaluated path. */
export function measureBenchmarkRecovery2025({path}){
 requireThat(path?.kind==='single-parent-ascending-salary-path'&&path.metric==='Y*'&&path.referenceMonth==='2026-08'&&path.incomeYear===2025,'Explicit supported Y* single-parent path and reference month required');
 requireThat(text(path.pathId)&&text(path.varyingPersonId)&&text(path.conditionsFingerprint)&&text(path.evidence?.source)&&text(path.evidence?.note),'Path identity, fixed-condition fingerprint and provenance required');
 const fixed=path.fixedSalaryByPerson;
 requireThat(fixed&&Object.keys(fixed).length===1&&!Object.hasOwn(fixed,path.varyingPersonId)&&Object.values(fixed).every(yen),'One explicit other-parent salary must be fixed');
 requireThat(Number.isSafeInteger(path.stepYen)&&path.stepYen>0&&Array.isArray(path.points)&&path.points.length>=2,'Constant positive integer step and at least two points required');
 const other=Object.keys(fixed)[0],points=path.points;
 for(let i=0;i<points.length;i++){
  const p=points[i];requireThat(p.pathId===path.pathId&&p.referenceMonth===path.referenceMonth&&p.conditionsFingerprint===path.conditionsFingerprint,'Mixed path/month/role/employment/insurance conditions are not a recovery experiment');
  requireThat(p.salaryByPerson&&same(Object.keys(p.salaryByPerson).sort(),[other,path.varyingPersonId].sort())&&p.salaryByPerson[other]===fixed[other]&&yen(p.salaryByPerson[path.varyingPersonId]),'Salary reallocation or unknown salary coordinate rejected');
  if(i)requireThat(p.salaryByPerson[path.varyingPersonId]-points[i-1].salaryByPerson[path.varyingPersonId]===path.stepYen,'Path must be strictly ascending and aligned with its constant step');
  requireThat(['known','pending','out-of-scope'].includes(p.status),'Explicit indicator availability required');
  if(p.status==='known')requireThat(Number.isSafeInteger(p.indicatorYen),'Known Y* must be signed integer yen');
 }
 const x=p=>p.salaryByPerson[path.varyingPersonId],episodes=[];let active;
 const finish=(state,extra={})=>{episodes.push({...active,...extra,state,label:({'recovered':'回復評価点を確認','not-recovered-in-range':'範囲内未回復','first-recovery-indeterminate':'初回回復判定不能'})[state]});active=undefined;};
 for(let i=1;i<points.length;i++){
  const prev=points[i-1],p=points[i],drop=prev.status==='known'&&p.status==='known'&&p.indicatorYen<prev.indicatorYen;
  if(!active&&drop)active={referenceSalaryYen:x(prev),referenceIndicatorYen:prev.indicatorYen,dropSalaryYen:x(p),dropIndicatorYen:p.indicatorYen,dropIndicatorDeltaYen:p.indicatorYen-prev.indicatorYen,subsequentDrops:[],missingSalaryPoints:[]};
  else if(active&&drop)active.subsequentDrops.push({salaryYen:x(p),indicatorYen:p.indicatorYen,previousIndicatorYen:prev.indicatorYen,referenceUnchanged:true});
  if(!active)continue;
  if(p.status!=='known'){active.missingSalaryPoints.push({salaryYen:x(p),status:p.status,reason:p.reason});continue;}
  if(p.indicatorYen>=active.referenceIndicatorYen){
   const observed={observedReturnCandidateSalaryYen:x(p),observedReturnCandidateIndicatorYen:p.indicatorYen};
   if(active.missingSalaryPoints.length)finish('first-recovery-indeterminate',observed);
   else finish('recovered',{...observed,recoverySalaryYen:x(p),recoveryIndicatorYen:p.indicatorYen,requiredAdditionalSalaryYen:x(p)-active.dropSalaryYen,firstRecoveryOnEvaluatedGrid:true,exactIntegerSalaryFirstRecovery:path.stepYen===1});
  }
 }
 if(active)finish(active.missingSalaryPoints.length?'first-recovery-indeterminate':'not-recovered-in-range');
 return {status:'known',metric:'Y*',pathId:path.pathId,referenceMonth:path.referenceMonth,incomeYear:2025,varyingPersonId:path.varyingPersonId,fixedSalaryByPerson:fixed,stepYen:path.stepYen,evaluatedRange:{fromYen:x(points[0]),throughYen:x(points.at(-1)),pointCount:points.length},
  resolution:path.stepYen===1?'complete-one-yen-local-path':'coarse-evaluated-grid-only',firstOffGridRecoveryClaim:false,conditionsFingerprint:path.conditionsFingerprint,evidence:path.evidence,episodes,
  missingPoints:points.filter(p=>p.status!=='known').map(p=>({salaryYen:x(p),reason:p.reason})),noObservedDrop:episodes.length===0,
  interpretation:'Fixed pre-drop Y* reference retained through later drops; required increase is recovery salary minus drop salary. This is path/grid-specific prototype recovery, not household cash flow or all-domain recovery.'};
}
/** Validate complete original benchmark conditions before projecting only the scalar needed for recovery. */
export function recoveryFromBenchmarkSection2025({section,pathId}){
 requireThat(Array.isArray(section?.points)&&section.points.length>=2&&section.metric==='Y*'&&section.referenceMonth==='2026-08','Supported benchmark section required');
 for(let i=1;i<section.points.length;i++)compareAnnualizedBenchmarks2025(section.points[i-1],section.points[i],{kind:'single-parent-salary-change',personId:section.varyingPersonId});
 const first=section.points[0],fingerprint=JSON.stringify([first.conditionsFingerprint,first.contract,first.components.find(c=>c.id==='personalInsuranceBurden').origin.byPerson]);
 const path={kind:'single-parent-ascending-salary-path',metric:'Y*',incomeYear:2025,pathId,varyingPersonId:section.varyingPersonId,fixedSalaryByPerson:section.fixedSalaryByPerson,stepYen:section.stepYen,referenceMonth:'2026-08',conditionsFingerprint:fingerprint,evidence:{source:'fresh annualizedBenchmark2025 section',note:'Original same-household salary comparisons validate fixed roles, service, insurance assumptions and composition contract before scalar projection'},
 points:section.points.map(p=>({pathId,referenceMonth:p.referenceMonth,conditionsFingerprint:fingerprint,salaryByPerson:p.salaryByPerson,status:p.status,indicatorYen:p.indicatorYen,reason:p.reason}))};
 return measureBenchmarkRecovery2025({path});
}
export function evaluateBenchmarkRecovery2025(input){const section=evaluateAnnualizedBenchmarkSection2025(input);if(!section.points)return section;return {section,recovery:recoveryFromBenchmarkSection2025({section,pathId:input.pathId})};}
