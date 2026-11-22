// Reproduce the lower bound for Appendix E from the current model (not an observed population).
// Run: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/audit-difference-global-minimum.mjs
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {CHILD_ELIGIBILITY_OPTIONS as profiles} from "../src/data/childEligibilityOptions.js";
import {createDisabilityIncomeComparison} from "../src/calc/disabilityIncomeDifference.js";
import {createRevisionCalculator, REVISION_SPOUSE_DEDUCTION_TABLE} from "../src/calc/revisionEngine.js";
import {calculatePaperSalaryTaxInputs2029} from "../src/calc/paperSalaryTaxInputs2029.js";
import {getChildDayServiceCapYen} from "../src/calc/serviceBurdenLimits.js";

const UNIT=10000, maxSalary=1500, protocol="paper-2029";
const maxMonthly=getChildDayServiceCapYen(280000,true);
assert.deepEqual([getChildDayServiceCapYen(0,false),getChildDayServiceCapYen(279999,true),maxMonthly],[0,4600,37200]);
const floorYen=-12*maxMonthly;
const fields=(p,age=10,fee=maxMonthly)=>({age,tccaGrade:p.tccaGrade,welfareEligible:p.welfareEligible,
  taxStatus:p.taxStatus,serviceUser:fee>0,serviceAmountYen:fee});
const plain=profiles.find(p=>p.tccaGrade==="not"&&!p.welfareEligible&&p.taxStatus==="none");
const household=children=>({protocol,children,serviceAmountYen:0});
const witness={headWan:0,spouseWan:1500,age:10,profile:plain.id,taxDependentOf:"spouse",servicePerUserMonthlyYen:maxMonthly,
  allowanceRecipient:"spouse",welfareMaintainer:"both",spouseDeductionClaimant:"spouse"};

// For fixed wages and tax-filing relationships, only the two disability deductions change the taxes:
// the tax exemption limit depends on the number of dependants, not their disability classifications.
// Both national and local taxable income decrease; for the city's adjustment credit the national/local
// personal deduction difference can only increase. In the lower local bracket the levy before the
// near-exemption reduction is 0.1T - 0.05 min(D,T); in the upper it is 0.1T - max(2500,0.05(D-T+2m)).
// Both are nondecreasing in T and nonincreasing in D. The branches agree at 2m because 50,000<=D<=2m
// (at most three children). The near-exemption cap, nonnegative clamp and final rounding preserve order.
// Cross-check this argument against the two individual tax modules as invoked by the household engine:
// for a parent, only own salary, tax-dependent count, how many are 16+, ordinary/special counts and
// spouse's income bracket/claim status matter. No Cartesian product of unneeded programme settings.
function taxAudit(){
  const limits=[620000,...REVISION_SPOUSE_DEDUCTION_TABLE.map(([wan])=>wan*UNIT)];
  function partnerRepresentatives(){
    const byKey=new Map();
    for(let salary=0;salary<=maxSalary;salary++){
      const {salaryIncomeYen}=calculatePaperSalaryTaxInputs2029({annualSalaryYen:salary*UNIT,eligibleForIncomeAdjustment:true});
      // Joint origin is not allowed. If a class also has a positive representative,
      // retain the positive wage so that the parent with 0 salary is checked too.
      const key=limits.findIndex(limit=>salaryIncomeYen<=limit);
      if(!byKey.has(key) || byKey.get(key)===0)byKey.set(key,salary);
    }
    return [...byKey.values()];
  }
  const partnerWages=partnerRepresentatives();
  let individualTaxComparisons=0, taxProfiles=0;
  for(let count=1;count<=3;count++)for(let older=0;older<=count;older++){
      const children=Array.from({length:count},(_,i)=>fields(plain,i<older?17:10,0));
      const baseline=createRevisionCalculator(household(children));
      const baselineTax=partnerWages.map(b=>Int32Array.from({length:maxSalary+1},(_,a)=>baseline.evaluate(a,b).details.headTax.totalTaxYen));
      for(let ordinary=0;ordinary<=count;ordinary++)for(let special=0;special<=count-ordinary;special++){
        if(ordinary+special===0)continue; // identical tax inputs; no difference even for zero dependants
        const variant=createRevisionCalculator(household(children.map((c,i)=>({...c,
          taxStatus:i<ordinary?"ordinary":i<ordinary+special?"special":"none"}))));
        taxProfiles++;
        // Tax deductions are assigned only to the higher earner (the head on an exact tie).
        // The low earner's tax inputs remain identical on both sides of the comparison.
        for(const [index,b] of partnerWages.entries())for(let a=Math.max(1,b);a<=maxSalary;a++){
          const t=variant.evaluate(a,b).details.headTax.totalTaxYen;
          assert.ok(t<=baselineTax[index][a],`Tax burden increased: ${[a,b,count,older,ordinary,special]}`);
          individualTaxComparisons++;
        }
      }
  }
  return {taxProfiles,partnerWages,individualTaxComparisons};
}

// Attain the lower bound with a valid dropdown selection. Service use does not automatically
// establish tax or cash disability qualifications. This is a model witness, not an observed family.
const published=JSON.parse(readFileSync(new URL("../src/data/disabilityDifferenceRange.json",import.meta.url),"utf8"));
for(const {children:n,minimumYen} of published){
  const h=household(Array.from({length:n},()=>fields(plain,witness.age,maxMonthly)));
  const d=createRevisionCalculator(h).evaluate(witness.headWan,witness.spouseWan).details;
  assert.deepEqual(d.roles.taxDependentOf,Array(n).fill("spouse"));
  assert.equal(d.roles.allowanceRecipient,"spouse");
  assert.equal(d.roles.welfareMaintainer,"both");
  assert.equal(d.roles.spouseDeductionClaimant,"spouse");
  const p=createDisabilityIncomeComparison(h).evaluate(witness.headWan,witness.spouseWan);
  assert.deepEqual([p.taxSavingYen,p.insuranceSavingYen,p.extraBenefitsYen,p.extraServiceYen,p.differenceYen],
    [0,0,0,12*maxMonthly,floorYen]);
  assert.equal(minimumYen,floorYen);
}
// At these specific wages census each ordered profile without asserting every one reaches
// the global minimum or even becomes negative. These are not counts of affected families.
assert.equal(new Set(profiles.map(p=>p.id)).size,profiles.length);
const counts=[0,0,0],negativeAtPoint=[0,0,0],atFloorAtPoint=[0,0,0];
function walk(list) {
  if(list.length){
    const ev=fee=>createDisabilityIncomeComparison(household(list.map(p=>fields(p,10,fee)))).evaluate(witness.headWan,witness.spouseWan);
    const p=ev(maxMonthly);
    assert.equal(p.status,"calculated");
    assert.ok(p.differenceYen>=floorYen);
    assert.equal(ev(0).differenceYen,p.differenceYen+maxMonthly*12);
    assert.equal(ev(1000).differenceYen,p.differenceYen+maxMonthly*12-12000*list.length);
    const i=list.length-1;
    counts[i]++;negativeAtPoint[i]+=Number(p.differenceYen<0);atFloorAtPoint[i]+=Number(p.differenceYen===floorYen);
  }
  if(list.length<3)for(const p of profiles)walk([...list,p]);
}
walk([]);
assert.deepEqual(counts,[1,2,3].map(n=>profiles.length**n));
// Bounds on all model cells: income change = tax savings + disability benefits - service charge.
// Market salaries, ages/child allowance, and individual employee insurance are the same on both sides.
// Given the nonnegative savings checked above, negative iff charge > savings + extra benefits;
// charge=0 cannot produce a negative value. The cap, not the number of children, bounds the annual loss.
const tax=taxAudit();
console.log(JSON.stringify({scope:"Appendix E paper-2029; salary grid, not population",floorYen,
  perChildProfiles:profiles.length,orderedFamilyCounts:counts,witness,negativeAtPoint,atFloorAtPoint,tax},null,2));
