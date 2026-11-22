// Verify Appendix G against two independently evaluated households in E, not against
// the tax-band decomposition used to produce G's envelopes.
// node scripts/audit-all-patterns.mjs [--full-grid]
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {CHILD_ELIGIBILITY_OPTIONS} from "../src/data/childEligibilityOptions.js";
import {comparePatternEnvelopes} from "../src/calc/allPatternsCore.js";
import {createDisabilityIncomeComparison} from "../src/calc/disabilityIncomeDifference.js";

const envelopes=JSON.parse(readFileSync(new URL("../src/data/patternSalaryEnvelopes.json",import.meta.url),"utf8"));
const byId=new Map(CHILD_ELIGIBILITY_OPTIONS.map(p=>[p.id,p]));
const compare=settings=>comparePatternEnvelopes(settings,envelopes);

function comparisonFor(settings,ids) {
  const children=ids.map((id,i)=>({...byId.get(id),age:settings.ages[i],
    serviceAmountYen:settings.fees[i],serviceUser:settings.fees[i]>0}));
  return createDisabilityIncomeComparison({protocol:"paper-2029",serviceAmountYen:0,children});
}

// The extrema must be *attained*. Include every ordered row, even when two rows
// have identical values; a reversal of the children's IDs is not a missing row.
function auditWitnesses(settings) {
  const rows=compare(settings);
  const keys=new Set();
  let checks=0;
  for(const [i,row] of rows.entries()){
    assert.equal(row.profileIds.length,settings.ages.length);
    for(const id of row.profileIds)assert.ok(byId.has(id),id);
    keys.add(row.profileIds.join("/"));
    assert.ok(row.minimum.differenceYen<=row.maximum.differenceYen);
    const calc=comparisonFor(settings,row.profileIds);
    for(const p of [row.minimum,row.maximum]){
      for(const w of [p.headWan,p.spouseWan])assert.ok(Number.isInteger(w)&&w>=0&&w<=1500);
      assert.ok(p.headWan+p.spouseWan>0);
      assert.equal(calc.evaluate(p.headWan,p.spouseWan).differenceYen,p.differenceYen,JSON.stringify({settings,row,p}));
      checks++;
    }
    for(const [a,b] of [[1,0],[0,1500],[1500,1500],[760,760],[(i*79+1)%1501,(i*83+11)%1501]]){
      if(a===0&&b===0)continue;
      const delta=calc.evaluate(a,b).differenceYen;
      assert.ok(Number.isInteger(delta)&&delta>=row.minimum.differenceYen&&delta<=row.maximum.differenceYen,
        JSON.stringify({settings,row,a,b,delta}));
      checks++;
    }
  }
  assert.equal(rows.length,15**settings.ages.length);
  assert.equal(keys.size,rows.length);
  return {rows:rows.length,checks};
}

// Every one-yen fee is allowed. Ages 3 and 5 are exempt, ages 2 and 6 are not.
// Include ages on both sides of 16; cap arithmetic is at household level.
const settings=[
  {ages:[8],fees:[0]}, {ages:[2],fees:[1]}, {ages:[3],fees:[37200]}, {ages:[17],fees:[4600]},
  {ages:[15,16],fees:[4600,37200]}, {ages:[5,6],fees:[37200,4601]},
  {ages:[2,5,16],fees:[37200,1,4600]}, {ages:[0,15,17],fees:[1,4599,32599]},
];
for(const s of settings)console.log("Witnesses and interior probes:",s,auditWitnesses(s));

// Optional slower oracle: walk all 2,253,000 included salary pairs via E with no
// symmetry, binning or dominance shortcuts. Traversal order defines the same
// tie-break as E (lowest spouse salary, then lowest head salary).
function auditWholeGrid(s,ids) {
  const row=compare(s).find(r=>r.profileIds.every((id,i)=>id===ids[i]));
  assert.ok(row);
  const calculator=comparisonFor(s,ids);
  let min=Infinity,max=-Infinity,minimum,maximum,points=0;
  for(let spouseWan=0;spouseWan<=1500;spouseWan++)for(let headWan=0;headWan<=1500;headWan++){
    if(headWan===0&&spouseWan===0)continue;
    const d=calculator.evaluate(headWan,spouseWan).differenceYen;
    assert.ok(Number.isInteger(d));
    if(d<min){min=d;minimum={differenceYen:d,spouseWan,headWan};}
    if(d>max){max=d;maximum={differenceYen:d,spouseWan,headWan};}
    points++;
  }
  assert.equal(points,2253000);
  for(const [key,expected] of Object.entries({minimum,maximum}))
    for(const field of Object.keys(expected))assert.equal(row[key][field],expected[field],key+"."+field);
  console.log("Independent full grid:",s,ids,{points,minimum,maximum});
}

if(process.argv.includes("--full-grid")){
  auditWholeGrid({ages:[15,16],fees:[12345,4600]},["2:yes:ordinary","1:no:special"]);
  auditWholeGrid({ages:[2,5,16],fees:[1,37200,37198]},["1:yes:special","not:no:ordinary","2:no:none"]);
}
