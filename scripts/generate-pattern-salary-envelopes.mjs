// Web Appendix G. Regenerate after changes to E's paper-2029 rules:
// node scripts/generate-pattern-salary-envelopes.mjs [--check]
import assert from "node:assert/strict";
import {readFileSync, writeFileSync} from "node:fs";
import {createRevisionCalculator} from "../src/calc/revisionEngine.js";
import {createPaperSalaryBands} from "../src/calc/paperSalaryBands.js";
import {getChildDayServiceCapYen} from "../src/calc/serviceBurdenLimits.js";

const maxSalaryWan=1500, protocol="paper-2029";
const output=new URL("../src/data/patternSalaryEnvelopes.json",import.meta.url);
const salaryPointCount=(maxSalaryWan+1)**2-1;
const {wages,band,first,last}=createPaperSalaryBands(maxSalaryWan);
/** 給与格子の区分を求めるため、年齢・税区分・手当資格を持つ子の入力を作る。 */
const child=(age,taxStatus,tccaGrade="1",welfareEligible=true)=>({
  age,taxStatus,tccaGrade,welfareEligible,serviceUser:false,serviceAmountYen:0,
});
/** 通所費を後から区分別に適用するため、まずEと同じ計算器に負担0円の世帯を渡す。 */
const calculator=children=>createRevisionCalculator({protocol,children,serviceAmountYen:0});

// The two parents have the same modeled age and coverage rules. The higher wage
// claims all child deductions and is the allowance claimant/maintainer; ties go
// to the head. A different partner wage within the same spouse-income band does
// not change this parent's taxes, levy, or means test provided roles stay fixed.
assert.ok(first.every(x=>x>=0));

// Rates (annual yen) come from E itself, rather than a second set of constants.
/** 所得停止のない給与点で一人分の特児・児福の年額をEの計算結果から取得する。 */
const rates=(grade,welfare)=>calculator([child(8,"none",grade,welfare)]).evaluate(1,1).details.benefits;
const annualRatesYen={first:rates("1",false).tcca,second:rates("2",false).tcca,welfare:rates("1",true).welfare};
assert.ok(Object.values(annualRatesYen).every(v=>Number.isSafeInteger(v)&&v>0));

// The low earner has no child tax dependants in either household. Save that
// parent's service levy/tax status and the spouse's special-child means test.
// Using the largest *high* salary in a band ensures the observed roles remain
// high/low, even if the lower salary is on the exact edge of that band.
const lowModel=calculator([child(8,"none")]);
const lows=last.map(representative=>wages.map(low=>{
  if(low>representative)return null;
  const d=lowModel.evaluate(representative,low).details;
  assert.equal(d.spouseTax.taxDependentCount,0);
  return {taxable:d.spouseTax.serviceTaxable,levy:d.spouseTax.serviceLevyYen,
    spousePass:!d.benefits.specialChildAllowance.checks[1].stopped};
}));

// Relative to a no-disability household at the same ages and wages, insurance
// and ordinary child allowance cancel. Tax saving depends on child count,
// number aged 16–17, ordinary and special tax classifications; these inputs are
// counts, not linked to individual allowance grades. Age 3–5 fee exemption is
// applied separately to the slider input, before using the household cap.
/** 手当の支給状態と通所上限が等しい給与点ごとに、税額差の両端と給与座標を集計する。 */
function groupCells(children,baseTax){
  const g=calculator(children);
  // Keep the smallest *low* wage in each band to preserve the same allocation
  // of child dependants to the high earner. Neither low wages nor parent labels
  // are dropped when composing the complete salary grid below.
  const highs=first.map((rep,i)=>wages.map(high=>{
    if(high===0||high<rep)return null;
    const d=g.evaluate(high,rep).details,t=d.headTax;
    assert.equal(t.taxDependentCount,children.length);
    const b=d.benefits;
    return {levy:t.serviceLevyYen,taxable:t.serviceTaxable,
      tax:baseTax[i][high]-t.totalTaxYen,claimant:!b.specialChildAllowance.checks[0].stopped,
      welfare:b.welfareChildren[0].incomeEligible};
  }));
  const buckets=new Map();
  for(let high=1;high<=maxSalaryWan;high++){
    const L=lows[band[high]];
    for(let low=0;low<=high;low++){
      const h=highs[band[low]][high],l=L[low];
      const cap=getChildDayServiceCapYen(h.levy+l.levy,h.taxable||l.taxable);
      const tcca=h.claimant&&l.spousePass,welfare=h.welfare,dc=h.tax;
      const key=cap*4+Number(tcca)*2+Number(welfare);
      let state=buckets.get(key);
      if(!state){
        const v={taxSavingYen:dc,headWan:high,spouseWan:low};
        state={tcca,welfare,capYen:cap,minimum:v,maximum:v,pointCount:0};
        buckets.set(key,state);
      }
      // Reflect the two salary axes: off-diagonal points occur twice.
      // For tied extrema prefer the lowest spouse wage, then the lowest head
      // wage, just as the full E scan does. The high>=low orientation wins
      // against its own reflection under this tie rule.
      state.pointCount+=high===low?1:2;
      if(dc<state.minimum.taxSavingYen || (dc===state.minimum.taxSavingYen && low<state.minimum.spouseWan))
        state.minimum={taxSavingYen:dc,headWan:high,spouseWan:low};
      if(dc>state.maximum.taxSavingYen || (dc===state.maximum.taxSavingYen && low<state.maximum.spouseWan))
        state.maximum={taxSavingYen:dc,headWan:high,spouseWan:low};
    }
  }
  const cells=[...buckets.values()].sort((a,b)=>Number(a.tcca)-Number(b.tcca)||
    Number(a.welfare)-Number(b.welfare)||a.capYen-b.capYen);
  assert.equal(cells.reduce((s,b)=>s+b.pointCount,0),salaryPointCount);

  // Independent full-household calls at both endpoints of every attainable
  // regime, plus their mirrors. Check the regime as well as the yen difference:
  // a stale cap can leave a zero-fee comparison correct by accident.
  const control=calculator(children.map(c=>({...c,tccaGrade:"not",taxStatus:"none",welfareEligible:false})));
  /** 二給与の直接算定と、所得帯ごとに再構成した支給状態・負担上限・税額差を照合する。 */
  function verifyPoint(x,y,tcca,welfare,cap,tax){
    const p=g.evaluate(x,y).details,b=control.evaluate(x,y).details;
    const actualTax=b.headTax.totalTaxYen+b.spouseTax.totalTaxYen-p.headTax.totalTaxYen-p.spouseTax.totalTaxYen;
    assert.deepEqual([p.benefits.tccaOK,p.benefits.welfareOK,p.service.householdCapYen,actualTax],
      [tcca,welfare,cap,tax]);
  }
  for(const cell of cells)for(const v of [cell.minimum,cell.maximum]){
    for(const [x,y] of [[v.headWan,v.spouseWan],[v.spouseWan,v.headWan]]){
      verifyPoint(x,y,cell.tcca,cell.welfare,cell.capYen,v.taxSavingYen);
    }
  }
  // Also check an interior pair for every possible higher salary, including
  // salaries nowhere near a bucket extremum. Alternate which parent earns more.
  for(let a=1;a<=maxSalaryWan;a++){
    const b=(104729*a+23)%(a+1), h=highs[band[b]][a],l=lows[band[a]][b];
    verifyPoint(a%2?a:b,a%2?b:a,h.claimant&&l.spousePass,h.welfare,
      getChildDayServiceCapYen(h.levy+l.levy,h.taxable||l.taxable),h.tax);
  }
  return cells;
}

const groups={};
for(let n=1;n<=3;n++)for(let older=0;older<=n;older++){
  const ages=Array.from({length:n},(_,i)=>i<older?16:8);
  const base=calculator(ages.map(age=>child(age,"none","not",false)));
  const baseTax=first.map(rep=>wages.map(high=>high>=rep && high>0
    ? base.evaluate(high,rep).details.headTax.totalTaxYen : null));
  for(let ordinary=0;ordinary<=n;ordinary++)for(let special=0;special<=n-ordinary;special++){
    const key=[n,older,ordinary,special].join(":");
    groups[key]=groupCells(ages.map((age,i)=>child(age,i<ordinary?"ordinary":i<ordinary+special?"special":"none")),baseTax);
  }
}
assert.equal(Object.keys(groups).length,64);
// One line per salary regime; stable order and a private Node-only generator.
const meta={schema:1,protocol,maxSalaryWan,salaryStepWan:1,salaryPointCount,annualRatesYen};
const groupLines=Object.entries(groups).map(([k,cells])=>
  '    '+JSON.stringify(k)+': [\n      '+cells.map(c=>JSON.stringify(c)).join(',\n      ')+'\n    ]');
const encoded='{'+'\n'+Object.entries(meta).map(([k,v])=>'  '+JSON.stringify(k)+': '+JSON.stringify(v)+',').join('\n')+
  '\n  "groups": {\n'+groupLines.join(',\n')+'\n  }\n}\n';
if(process.argv.includes("--check"))assert.equal(readFileSync(output,"utf8"),encoded,"Regenerate the salary envelopes before publishing.");
else writeFileSync(output,encoded);
console.log(Object.keys(groups).length+" tax/age profiles × "+salaryPointCount+" ordered salary points verified.");
