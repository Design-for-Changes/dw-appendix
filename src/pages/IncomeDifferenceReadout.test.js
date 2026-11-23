import {render,screen,within} from "@testing-library/react";
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
  const surface={width:3,validCount:8,negativeCount:3,
    minimum:{differenceYen:-1,headWan:2,spouseWan:1,count:3}, maximum:{differenceYen:2,headWan:1,spouseWan:2,count:1}};
  const grid={width:3,netYen:Int32Array.from([0,1,2,3,4,40001,6,80002,8]),differenceYen:Int32Array.from([0,0,0,0,0,-1,0,2,0])};
  render(<DifferenceExtrema surface={surface} grid={grid}/>);
  expect(screen.getByText(/全8給与点のうち3点/)).toBeInTheDocument();
  const table=screen.getByRole("table",{name:"給与点別の年間収入・可処分所得"});
  const low=within(table).getByRole("row",{name:/最小点/}), high=within(table).getByRole("row",{name:/最大点/});
  expect(within(low).getByRole("rowheader")).toHaveTextContent(/同額\s*3点の一例/);
  expect(within(low).getAllByRole("cell").map(c=>c.textContent)).toEqual(["2万円","1万円","3万円","0円","40,001円","40,002円","−1円"]);
  expect(within(high).getAllByRole("cell").map(c=>c.textContent)).toEqual(["1万円","2万円","3万円","0円","80,002円","80,000円","＋2円"]);
  expect(screen.queryByRole("button")).toBeNull();
  expect(screen.queryByText(/全設定|点P/)).toBeNull();
});

test.each([false,true])("給与収入と給与所得を区別し、同じ年収で比較した2世帯の可処分所得と差を表示（給与入替=%p）",swapped=>{
  // 8歳1人・特児1級・児福該当・税特別・通所37,200円。ここでは検算済みの2座標のみを表示に渡す。
  const coords=(a,b)=>swapped?[b,a]:[a,b];
  const [highX,highY]=coords(600,400),[lowX,lowY]=coords(0,1500),width=1501;
  const surface={width,validCount:2,negativeCount:1,
    minimum:{headWan:lowX,spouseWan:lowY,differenceYen:-140700,count:1},
    maximum:{headWan:highX,spouseWan:highY,differenceYen:974520,count:1}};
  const grid={width,netYen:new Int32Array(width*width),differenceYen:new Int32Array(width*width)};
  const highIndex=highY*width+highX, lowIndex=lowY*width+lowX;
  grid.netYen[highIndex]=8798764;grid.differenceYen[highIndex]=974520;
  grid.netYen[lowIndex]=10158004;grid.differenceYen[lowIndex]=-140700;
  render(<DifferenceExtrema surface={surface} grid={grid}/>);
  const table=screen.getByRole("table",{name:"給与点別の年間収入・可処分所得"});
  const cells=label=>within(within(table).getByRole("row",{name:label})).getAllByRole("cell").map(c=>c.textContent);
  expect(cells(/最大点/)).toEqual([highX+"万円",highY+"万円","1,000万円","7,120,000円","8,798,764円","7,824,244円","＋974,520円"]);
  expect(cells(/最小点/)).toEqual([swapped?"1,500万円":"0万円",swapped?"0万円":"1,500万円","1,500万円","12,900,000円","10,158,004円","10,298,704円","−140,700円"]);
});

test("未算定の整数円を0円や負の所得とせず、実額の単点計算がある場合だけ表示できる",()=>{
  const p={headWan:1,spouseWan:0},s={width:2,validCount:0,minimum:null,maximum:null};
  const missing=-2147483648;
  const grid={width:2,netYen:new Int32Array(4).fill(missing),differenceYen:new Int32Array(4).fill(missing)};
  const {rerender}=render(<DifferenceExtrema surface={s} shown={p} grid={grid}/>);
  const numbers=()=>within(screen.getByRole("row",{name:/図上の点/})).getAllByRole("cell").map(c=>c.textContent).slice(-3);
  expect(numbers()).toEqual(["—","—","—"]);
  const lookupPair=jest.fn(()=>({withYen:112345,withoutYen:100000,differenceYen:12345}));
  rerender(<DifferenceExtrema surface={s} shown={p} lookupPair={lookupPair}/>);
  expect(lookupPair).toHaveBeenCalledWith(1,0);
  expect(numbers()).toEqual(["112,345円","100,000円","＋12,345円"]);
});

test.each([
  [1,746,195,1079220,900120,179100],
  [2,826,203,2177140,1800240,376900],
  [3,906,203,3267160,2700360,566800],
])("子ども%i人の検算データの最大差を両方の給与配分で復算する",(n,high,low,differenceYen,extraBenefitsYen,taxSavingYen)=>{
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
