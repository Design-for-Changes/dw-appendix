import {assessFunabashiMedicalCoverage as assess, funabashiMedicalBoundaryExample, standardFunabashiChildVisit} from "./paperMedicalCoverage.js";
import {scanPaperChangePoints} from "./paperChangePoints.js";

const p=(overrides={})=>({...standardFunabashiChildVisit,adjustedInsuranceUnitLevyYen:234900,...overrides});
test("同一医療保険単位の調整後所得割234,900→235,000円：M01だけが外れ、子ども医療の適用は両側に残る",()=>{
  const [a,b]=funabashiMedicalBoundaryExample();
  expect([a,b].map(r=>[r.adjustedInsuranceUnitLevyYen,r.m01Status,r.childStatus,r.childCopayClass])).toEqual([
    [234900,"対象","対象","一部負担区分"],[235000,"対象外（所得制限）","対象","一部負担区分"]]);
  expect([a.coordination,b.coordination]).toEqual(["両制度の要件に該当（重複計上しない）","M01対象外・子ども医療は対象"]);
  expect(assess(p({adjustedInsuranceUnitLevyYen:234999})).m01Status).toBe("対象");
  expect(Object.keys(b).sort()).toEqual(["adjustedInsuranceUnitLevyYen","m01Status","childStatus","childCopayClass","coordination"].sort());
});

test("特例の有無を限度額以上のときだけ要し、不明・非該当・認定済みを混同しない",()=>{
  for (const [levy,exception,status] of [[235000,true,"対象（特例）"],[235001,false,"対象外（所得制限）"],
    [235001,null,null],[234999,null,"対象"]]) {
    const result=assess(p({adjustedInsuranceUnitLevyYen:levy,m01ExceptionConfirmed:exception}));
    expect(result.m01Status).toBe(status);
    expect(result.childStatus).toBe("対象");
  }
  const different=assess(p({adjustedInsuranceUnitLevyYen:undefined,headSalaryWan:1400,householdServiceLevyYen:500000}));
  expect(different).toMatchObject({m01Status:null,childStatus:"対象",coordination:null});
  expect(assess(p({m01DisabilityConfirmed:null,tccaGrade:"1"})).m01Status).toBeNull();
  expect(assess(p({m01DisabilityConfirmed:false})).m01Status).toBe("対象外");
});

test("子ども医療は0歳から18歳到達後最初の年度末まで。医療制度により資格と請求費目の範囲は別",()=>{
  for (const [age,yearEnd,status] of [[0,null,"対象"],[17,null,"対象"],[18,true,"対象"],[18,null,null],[18,false,"対象外"],[19,null,"対象外"]])
    expect(assess(p({ageAtVisit:age,withinEndOfFiscalYearAt18:yearEnd})).childStatus).toBe(status);
  for (const field of ["insured","funabashiRegistered"])
    expect(assess(p({[field]:false}))).toMatchObject({m01Status:"対象外",childStatus:"対象外"});
  expect(assess(p({publicAssistance:true}))).toMatchObject({m01Status:"対象外",childStatus:"対象外"});
  for (const reason of ["uninsured","insurer-paid-portion","school-sport-covered","third-party"])
    expect(assess(p({claimKind:reason}))).toMatchObject({childStatus:"対象外（当該費用）",childCopayClass:null});
  expect(assess(p({claimKind:null}))).toMatchObject({childStatus:null,childCopayClass:null});
});

test("子ども医療の適用と自己負担区分を分ける。所得割非課税・保険調剤・通院6回目・入院11日目",()=>{
  const tier=override=>assess(p(override)).childCopayClass;
  expect(tier({childHouseholdLevyTaxable:false})).toBe("無料区分");
  expect(tier({visitType:"pharmacy",ordinalAtSameProviderInMonth:null})).toBe("無料区分");
  for (const [visit,before,after] of [["outpatient",5,6],["inpatient",10,11]]) {
    expect(tier({visitType:visit,ordinalAtSameProviderInMonth:before})).toBe("一部負担区分");
    expect(tier({visitType:visit,ordinalAtSameProviderInMonth:after})).toBe("無料区分");
    expect(tier({visitType:visit,ordinalAtSameProviderInMonth:null})).toBeNull();
  }
  expect(assess(p({childHouseholdLevyTaxable:null}))).toMatchObject({childStatus:"対象",childCopayClass:null});
  expect(assess(p({otherPriorPublicAid:true}))).toMatchObject({childStatus:"対象",coordination:"他公費優先。残る自己負担は子ども医療で調整しうる"});
});

test("給与との対応が外部から判定できた点だけで変化を検知。医療費に関する架空の下落・第2の境界を返さない",()=>{
  const statuses=new Map([[1,234900],[2,235000],[4,234900]]);
  // 単体テストの給与点に任意の判定指標を対応づけただけで、論文の給与閾値ではない。
  const a=(id,key)=>({id,subject:"child1",label:id,assess:(point,{headWan})=>assess(p({
    adjustedInsuranceUnitLevyYen:statuses.get(headWan)}))[key]});
  const calculator={evaluate:()=>({status:"calculated",details:{}})};
  const r=scanPaperChangePoints(calculator,"head",100,{minWan:1,maxWan:4,assessors:[a("M01","m01Status"),a("子ども医療","childStatus")]});
  expect(r.events).toHaveLength(1);
  expect(r.events[0]).toMatchObject({fromWan:1,atWan:2,system:"M01",before:"対象",after:"対象外（所得制限）"});
  expect(r.unknownRanges).toEqual([{system:"M01",subject:"child1",fromWan:3,toWan:3}]);
});

test("書式誤りやモデル外年齢を欠測と取り違えず、欠測は陰性にも0にも置換しない",()=>{
  expect(assess({})).toEqual({m01Status:null,childStatus:null,childCopayClass:null,coordination:null});
  for (const kv of [{ageAtVisit:65},{adjustedInsuranceUnitLevyYen:-1},{m01ExceptionConfirmed:"no"},{visitType:"home"},
    {ordinalAtSameProviderInMonth:0},{claimKind:"?"}]) expect(()=>assess(p(kv))).toThrow();
});
