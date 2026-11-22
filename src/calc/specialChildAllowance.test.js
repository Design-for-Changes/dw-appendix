import {calculateSpecialChildAllowance, salaryOnlySpecialChildIncome} from "./specialChildAllowance.js";
import {createRevisionCalculator} from "./revisionEngine.js";

// 独立期待値：施行令2条の所得限度額、5条の所得算定、5条の2の月額を転記。
// https://www.mhlw.go.jp/web/t_doc?dataId=82091000&dataType=0
// 法6条・7条はいずれも「以上」。世帯所得の足し算とはしない。
const party = (id, assessmentIncomeYen=0, dependentCount=0)=>({id, assessmentIncomeYen, dependentCount});
const base = {grades:["1","2"],claimant:party("head"),spouse:party("spouse")};
const evaluate = options=>calculateSpecialChildAllowance({...base,...options});

test.each([
  [4595999,6286999,[]],[4596000,6286999,["head"]],[4595999,6287000,["spouse"]],
  [4596000,6287000,["head","spouse"]],[4596001,6287001,["head","spouse"]],
])("受給資格者所得%s・配偶者所得%sを各々の限度額と比較", (a,b,ids)=>{
  const result=evaluate({claimant:party("head",a),spouse:party("spouse",b)});
  expect(result.stoppedBy.map(p=>p.id)).toEqual(ids);
  expect(result.monthlyBeforeIncomeYen).toBe(97380);
  expect(result.annualYen).toBe(ids.length ? 0 : 1168560);
  expect(result.status).toBe(ids.length ? "income-stopped" : "payable");
});

test("他の扶養義務者も合計せず、各人の扶養人数に応じた表を適用する",()=>{
  const {checks,stoppedBy}=evaluate({spouse:party("spouse",6535999,1),
    otherObligors:[party("relative1",6749000,2),party("relative2",6961999,3)]});
  expect(checks.map(c=>c.limitYen)).toEqual([4596000,6536000,6749000,6962000]);
  expect(stoppedBy).toEqual([{id:"relative1",role:"obligor",assessmentIncomeYen:6749000,dependentCount:2,limitYen:6749000,stopped:true}]);
  expect(()=>evaluate({otherObligors:[party("spouse")]})).toThrow();
});

test("本人限度に税扶養外の前年末生計維持児童を38万円、控除対象の16～18歳児を63万円として1回ずつ算入",()=>{
  const p=evaluate({claimant:party("head",0,1),spouse:party("spouse",0,1),claimantOlderTaxDependents:1,additionalMaintainedChildren:1});
  expect(p.checks.map(a=>a.limitYen)).toEqual([5606000,6536000]);
});

test("対象児なしは所得停止ではなく、各児の等級は所得制限の対象者とは別",()=>{
  expect(evaluate({grades:["not"]})).toMatchObject({incomeEligible:true,status:"no-qualifying-child",monthlyYen:0});
  expect(evaluate({grades:["1","1","2"]})).toMatchObject({monthlyYen:155830,annualYen:1869960});
});

test("給与のみの前年判定所得は税務の障害者控除額や支払済み社会保険料に置き換えない",()=>{
  const calc = (salary,spouse,ordinary,special)=>salaryOnlySpecialChildIncome({
    salaryIncomeBeforeAdjustmentYen:salary,spouseSpecialDeductionYen:spouse,ordinaryDisabilityCount:ordinary,specialDisabilityCount:special});
  expect(calc(6100000,330000,1,1)).toBe(4920000);
  expect(calc(170000,0,0,0)).toBe(0);
  expect(()=>calc(6100000,-1,0,0)).toThrow();
});

test("改稿計算器の両給与から特児判定と停止理由が実際の内訳に渡る",()=>{
  const insured = {mode:"employee",workRegion:"chiba",employmentInsurance:true};
  const calculator = createRevisionCalculator({children:[{age:10,tccaGrade:"1",taxStatus:"special",welfareEligible:true,serviceUser:false}],
    insurance:{head:insured,spouse:insured},roles:{allowanceRecipient:"head",spouseDeductionClaimant:"head"},
    serviceAmountYen:0});
  const a = calculator.evaluate(400,400), b = calculator.evaluate(400,1000), c = calculator.evaluate(1000,400);
  expect(a.breakdown.tccaWan).toBe(70.14);
  expect(a.details.benefits.specialChildAllowance).toMatchObject({annualYen:701400,incomeEligible:true,stoppedBy:[]});
  expect(a.details.benefits.specialChildAllowance.checks.map(p=>[p.id,p.limitYen])).toEqual(
    [["head",4976000],["spouse",6287000]]);
  expect(b.details.benefits.specialChildAllowance.stoppedBy.map(p=>p.role)).toEqual(["spouse"]);
  expect(c.details.benefits.specialChildAllowance.stoppedBy.map(p=>p.role)).toEqual(["claimant"]);
  expect([b.breakdown.tccaWan,c.breakdown.tccaWan]).toEqual([0,0]);
});
