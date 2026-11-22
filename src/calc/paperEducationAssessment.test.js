import {assessPaperEducationClass,createPaperEducationAssessor,PAPER_EDUCATION_PUBLISHED_EXAMPLES} from "./paperEducationAssessment";
import {scanPaperChangePoints} from "./paperChangePoints";

const measurement = (income, need) => ({scope:"special-school-elementary-ordinary",measuredMonthlyIncomeYen:income,measuredMonthlyNeedYen:need});
const immutablePoint = Object.freeze({status:"calculated",disposableWan:512.3456,
  breakdown:Object.freeze({salaryWan:800,taxWan:30,socialWan:120}), details:Object.freeze({})});
const calculator = {evaluate:()=>immutablePoint};

test("表示例は1世帯・3所得条件。原典の年間所得と控除を税込給与と取り違えず、船橋の年度を付けない",()=>{
  const data=PAPER_EDUCATION_PUBLISHED_EXAMPLES;
  expect(data.title).toContain("同一世帯");
  expect(data.householdLabel).toContain("さいたま市");
  expect(data.yearLabel).toContain("適用年度の記載なし");
  expect(data.sourceUrl).toBe("https://www.pref.saitama.lg.jp/documents/27010/sibenkubun.pdf");
  expect(data.measuredMonthlyNeedYen).toBe(229089);
  expect(data.rows.map(r=>[r.annualIncomeYen,r.annualDeductionYen,r.measuredMonthlyIncomeYen,r.classification])).toEqual([
    [4000000,900000,258333,"第1区分"],[6000000,1200000,400000,"第2区分"],[9000000,1400000,633333,"第3区分"],
  ]);
  for(const r of data.rows) expect(assessPaperEducationClass(measurement(r.measuredMonthlyIncomeYen,data.measuredMonthlyNeedYen))).toBe(r.classification);
});

// 埼玉県教育委員会「支弁区分について」の同一4人世帯・3例。さいたま市の資料にある
// 需要額を試験の入力に使い、船橋市モデルの需要額としては使わない。
// https://www.pref.saitama.lg.jp/documents/27010/sibenkubun.pdf
test.each([[258333,"第1区分"],[400000,"第2区分"],[633333,"第3区分"]])(
  "公表例の測定月収%s・需要229089円の区分", (income,expected)=>{
    expect(assessPaperEducationClass(measurement(income,229089))).toBe(expected);
  });
test.each([[0,"第1区分"],[299999,"第1区分"],[300000,"第2区分"],[499999,"第2区分"],[500000,"第3区分"]])(
  "需要20万円：月収%s円を丸めず比較", (income,expected)=>{
    expect(assessPaperEducationClass(measurement(income,200000))).toBe(expected);
  });
test("測定額不足・一般の給与・非該当は判定不能で、所得ゼロとは区別",()=>{
  for (const input of [null,measurement(null,200000),measurement("0",200000),measurement(0,0),
    measurement(300000,null),measurement(NaN,100),{...measurement(0,200000),scope:"special-class"},
    {scope:"special-school-elementary-ordinary",headWan:400,spouseWan:400,measuredMonthlyNeedYen:200000}])
    expect(assessPaperEducationClass(input)).toBeNull();
  const noInput=createPaperEducationAssessor();
  expect(noInput.assess(immutablePoint,{headWan:400,spouseWan:400})).toBeNull();
  const source=jest.fn();
  expect(createPaperEducationAssessor(source).assess({status:"excluded"},{headWan:0,spouseWan:0})).toBeNull();
  expect(source).not.toHaveBeenCalled();
});
test("給与点別資料を照合して区分変化だけを抽出し、欠測をまたがない。元の家計収支は変更しない",()=>{
  const table=new Map([[399,measurement(299999,200000)],[400,measurement(300000,200000)],[402,measurement(500000,200000)]]);
  const read=jest.fn((_,{headWan,spouseWan})=>spouseWan===300 ? table.get(headWan) : null);
  const r=scanPaperChangePoints(calculator,"head",300,{minWan:399,maxWan:402,assessors:[createPaperEducationAssessor(read)]});
  expect(r.events).toHaveLength(1);
  expect(r.events[0]).toMatchObject({system:"N04",fromWan:399,atWan:400,before:"第1区分",after:"第2区分"});
  expect(r.unknownRanges).toEqual([{system:"N04",subject:"household",fromWan:401,toWan:401}]);
  expect(read).toHaveBeenCalledTimes(4);
  expect(read).toHaveBeenCalledWith(immutablePoint,{headWan:402,spouseWan:300});
  expect(immutablePoint.disposableWan).toBe(512.3456);
});
