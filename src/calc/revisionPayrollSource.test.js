import { monthlyEmployeePremiums45Yen, annualEmployeePremiums, employeeGradesFromAnnualPay, shortTimeWageTestFromAnnualPay, resolveEmploymentContract } from "./revisionPayroll.js";

// 千葉支部・一般被保険者・45歳・給与天引き（特約なし）。
// 原表の「報酬月額」の行から折半額を読んだ期待値。本人加入の可否、失業等給付は検算しない。
// https://www.kyoukaikenpo.or.jp/assets/12chiba_7.pdf
// https://www.kyoukaikenpo.or.jp/assets/R8_12chiba.pdf
// 健保・支援金を合算して端数処理：https://www.mhlw.go.jp/hourei/doc/tsuchi/T260216S0101.pdf
const points = [
  // 対象年, 月, 報酬月額, 健保標準, 厚年標準, 健保介護支援金合計, 厚年, 本人負担計（円/月）
  [2025, 4, 100000, 98000, 98000, 5576, 8967, 14543],
  [2025, 4, 200000, 200000, 200000, 11380, 18300, 29680],
  [2025, 4, 300000, 300000, 300000, 17070, 27450, 44520],
  [2026, 2, 650000, 650000, 650000, 36985, 59475, 96460],
  [2026, 3, 650000, 650000, 650000, 36887, 59475, 96362],
  // 36,887.5＋747.5＝37,635。各別に50銭を切り捨てると1円少なくなる。
  [2026, 4, 650000, 650000, 650000, 37635, 59475, 97110],
  [2026, 4, 100000, 98000, 98000, 5674, 8967, 14641],
  [2026, 4, 200000, 200000, 200000, 11580, 18300, 29880],
  [2026, 4, 300000, 300000, 300000, 17370, 27450, 44820],
  // 報酬635,000円は厚年の最高等級の下端。665,000円では健保だけが次等級になる。
  [2026, 4, 634999, 620000, 620000, 35898, 56730, 92628],
  [2026, 4, 635000, 650000, 650000, 37635, 59475, 97110],
  [2026, 4, 665000, 680000, 650000, 39372, 59475, 98847],
];
test.each(points)("%i年%i月・報酬月額%i円を料額表と照合", (year, month, remunerationYen, healthStandardYen, pensionStandardYen, combinedHealthYen, pensionYen, totalYen) => {
  const p = monthlyEmployeePremiums45Yen({year,month,remunerationYen,workRegion:"chiba"});
  expect(p).toMatchObject({healthStandardYen,pensionStandardYen,combinedHealthYen,pensionYen,totalYen});
  expect(p.healthCareYen+p.supportYen).toBe(combinedHealthYen);
});
test("既存の固定料率の年換算に渡すのは4月分。暦年実額とは別", () => {
  // 賞与なし月給30万円。雇用保険はこの例の照合対象に含めない。
  expect(annualEmployeePremiums(360,2026,false,"chiba")).toMatchObject({
    healthCareYen:204300,supportYen:4140,pensionYen:329400,totalYen:537840,
  });
});
test("支部・対象月不明を料率ゼロや既定支部として扱わない", () => {
  const base={year:2026,month:4,remunerationYen:300000,workRegion:"chiba"};
  for (const override of [{year:2025,month:2},{month:0},{month:13},{workRegion:undefined},{remunerationYen:null}]) {
    expect(() => monthlyEmployeePremiums45Yen({...base,...override})).toThrow(RangeError);
  }
});

test.each([
  [1283999,6,3,104000,104000], [1284000,7,4,110000,110000],
  [1284001,7,4,110000,110000], [1300000,7,4,110000,110000],
  [3600000,22,19,300000,300000], [7620000,35,32,650000,650000],
  [7980000,36,32,680000,650000],
])("12等分の年収%i円→本人加入時の健保・厚年等級", (annualPayYen,healthGrade,pensionGrade,healthStandardYen,pensionStandardYen) => {
  const expected={healthGrade,pensionGrade,healthStandardYen,pensionStandardYen};
  expect(employeeGradesFromAnnualPay(annualPayYen)).toEqual(expected);
  expect(monthlyEmployeePremiums45Yen({annualPayYen,year:2026,month:11,workRegion:"chiba"})).toMatchObject(expected);
});
test("年収を月に換算する賃金要件と、所定労働時間などの要件は別に判定", () => {
  // 日本年金機構「2026年10月に社会保険の短時間労働者に係る賃金要件が撤廃されました」。
  for (const [annualPay, result] of [[1055999,"not-met"],[1056000,"met"],[1056001,"met"]]) {
    expect(shortTimeWageTestFromAnnualPay(annualPay,2026,9)).toEqual({requirement:result, monthlyThresholdYen:88000, annualThresholdYen:1056000});
    expect(shortTimeWageTestFromAnnualPay(annualPay,2026,10)).toEqual({requirement:"abolished", monthlyThresholdYen:null, annualThresholdYen:null});
  }
  const conditions={workRegion:"chiba"};
  expect(resolveEmploymentContract(conditions,130,2026).mode).toBe("unknown");
  expect(resolveEmploymentContract({...conditions,workPattern:"short-covered"},130,2026).mode).toBe("employee");
  expect(resolveEmploymentContract({...conditions,workPattern:"under20"},130,2026).mode).toBe("outside");
});
test("年収0を就労中の最低等級に割り当てない。年収と報酬月額の二重指定も受け付けない", () => {
  expect(() => employeeGradesFromAnnualPay(0)).toThrow(RangeError);
  expect(() => monthlyEmployeePremiums45Yen({annualPayYen:1300000,remunerationYen:110000,year:2026,month:11,workRegion:"chiba"})).toThrow(RangeError);
});
