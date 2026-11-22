import { createRevisionCalculator, classifyRevisionFalls } from "./revisionEngine";
import { paperComparisonInputs } from "./paperComparison";
import { getResidentTaxParts } from "./taxes";

// 本稿の計算経路だけを検証する。期待値を税・手当モジュールで再計算しない。
// 船橋市の特児表および千葉県の手当表（令和8年度の手当額を固定する比較）:
// https://www.city.funabashi.lg.jp/kenkou/shougaisha/004/03/p042515.html
// https://www.pref.chiba.lg.jp/shoufuku/service/teate.html
// 合算後の通所負担上限: https://www.cfa.go.jp/policies/shougaijishien/shisaku/futan
const qualifying = {age:10, tccaGrade:"1", welfareEligible:true, taxStatus:"special", serviceUser:true};
const sibling = {age:8, tccaGrade:"not", welfareEligible:false, taxStatus:"none", serviceUser:false};
const family = {children:[qualifying,sibling]};
const calc = (extra={}) => createRevisionCalculator({...paperComparisonInputs(family,3100),...extra});
const annualYen = (wan) => Math.round(wan*10000);

describe("所得割の非課税限度直上の減額（地方税法附則3条の3第2・5項）",()=>{
  // 給与のみ。限度1,470,000円、課税標準362,000円、人的控除差100,000円。
  // 減額前の市・県合計は36,200−5,000＝31,200円。必ず按分後に市県別に丸める。
  test.each([[0,0,0],[1,0,0],[166,0,0],[167,100,0],[249,100,0],[250,100,100],
    [4000,2400,1600],[31199,18700,12400],[31200,18700,12400],[50000,18700,12400]])(
    "限度額 ＋ %i円の市所得割%i円・県所得割%i円", (excess,city,pref)=>{
      const got=getResidentTaxParts(36.2,{totalIncomeWan:(1470000+excess)/10000,dependentCount:2,
        personalDeductionDifferenceWan:10,applySalaryOnlyExemptionAdjustment:true});
      expect([got.municipalIncomeLevyYen,got.prefecturalIncomeLevyYen]).toEqual([city,pref]);
      expect(got.perCapitaYen+got.forestEnvironmentTaxYen).toBe(5000);
    });
  test("A給与222万・配偶者0・税障害区分なしの10歳児：所得割31,100でなく4,000円",()=>{
    const point=calc({children:[{...sibling,age:10}]}).evaluate(222,0);
    expect(point.details.headTax).toMatchObject({currentIncomeYen:1474000,residentTaxYen:9000,
      residentTax:{municipalIncomeLevyYen:2400,prefecturalIncomeLevyYen:1600,
        incomeLevyThresholdReductionYen:27200,exemption:{incomeLevyExemptionThresholdYen:1470000}}});
  });
  test("世帯主131→132万：高給与の配偶者が2児を税扶養しており、旧固定扶養の税による逆転はない",()=>{
    const c=calc({children:[{...qualifying,tccaGrade:"2",welfareEligible:false},sibling],serviceAmountYen:37200});
    const a=c.evaluate(131,182),b=c.evaluate(132,182);
    expect([a,b].map(p=>p.details.spouseTax.residentTax.incomeLevyYen)).toEqual([0,0]);
    // 扶養2児で配偶者の所得割は両点とも0。給与+10,000円、保険料+48円、世帯の税は同じ5,000円。
    expect([a,b].map(p=>annualYen(p.studyDisposableWan))).toEqual([3295184,3305136]);
    expect(annualYen(b.studyDisposableWan)-annualYen(a.studyDisposableWan)).toBe(9952);
    expect(classifyRevisionFalls([a,b]).allFalls).toEqual([]);
  });
});

test("図表の既定値はpaper-2029。原点を0円の世帯収支として比較しない", () => {
  const c = calc(), origin = c.evaluate(0,0);
  expect(origin).toMatchObject({protocol:"paper-2029",status:"excluded",breakdown:null,disposableWan:null,studyDisposableWan:null,
    details:{insurance:{head:null,spouse:null,totalYen:null}}});
  for (const [h,s,worker,dependent] of [[1,0,"head","spouse"],[0,1,"spouse","head"]]) {
    const p = c.evaluate(h,s);
    expect(p.status).toBe("calculated");
    expect(p.details.insurance[worker]).toMatchObject({status:"employee",healthStandardYen:58000,pensionStandardYen:88000});
    expect(p.details.insurance[dependent]).toMatchObject({status:"dependent",healthStandardYen:null,annual:{totalYen:0}});
    expect(classifyRevisionFalls([origin,p]).values[0]).toBeNull();
  }
});

test("給与400万ずつ・子2人の独立検算。教育・医療は0円行を置かず、収支の算式に含めない", () => {
  const p = calc().evaluate(400,400);
  // 両親とも給与所得276万円、標準報酬34万円。月額19686+31110+1667円、年629556円/人。
  for (const k of ["head","spouse"]) {
    expect(p.details.insurance[k]).toMatchObject({healthStandardYen:340000,pensionStandardYen:340000,
      monthly:{healthCareSupportYen:19686,pensionYen:31110,employmentYen:1667},annual:{totalYen:629556}});
  }
  // 所得税の課税所得: 世帯主76万円・配偶者151万円（同居特障75万円は世帯主のみ）。
  // 住民税課税所得117万/170万円、人的控除差27万/5万円、均等割と森林環境税込み。
  expect(p.details.headTax).toMatchObject({incomeTaxYen:38700,residentTaxYen:108500,forestTaxYen:1000});
  expect(p.details.spouseTax).toMatchObject({incomeTaxYen:77000,residentTaxYen:172500,forestTaxYen:1000});
  // 2制度の対象は同じ子だが、特児1級58450円/月と児福16560円/月は別の支給。
  expect(p.breakdown).toEqual({salaryWan:800,taxWan:39.67,socialWan:125.9112,tccaWan:70.14,welfareWan:19.872,
    childAllowanceWan:24,serviceWan:3.72});
  const expectedYen = 8000000 - 147200 - 249500 - 629556*2 + (58450 + 16560 + 10000*2 - 3100)*12;
  expect(expectedYen).toBe(7447108);
  expect(annualYen(p.studyDisposableWan)).toBe(expectedYen);
  expect(annualYen(p.disposableWan)).toBe(expectedYen);
});

test("世帯主給与を上げたとき、特児の本人限度と児福の扶養義務者限度が別々に効く", () => {
  const c = calc();
  // 受給者扶養2人: 特児535.6万円、児福の支給可否を決める生計維持者は674.9万円。
  for (const [h,assessment,tcca,welfare] of [[781,5349000,true,true],[782,5358000,false,true],
    [927,6740000,false,true],[928,6750000,false,false]]) {
    const b = c.evaluate(h,400).details.benefits;
    expect(b.specialChildAllowance.checks[0]).toMatchObject({id:"head",assessmentIncomeYen:assessment,limitYen:5356000,stopped:!tcca});
    expect(b.welfareChildren[0].checks).toMatchObject([
      {role:"recipient",id:"child1",incomeYen:0,limitYen:3758000,stopComparison:">",passes:true},
      {role:"maintainer",id:"head",incomeYen:assessment,limitYen:6749000,stopComparison:">=",passes:welfare},
    ]);
    expect([b.tcca,b.welfare]).toEqual([tcca?701400:0, welfare?198720:0]);
  }
});

test("2児の扶養と特児本人を配偶者側に入れ替えると、同じ給与で同じ手当の停止境界になる", () => {
  const c = calc();
  for (const [s,income,stops,welfareStops] of [[781,5349000,false,false],[782,5358000,true,false],
    [927,6740000,true,false],[928,6750000,true,true]]) {
    const p = c.evaluate(400,s), b=p.details.benefits;
    expect(p.recipient).toBe("spouse");
    expect(b.specialChildAllowance.checks[0]).toMatchObject({id:"spouse",role:"claimant",assessmentIncomeYen:income,
      limitYen:5356000,stopped:stops});
    expect(b.specialChildAllowance.checks[1]).toMatchObject({id:"head",role:"spouse",limitYen:6287000,stopped:false});
    expect(b.specialChildAllowance.stoppedBy.map(({id})=>id)).toEqual(stops ? ["spouse"] : []);
    expect(b.welfareChildren[0].checks[1]).toMatchObject({id:"spouse",role:"maintainer",incomeYen:income,limitYen:6749000,passes:!welfareStops});
    expect(b.welfareChildren[0].reasons).toEqual(welfareStops ? ["maintainer:spouse"] : []);
  }
});

test.each(["head","spouse","highest-salary"])("旧受給者設定 %s にかかわらず高給与の親が特児と全児童の税扶養を担う。同額は世帯主",stale=>{
  const c=calc({roles:{allowanceRecipient:stale,spouseDeductionClaimant:"spouse",welfareMaintainer:"head"},
    children:[{...qualifying,age:16,taxDependentOf:"spouse",maintainedBy:"head"},sibling]});
  for(const [h,s,id,other] of [[601,600,"head","spouse"],[600,600,"head","spouse"],[599,600,"spouse","head"]]){
    const p=c.evaluate(h,s);
    expect(p.details.roles).toMatchObject({allowanceRecipient:id,allowanceRecipientAssumption:"highest-salary",
      spouseDeductionClaimant:"spouse",taxDependentOf:[id,id],welfareMaintainer:"head",additionalMaintainedChildren:0});
    expect(p.details[id+"Tax"]).toMatchObject({taxDependentCount:2,olderDependentCount:1,disabilityDeductionITYen:750000});
    expect(p.details[other+"Tax"]).toMatchObject({taxDependentCount:0,olderDependentCount:0,disabilityDeductionITYen:0});
    expect(p.details.benefits.specialChildAllowance.checks.slice(0,2)).toMatchObject([
      {id,role:"claimant",limitYen:5606000},{id:other,role:"spouse",limitYen:6287000}]);
    expect(p.details.benefits.additionalSupportedCount).toBe(0);
  }
});

test("論文用では旧設定から扶養先・税扶養外加算を復元しない",()=>{
  const clean=calc({children:[qualifying]});
  for(const obsolete of [{taxDependentOf:"head",maintainedByRecipient:true},{taxDependentOf:"spouse",maintainedBy:"head"}]){
    const stale=calc({children:[{...qualifying,...obsolete}]});
    for(const [h,s] of [[601,600],[600,600],[600,601]]) expect(stale.evaluate(h,s)).toEqual(clean.evaluate(h,s));
  }
});

test("132/841・600/1012の従前例で配偶者を受給資格者・全児童の扶養先として再判定",()=>{
  const low=calc({children:[{...qualifying,age:8,taxDependentOf:"head"}],serviceAmountYen:37200}).evaluate(132,841);
  expect(low.details.benefits.specialChildAllowance.checks[0]).toMatchObject({id:"spouse",role:"claimant",limitYen:4976000,assessmentIncomeYen:5889000,stopped:true});
  const high=calc({children:[7,12,16].map(age=>({...qualifying,age,serviceUser:false,taxDependentOf:"spouse"}))}).evaluate(600,1012);
  expect(high.details.benefits.specialChildAllowance.checks[0]).toMatchObject({id:"spouse",role:"claimant",limitYen:5986000,assessmentIncomeYen:6790000,stopped:true});
  expect(high.details.benefits).toMatchObject({tcca:0,welfare:596160});
});

test.each([[1,0,0],[400,400,4600],[1000,1000,37200]])(
  "給与%s/%s万円・利用児2人の月額は合算後に世帯上限%s円を一度だけ適用する",
  (h,s,cap) => {
    const inputs = {children:[qualifying,{...qualifying,age:8}], otherServiceMonthlyYen:1300};
    const without = calc({...inputs,serviceAmountYen:0,otherServiceMonthlyYen:0}).evaluate(h,s);
    for (const perChild of [0,1000,3100,37200]) {
      const p=calc({...inputs,serviceAmountYen:perChild}).evaluate(h,s);
      const annual = 12*Math.min(2*perChild + 1300, cap);
      expect(p.details.service).toMatchObject({dayMonthlyBeforeCapYen:2*perChild,otherServiceMonthlyYen:1300,householdCapYen:cap,annual});
      expect(annualYen(p.breakdown.serviceWan)).toBe(annual);
      expect(annualYen(without.disposableWan)-annualYen(p.disposableWan)).toBe(annual);
    }
  });
