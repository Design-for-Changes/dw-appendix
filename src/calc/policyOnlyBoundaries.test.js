import {buildPolicyOnlyMap,createPolicyOnlyClassifier} from "./policyOnlyBoundaries";
import {createRevisionCalculator} from "./revisionEngine";
import {assessPaperEducationClass,PAPER_EDUCATION_ASSESSMENT_BASIS} from "./paperEducationAssessment";
import {assessBoundaryEducationNeed} from "./policyEducationNeed";

const family={protocol:"paper-2029",serviceAmountYen:0,children:[
  {age:8,tccaGrade:"1",welfareEligible:true,taxStatus:"special",serviceUser:false,serviceAmountYen:0},
  {age:17,tccaGrade:"2",welfareEligible:false,taxStatus:"ordinary",serviceUser:true,serviceAmountYen:37200},
]};
const settings={educationInputs:{annualMaterialsYen:12000,previousAnnualCommuteYen:24000,previousSpecialPupils:1}};
function codes(classifier,x,y){
  const words=[0,0];classifier.classify(x,y,words);
  return Array.from({length:6},(_,i)=>(words[0]>>>(4*i))&15);
}

test("二給与の区分は役割入替・ゼロ・配偶者所得帯・等級境界でもEの個別算定と一致する",()=>{
  const c=createPolicyOnlyClassifier(family,settings),model=createRevisionCalculator(family);
  const {monthlyNeedYen}=assessBoundaryEducationNeed(family.children,settings.educationInputs);
  expect(monthlyNeedYen).toBeGreaterThan(0);
  // Check every possible higher wage and correlated lower wages, both assignments.
  for(let a=1;a<=1500;a++){
    const b=[0,a,Math.min(a,124),Math.min(a,195),(104729*a+23)%(a+1)][a%5];
    for(const [x,y] of [[a,b],[b,a]]){
      const d=model.evaluate(x,y).details,ht=d.headTax,st=d.spouseTax;
      const monthly=Math.max(0,(ht.previousIncomeYen-ht.previousSocialYen+st.previousIncomeYen-st.previousSocialYen)/12);
      const education=assessPaperEducationClass({scope:PAPER_EDUCATION_ASSESSMENT_BASIS.scope,
        measuredMonthlyIncomeYen:monthly,measuredMonthlyNeedYen:monthlyNeedYen});
      // Both medical lines use the assumed insured parent, not the sum. Only
      // the N02 reference applies the statutory dependants' levy correction.
      const insured=x>=y?ht:st;
      const medicalLevy=insured.residentTax.municipalIncomeLevyYen;
      const goods=Math.max(ht.residentTax.municipalIncomeLevyYen,st.residentTax.municipalIncomeLevyYen);
      expect(codes(c,x,y)).toEqual([d.benefits.tcca>0?1:2,d.benefits.welfare>0?1:2,
        [0,4600,37200].indexOf(d.service.householdCapYen)+1,
        ["第1区分","第2区分","第3区分"].indexOf(education)+1,medicalLevy===0?1:medicalLevy<235000?2:3,goods>0?2:1]);
      const words=[0,0]; c.classify(x,y,words);
      expect((words[1]>>>12)&15).toBe(!insured.serviceTaxable?1:insured.serviceLevyYen<33000?2:insured.serviceLevyYen<235000?3:4);
    }
  }
  expect(codes(c,0,0)).toEqual([0,0,0,0,0,0]);
});

test("障害認定を推定せずに医療の条件付き所得境界を示す。市民税所得割と均等割を混同しない",()=>{
  const child={...family.children[0],age:3,tccaGrade:"not",welfareEligible:false,taxStatus:"none"};
  const inputs={...family,children:[child]};
  const c=createPolicyOnlyClassifier(inputs,{},300);
  expect(c.layers.slice(0,6).map(l=>l.status)).toEqual(["not-applicable","not-applicable","calculated","not-applicable","calculated","calculated"]);
  expect(c.layers.find(l=>l.id==="M01").label).toMatch(/保険単位の所得割23万5千円、障害要件該当・特例なし/);
  expect(codes(c,300,100).slice(0,2)).toEqual([0,0]);
  expect(codes(c,300,100).slice(3,5)).toEqual([0,2]);
  const model=createRevisionCalculator(inputs);
  const residentWage=Array.from({length:300},(_,i)=>i+1).find(w=>{
    const p=model.evaluate(w,0).details.headTax.residentTax;
    return p.perCapitaYen>0 && p.municipalIncomeLevyYen===0;
  });
  expect(residentWage).toBeDefined();
  expect(codes(c,residentWage,0)[5]).toBe(1);
});

test("児福では低給与の親だけが所得限度額に達する境界も、両方向で抽出する",()=>{
  const c=createPolicyOnlyClassifier(family,settings,900);
  const model=createRevisionCalculator(family);
  for(const [x,y,code] of [[900,840,1],[900,841,2],[840,900,1],[841,900,2],[900,900,2]]){
    const {checks}=model.evaluate(x,y).details.benefits.welfareChildren[0];
    expect(checks.map(p=>p.passes)).toEqual([true,true,code===1]);
    expect(codes(c,x,y)[1]).toBe(code);
  }
});

test("N04は給与ではなく子のモデル年齢と計算可能な需要額で描画の要否を決める",()=>{
  const n04=(inputs,opts)=>createPolicyOnlyClassifier(inputs,opts,5).layers.find(l=>l.id==="N04").status;
  for(const age of [5,6,11,12]){
    const child={...family.children[0],age};
    const opts={educationInputs:{annualMaterialsYen:12000,previousAnnualCommuteYen:24000}};
    expect(n04({...family,children:[child]},opts)).toBe(age>=6&&age<=11?"calculated":"not-applicable");
  }
  expect(n04(family,{})).toBe("needs-input");
  expect(n04({...family,children:[{...family.children[0],age:6}]},{})).toBe("calculated");
});

test("出力する線分は隣接する有効な給与点間の制度区分の変化だけで、方向や対象をまたいで結ばない",()=>{
  const upper=160,opts=settings;
  const {layers,validCount}=buildPolicyOnlyMap(family,opts,{maxSalaryWan:upper});
  const classify=createPolicyOnlyClassifier(family,opts,upper);
  expect(validCount).toBe((upper+1)**2-1);
  // Enumerate every changed edge independently, and reconstruct its directed
  // change from the serialized line endpoints returned to the UI.
  const expected=new Map(),actual=new Map();
  const key=(i,x,y,axis)=>[i,x,y,axis].join(":");
  const add=(m,k,before,after)=>{if(m.has(k))throw new Error("duplicate edge "+k);m.set(k,before*16+after);};
  for(let y=0;y<=upper;y++)for(let x=0;x<=upper;x++){
    const now=codes(classify,x,y);
    for(const [axis,p] of [["x",x>0?codes(classify,x-1,y):[]],["y",y>0?codes(classify,x,y-1):[]]]){
      for(let i=0;i<6;i++)if(p[i]&&now[i]&&p[i]!==now[i])add(expected,key(i,x,y,axis),p[i],now[i]);
    }
  }
  for(const [i,layer] of layers.slice(0,6).entries())for(const [x0,y0,x1,y1,b,a] of layer.segments){
    if(x0===x1)for(let y=Math.ceil(y0);y<=Math.floor(y1);y++)add(actual,key(i,x0+.5,y,"x"),b,a);
    else for(let x=Math.ceil(x0);x<=Math.floor(x1);x++)add(actual,key(i,x,y0+.5,"y"),b,a);
  }
  expect(expected.size).toBeGreaterThan(0);expect(actual).toEqual(expected);
});
