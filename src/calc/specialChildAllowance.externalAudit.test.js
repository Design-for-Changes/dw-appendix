import {calculateSpecialChildAllowance} from "./specialChildAllowance.js";
import {createRevisionCalculator} from "./revisionEngine.js";

// 独立正解：実装定数・税計算関数は参照しない。月額は令和8年4月分以降。
// 法3条2項、6・7条（いずれも限度額以上で停止、前年所得で8月～翌7月を判定）：
// https://www.mhlw.go.jp/web/t_doc?dataId=82090000
// 令2条、5条、5条の2：https://www.mhlw.go.jp/web/t_doc?dataId=82091000&dataType=0
// 船橋市の月額・所得額表：https://www.city.funabashi.lg.jp/kenkou/shougaisha/004/03/p042515.html
// 大阪府の4人欄、16～18歳加算、法定控除：https://www.pref.osaka.lg.jp/o090135/kateishien/teate/tokubetsujihu.html
// 給与660万円以上の給与所得速算表：https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1410.htm
const subject=(id,assessmentIncomeYen=0,dependentCount=0)=>({id,assessmentIncomeYen,dependentCount});
const rows=[
  // 扶養人数、請求者の限度額、配偶者・扶養義務者の限度額（円）。
  [0,4596000,6287000],[1,4976000,6536000],[2,5356000,6749000],[3,5736000,6962000],[4,6116000,7175000],
];
test.each(rows)("原典の扶養%s人欄：本人・配偶者・その他の扶養義務者を単独で境界の両側／同額に置く",(n,ownLimit,familyLimit)=>{
  for(const role of ["claimant","spouse","obligor"])for(const delta of [-1,0,1]){
    const limit=role==="claimant"?ownLimit:familyLimit;
    const parties=Object.fromEntries(["claimant","spouse","obligor"].map(id=>
      [id,subject(id,id===role?limit+delta:0,n)]));
    const p=calculateSpecialChildAllowance({grades:["1","2"],claimant:parties.claimant,
      spouse:parties.spouse,otherObligors:[parties.obligor]});
    expect(p.checks.find(c=>c.id===role)).toMatchObject({limitYen:limit,assessmentIncomeYen:limit+delta,stopped:delta>=0});
    expect(p.stoppedBy.map(c=>c.id)).toEqual(delta>=0?[role]:[]);
    expect(p.monthlyBeforeIncomeYen).toBe(97380);
    expect([p.monthlyYen,p.annualYen]).toEqual(delta>=0?[0,0]:[97380,1168560]);
  }
});

test.each([
  [["1"],58450,701400],[["2"],38930,467160],[["1","2","2"],136310,1635720],[["not"],0,0],
])("令和8年4月以降の児童別等級 %j：前提上12か月同額として年換算",(grades,monthly,annual)=>{
  const result=calculateSpecialChildAllowance({grades,claimant:subject("A"),spouse:subject("B")});
  expect(result.basis.amountBasis).toBe("2026-04");
  expect([result.monthlyYen,result.annualYen]).toEqual([monthly,annual]);
});

const kid=(age,tccaGrade,taxStatus)=>({age,tccaGrade,taxStatus,welfareEligible:false,serviceUser:false});
const scenario=children=>createRevisionCalculator({protocol:"paper-2029",children,serviceAmountYen:0});

test.each(["head","spouse"])("3児・%s給与を増やす：給与1万円格子で本人限度にちょうど達する例",higher=>{
  // 高給与側が子3人全員を税扶養。15歳以下、特別障害者1人。もう一人の親は給与700万円。
  // 本人の判定所得＝給与×90%−110万円−給与10万円−定額8万円−特別障害40万円。
  const c=scenario([kid(8,"1","special"),kid(10,"2","none"),kid(12,"not","none")]);
  for(const [salary,expectedIncome,annual] of [[823,5727000,1168560],[824,5736000,0],[825,5745000,0]]){
    const p=higher==="head"?c.evaluate(salary,700):c.evaluate(700,salary);
    expect(p.details.roles.taxDependentOf).toEqual(Array(3).fill(higher));
    const b=p.details.benefits.specialChildAllowance;
    expect(b.checks.find(v=>v.role==="claimant")).toMatchObject({id:higher,assessmentIncomeYen:expectedIncome,limitYen:5736000});
    expect(b.checks.find(v=>v.role==="spouse")).toMatchObject({assessmentIncomeYen:5020000,limitYen:6287000});
    expect([p.details.benefits.tcca,b.annualYen]).toEqual([annual,annual]);
  }
});

test.each(["head","spouse"])("3児・高給与側が%s：請求者は限度未満でも低給与の配偶者だけで支給停止",higher=>{
  const c=scenario([kid(8,"1","special"),kid(12,"2","special"),kid(16,"1","special")]);
  // 請求者900万円：900万−195万−18万−3×40万＝567万、3人欄＋16歳加算＝598.6万円。
  // 他方には子の税扶養なし。840／841万円×90%−110万−18万＝628／628.9万円。
  // 628.7万円は1万円給与格子の間にあり、ここで擬似的な「一致点」を作らない。
  for(const [salary,expectedIncome,annual] of [[840,6280000,1869960],[841,6289000,0]]){
    const other=higher==="head"?"spouse":"head";
    const p=higher==="head"?c.evaluate(900,salary):c.evaluate(salary,900);
    const b=p.details.benefits.specialChildAllowance;
    expect(b.checks.find(v=>v.role==="claimant")).toMatchObject({id:higher,assessmentIncomeYen:5670000,limitYen:5986000});
    expect(b.checks.find(v=>v.role==="spouse")).toMatchObject({id:other,assessmentIncomeYen:expectedIncome,limitYen:6287000});
    expect(b.stoppedBy.map(v=>v.id)).toEqual(annual?[]:[other]);
    expect(p.details.benefits.tcca).toBe(annual);
  }
});

test("給与の大小が逆転したときは旧手動指定を引き継がず、同額では世帯主。本人・配偶者の表は交換しない",()=>{
  const c=createRevisionCalculator({protocol:"paper-2029",serviceAmountYen:0,roles:{allowanceRecipient:"spouse"},
    children:[kid(8,"2","special"),kid(10,"not","none"),kid(12,"not","none")].map(k=>({...k,taxDependentOf:"spouse"}))});
  for(const [x,y,higher,annual] of [[822,823,"spouse",467160],[823,823,"head",467160],[823,822,"head",467160],
    [823,824,"spouse",0],[824,824,"head",0],[824,823,"head",0]]){
    const d=c.evaluate(x,y).details,b=d.benefits.specialChildAllowance;
    expect(d.roles.allowanceRecipient).toBe(higher);
    expect(b.checks.find(v=>v.role==="claimant")).toMatchObject({id:higher,limitYen:5736000,dependentCount:3});
    expect(b.checks.find(v=>v.role==="spouse")).toMatchObject({id:higher==="head"?"spouse":"head",limitYen:6287000,dependentCount:0});
    expect(b.annualYen).toBe(annual);
  }
});
