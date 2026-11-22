import {buildSalaryDecisionMap} from "./salaryDecisionMap.js";
import {createRevisionCalculator} from "./revisionEngine.js";

const point=(tcca=0,welfare=0,householdCapYen=0,use=true)=>({status:"calculated",
  details:{benefits:{tcca,welfare},service:{hasCapApplicableServiceUse:use,householdCapYen,monthly:0,annual:0}}});
const build=(fn,maxSalaryWan=5)=>buildSalaryDecisionMap({evaluate:fn},{maxSalaryWan});
const layer=(m,id)=>m.layers.find(l=>l.id===id).segments;
// 目盛（実測点）間の半目盛位置を通るか。圧縮方法の実装には依存しない。
const vertical=(lines,x,y)=>lines.filter(([x1,y1,x2,y2])=>x1===x&&x2===x&&y1<=y&&y<=y2).length;
const horizontal=(lines,x,y)=>lines.filter(([x1,y1,x2,y2])=>y1===y&&y2===y&&x1<=x&&x<=x2).length;

test("両親のうち一方で既に全額停止している領域に、他方の限度額の線は延びない",()=>{
  const m=build((x,y)=>point(x<3&&y<3?100:0,x<2?50:0,4600));
  expect(layer(m,"N01-1")).toHaveLength(2);
  expect(layer(m,"N01-1")).toEqual(expect.arrayContaining([[2.5,0,2.5,2.5],[0,2.5,2.5,2.5]]));
  expect(layer(m,"N01-2")).toEqual([[1.5,0,1.5,5]]);
  expect(layer(m,"N02/N03")).toEqual([]);
});

test("世帯の支給の有無と、利用するサービスの負担区分を区別。無償のみ・非利用・未知の区分に境界を作らない",()=>{
  const cap=x=>x<2?0:x<4?4600:37200;
  for(const use of [true,false]){
    const m=build(x=>point(x===4?500:100,undefined,cap(x),use));
    expect(layer(m,"N01-1")).toEqual([]); // 金額が違っても支給の有無は同じ
    expect(layer(m,"N02/N03")).toEqual(use?[[1.5,0,1.5,5],[3.5,0,3.5,5]]:[]);
  }
  expect(layer(build(x=>point(0,0,x<2?undefined:x===2?null:37200)),"N02/N03").length).toBe(0);
});

test("全隣接点の状態を個別比較した結果と線分を突合する。原点と未算定点をつながず、斜め補間しない",()=>{
  const n=12;
  const fn=(x,y)=>(x===4&&y>=2&&y<=6) || (x+y)%17===0 ?
    {status:"excluded"} : point(x+y<8?100:0, x===y||y===5?50:0, x+y<5?0:(x+y)%5===0?37200:4600,y!==8);
  const calc=jest.fn(fn), updates=[];
  const m=buildSalaryDecisionMap({evaluate:calc},{maxSalaryWan:n,onProgress:x=>updates.push(x)});
  expect(calc).toHaveBeenCalledTimes((n+1)**2-1);
  expect(calc).not.toHaveBeenCalledWith(0,0);
  expect(updates[0]).toBe(0); expect(updates.at(-1)).toBe(100);
  const read=(p,j)=>p.status!=="calculated"?null:j===0?p.details.benefits.tcca>0:j===1?p.details.benefits.welfare>0:
    p.details.service.hasCapApplicableServiceUse?p.details.service.householdCapYen:null;
  const changed=(a,b)=>Number(a!==null&&b!==null&&a!==b);
  const actual=(x,y)=>x||y?fn(x,y):{status:"excluded"};
  let valid=0;
  for(let x=0;x<=n;x++) for(let y=0;y<=n;y++){
    const curr=actual(x,y);
    if(curr.status==="calculated")valid++;
    m.layers.forEach(({segments},j)=>{
      if(x>0)expect(vertical(segments,x-0.5,y)).toBe(changed(read(actual(x-1,y),j),read(curr,j)));
      if(y>0)expect(horizontal(segments,x,y-0.5)).toBe(changed(read(actual(x,y-1),j),read(curr,j)));
    });
  }
  expect(m.validCount).toBe(valid);
  for(const {segments} of m.layers)for(const [x1,y1,x2,y2] of segments){
    expect(x1===x2||y1===y2).toBe(true);
    expect([x1,y1,x2,y2].every(v=>v>=0&&v<=n)).toBe(true);
  }
});

test("実計算器：上限4,600→37,200円、実負担1,000円のままでも2Dの区分線は出る",()=>{
  const h=createRevisionCalculator({protocol:"paper-2029",serviceAmountYen:1000,children:[
    {age:10,tccaGrade:"1",welfareEligible:true,taxStatus:"special",serviceUser:true},
  ]});
  expect([984,985].map(x=>h.evaluate(x,0).details.service)).toEqual([
    expect.objectContaining({householdCapYen:4600,monthly:1000}),
    expect.objectContaining({householdCapYen:37200,monthly:1000}),
  ]);
  const m=build((x,y)=>h.evaluate(x+983,y),4);
  expect(vertical(layer(m,"N02/N03"),1.5,0)).toBe(1);
  // 支給がすでに停止した給与点では、判定内部の変化を世帯受給の切替として出さない。
  expect(layer(build((x,y)=>h.evaluate(x+739,y+1400),4),"N01-1")).toEqual([]);
});

test("原点だけなら有効点も線分もゼロ、範囲外・非整数は受け付けない",()=>{
  const e=jest.fn();
  const m=build(e,0);
  expect(e).not.toHaveBeenCalled(); expect(m.validCount).toBe(0); expect(m.layers.every(l=>!l.segments.length)).toBe(true);
  for(const n of [-1,1501,2.5])expect(()=>build(e,n)).toThrow(RangeError);
});
