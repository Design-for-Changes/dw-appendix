import {scanPaperChangePoints} from "./paperChangePoints.js";
import {createRevisionCalculator} from "./revisionEngine.js";

const checked = (head,spouse) => ({status:"calculated",head,spouse,details:{}});
const index = (family,serviceAmountYen=0,otherServiceMonthlyYen=0) =>
  createRevisionCalculator({protocol:"paper-2029",children:family,serviceAmountYen,otherServiceMonthlyYen});
const child = (age, extra={}) => ({age,tccaGrade:"not",taxStatus:"none",welfareEligible:false,serviceUser:false,...extra});
const qualified = age => child(age,{tccaGrade:"1",taxStatus:"special",welfareEligible:true,serviceUser:true});

test("モデル世帯の収支・下落幅とは別：資金の入出がなくても、条件がそろったN04等の区分の変化を個別に記録",()=>{
  // 外部区分は入力フィクスチャ。実制度の収入式・支弁区分境界を意味しない。
  const assessor={id:"N04",label:"就学奨励費・支弁区分",assess:(point,{spouseWan})=>spouseWan<4?"第Ⅰ区分":"第Ⅱ区分"};
  const m01={id:"M01",label:"モデル市の医療費助成・所得要件",assess:(p)=>p.spouse<4?"対象":"非対象"};
  const calculator={evaluate:(h,s)=>({...checked(h,s),disposableWan:999,breakdown:{}})};
  const result=scanPaperChangePoints(calculator,"spouse",700,{assessors:[assessor,m01],minWan:2,maxWan:5});
  expect(result.events).toEqual([
    {fromWan:3,atWan:4,system:"N04",subject:"household",label:assessor.label,before:"第Ⅰ区分",after:"第Ⅱ区分"},
    {fromWan:3,atWan:4,system:"M01",subject:"household",label:m01.label,before:"対象",after:"非対象"},
  ]);
  expect(result.unknownRanges).toEqual([]);
});

test("原点・全体の判定不能・部分的な資料不足を飛び越えず、後者は他制度の判定を止めない",()=>{
  const evaluate=jest.fn((head,spouse)=>head===3 ? {status:"insufficient"} : checked(head,spouse));
  const n04={id:"N04",label:"就学奨励費",assess:(p)=>[5,6].includes(p.head)?null:p.head<2?"区分1":p.head<4?"区分2":p.head<7?"区分3":"区分4"};
  const other={id:"other",label:"他の制度",assess:p=>p.head<6?"A":"B"};
  const r=scanPaperChangePoints({evaluate},"head",0,{assessors:[n04,other],maxWan:8});
  expect(evaluate).not.toHaveBeenCalledWith(0,0);
  expect(r.pointGaps).toEqual([{fromWan:0,toWan:0},{fromWan:3,toWan:3}]);
  expect(r.unknownRanges).toEqual([{system:"N04",subject:"household",fromWan:5,toWan:6}]);
  expect(r.events.map(e=>[e.system,e.fromWan,e.atWan])).toEqual([["N04",1,2],["other",5,6]]);
});

test("通所上限の変化は負担額の変化と別：未利用・無償対象だけでは数えず、利用あり・設定0円なら区分を記録",()=>{
  for (const [family,other,expected] of [
    [[child(10)],0,false], [[child(4,{serviceUser:true})],0,false],
    [[child(10,{serviceUser:true})],0,true], [[child(10)],800,true],
  ]) {
    const c=index(family,0,other);
    const events=scanPaperChangePoints(c,"head",0).events;
    expect(c.evaluate(500,0).details.service.hasCapApplicableServiceUse).toBe(expected);
    expect(events.every(e=>e.system==="N02/N03")).toBe(true);
    expect(events.length>0).toBe(expected);
    if (expected && other===0) for (const e of events) {
      expect(c.evaluate(e.fromWan,0).details.service.monthly).toBe(0);
      expect(c.evaluate(e.atWan,0).details.service.monthly).toBe(0);
    }
  }
});

test("特児は各人を個別比較。すでに別人の所得で停止済みでも、残る人の所得基準の切替を拾う",()=>{
  const c=index([qualified(10)]), r=scanPaperChangePoints(c,"head",1250);
  // 配偶者が高給与の受給者。低給与側（世帯主）は扶養0人の配偶者表628.7万円。
  const change=r.events.find(e=>e.system==="N01-1" && e.subject==="spouse:head" && e.after==="所得制限に該当");
  expect(change).toMatchObject({fromWan:840,atWan:841});
  const previous=c.evaluate(change.fromWan,1250), current=c.evaluate(change.atWan,1250);
  expect(previous.breakdown.tccaWan).toBe(0);
  expect(current.breakdown.tccaWan).toBe(0);
  expect(change.beforePerson).toBe("head");
  const swap=scanPaperChangePoints(c,"spouse",1200).events.find(e=>e.system==="N01-1" && e.subject==="spouse:spouse");
  expect(swap.afterPerson).toBe("spouse");
});

test("給与順位と本人表の支給可否が同じ一歩で変わっても、本人の制限境界を落とさない",()=>{
  const c=index([qualified(10),child(8)]), events=scanPaperChangePoints(c,"spouse",781,{minWan:780,maxWan:783}).events;
  const changes=events.filter(e=>e.system==="N01-1");
  expect(changes).toMatchObject([{atWan:782,subject:"claimant:spouse",beforePerson:"head",afterPerson:"spouse",after:"所得制限に該当"}]);
});

test("2児とも父母を別々に判定し、世帯主だけが限度額に達したら児童別に2件記録する",()=>{
  const c=index([qualified(10),qualified(8)]);
  const r=scanPaperChangePoints(c,"head",200);
  const ward=r.events.filter(e=>e.system==="N01-2");
  expect(ward.map(e=>e.subject)).toEqual(["child1:maintainer:head","child2:maintainer:head"]);
  expect(ward[0].atWan).toBe(ward[1].atWan);
  expect(ward.every(e=>e.beforePerson==="head" && e.afterPerson==="head")).toBe(true);
  // 本人は無所得のモデルなので、本人の所得判定には変化点がない。
  expect(r.events.some(e=>e.system==="N01-2" && e.subject.includes(":recipient"))).toBe(false);
  expect(r.events.filter(e=>e.system==="N04" || e.system==="M01")).toEqual([]);
});

test("実際の維持者の交代で制限状態が変わる場合と、児福本人の判定の変化を区別する",()=>{
  const calculator={evaluate:w=>({status:"calculated",details:{benefits:{welfareChildren:[{reasons:[],checks:[
    {role:"recipient",id:"child1",passes:w<4},
    {role:"maintainer",id:w<3?"head":"spouse",passes:w<3},
  ]}]}}})};
  const {events}=scanPaperChangePoints(calculator,"head",100,{minWan:1,maxWan:5});
  expect(events.map(e=>[e.subject,e.atWan,e.beforePerson,e.afterPerson])).toEqual([
    ["child1:maintainer",3,"head","spouse"], ["child1:recipient",4,"child1","child1"],
  ]);
});

test("給与単位・外部判定器ID・区分のみの出力契約を検査する",()=>{
  const c={evaluate:checked}, a={id:"N04",label:"就学奨励費",assess:()=>0};
  expect(()=>scanPaperChangePoints(c,"spouse",2,{assessors:[a],maxWan:1})).toThrow();
  expect(()=>scanPaperChangePoints(c,"head",0,{assessors:[a,a]})).toThrow();
  expect(()=>scanPaperChangePoints(c,"head",0,{assessors:[{...a,id:"N01-1"}]})).toThrow();
  expect(()=>scanPaperChangePoints(c,"head",0,{minWan:5,maxWan:4})).toThrow();
  expect(()=>scanPaperChangePoints(c,"head",100.5)).toThrow();
});

test("同じ外部制度でも適用対象を児童別に区別し、一方の不足を他方の結果に転写しない",()=>{
  const c={evaluate:checked};
  const assessor={id:"M01",subject:"child1",label:"子1の医療費助成",assess:p=>p.head<2?"対象":"非対象"};
  const second={...assessor,subject:"child2",label:"子2の医療費助成",assess:()=>null};
  const r=scanPaperChangePoints(c,"head",50,{assessors:[assessor,second],minWan:1,maxWan:3});
  expect(r.events.map(e=>[e.system,e.subject,e.atWan])).toEqual([["M01","child1",2]]);
  expect(r.unknownRanges).toEqual([{system:"M01",subject:"child2",fromWan:1,toWan:3}]);
});
