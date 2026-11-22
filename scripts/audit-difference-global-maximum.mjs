// Verify the upper bounds in Appendix E. Run: node --experimental-default-type=module scripts/audit-difference-global-maximum.mjs
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRevisionCalculator, REVISION_SPOUSE_DEDUCTION_TABLE} from "../src/calc/revisionEngine.js";
import {createDisabilityIncomeComparison} from "../src/calc/disabilityIncomeDifference.js";
import {calculatePaperSalaryTaxInputs2029} from "../src/calc/paperSalaryTaxInputs2029.js";

const MAX=1500, W=10000, wages=Array.from({length:MAX+1},(_,n)=>n);
const child=age=>({age,tccaGrade:"1",welfareEligible:true,taxStatus:"special",serviceUser:false,serviceAmountYen:0});
const spec=children=>({protocol:"paper-2029",serviceAmountYen:0,children});
const normal=h=>({...h,children:h.children.map(c=>({...c,tccaGrade:"not",welfareEligible:false,taxStatus:"none"}))});

// Higher gross salary gets all child dependants and claims the special child allowance. By
// symmetry it suffices to scan head >= spouse: the higher earner is always the spouse-
// deduction filer, including ties (head). Both parents are tested as welfare maintainers. The low earner's
// tax saving is always zero. Only the higher earner receives these child deductions.
// With service off (maximal delta), age collapses to <16 / 16–17, order is immaterial, and
// ordinary child allowance cancels. The largest eligible cash rates are first grade + welfare.
// Upgrading every tax class to special is verified below not to reduce either benefit or tax saving.
const limits=[620000,...REVISION_SPOUSE_DEDUCTION_TABLE.map(([wan])=>wan*W),Infinity];
const band=wages.map(w=>limits.findIndex(limit=>calculatePaperSalaryTaxInputs2029({
  annualSalaryYen:w*W,eligibleForIncomeAdjustment:true}).salaryIncomeYen<=limit));
const lo=limits.map((_,i)=>band.indexOf(i)), hi=limits.map((_,i)=>band.lastIndexOf(i));
assert.ok(lo.every(x=>x>=0));
let sampledCells=0,rankCells=0,restoredChecks=0,crossChecks=0,dominanceComparisons=0;
const maxima=[];
for(let n=1;n<=3;n++)for(let old=0;old<=n;old++){
  const children=Array.from({length:n},(_,i)=>child(i<old?16:8));
  const household=spec(children);
  const g=createRevisionCalculator(household), base=createRevisionCalculator(normal(household));
  // At a fixed wage point, a parent's taxes, assessed income and size of tax household
  // depend on the partner's salary only through its spouse-income band. For a high earner
  // use the **lowest** partner in that band so children stay on this parent. For a low earner
  // use the **highest** partner in the band, with the same tie rule. Never transfer a
  // claimant decision or child deduction over the crossover to the low earner.
  const highData=lo.map(b=>wages.map(a=>{
    if(a<b || !a)return null;
    const d=g.evaluate(a,b).details, dt=base.evaluate(a,b).details;
    assert.equal(d.headTax.taxDependentCount,n);
    assert.deepEqual([d.roles.allowanceRecipient,d.roles.spouseDeductionClaimant,d.roles.welfareMaintainer],["head","head","both"]);
    assert.equal(d.benefits.additionalSupportedCount,0);
    const c=d.benefits.specialChildAllowance.checks[0];
    sampledCells++;
    assert.equal(typeof c.stopped,"boolean");
    return {tax:dt.headTax.totalTaxYen-d.headTax.totalTaxYen,claimant:!c.stopped,
      welfare:d.benefits.welfareChildren[0].checks.find(c=>c.role==="maintainer"&&c.id==="head").passes};
  }));
  const lowData=hi.map(a=>wages.map(b=>{
    if(b>a)return null;
    const d=g.evaluate(a,b).details,dt=base.evaluate(a,b).details;
    assert.equal(d.spouseTax.taxDependentCount,0);
    assert.equal(d.spouseTax.totalTaxYen,dt.spouseTax.totalTaxYen);
    const c=d.benefits.specialChildAllowance.checks[1];
    sampledCells++;
    assert.equal(typeof c.stopped,"boolean");
    return {spouse:!c.stopped,welfare:d.benefits.welfareChildren[0].checks.find(c=>c.role==="maintainer"&&c.id==="spouse").passes};
  }));
  const {tcca,welfare}=g.evaluate(1,1).details.benefits;
  assert.ok(tcca>0 && welfare>0);
  const direct=createDisabilityIncomeComparison(household);
  function differenceFromBands(a,b){
    const H=highData[band[b]][a],L=lowData[band[a]][b];
    return H.tax+(H.claimant&&L.spouse?tcca:0)+(H.welfare&&L.welfare?welfare:0);
  }
  // Check the salary-band reduction independently against both the actual household and
  // its control. Cover each possible salary, as well as the exact endpoints of every
  // partner-income class (including 0, ties and the reflected half of the grid).
  for(let a=1;a<=MAX;a++){
    for(const b of new Set([a, (104729*a+23)%(a+1), lo[a%lo.length], hi[a%hi.length]])){
      if(b>a)continue;
      const expected=differenceFromBands(a,b);
      assert.equal(direct.evaluate(a,b).differenceYen,expected);
      assert.equal(direct.evaluate(b,a).differenceYen,expected);
      crossChecks+=2;
    }
  }
  let best=-Infinity,witness,rank=-1;
  for(let a=1;a<=MAX;a++)for(let b=0;b<=a;b++){
    const delta=differenceFromBands(a,b);
    const r=Number(a!==b&&b>0); // merely choose a reproducible dual-earner witness among exact ties.
    if(delta>best || (delta===best && r>rank)){
      best=delta;rank=r;witness={a,b};
    }
    rankCells++;
  }
  const {a,b}=witness,hh=household;
  const parsed=createDisabilityIncomeComparison(hh).evaluate(a,b),result=createRevisionCalculator(hh).evaluate(a,b);
  assert.equal(result.recipient,"head");
  assert.equal(parsed.differenceYen,best);
  assert.equal(Math.round(result.studyDisposableWan*W)-Math.round(createRevisionCalculator(normal(hh)).evaluate(a,b).studyDisposableWan*W),best);
  if(a!==b){ // direct check of the excluded (mirror image) half of the grid, with parent IDs interchanged
    const mirror=g.evaluate(b,a).details.roles;
    assert.deepEqual([mirror.allowanceRecipient,mirror.spouseDeductionClaimant,mirror.welfareMaintainer],["spouse","spouse","both"]);
    assert.equal(createDisabilityIncomeComparison(hh).evaluate(b,a).differenceYen,best);
  }
  restoredChecks++;
  if(!maxima[n-1]||best>maxima[n-1].differenceYen||(best===maxima[n-1].differenceYen&&rank>maxima[n-1].rank))
    maxima[n-1]={headWan:a,spouseWan:b,household:hh,rank,...parsed,specialChildAllowanceYen:result.details.benefits.tcca,
      childWelfareAllowanceYen:result.details.benefits.welfare};
}
assert.equal(restoredChecks,9);
assert.equal(rankCells,9*((MAX+1)*(MAX+2)/2-1));

// Independently prove the tax/cash upper-bound reduction over all distinct tax inputs of
// the higher earner, including both sides of every tax exemption / means-test threshold.
for(let n=1;n<=3;n++)for(let old=0;old<=n;old++){
  const children=Array.from({length:n},(_,i)=>child(i<old?16:8));
  const g=createRevisionCalculator(spec(children));
  for(const b of lo){
    const lower=Math.max(1,b), gold=wages.slice(lower).map(a=>g.evaluate(a,b).details.headTax);
    for(let ord=0;ord<=n;ord++)for(let sp=0;sp<=n-ord;sp++){
      if(sp===n)continue;
      const alt=createRevisionCalculator(spec(children.map((c,i)=>({...c,taxStatus:i<ord?"ordinary":i<ord+sp?"special":"none"}))));
      for(let a=lower;a<=MAX;a++){
        const x=alt.evaluate(a,b).details.headTax,y=gold[a-lower];
        assert.ok(y.totalTaxYen<=x.totalTaxYen && y.allowanceIncomeYen<=x.allowanceIncomeYen &&
          y.welfareMaintainerIncomeYen<=x.welfareMaintainerIncomeYen);dominanceComparisons++;
      }
    }
  }
}
const verifiedTable=maxima.map((p,i)=>({children:i+1,maximumYen:p.differenceYen}));
console.log(JSON.stringify({salaryPairs:(MAX+1)**2-1,configurations:restoredChecks,rankCells,sampledCells,crossChecks,
  dominanceComparisons,verifiedTable,maxima},null,2));
const published=JSON.parse(readFileSync(new URL("../src/data/disabilityDifferenceRange.json",import.meta.url),"utf8"));
assert.deepEqual(published.map(({children,maximumYen})=>({children,maximumYen})),verifiedTable);
