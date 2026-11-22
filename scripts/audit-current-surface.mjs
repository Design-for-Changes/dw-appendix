// Read-only audit: node --experimental-default-type=module scripts/audit-current-surface.mjs
// Reconcile point P, its elementary flows, and the surface actually sent to the
// renderer. This checks transmission, not legal correctness of its source flows.
import assert from "node:assert/strict";
import {createRevisionCalculator} from "../src/calc/revisionEngine.js";
import {buildSalarySurfaceGrid} from "../src/calc/salarySurfaceGrid.js";

const child=(age,tccaGrade,welfareEligible,taxStatus,serviceAmountYen,taxDependentOf="head")=>
  ({age,tccaGrade,welfareEligible,taxStatus,serviceAmountYen,taxDependentOf,serviceUser:serviceAmountYen>0});
const fixtures=[
  [child(10,"not",false,"none",0)],
  [child(8,"1",true,"special",37200),child(12,"1",true,"special",37200)],
  [child(2,"2",false,"ordinary",1800),child(4,"1",true,"special",11000,"spouse"),child(17,"not",false,"none",3500)],
];
const W=1501,N=W*W,ids=["N01-1","N01-2","N02/N03"];
for (const children of process.argv.includes("--tax-only")?[]:fixtures) {
  const model=createRevisionCalculator({protocol:"paper-2029",children,serviceAmountYen:0});
  assert.equal(model.evaluate(0,0).status,"excluded");
  const net=new Int32Array(N);
  const money=ids.map(()=>new Int32Array(N));
  const general=[...children].sort((a,b)=>b.age-a.age).reduce((v,c,i)=>v+(i>=2?30000:c.age<3?15000:10000)*12,0);
  const rawService=children.reduce((v,c)=>v+(c.serviceUser&&(c.age<3||c.age>=6)?c.serviceAmountYen:0),0);
  const ad=(t,i)=>t.nationalTax.taxYen+t.residentTax.municipalIncomeLevyYen+t.residentTax.prefecturalIncomeLevyYen+
    t.residentTax.perCapitaYen+t.residentTax.forestEnvironmentTaxYen+12*(i.monthly.healthCareSupportYen+i.monthly.pensionYen+i.monthly.employmentYen);
  let reconciled=0;
  const grid=buildSalarySurfaceGrid({evaluate(x,y){
    const p=model.evaluate(x,y),d=p.details,b=d.benefits,i=d.insurance,k=W*y+x;
    const parents=[d.headTax,d.spouseTax];
    const owner=x>=y?"head":"spouse";
    assert.equal(d.roles.allowanceRecipient,owner);
    assert(d.roles.taxDependentOf.length===children.length && d.roles.taxDependentOf.every(id=>id===owner));
    const taxed=parents.some(t=>t.residentTax.perCapitaYen>0 || t.residentTax.incomeLevyYen>0);
    const assess=parents.reduce((v,t,j)=>v+Math.max(0,t.residentTax.municipalIncomeLevyYen-
      ((j?"spouse":"head")===owner?children.reduce((a,c)=>a+(c.age<16?19800:7200),0):0)),0);
    const cap=taxed?(assess<280000?4600:37200):0;
    const s=12*Math.min(rawService,cap);
    const a=b.specialChildAllowance.checks.some(c=>c.assessmentIncomeYen>=c.limitYen)?0:
      12*children.reduce((v,c)=>v+({"1":58450,"2":38930,"not":0}[c.tccaGrade]),0);
    const w=children.reduce((v,c,j)=>v+((c.welfareEligible&&b.welfareChildren[j].checks.every(t=>t.role==="recipient"?
      t.incomeYen<=t.limitYen:t.incomeYen<t.limitYen))?12*16560:0),0);
    net[k]=(x+y)*10000-ad(parents[0],i.head)-ad(parents[1],i.spouse)+a+w+general-s;
    if (Math.round(p.studyDisposableWan*10000)!==net[k]||b.childAllowance!==general||d.service.annual!==s||b.tcca!==a||b.welfare!==w)
      throw Error("Point reconciliation failed: "+[children.length,x,y]);
    money[0][k]=a;money[1][k]=w;money[2][k]=s;reconciled++;
    return p;
  }});
  assert.equal(reconciled,N-1);assert.equal(grid.validCount,N-1);assert(Number.isNaN(grid.heights[0]));
  let rounding=0;
  for (let k=1;k<N;k++) {
    assert.equal(grid.heights[k],Math.fround(net[k]/10000));
    rounding=Math.max(rounding,Math.abs(grid.heights[k]*10000-net[k]));
  }
  const edges=[];
  ids.forEach((id,j)=>{
    const actual=grid.changeBySystem[id],flags=new Uint8Array(N),marks=new Uint8Array(N),links=new Uint8Array(N);
    for (const k of actual.points) {assert.equal(marks[k],0);marks[k]=1;}
    for(let l=0;l<actual.lines.length;l+=2){
      const a=actual.lines[l],b=actual.lines[l+1],corner=b-a===W?1:b-a===1?2:0;
      assert(corner);assert.equal(links[b]&corner,0);links[b]|=corner;
    }
    for(let k=1;k<N;k++){
      const x=k%W,y=Math.floor(k/W),m=money[j];
      const h=x>0&&k-1>0&&m[k]!==m[k-1],v=y>0&&k-W>0&&m[k]!==m[k-W];
      flags[k]=Number(h)+2*Number(v);
      assert.equal(marks[k],Number(h||v));
      const e=Number(y>0&&h&&!!(flags[k-W]&1))+2*Number(x>0&&v&&!!(flags[k-1]&2));
      assert.equal(links[k],e);
    }
    edges.push([id,actual.points.length,actual.lines.length/2]);
  });
  console.log(JSON.stringify({verificationHouseholdSize:children.length,points:reconciled,maxDisplayRoundingYen:rounding,edges}));
}

// Unlike reconciliation above, these expectations do not use the engine's
// resident tax. Funabashi is not a designated city (6% city, 4% prefecture).
// 地方税法附則第3条の3: https://laws.e-gov.go.jp/law/325AC0000000226
// City exemption thresholds: https://www.city.funabashi.lg.jp/kurashi/zei/007/001/p000865.html
function expected(label,actual,want) {
  console.log(JSON.stringify({label,actual,expected:want,match:actual===want}));
  if(actual!==want)process.exitCode=1;
}
const model=children=>createRevisionCalculator({protocol:"paper-2029",serviceAmountYen:0,children});
// A income 1,474,000; limit 350,000*3+420,000=1,470,000. The maximum
// levy is 4,000 (2,400 municipal + 1,600 prefectural), excluding flat taxes.
expected("所得割：給与222万・配偶者0・10歳児1人",model(fixtures[0]).evaluate(222,0).details.headTax.residentTax.incomeLevyYen,4000);
// B earns more and claims both children. B income=1,130,000; at A=131/132万,
// A income=620,000/630,000, so B's number of dependents including spouse is
// 3/2. B's income-levy exemption limit is 350,000*(n+1)+420,000, above B income at both points.
const dis=model([child(10,"2",false,"special",37200),child(8,"not",false,"none",0)]);
const left=dis.evaluate(131,182),right=dis.evaluate(132,182);
expected("配偶者所得割：世帯主131万・配偶者182万",left.details.spouseTax.residentTax.incomeLevyYen,0);
expected("配偶者所得割：世帯主132万・配偶者182万",right.details.spouseTax.residentTax.incomeLevyYen,0);
// +10,000 gross -48 insurance; benefits, service fees and taxes are unchanged.
expected("この隣接2点の可処分所得増減（円）",Math.round((right.studyDisposableWan-left.studyDisposableWan)*10000),9952);

// A=181→182万, B=825万: A's municipal levy rises 23,200→23,700; B's remains 276,500.
// The 19,800 adjustment for the 10-year-old belongs to B (tax parent). The 280,000 threshold
// is bracketed by 279,900→280,400. A:B taxes = 43,600:936,700 → 44,500:936,700.
const serviceModel=model([child(10,"2",false,"none",10406)]);
for (const [a,cityA,levy,cap,annual,net] of [
  [181,23200,279900,4600,55200,10060000-43600-936700-277968-1260348+120000-55200],
  [182,23700,280400,37200,124872,10070000-44500-936700-278016-1260348+120000-124872],
]) {
  const p=serviceModel.evaluate(a,825),d=p.details, id="（世帯主"+a+"万・配偶者825万）";
  expected("世帯主の市民税所得割"+id,d.headTax.residentTax.municipalIncomeLevyYen,cityA);
  expected("配偶者の市民税所得割"+id,d.spouseTax.residentTax.municipalIncomeLevyYen,276500);
  expected("通所の判定所得割"+id,d.service.assessmentLevyYen,levy);
  expected("通所の月額上限"+id,d.service.householdCapYen,cap);
  expected("年間の通所自己負担"+id,d.service.annual,annual);
  expected("住民税・通所負担をともに反映した可処分所得"+id,Math.round(p.studyDisposableWan*10000),net);
}
