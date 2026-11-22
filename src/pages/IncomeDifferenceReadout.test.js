import {fireEvent,render,screen} from "@testing-library/react";
import {createDisabilityIncomeComparison} from "../calc/disabilityIncomeDifference";
import {DifferenceAllCases,DifferenceExtrema,IncomeDifferencePoint} from "./IncomeDifferenceReadout";

test("手当・税額に差がなくても利用料は残り、表示は可処分所得のマイナスになる",()=>{
  const p=createDisabilityIncomeComparison({children:[{age:10,tccaGrade:"not",welfareEligible:false,
    taxStatus:"none",serviceUser:true,serviceAmountYen:37200}],serviceAmountYen:0,
    roles:{welfareMaintainer:"highest-salary",spouseDeductionClaimant:"head"}}).evaluate(0,1500);
  expect(p.differenceYen).toBe(-446400);
  render(<IncomeDifferencePoint point={p}/>);
  expect(screen.getAllByText("−446,400円")).toHaveLength(2);
  expect(screen.getByText("差額の内訳")).toBeInTheDocument();
});

test("同率の極値は一例の座標として表示し、点Pへは夫婦別の給与を渡す",()=>{
  const f=jest.fn(),surface={validCount:8,negativeCount:3,
    minimum:{differenceYen:-1,headWan:2,spouseWan:1,count:3}, maximum:{differenceYen:2,headWan:1,spouseWan:2,count:1}};
  render(<DifferenceExtrema surface={surface} onSelectSalary={f} fixedTotal={null}/>);
  expect(screen.getByText(/全8給与点のうち3点/)).toBeInTheDocument();
  expect(screen.getByText(/同額 3点の一例/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button",{name:"最低点を点Pに表示"}));expect(f).toHaveBeenCalledWith(2,1);
});

test("全設定の最高差の掲載例を、両親とも稼得し生計維持者が高給与の親である条件で復算",()=>{
  const point=createDisabilityIncomeComparison({serviceAmountYen:0,
    roles:{welfareMaintainer:"highest-salary",spouseDeductionClaimant:"none"},
    children:[7,10,12].map(age=>({age,tccaGrade:"1",welfareEligible:true,taxStatus:"special",
      serviceUser:false,serviceAmountYen:0}))}).evaluate(944,100);
  expect(point).toMatchObject({differenceYen:3299060,extraBenefitsYen:2700360,taxSavingYen:598700,extraServiceYen:0,
    withYen:11542504,withoutYen:8243444});
  render(<DifferenceAllCases/>);
  expect(screen.getByText("＋3,299,060円")).toBeInTheDocument();
});
