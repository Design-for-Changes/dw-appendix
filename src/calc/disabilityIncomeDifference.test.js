import {createRevisionCalculator} from "./revisionEngine.js";
import {createDisabilityIncomeComparison,buildDisabilityDifferenceSurface} from "./disabilityIncomeDifference.js";

const normal=(age,extra={})=>({age,tccaGrade:"not",welfareEligible:false,taxStatus:"none",
  serviceUser:false,serviceAmountYen:0,...extra});
const family={protocol:"paper-2029",serviceAmountYen:37200,children:[
  normal(10,{tccaGrade:"2",taxStatus:"special",serviceUser:true,serviceAmountYen:37200})]};
const zeroFields={differenceYen:0,taxSavingYen:0,extraBenefitsYen:0,extraServiceYen:0,insuranceSavingYen:0};

test("同じ給与の対照世帯を別に作り手計算した支給・税・負担差。給付停止の前後と負への反転",()=>{
  const cmp=createDisabilityIncomeComparison(family);
  const cases=[
    // 世帯主、配偶者、税負担の減額、手当の増額、利用負担の増額
    [200,0,0,467160,0],[781,0,172900,467160,55200],[782,0,173800,0,55200],
    [1000,0,206200,0,446400],[1500,1500,305700,0,446400],
  ];
  const original=createRevisionCalculator(family);
  const baseline=createRevisionCalculator({protocol:"paper-2029",serviceAmountYen:0,children:[normal(10)]});
  for(const [head,spouse,tax,benefit,service] of cases){
    const a=original.evaluate(head,spouse),b=baseline.evaluate(head,spouse),p=cmp.evaluate(head,spouse);
    expect(p).toMatchObject({status:"calculated",extraBenefitsYen:benefit,taxSavingYen:tax,
      extraServiceYen:service,insuranceSavingYen:0,differenceYen:tax+benefit-service,
      withYen:Math.round(a.disposableWan*10000),withoutYen:Math.round(b.disposableWan*10000)});
    expect(p.withYen-p.withoutYen).toBe(p.differenceYen);
  }
});

test("全児童を非該当とし、それ以外の年齢・親の役割・税扶養・生計維持条件を保存。入力を上書きしない",()=>{
  const roles={allowanceRecipient:"spouse",spouseDeductionClaimant:"none",welfareMaintainer:"spouse"};
  const cs=[normal(2,{tccaGrade:"1",welfareEligible:true,taxStatus:"special",taxDependentOf:"spouse",maintainedByRecipient:true,serviceUser:true,serviceAmountYen:6500}),
    normal(8,{taxDependentOf:"head"}),normal(17,{tccaGrade:"2",taxStatus:"ordinary",taxDependentOf:"spouse"})];
  const input={protocol:"paper-2029",roles,serviceAmountYen:4000,otherServiceMonthlyYen:8000,children:cs};
  const expected={protocol:"paper-2029",roles,serviceAmountYen:0,otherServiceMonthlyYen:0,children:[
    normal(2,{taxDependentOf:"spouse",maintainedByRecipient:true}),normal(8,{taxDependentOf:"head"}),normal(17,{taxDependentOf:"spouse"})]};
  const original=JSON.stringify(input),c=createDisabilityIncomeComparison(input);
  expect(c.baselineInputs).toEqual(expected); expect(JSON.stringify(input)).toBe(original);
  const base=createRevisionCalculator(expected);
  for(const [x,y] of [[0,1],[730,500],[920,850],[1500,1500]]){
    const p=c.evaluate(x,y);
    const ref=base.evaluate(x,y),higher=x>=y?"head":"spouse";
    expect(p.allowanceRecipient).toBe(higher);
    expect(ref.details.roles.taxDependentOf).toEqual(cs.map(()=>higher));
    expect(p.withoutYen).toBe(Math.round(ref.studyDisposableWan*10000));
    expect(p.differenceYen).toBe(p.taxSavingYen+p.extraBenefitsYen+p.insuranceSavingYen-p.extraServiceYen);
  }
});

test("全員非該当・非利用なら年齢による児童手当等を残して差0、全有効点が最低・最高で同率",()=>{
  const c=createDisabilityIncomeComparison({serviceAmountYen:0,children:[normal(1),normal(9),normal(17)]});
  expect(c.evaluate(1200,1000)).toMatchObject(zeroFields);
  const m=buildDisabilityDifferenceSurface(c,{maxSalaryWan:4});
  expect(m).toMatchObject({kind:"disability-difference",min:0,max:0,validCount:24,negativeCount:0,
    minimum:{headWan:1,spouseWan:0,differenceYen:0,count:24},maximum:{headWan:1,spouseWan:0,differenceYen:0,count:24}});
  expect(m.heights[0]).toBeNaN();expect(Array.from(m.heights.slice(1)).every(v=>v===0)).toBe(true);
});

test("利用者の手当・税の認定がすべて非該当でも、利用負担を消さずに非利用の対照世帯と比較",()=>{
  const c=createDisabilityIncomeComparison({serviceAmountYen:0,children:[normal(10,{serviceUser:true,serviceAmountYen:5000})]});
  expect(c.evaluate(1500,1500)).toMatchObject({...zeroFields,differenceYen:-60000,extraServiceYen:60000});
});

test("原点・未算定はゼロ差と区別。原点だけの面の最低・最高はnull",()=>{
  const c=createDisabilityIncomeComparison(family);
  expect(c.evaluate(0,0)).toMatchObject({status:"excluded",withYen:null,withoutYen:null,differenceYen:null});
  const v3=createDisabilityIncomeComparison({...family,protocol:"v3"}).evaluate(500,150);
  expect(v3.status).toBe("insufficient");expect(v3.differenceYen).toBeNull();expect(v3.reasons.length).toBeGreaterThan(0);
  const empty=buildDisabilityDifferenceSurface(c,{maxSalaryWan:0});
  expect(empty).toMatchObject({min:null,max:null,minimum:null,maximum:null,validCount:0,negativeCount:0});
});

test("全給与点の1円差は丸め前に比較し、同率点の個数・代表点・負領域を正確に返す",()=>{
  // 極値の隣の点は、1円違っても描画用Float32では同じ高さになる。
  const amounts=[null,200000000,200000001,200000001,-200000001,-200000000,-200000001,null,0];
  const calls=[],progress=[],calc={evaluate:(x,y)=>{
    calls.push([x,y]);const v=amounts[3*y+x];return v===null?{status:"insufficient"}:{status:"calculated",differenceYen:v};
  }};
  const m=buildDisabilityDifferenceSurface(calc,{maxSalaryWan:2,onProgress:(done,total)=>progress.push([done,total])});
  expect(m).toMatchObject({width:3,validCount:7,negativeCount:3,min:-20000.0001,max:20000.0001,
    minimum:{headWan:1,spouseWan:1,differenceYen:-200000001,count:2},
    maximum:{headWan:2,spouseWan:0,differenceYen:200000001,count:2}});
  expect(m.heights).toBeInstanceOf(Float32Array);expect(m.heights[0]).toBeNaN();expect(m.heights[7]).toBeNaN();
  expect(m.heights[1]).toBe(m.heights[2]);expect(m.heights[4]).toBe(m.heights[5]);
  expect(progress).toEqual([[0,9],[3,9],[6,9],[9,9]]);expect(calls).toHaveLength(8);
  expect(calls).not.toContainEqual([0,0]);
});

test("不正な給与範囲を許容せず、内部計算値が整数円でなければ極値扱いしない",()=>{
  for(const v of [-1,1501,0.5])expect(()=>buildDisabilityDifferenceSurface(null,{maxSalaryWan:v})).toThrow(RangeError);
  expect(()=>buildDisabilityDifferenceSurface({evaluate:()=>({status:"calculated",differenceYen:0.1})},{maxSalaryWan:1})).toThrow(RangeError);
});
