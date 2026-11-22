import {assessBoundaryEducationNeed as need, BOUNDARY_EDUCATION_BASIS} from "./policyEducationNeed.js";

const children=(...ages)=>ages.map(age=>({age}));
const fees={annualMaterialsYen:12000,previousAnnualCommuteYen:24000};

test("1級地-2/VI、両親45歳・子8歳：原表から独立に手計算した月額と一致",()=>{
  const result=need(children(8),fees);
  expect(result).toMatchObject({applicable:true,fiscalYear:2024,basisDate:"2023-12-31",monthlyNeedYen:200087,
    missing:[],previousSpecialPupils:1,components:{firstClassYen:102080,secondClassYen:44730,
      yearEndYen:1893,winterYen:1767,schoolBaseYen:2600,schoolLunchYen:4207,
      monthlyDisabilityAdditionYen:26810,housingYen:13000,materialsYen:1000,commuteYen:2000}});
  expect(BOUNDARY_EDUCATION_BASIS.sections.housing).toMatch(/HouseAid\.png$/);
});

test("新小1は当年度の対象、前年末に就学者はおらず、過年度就学分を仮計上しない",()=>{
  expect(need(children(6))).toMatchObject({applicable:true,monthlyNeedYen:163470,missing:[],
    requiredInputs:[],previousSpecialPupilsRange:{min:0,max:0},components:{monthlyDisabilityAdditionYen:0,materialsYen:0,commuteYen:0}});
  expect(need(children(6),fees).monthlyNeedYen).toBe(163470);
  for(const a of [0,5,12,15,17])expect(need(children(a)).applicable).toBe(false);
  for(const a of [6,7,11])expect(need(children(a)).applicable).toBe(true);
});

test("きょうだいの学校種や対象児は年齢・税区分から決めない。人数未入力・範囲外は未算定",()=>{
  const kids=[{age:6,taxDisability:"special"},{age:8,tccaGrade:"not"},{age:11,welfareEligible:true}];
  const options={...fees,previousSpecialPupils:1};
  const calculated=need(kids,options);
  expect(calculated.previousSpecialPupilsRange).toEqual({min:0,max:2});
  expect(need(kids,fees).missing).toContain("previousSpecialPupils");
  for(const v of [null,-1,4,1.5,"1"])expect(need(kids,{...fees,previousSpecialPupils:v}).monthlyNeedYen).toBeNull();
  expect(need(kids,{...fees,previousSpecialPupils:2}).monthlyNeedYen-calculated.monthlyNeedYen).toBe(26810);
  const withoutPrior=need(kids,{annualMaterialsYen:12000,previousSpecialPupils:0});
  expect(withoutPrior.missing).toEqual([]);
  expect(withoutPrior.components.commuteYen).toBe(0);
  expect(need(children(8,11),fees).previousSpecialPupilsRange).toEqual({min:1,max:2});
});

test("前年末在学：新中1は小学校、新高1は中学校。人数別早見表を正しい列で採用",()=>{
  const threeChildren=need(children(8,12,15),{...fees,previousSpecialPupils:1});
  expect(threeChildren).toMatchObject({monthlyNeedYen:256539,primary:2,middle:1,
    components:{firstClassYen:136700,winterYen:1963,yearEndYen:2219,secondClassYen:49180,schoolBaseYen:10300,schoolLunchYen:13367}});
  expect(need(children(11,17),{...fees,previousSpecialPupils:1})).toMatchObject({primary:1,middle:0,
    previousSpecialPupilsRange:{min:1,max:2},components:{yearEndYen:2129,secondClassYen:48900,winterYen:1908}});
  expect(need(children(6,17),{previousSpecialPupils:1})).toMatchObject({primary:0,middle:0,missing:[],
    components:{monthlyDisabilityAdditionYen:26810,schoolBaseYen:0,commuteYen:0}});
});

test("教材・交通は年額実費、総需要額の上書きや欠損値のゼロ扱いはしない",()=>{
  expect(need(children(8),{monthlyNeedYen:1234567,monthlyHousingYen:56000})).toMatchObject({
    monthlyNeedYen:null,missing:["annualMaterialsYen","previousAnnualCommuteYen"]});
  const zero=need(children(8),{annualMaterialsYen:0,previousAnnualCommuteYen:0});
  expect(zero.monthlyNeedYen).toBe(197087);
  const one=need(children(8),{annualMaterialsYen:1,previousAnnualCommuteYen:0});
  expect(one.monthlyNeedYen).toBeCloseTo(197087+1/12,8);
  for(const value of [null,"",false,-1,2.1,NaN,Infinity]){
    expect(need(children(8),{...fees,annualMaterialsYen:value}).monthlyNeedYen).toBeNull();
  }
});

test("モデル外の年齢・人数で年齢表を外挿しない",()=>{
  for(const ages of [[],[18],[2.5],[1,2,3,4]])expect(()=>need(children(...ages))).toThrow(RangeError);
});
