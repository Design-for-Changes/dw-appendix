// Reproduce the extrema of Appendix J across *all selectable G configurations* and both salary axes.
// Run from the repository root: node scripts/audit-difference-global-maximum.mjs
// All figures are annual yen under paper-2029, not an estimate of actual households.
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {CHILD_ELIGIBILITY_OPTIONS as options} from "../src/data/childEligibilityOptions.js";
import {createRevisionCalculator, REVISION_SPOUSE_DEDUCTION_TABLE} from "../src/calc/revisionEngine.js";
import {createDisabilityIncomeComparison} from "../src/calc/disabilityIncomeDifference.js";
import {calculatePaperSalaryTaxInputs2029} from "../src/calc/paperSalaryTaxInputs2029.js";
import {getChildDayServiceCapYen} from "../src/calc/serviceBurdenLimits.js";

const MAX=1500, W=10000, wage=Array.from({length:MAX+1},(_,n)=>n);
const parents=["head","spouse"], filings=[...parents,"none"], key=(...args)=>args.join(":");
const strongest=options.find(p=>p.tccaGrade==="1" && p.welfareEligible && p.taxStatus==="special");
const plain=options.find(p=>p.tccaGrade==="not" && !p.welfareEligible && p.taxStatus==="none");
assert.ok(strongest && plain);
const child=(p,age,taxDependentOf)=>({tccaGrade:p.tccaGrade,welfareEligible:p.welfareEligible,taxStatus:p.taxStatus,
  age,taxDependentOf,maintainedByRecipient:taxDependentOf==="spouse",serviceUser:false,serviceAmountYen:0});
const household=(children,spouseDeductionClaimant,welfareMaintainer)=>({protocol:"paper-2029",serviceAmountYen:0,
  roles:{allowanceRecipient:"head",spouseDeductionClaimant,welfareMaintainer},children});
const noDisability=children=>children.map(c=>({...c,tccaGrade:"not",welfareEligible:false,taxStatus:"none",serviceUser:false,serviceAmountYen:0}));

// The spouse enters an individual's tax/allowance calculation only via these income bands:
// same-household spouse (<=620k), then the ordinary/special spouse relief schedule. The
// individual's own salary still runs over every single 1-man-yen step, including 0 and 1500.
const limits=[620000,...REVISION_SPOUSE_DEDUCTION_TABLE.map(([wan])=>wan*W),Infinity];
const income=wage.map(w=>calculatePaperSalaryTaxInputs2029({annualSalaryYen:w*W,eligibleForIncomeAdjustment:true}).salaryIncomeYen);
const band=wage.map(w=>w===0?0:1+limits.findIndex(l=>income[w]<=l));
const bands=Array.from({length:limits.length+1},(_,i)=>wage.filter(w=>band[w]===i));
assert.ok(bands.every(b=>b.length));
const rep=bands.map(b=>b[0] || 1); // 0 and 1 give the same partner tax status; use 1 to allow own wage 0.

// Maximum reductions: no service use maximises the difference. Both handouts are nonnegative;
// grade 1 and welfare-eligible attain the largest scheduled amounts. Making each assigned
// child tax-special increases the disability deduction, does not raise any assessed allowance
// income, and does not raise tax (verified below). The previous-year additional-maintenance
// indicator only raises the fixed head claimant's income limit; set it for all spouse dependants.
// Child allowance cancels; with zero service use only ages <16 vs >=16 matter. Child order is immaterial.
const profiles=[];
for(let n=1;n<=3;n++)for(let hy=0;hy<=n;hy++)for(let ho=0;ho<=n-hy;ho++)for(let sy=0;sy<=n-hy-ho;sy++){
  const so=n-hy-ho-sy;
  const children=[[hy,8,"head"],[ho,16,"head"],[sy,8,"spouse"],[so,16,"spouse"]]
    .flatMap(([count,age,p])=>Array.from({length:count},()=>child(strongest,age,p)));
  profiles.push(children);
}
assert.deepEqual([1,2,3].map(n=>profiles.filter(cs=>cs.length===n).length),[4,10,20]);
const low=createRevisionCalculator(household([child(strongest,8,"head")],"head","head")).evaluate(1,1);
const {tcca:tccaPerChild,welfare:welfarePerChild}=low.details.benefits;
assert.ok(tccaPerChild>0 && welfarePerChild>0);
const cached=new Map(); let individualObservations=0, joinedGroups=0, directPointChecks=0;

// For each side, inside [own wage band][partner wage band] keep the largest
// individual tax saving for each (TCCA passes?, child-welfare passes as maintainer?)
// state. Once bands and statuses are fixed, the two tax savings are independent; the
// Cartesian maxima can be added and both witnesses are simultaneously attainable.
function sideTables(children,filing,side){
  const own=children.filter(c=>c.taxDependentOf===side),claims=filing===side;
  const id=key(side,children.length,own.length,own.filter(c=>c.age>=16).length,claims);
  if(cached.has(id))return cached.get(id);
  const H=household(children,filing,side);
  const obs=createRevisionCalculator(H),base=createRevisionCalculator({...H,children:noDisability(children)});
  const result=bands.map(()=>[]), memoPartner=new Map();
  for(let j=0;j<bands.length;j++){
    const partner=claims?rep[j]:(income[rep[j]]<=620000?1:rep[2]);
    let grouped=memoPartner.get(partner);
    if(!grouped){
      grouped=bands.map(()=>new Map());
      for(const w of wage){
        const coords=side==="head"?[w,partner]:[partner,w];
        const a=obs.evaluate(...coords).details,b=base.evaluate(...coords).details;
        const taxSaving=b[side+"Tax"].totalTaxYen-a[side+"Tax"].totalTaxYen;
        const t=!a.benefits.specialChildAllowance.checks.find(entry=>entry.id===side).stopped;
        const f=a.benefits.welfareChildren[0].incomeEligible;
        const status=Number(t)*2+Number(f), winners=grouped[band[w]];
        if(!winners.has(status))winners.set(status,{w,t,f,taxSaving,rows:[]});
        const entry=winners.get(status);
        if(entry.taxSaving<taxSaving)Object.assign(entry,{w,taxSaving});
        entry.rows.push([w,taxSaving]);
        individualObservations++;
      }
      memoPartner.set(partner,grouped);
    }
    for(let i=0;i<bands.length;i++)result[i][j]=grouped[i];
  }
  cached.set(id,result);
  return result;
}

// Global maximum covers "higher earner" as well: at every wage pair that setting selects
// exactly one of the two fixed maintainers. The larger feasible award is their logical OR.
const byN=new Map();
const ranked=new Map();
// Within a shared salary-income band the two personal maxima need not satisfy head>=spouse.
// Scan both salary-ordered candidate lists, maintaining the best admissible spouse up to each
// head wage. This also enforces the qualifying claimant's own <=10m income for ordinary relief.
function bestOrdered(h,s,ordinary){
  let result=null,k=0,sp=null;
  for(const [hw,hsave] of h.rows){
    for(;k<s.rows.length && s.rows[k][0]<=hw;k++){
      const [sw,save]=s.rows[k];
      if((!ordinary || income[sw]<=620000) && (!sp || save>sp.save || (save===sp.save && sw>sp.sw)))sp={sw,save};
    }
    if(!sp || hsave<=0 || (ordinary && income[hw]>10000000))continue;
    const save=hsave+sp.save;
    if(!result || save>result.save || (save===result.save && sp.sw>result.sw))result={hw,sw:sp.sw,save};
  }
  return result;
}
function rememberRanked(label,result,handouts,children){
  if(!result)return;
  const v=result.save+handouts,cur=ranked.get(label);
  if(cur && (v<cur.v || (v===cur.v && cur.sw>=result.sw)))return;
  ranked.set(label,{...result,v,children});
}
for(const children of profiles){
  const n=children.length;
  for(const filing of filings){
    const H=sideTables(children,filing,"head"),S=sideTables(children,filing,"spouse");
    let best=null;
    for(let i=0;i<bands.length;i++)for(let j=0;j<bands.length;j++){
      if(i===0&&j===0)continue;  // origin is the only excluded salary point in paper-2029
      for(const h of H[i][j].values())for(const s of S[j][i].values()){
        const value=h.taxSaving+s.taxSaving+n*((h.t&&s.t?tccaPerChild:0)+(h.f||s.f?welfarePerChild:0));
        if(filing==="head" && i>=j && children.some(c=>c.taxDependentOf==="head")){
          const handouts=n*((h.t&&s.t?tccaPerChild:0)+(h.f?welfarePerChild:0));
          const ordered=bestOrdered(h,s,false);
          rememberRanked("higherEarnerHeadAndHeadTaxSaving",ordered,handouts,children);
          if(children.every(c=>c.taxDependentOf==="head"))
            rememberRanked("allChildrenClaimedByHigherEarnerHead",ordered,handouts,children);
          if(j<=1){
            const ordinary=bestOrdered(h,s,true);
            rememberRanked("ordinarySpouseDeductionAndHigherEarnerHead",ordinary,handouts,children);
            if(children.every(c=>c.taxDependentOf==="head"))
              rememberRanked("ordinarySpouseDeductionAllChildrenClaimedByHigherEarnerHead",ordinary,handouts,children);
          }
        }
        joinedGroups++;
        if(!best || value>best.value)best={value,headWan:h.w,spouseWan:s.w,maintainer:h.f?"head":"spouse"};
      }
    }
    // Do not just trust the factorisation: rebuild the two complete G households at each
    // of the 102 winning coordinates, independently of the partner-band representatives.
    const spec=household(children,filing,best.maintainer), coords=[best.headWan,best.spouseWan];
    const point=createDisabilityIncomeComparison(spec).evaluate(...coords);
    const g=createRevisionCalculator(spec).evaluate(...coords), b=createRevisionCalculator({...spec,children:noDisability(children)}).evaluate(...coords);
    const direct=Math.round(g.studyDisposableWan*W)-Math.round(b.studyDisposableWan*W);
    assert.equal(point.differenceYen,best.value); assert.equal(direct,best.value);directPointChecks++;
    if(!byN.has(n)||best.value>byN.get(n).differenceYen)byN.set(n,{...coordsToObject(coords),household:spec,...point,
      specialChildAllowanceYen:g.details.benefits.tcca,childWelfareAllowanceYen:g.details.benefits.welfare});
  }
}
function coordsToObject([headWan,spouseWan]){return {headWan,spouseWan};}

const rankedWitnesses={};
for(const [label,{hw,sw,v,children}] of ranked){
  let h=household(children,"head","highest-salary");
  const unmarked={...h,children:children.map(c=>({...c,maintainedByRecipient:false}))};
  if(createDisabilityIncomeComparison(unmarked).evaluate(hw,sw).differenceYen===v)h=unmarked;
  const c=createDisabilityIncomeComparison(h),p=c.evaluate(hw,sw),dh=createRevisionCalculator(h).evaluate(hw,sw).details;
  const db=createRevisionCalculator(c.baselineInputs).evaluate(hw,sw).details;
  assert.equal(p.differenceYen,v);
  assert.ok(hw>=sw && dh.roles.welfareMaintainer==="head" && db.headTax.totalTaxYen>dh.headTax.totalTaxYen);
  if(label.startsWith("ordinary"))assert.equal(dh.headTax.spouseDeduction.current.kind,"ordinary");
  rankedWitnesses[label]={headWan:hw,spouseWan:sw,household:h,...p,headTaxSavingYen:db.headTax.totalTaxYen-dh.headTax.totalTaxYen,
    spouseTaxSavingYen:db.spouseTax.totalTaxYen-dh.spouseTax.totalTaxYen,spouseDeductionKind:dh.headTax.spouseDeduction.current.kind,
    specialChildAllowanceYen:dh.benefits.tcca,childWelfareAllowanceYen:dh.benefits.welfare};
}

// Exhaustively check the dominance reduction using G's own tax/allowance calculations:
// salary 0..1500; every partner band; 0..3 dependants; number >=16; number ordinary vs
// special vs neither. Child order and cross-assignment of age to disability within the same
// deduction claim do not matter: the module counts each trait separately. A parent with
// zero dependants has identical assessments and taxes in both worlds by construction.
let dominanceComparisons=0;
for(let count=1;count<=3;count++)for(let older=0;older<=count;older++)for(const claim of [true,false]){
  const partnerReps=claim?[...new Set(rep)]:[1,rep[2]];
  const children=Array.from({length:count},(_,i)=>child(strongest,i<older?16:8,"head"));
  const src=household(children,claim?"head":"none","head"),ceil=createRevisionCalculator(src);
  const extreme=partnerReps.map(b=>wage.map(a=>ceil.evaluate(a,b).details.headTax));
  for(let ordinary=0;ordinary<=count;ordinary++)for(let special=0;special<=count-ordinary;special++){
    if(special===count)continue;
    const mixed=createRevisionCalculator({...src,children:children.map((c,i)=>({...c,taxStatus:i<ordinary?"ordinary":i<ordinary+special?"special":"none"}))});
    for(let j=0;j<partnerReps.length;j++)for(const a of wage){
      const x=mixed.evaluate(a,partnerReps[j]).details.headTax, e=extreme[j][a];
      assert.ok(e.totalTaxYen<=x.totalTaxYen && e.allowanceIncomeYen<=x.allowanceIncomeYen &&
        e.welfareMaintainerIncomeYen<=x.welfareMaintainerIncomeYen,"special failed to dominate a selectable combination");
      dominanceComparisons++;
    }
  }
}
// Minimum: the possible loss cannot exceed the highest annual household service cap;
// tax savings and handouts are nonnegative, and employee insurance is unchanged.
const minFee=getChildDayServiceCapYen(280000,true), minSpec=household([{...child(strongest,8,"head"),
  serviceUser:true,serviceAmountYen:minFee}],"head","highest-salary");
const minimum=createDisabilityIncomeComparison(minSpec).evaluate(0,MAX);
assert.equal(minimum.differenceYen,-12*minFee);
const maxima=[...byN.values()], maximum=maxima.reduce((x,y)=>x.differenceYen>y.differenceYen?x:y);
const displayed=JSON.parse(readFileSync(new URL("../src/data/disabilityDifferenceRange.json",import.meta.url),"utf8"));
const checkedRanges=maxima.map(p=>{
  const n=p.household.children.length, spec={...minSpec,children:Array.from({length:n},()=>({...minSpec.children[0]}))};
  const minimumYen=createDisabilityIncomeComparison(spec).evaluate(0,MAX).differenceYen;
  assert.equal(minimumYen,-12*minFee);
  return {children:n,minimumYen,maximumYen:p.differenceYen};
});
assert.deepEqual(displayed,checkedRanges,"Appendix J child-count table differs from the current simulation");
// A two-earner, distinct-age witness for the global maximum; no salary tie, no additional
// maintenance claim, and the default higher earner is the welfare maintainer.
const ordinaryExample=household([7,12,16].map(a=>({...child(strongest,a,"spouse"),maintainedByRecipient:false})),"head","highest-salary");
const twoEarners=createDisabilityIncomeComparison(ordinaryExample).evaluate(600,1012);
assert.equal(twoEarners.differenceYen,maximum.differenceYen);
console.log(JSON.stringify({protocol:"paper-2029",salaryPairs:(MAX+1)**2-1,numberOfAgeAndTaxAssignments:profiles.length,
  filings,maintainers:[...parents,"highest-salary"],individualObservations,joinedGroups,directPointChecks,dominanceComparisons,
  maximaByNumberOfChildren:maxima.map(p=>({n:p.household.children.length,differenceYen:p.differenceYen,headWan:p.headWan,spouseWan:p.spouseWan})),
  maximum,twoEarnerMaximum:{headWan:600,spouseWan:1012,household:ordinaryExample,...twoEarners},
  rankedWitnesses,verifiedTable:checkedRanges,minimum:{headWan:0,spouseWan:MAX,household:minSpec,...minimum}},null,2));
