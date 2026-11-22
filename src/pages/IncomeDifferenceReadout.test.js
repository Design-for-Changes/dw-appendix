import {render,screen} from "@testing-library/react";
import {createDisabilityIncomeComparison} from "../calc/disabilityIncomeDifference";
import auditRanges from "../data/disabilityDifferenceRange.json";
import {DifferenceExtrema} from "./IncomeDifferenceReadout";

test("手当・税額に差がなくても利用料は残り、可処分所得差はその負担分だけマイナスになる",()=>{
  const p=createDisabilityIncomeComparison({children:[{age:10,tccaGrade:"not",welfareEligible:false,
    taxStatus:"none",serviceUser:true,serviceAmountYen:37200}],serviceAmountYen:0}).evaluate(0,1500);
  expect(p.differenceYen).toBe(-446400);
  expect(p.extraServiceYen).toBe(446400);
  expect(p.extraBenefitsYen+p.taxSavingYen).toBe(0);
});

test("選択した世帯の極値だけを表示し、同率の場合は一例の座標として示す",()=>{
  const surface={validCount:8,negativeCount:3,
    minimum:{differenceYen:-1,headWan:2,spouseWan:1,count:3}, maximum:{differenceYen:2,headWan:1,spouseWan:2,count:1}};
  render(<DifferenceExtrema surface={surface}/>);
  expect(screen.getByText(/全8給与点のうち3点/)).toBeInTheDocument();
  expect(screen.getByText(/同額 3点の一例/)).toBeInTheDocument();
  expect(screen.getByText(/世帯主 2万円・配偶者 1万円/)).toBeVisible();
  expect(screen.getByText("−1円／年")).toBeVisible();
  expect(screen.queryByRole("button")).toBeNull();
  expect(screen.queryByText(/全設定|点P/)).toBeNull();
});

test.each([
  [1,746,195,1079220,900120,179100],
  [2,826,203,2177140,1800240,376900],
  [3,906,203,3267160,2700360,566800],
])("子ども%i人の検算データの最高差を両方の給与配分で復算する",(n,high,low,differenceYen,extraBenefitsYen,taxSavingYen)=>{
  const calc=createDisabilityIncomeComparison({serviceAmountYen:0,
    children:[7,10,12].slice(0,n).map(age=>({age,tccaGrade:"1",welfareEligible:true,taxStatus:"special",
      serviceUser:false,serviceAmountYen:0}))});
  for(const [a,b,higher] of [[high,low,"head"],[low,high,"spouse"]]){
    const {observedPoint,comparisonPoint}=calc.evaluatePair(a,b);
    expect(observedPoint.details.roles).toMatchObject({allowanceRecipient:higher,welfareMaintainer:"both",spouseDeductionClaimant:higher});
    expect(comparisonPoint).toMatchObject({differenceYen,extraBenefitsYen,taxSavingYen,extraServiceYen:0,insuranceSavingYen:0});
    expect(comparisonPoint.withYen-comparisonPoint.withoutYen).toBe(differenceYen);
  }
  expect(auditRanges.find(r=>r.children===n).maximumYen).toBe(differenceYen);
});
