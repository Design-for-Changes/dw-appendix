import {createRevisionCalculator} from "./revisionEngine.js";
import {buildSalaryDecisionMap} from "./salaryDecisionMap.js";
import {buildSalaryIncomeSection} from "./salaryIncomeSection.js";
import {buildDisabilityDifferenceSurface,createDisabilityIncomeComparison} from "./disabilityIncomeDifference.js";

// 公表月額は令和8年4月。900万円台等の給与境界は法定の一律給与ではなく、この試算条件での1万円格子。
// https://www.city.funabashi.lg.jp/kenkou/shougaisha/004/03/p042515.html
// https://www.city.funabashi.lg.jp/kenkou/shougaisha/004/03/p042516.html
// https://www.mhlw.go.jp/content/12200000/001327493.pdf （障害児通所の負担上限）
const G1=58450*12,G2=38930*12,WF=16560*12,smallCap=4600,largeCap=37200,fee=20000;
const k=(grade,{age=8,tax="none",wf=false,monthly=0}={})=>({age,tccaGrade:grade,taxStatus:tax,welfareEligible:wf,
  serviceUser:monthly>0,serviceAmountYen:monthly});
const severe=[k("1",{tax:"special",wf:true,monthly:fee})];
const household=children=>({protocol:"paper-2029",serviceAmountYen:0,children});

// Wages are annual 万円; the remaining arrays contain the before/after amounts in yen.
// Other costs (tax and contributions) may themselves change over the wage step:
// never use the amount of benefit lost as the drop in household disposable income.
const rows=[
  {label:"特児1級",children:severe,id:"N01-1",cut:740,special:[G1,0],welfare:[WF,WF],cap:[largeCap,largeCap],
    tax:[178800,179700],with:[11048336,10355088],base:[10209416,10216668],delta:[838920,138420]},
  {label:"特児2級",children:[k("2")],id:"N01-1",cut:696,special:[G2,0],welfare:[0,0],cap:[largeCap,largeCap],
    tax:[0,0],with:[10396056,9936048],base:[9928896,9936048],delta:[G2,0]},
  {label:"特児1級＋2級",children:[k("1"),k("2",{age:11})],id:"N01-1",cut:738,special:[G1+G2,0],welfare:[0,0],cap:[largeCap,largeCap],
    tax:[0,0],with:[11483572,10322264],base:[10315012,10322264],delta:[G1+G2,0]},
  {label:"児福",children:severe,id:"N01-2",cut:907,special:[0,0],welfare:[WF,0],cap:[largeCap,largeCap],
    tax:[206200,206200],with:[11419020,11227552],base:[11254100,11261352],delta:[164920,-33800]},
  {label:"通所支援",children:severe,id:"N02/N03",cut:533,special:[G1,G1],welfare:[WF,WF],cap:[smallCap,largeCap],
    tax:[129600,129600],with:[9779484,9603536],base:[8804964,8813816],delta:[974520,789720]},
];
const edgeAt=(map,axis)=>map.layers.filter(layer=>layer.segments.some(([x,y,X,Y])=>axis==="head"
  ? x===1.5&&X===x&&y<=1&&1<=Y : y===1.5&&Y===y&&x<=1&&1<=X)).map(l=>l.id);

describe.each(["head","spouse"])("可処分所得の制度境界：増収する親 %s",axis=>{
  test.each(rows)("$label：Iの境界、実際の年額とJの差額が一致する",row=>{
    const {children,cut}=row,h=household(children),fixed=600,c=createRevisionCalculator(h),j=createDisabilityIncomeComparison(h);
    const expand=(w,f=fixed)=>axis==="head"?[w,f]:[f,w];
    const windowed=(calculator)=>({evaluate:(x,y)=>calculator.evaluate(...(axis==="head"
      ?[cut-2+x,fixed-1+y] :[fixed-1+x,cut-2+y]))});
    const localMap=buildSalaryDecisionMap(windowed(c),{maxSalaryWan:3});
    expect(edgeAt(localMap,axis)).toEqual([row.id]);
    const strip=buildSalaryIncomeSection(c,{axis,fixedWan:fixed,maxSalaryWan:cut+1});
    expect(strip.events.find(e=>e.afterWan===cut)).toMatchObject({beforeWan:cut-1,systems:[row.id],beforeYen:row.with[0],
      afterYen:row.with[1],dropYen:row.with[0]-row.with[1]});
    const mesh=buildDisabilityDifferenceSurface(windowed(j),{maxSalaryWan:3});
    for(let i=0;i<2;i++){
      const w=cut-1+i,pair=expand(w),g=c.evaluate(...pair).details,p=j.evaluate(...pair);
      expect(g.benefits.tcca).toBe(row.special[i]);expect(g.benefits.welfare).toBe(row.welfare[i]);
      expect(g.service.householdCapYen).toBe(row.cap[i]);
      const service=12*Math.min(row.cap[i],children.reduce((sum,ch)=>sum+ch.serviceAmountYen,0));
      expect(g.service.annual).toBe(service);
      if(row.id==="N01-1"){
        // All relevant claimant wages lie between 6.6m and 8.5m; no spouse or older-child add-on.
        // Gross salary income=0.9*g-1.1m; special allowance deductions=100k+80k plus 400k/special child.
        const assessed=9000*w-1100000-100000-80000-400000*children.filter(ch=>ch.taxStatus==="special").length;
        const limit=4596000+380000*children.length;
        const self=g.benefits.specialChildAllowance.checks.find(x=>x.role==="claimant");
        expect(self).toMatchObject({assessmentIncomeYen:assessed,limitYen:limit});
        expect(assessed>=limit).toBe(i===1);
      }
      if(row.id==="N01-2"){
        const parent=g.benefits.welfareChildren[0].checks.find(x=>x.role==="maintainer");
        expect(parent).toMatchObject({incomeYen:w*10000-1950000-100000-80000-400000,limitYen:6536000});
        expect(parent.incomeYen>=6536000).toBe(i===1);
      }
      if(row.id==="N02/N03")expect(g.service.assessmentLevyYen).toBe([279700,280000][i]);
      const delta=row.special[i]+row.welfare[i]+row.tax[i]-service;
      expect(delta).toBe(row.with[i]-row.base[i]);expect(delta).toBe(row.delta[i]);
      expect(p).toMatchObject({withYen:row.with[i],withoutYen:row.base[i],differenceYen:delta,
        taxSavingYen:row.tax[i],extraBenefitsYen:row.special[i]+row.welfare[i],extraServiceYen:service,insuranceSavingYen:0});
      const [x,y]=axis==="head"?[1+i,1]:[1,1+i];
      expect(Math.round(mesh.heights[mesh.width*y+x]*10000)).toBe(delta);
    }
  });
});

test("同額では世帯主、次点では配偶者。特児の支給境界はL字になり、停止済みの領域までは延びない",()=>{
  const h=household(severe),c=createRevisionCalculator(h),j=createDisabilityIncomeComparison(h);
  const map=buildSalaryDecisionMap({evaluate:(x,y)=>c.evaluate(738+x,738+y)},{maxSalaryWan:3});
  expect(edgeAt(map,"head")).toEqual(["N01-1"]);expect(edgeAt(map,"spouse")).toEqual(["N01-1"]);
  const cuts=map.layers.find(l=>l.id==="N01-1").segments;
  expect(cuts.some(([x,y,X,Y])=>(x===X&&x===1.5&&Y>=2)||(y===Y&&y===1.5&&X>=2))).toBe(false);
  for(const [x,y,who,amount] of [[739,739,"head",838920],[739,740,"spouse",138420],[740,739,"head",138420],[740,740,"head",138420]]){
    const g=c.evaluate(x,y).details;
    expect(g.roles.allowanceRecipient).toBe(who);expect(g.roles.taxDependentOf).toEqual([who]);
    expect(j.evaluate(x,y).differenceYen).toBe(amount);
  }
});
