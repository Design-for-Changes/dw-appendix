import { calculateDisabledChildWelfareAllowance as assess, calculateWelfareSalaryAssessment as salary } from "./disabledChildWelfareAllowance";

// 船橋市の本人・扶養義務者「所得額」の列。万円換算の「収入額」は閾値にしない。
// https://www.city.funabashi.lg.jp/kenkou/shougaisha/004/03/p042516.html
const person = (incomeYen, dependentCount = 0) => ({incomeYen, dependentCount});
const child = (incomeYen, params={}) => assess({eligible:true, recipient:person(incomeYen), maintainers:[], ...params});
test.each([[0, 3758000, 6287000], [1, 4138000, 6536000], [2, 4518000, 6749000], [3, 4898000, 6962000]])(
  "扶養親族等%i人：本人は等号で支給、法21条の判定対象は等号で停止", (n, self, other) => {
    for (const delta of [-1, 0, 1]) {
      const own = child(0, {recipient:person(self + delta,n)});
      expect(own.monthlyYen).toBe(delta <= 0 ? 16560 : 0);
      expect(own.checks[0]).toMatchObject({role:"recipient",limitYen:self,stopComparison:">"});
      const maintainer = child(0, {maintainers:[{...person(other + delta,n), id:"head"}]});
      const spouse = child(0, {spouse:person(other + delta,n)});
      expect(maintainer.monthlyYen).toBe(delta < 0 ? 16560 : 0);
      expect(spouse.monthlyYen).toBe(delta < 0 ? 16560 : 0);
      expect(maintainer.checks[1]).toMatchObject({role:"maintainer",limitYen:other,stopComparison:">="});
    }
  });

test("児童所得0・無配偶の研究条件と、所得外要件不該当は区別する", () => {
  const point = {maintainers:[{...person(6000000,2),id:"mother"}]};
  expect(child(0,point)).toMatchObject({payable:true,incomeEligible:true,annualYen:198720,reasons:[],
    checks:[{id:"recipient",incomeYen:0,limitYen:3758000},{id:"mother",limitYen:6749000}]});
  expect(child(0,{...point,eligible:false})).toMatchObject({incomeEligible:true,payable:false,annualYen:0,
    reasons:["non-income-ineligible"]});
});

test("家族の判定は各人個別。本人・本人の配偶者・生計維持者のうち、停止理由を取り違えない", () => {
  const family = {spouse:{...person(4000000),id:"child-spouse"},maintainers:[{...person(4000000),id:"head"}]};
  expect(child(1, family).annualYen).toBe(198720); // 400万＋400万として合算しない。
  const multiple = child(3758001, {...family,maintainers:[{...person(6287000),id:"head"}]});
  expect(multiple).toMatchObject({payable:false,reasons:["recipient:recipient","maintainer:head"]});
  expect(child(0,{spouse:person(6287000)}).reasons).toEqual(["spouse:spouse"]);
  expect(() => child(0,{maintainers:[{...person(0),id:"x"},{...person(0),id:"x"}]})).toThrow();
  expect(() => child(undefined)).toThrow(); // 不明所得は無所得にしない。
});

test("限度額の法定加算：本人には特定・老人・高齢配偶者、扶養義務者は老人扶養のみ", () => {
  const r=child(0, {recipient:{...person(0,3),elderlyDependentCount:1, elderlySpouseCount:1,specifiedDependentCount:1},
    maintainers:[{...person(0,2),id:"a",elderlyDependentCount:2}, {...person(0,2),id:"b",elderlySpouseCount:1,specifiedDependentCount:1}]});
  expect(r.checks.map(c=>c.limitYen)).toEqual([5348000,6809000,6749000]);
  expect(() => child(0,{recipient:{...person(0,0),specifiedDependentCount:1}})).toThrow();
});

test("施行令8条：児童本人に定額8万や自己の障害者控除は使わず、父母には実額社保を使わない", () => {
  const wages = {salaryIncomeYen:1800000, socialInsuranceDeductionYen:325000,ownTaxDisability:"special",
    ordinaryDisabledDependents:1,otherAllowedDeductionsYen:1000};
  expect(salary({...wages,role:"recipient"})).toMatchObject({incomeYen:1104000,insuranceDeductionYen:325000,
    disabilityDeductionYen:270000});
  for (const role of ["spouse","maintainer"]) expect(salary({...wages,role})).toMatchObject({
    incomeYen:949000, insuranceDeductionYen:80000, disabilityDeductionYen:670000});
  expect(salary({role:"recipient",salaryIncomeYen:0})).toMatchObject({incomeYen:0,salaryDeductionYen:0,insuranceDeductionYen:0});
  expect(salary({role:"maintainer",salaryIncomeYen:100000,specialDisabledDependents:1})).toMatchObject({
    incomeYen:0,disabilityDeductionYen:400000});
  expect(() => salary({...wages,role:"recipient",otherAllowedDeductionsYen:-1})).toThrow();
});
