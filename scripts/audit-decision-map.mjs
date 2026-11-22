// node scripts/audit-decision-map.mjs [--quick]
// 2D制度境界の独立検算。3Dに使う支払額差分や2Dの判定コード・線の連結処理は
// 期待値に使用しない。フルは実給与0～1,500万円、quickは同じ1万円刻みの局所窓。
import assert from "node:assert/strict";
import { createRevisionCalculator } from "../src/calc/revisionEngine.js";
import { buildSalaryDecisionMap } from "../src/calc/salaryDecisionMap.js";

const quick = process.argv.includes("--quick");
assert(process.argv.slice(2).every(arg=>arg==="--quick"),"使用法: node scripts/audit-decision-map.mjs [--quick]");
const ids = ["N01-1","N01-2","N02/N03"];
const child = (age, tccaGrade, welfareEligible, taxStatus, serviceAmountYen, taxDependentOf="head", serviceUser=true) =>
  ({age,tccaGrade,welfareEligible,taxStatus,serviceAmountYen,taxDependentOf,serviceUser});
const one = [child(10,"1",true,"special",1)];
const mixed = [child(4,"1",true,"special",37200,"spouse"),child(16,"2",false,"ordinary",37200),child(17,"not",false,"none",0,"spouse",false)];
const free = [child(4,"not",false,"none",37200)];
const model = children => createRevisionCalculator({protocol:"paper-2029",children,serviceAmountYen:0});
const missing = {status:"excluded"};

// 各点の個別所得判定から、当該世帯への実際の支給の有無を組み立てる。
// 月額上限は親の市民税所得割・扶養児童と年齢から再算定する。判定用所得割や
// 計算器の世帯上限そのもの、手当の合計年額からコピーしない。
function reference(point,children,headWan,spouseWan) {
  if (point.status!=="calculated") return [null,null,null];
  const d=point.details, checks=d.benefits.specialChildAllowance.checks;
  const owner=headWan>=spouseWan?"head":"spouse";
  assert.equal(d.roles.allowanceRecipient,owner);
  assert(d.roles.taxDependentOf.length===children.length && d.roles.taxDependentOf.every(id=>id===owner));
  const eligibleSpecial=children.some(c=>c.tccaGrade!=="not") && checks.every(c=>c.assessmentIncomeYen<c.limitYen);
  const eligibleWelfare=children.some((c,i)=>c.welfareEligible && d.benefits.welfareChildren[i].checks.every(t=>
    t.role==="recipient"?t.incomeYen<=t.limitYen:t.incomeYen<t.limitYen));
  if (!children.some(c=>c.serviceUser && (c.age<3 || c.age>5))) return [eligibleSpecial,eligibleWelfare,null];
  const levy=["head","spouse"].reduce((sum,id)=>{
    const tax=d[id+"Tax"].residentTax;
    const reduction=id===owner?children.reduce((a,c)=>a+(c.age<16?19800:7200),0):0;
    return sum+Math.max(0,tax.municipalIncomeLevyYen-reduction);
  },0);
  const taxed=[d.headTax,d.spouseTax].some(t=>t.residentTax.perCapitaYen>0 || t.residentTax.incomeLevyYen>0);
  return [eligibleSpecial,eligibleWelfare,taxed?(levy<280000?4600:37200):0];
}

// 独立の読み取り：出来上がった線分が横切る給与点間の辺を整数格子へ逆投影する。
// 端点は外枠で切った半整数であり、重複・斜線・中心点を通る線は許さない。
function rasterize(map,n) {
  assert.deepEqual(map.layers.map(a=>a.id).sort(),[...ids].sort());
  const w=n+1;
  const hits=Array.from({length:3},()=>new Uint8Array(w*w));
  for(const {id,segments} of map.layers){
    const arr=hits[ids.indexOf(id)];
    for(const [x,y,X,Y] of segments) {
      const v=x===X, h=y===Y;
      assert(v!==h && [x,y,X,Y].every(k=>k>=0 && k<=n && Number.isInteger(k*2)),"線分の形状・範囲");
      const fixed=v?x:y, a=v?y:x, b=v?Y:X, bit=v?1:2;
      assert(!Number.isInteger(fixed) && a<b && (a===0 || !Number.isInteger(a)) && (b===n || !Number.isInteger(b)),"半目盛の共有辺");
      for(let k=Math.ceil(a);k<=Math.floor(b);k++){
        const next=Math.ceil(fixed), ix=v?k*w+next:next*w+k;
        assert.equal(arr[ix]&bit,0,"同一制度で同じ辺を二重描画"); arr[ix]|=bit;
      }
    }
  }
  return hits;
}

// x,yはグラフ窓に対する相対座標。quickでも給与の間引きは行わない。
function audit(name,children,{ox=0,oy=0,n,all=false,hole}={}) {
  const calc=model(children);
  const unavailable=(x,y)=>(x===0&&y===0)||Boolean(hole?.(x,y));
  const evalAt=(x,y)=>unavailable(x,y)?missing:calc.evaluate(ox+x,oy+y);
  const map=buildSalaryDecisionMap({evaluate:evalAt},{maxSalaryWan:n});
  const w=n+1;
  let unavailableCount=1;
  if(hole) for(let y=0;y<=n;y++)for(let x=0;x<=n;x++)if((x||y)&&hole(x,y))unavailableCount++;
  assert.equal(map.maxSalaryWan,n);
  assert.equal(map.validCount,w*w-unavailableCount);
  const hits=rasterize(map,n);
  const selected=all?Array.from({length:w},(_,i)=>i):
    [0,1,50,114,131,132,182,203,300,400,448,500,652,700,739,740,800,825,900,921,949,1200,n].filter(k=>k<=n);
  let comparisons=0;
  const changes=[0,0,0];
  for(const verticalOfLine of [true,false]){
    const bit=verticalOfLine?1:2;
    for(const fixed of selected){
      let last;
      for(let k=0;k<=n;k++){
        const x=verticalOfLine?k:fixed, y=verticalOfLine?fixed:k;
        const current=reference(evalAt(x,y),children,ox+x,oy+y);
        for(let j=0;j<3;j++){
          const expected=k>0 && last[j]!==null && current[j]!==null && current[j]!==last[j];
          const actual=Boolean(hits[j][y*w+x]&bit);
          if(actual!==expected) assert.fail(`${name} ${ids[j]} ${verticalOfLine?"世帯主":"配偶者"}軸 給与(${ox+x},${oy+y})万: 期待=${expected}, 描画=${actual}`);
          if(expected)changes[j]++;
          if(k>0)comparisons++;
        }
        last=current;
      }
    }
  }
  console.log(JSON.stringify({fixture:name,window:[ox,oy,n],validPoints:map.validCount,adjacentSystemChecks:comparisons,boundariesSeen:changes}));
  return {hits,w};
}

// 明示的な境界：実額は月1円で据え置きでも、所得割が28万円に達した時は線を引く。
const calcOne=model(one);
const before=calcOne.evaluate(920,182).details.service, at=calcOne.evaluate(921,182).details.service;
assert(before.assessmentLevyYen<280000); assert.equal(at.assessmentLevyYen,280000);
assert.deepEqual([before.householdCapYen,at.householdCapYen],[4600,37200]);
assert.deepEqual([before.monthly,at.monthly],[1,1]);
const capWindow=audit("上限境界・月1円",one,{ox:915,oy:178,n:12,all:true});
assert(capWindow.hits[2][4*capWindow.w+6]&1);
// 直前点を欠測に置き換えた同じ境界。穴をまたいで線が延びないことも確認。
const gapWindow=audit("28万円境界に欠測を挿入",one,{ox:915,oy:178,n:12,all:true,hole:(x,y)=>x===5&&y===4});
assert.equal(gapWindow.hits[2][4*gapWindow.w+6]&1,0);
// 高い配偶者給与で既に特児が停止。世帯主側の限度だけが変化しても線は出ない。
const stopped=[];
for(let x=600;x<=900;x++){
  const b=calcOne.evaluate(x,1200).details.benefits;
  assert.equal(b.tcca,0);
  assert(b.specialChildAllowance.checks.some(c=>c.role==="claimant"&&c.assessmentIncomeYen>=c.limitYen));
  stopped.push(b.specialChildAllowance.checks.find(c=>c.role==="spouse").stopped);
}
const cross=stopped.findIndex((state,i)=>i>0&&state!==stopped[i-1])+600;
assert(cross>600 && cross<900);
const blocked=audit("特児は配偶者所得で停止済み",one,{ox:cross-3,oy:1197,n:6,all:true});
assert.equal(blocked.hits[0][3*blocked.w+3]&1,0);
audit("無償通所だけ・手当要件なし",free,{ox:170,oy:120,n:26,all:true});
// 短時間版でも両手当の有効な支給・停止境界を1万円単位で含む。
if(quick){
  audit("特児の支給停止",one,{ox:732,oy:296,n:12,all:true});
  audit("生計維持者の交代",one,{ox:894,oy:897,n:18,all:true});
  audit("異年齢3児・旧扶養入力あり",mixed,{ox:880,oy:390,n:40,all:true});
}else{
  audit("1児・月額1円",one,{n:1500});
  audit("3児・給与逆転で全児の扶養先が切替",mixed,{n:1500});
}
