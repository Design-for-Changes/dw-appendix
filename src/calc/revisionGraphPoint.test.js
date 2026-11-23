import {createRevisionCalculator} from "./revisionEngine.js";

const child=(age,taxStatus="none",tccaGrade="not",welfareEligible=false,serviceUser=false,serviceAmountYen=0)=>
  ({age,taxStatus,tccaGrade,welfareEligible,serviceUser,serviceAmountYen});
const disabled=child(16,"special","1",true,true,3100);
const households=[
  {children:[disabled],roles:{spouseDeductionClaimant:"highest-salary"}},
  {children:[child(4,"ordinary","2",false,true,27000),disabled,child(1)],roles:{spouseDeductionClaimant:"spouse"},otherServiceMonthlyYen:2700},
  {children:[child(7,"none","2",true,true,37200),child(17,"special","1",false)],roles:{spouseDeductionClaimant:"head"}},
  {children:[child(10),child(2),child(16)],roles:{spouseDeductionClaimant:"none"}},
];

/** グラフが詳算点から読む値だけを射影する。個人税と保険、利用上限と実負担も別々に照合する。 */
function graphFields(point) {
  if (point.status!=="calculated") return [point.status,point.studyDisposableWan,...point.reasons];
  const {headTax,spouseTax,coverage,roles,benefits,service}=point.details;
  return [point.status,point.studyDisposableWan,headTax.totalTaxYen,spouseTax.totalTaxYen,
    coverage.head.social,coverage.spouse.social,roles.allowanceRecipient,benefits.tcca,benefits.welfare,
    benefits.childAllowance,service.annual,service.monthly,service.dayMonthlyBeforeCapYen,service.otherServiceMonthlyYen,
    service.householdCapYen,service.assessmentLevyYen,service.hasCapApplicableServiceUse];
}

test.each(households)("格子専用の結果が詳細算定と円単位で一致する：%j",inputs=>{
  const {evaluate,evaluateGraphPoint}=createRevisionCalculator({protocol:"paper-2029",serviceAmountYen:0,...inputs});
  // 配偶者控除の各行、非課税・保険・手当の境界、二軸の同額/逆転、端点を同じキャッシュの中で行き来する。
  const cuts=[0,1,60,61,62,110,120,123,126,127,130,131,135,136,137,158,159,160,161,164,165,
    168,169,170,174,175,179,180,184,185,189,190,194,195,199,200,204,205,207,208,
    650,794,824,850,1109,1110,1111,1160,1161,1210,1211,1499,1500];
  const check=(x,y)=>{
    const want=graphFields(evaluate(x,y)),actual=graphFields(evaluateGraphPoint(x,y));
    if (actual.length!==want.length || actual.some((v,i)=>v!==want[i])) {
      throw new Error(`給与 ${x},${y} の格子と詳細が不一致: ${JSON.stringify(actual)} / ${JSON.stringify(want)}`);
    }
  };
  for (const x of cuts) for (const y of cuts) check(x,y);
  for(let w=0;w<=1500;w++) {
    check(w,(w*113)%1501);
    check(916,w);
    check(w,134);
  }
});

test("格子専用計算でも入力検証を維持し、旧版や勤務条件別の保険計算には適用しない",()=>{
  const input={serviceAmountYen:0,children:[disabled]};
  const paper=createRevisionCalculator({...input,protocol:"paper-2029"});
  for(const w of [null,"0",0.5,-1,1501]) {
    expect(()=>paper.evaluateGraphPoint(0,w)).toThrow(RangeError);
    expect(()=>paper.evaluateGraphPoint(w,0)).toThrow(RangeError);
  }
  for(const protocol of ["v3","legacy-v2"]) expect(createRevisionCalculator({...input,protocol}).evaluateGraphPoint).toBeUndefined();
});
