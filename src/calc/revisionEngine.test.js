import { classifyRevisionFalls, createRevisionCalculator, evaluateRevisionSlice, validateRevisionHousehold } from "./revisionEngine.js";

const child = (age, options={}) => ({age,tccaGrade:"not",taxStatus:"none",welfareEligible:false,serviceUser:false,...options});
const severe = (age, options={}) => child(age,{tccaGrade:"1",welfareEligible:true,taxStatus:"special",serviceUser:true,...options});
// Historical fixtures assert exactly the published v2 assumptions, not observed insurance participation.
const house = (extra={}) => ({protocol:"legacy-v2",children:[severe(10),child(8)],serviceAmountYen:37200,...extra});
const employee = () => ({mode:"employee",workRegion:"chiba",employmentInsurance:true});
const bothEmployee = () => ({head:employee(),spouse:employee()});
const newHouse = (extra={}) => house({protocol:"v3",insurance:bothEmployee(),...extra});

test("v3は保険区分を給与だけで補わず、不足・旧式・算定済を明示する",()=>{
  const {protocol, insurance, ...conditions}=newHouse();
  const missing=createRevisionCalculator(conditions).evaluate(600,100);
  expect(missing).toMatchObject({protocol:"v3",status:"insufficient",studyDisposableWan:null,breakdown:null});
  expect(missing.reasons.length).toBeGreaterThan(0);
  const old=createRevisionCalculator(house()).evaluate(600,100);
  expect(old).toMatchObject({protocol:"legacy-v2",status:"calculated"});
  const real=createRevisionCalculator(newHouse()).evaluate(600,100);
  expect(real.status).toBe("calculated");
  expect(real.details.roles).toMatchObject({allowanceRecipient:"head",spouseDeductionClaimant:"head",taxDependentOf:["head","head"]});
  expect(()=>createRevisionCalculator(newHouse({protocol:"typo"}))).toThrow();
  expect(()=>createRevisionCalculator(newHouse({roles:{allowanceRecipient:"higher"}}))).toThrow();
  expect(()=>createRevisionCalculator(newHouse({children:[child(8,{taxDependentOf:"both"})]}))).toThrow();
});

test("給与が交差しても扶養・配偶者控除の申告者・特児受給者はそのまま。家族全体の入替えは対称",()=>{
  const assigned = newHouse({children:[severe(16,{taxDependentOf:"spouse"}),child(8)],roles:{allowanceRecipient:"head",spouseDeductionClaimant:"spouse"}});
  const a=createRevisionCalculator(assigned);
  for(const [x,y] of [[599,600],[600,600],[601,600]]) {
    const p=a.evaluate(x,y);
    expect(p.recipient).toBe("head");
    expect(p.details.headTax.taxDependentCount).toBe(1);
    expect(p.details.spouseTax.olderDependentCount).toBe(1);
    expect(p.details.spouseTax.disabilityDeductionITYen).toBe(750000);
    expect(p.details.headTax.disabilityDeductionITYen).toBe(0);
    expect(p.details.benefits.claimantLimitYen).toBe(4596000+380000);
  }
  const b=createRevisionCalculator(newHouse({children:[severe(16,{taxDependentOf:"head"}),child(8,{taxDependentOf:"spouse"})],
    roles:{allowanceRecipient:"spouse",spouseDeductionClaimant:"head"}}));
  expect(a.evaluate(160,780).breakdown).toEqual(b.evaluate(780,160).breakdown);
  expect(a.evaluate(160,780).details.spouseTax.spouseDeduction.current.it).toBe(380000);
  expect(a.evaluate(160,780).details.headTax.spouseDeduction.current.it).toBe(0);
});

test("特児法6条の生計維持児童は受給資格者本人限度にだけ1回数え、税扶養や16歳加算へ転写しない",()=>{
  const base = c => createRevisionCalculator(newHouse({children:[c]})).evaluate(800,300);
  const a=base(severe(16,{taxDependentOf:"spouse"}));
  const b=base(severe(16,{taxDependentOf:"spouse",maintainedByRecipient:true}));
  const c=base(severe(16,{taxDependentOf:"head",maintainedByRecipient:true}));
  expect(b.details.benefits.claimantLimitYen-a.details.benefits.claimantLimitYen).toBe(380000);
  expect(b.details.benefits.otherLimitYen).toBe(a.details.benefits.otherLimitYen);
  expect(b.details.benefits.obligorLimitYen).toBe(a.details.benefits.obligorLimitYen);
  expect(b.breakdown.taxWan).toBe(a.breakdown.taxWan);
  expect(c.details.benefits.additionalSupportedCount).toBe(0);
  expect(c.details.benefits.claimantLimitYen-b.details.benefits.claimantLimitYen).toBe(250000);
});

test("保険の認定は扶養申告とは別：被扶養の配偶者の本人負担を引かず、控除・前年所得割を再計算",()=>{
  const point = insurance => createRevisionCalculator(newHouse({insurance})).evaluate(750,125);
  const own = point(bothEmployee());
  const dependent = point({head:employee(),spouse:{mode:"outside",employmentInsurance:false}});
  expect(dependent.status).toBe("calculated");
  expect(dependent.details.spouseTax.socialYen).toBe(0);
  expect(own.details.spouseTax.socialYen).toBeGreaterThan(0);
  expect(own.details.spouseTax.serviceLevyYen).toBeLessThan(dependent.details.spouseTax.serviceLevyYen);
  expect(own.details.headTax.spouseDeduction).toEqual(dependent.details.headTax.spouseDeduction);
});

test("各年の配偶者控除・特別控除：本人3所得帯と全配偶者所得境界でIT・LTを独立の原表と照合",()=>{
  // NTA No.1195・令和9年度市民税表。給与のみ・両親45歳・23歳未満の子あり。
  const c=createRevisionCalculator(newHouse());
  // 900/950/1,000万円の本人所得は給与1,110/1,160/1,210万円に対応（所得金額調整控除15万円）。
  const columns=[[1110,0],[1111,1],[1160,1],[1161,2],[1210,2],[1211,3]];
  // 配偶者給与は当年最低控除74万円を含む。169→170で所得税のみ、207→208で両税の控除が0に。
  const rows=[
    [136,"ordinary",[38,26,13],[33,22,11]], [137,"special",[38,26,13],[33,22,11]],
    [169,"special",[38,26,13],[33,22,11]], [170,"special",[36,24,12],[33,22,11]],
    [174,"special",[36,24,12],[33,22,11]], [175,"special",[31,21,11],[31,21,11]],
    [179,"special",[31,21,11],[31,21,11]], [180,"special",[26,18,9],[26,18,9]],
    [184,"special",[26,18,9],[26,18,9]], [185,"special",[21,14,7],[21,14,7]],
    [189,"special",[21,14,7],[21,14,7]], [190,"special",[16,11,6],[16,11,6]],
    [194,"special",[16,11,6],[16,11,6]], [195,"special",[11,8,4],[11,8,4]],
    [199,"special",[11,8,4],[11,8,4]], [200,"special",[6,4,2],[6,4,2]],
    [204,"special",[6,4,2],[6,4,2]], [205,"special",[3,2,1],[3,2,1]],
    [207,"special",[3,2,1],[3,2,1]], [208,"none",[0,0,0],[0,0,0]],
  ];
  for(const [income,col] of columns) for(const [salary,kind,it,lt] of rows) {
    expect(c.evaluate(income,salary).details.headTax.spouseDeduction.current).toMatchObject(
      {kind:col===3?"none":kind,it:(it[col]||0)*10000,lt:(lt[col]||0)*10000});
  }
  expect(c.evaluate(800,123).details.headTax.spouseDeduction.previous.kind).toBe("ordinary");
  expect(c.evaluate(800,124).details.headTax.spouseDeduction.previous.kind).toBe("special");
  expect(c.evaluate(800,124).details.headTax.spouseDeduction.current.kind).toBe("ordinary");
});

test("未算定の給与点を下落・回復に数えず、未算定の前後をつながない",()=>{
  const obs = (v, handout) => ({disposableWan:v,breakdown:{tccaWan:handout,welfareWan:0,serviceWan:0}});
  const gap={status:"insufficient",disposableWan:null,breakdown:null};
  const output=classifyRevisionFalls([obs(5,5),obs(3.1234,3),gap,obs(6,3),gap,obs(0,0)]);
  expect(output.values).toEqual([5,3.1234,null,6,null,0]);
  expect(output.falls).toEqual([{at:1,delta:1.8766,recovered:null,recoveryStatus:"gap",causes:["特別児童扶養手当"]}]);
});

test("入力は整数かつ制度別。手当等級を税や就学先に読み替えない",()=>{
  for (const children of [[],[child(18)],[child(2),child(3),child(4),child(5)],[child(8,{taxStatus:"unknown"})],[child(8,{welfareEligible:true})]]) {
    expect(()=>validateRevisionHousehold(house({children}))).toThrow(RangeError);
  }
  expect(()=>validateRevisionHousehold(house({children:[child(17,{tccaGrade:"2",taxStatus:"none",welfareEligible:true})]}))).not.toThrow();
  const calculator=createRevisionCalculator(house());
  for(const x of [null,"0",-1,100.1,1501]) expect(()=>calculator.evaluate(0,x)).toThrow(RangeError);
  expect(()=>calculator.evaluate(1500,1500)).not.toThrow();
});

test("給与ゼロの現金給付は原表で独立検算でき、受給停止前の区分と実支給を区別する",()=>{
  const p=createRevisionCalculator(house()).evaluate(0,0);
  expect(p.breakdown).toMatchObject({salaryWan:0,tccaWan:58450*12/10000,welfareWan:16560*12/10000,
    childAllowanceWan:24,serviceWan:0,taxWan:0,socialWan:0});
  expect(p.disposableWan).toBe(114.012);
  const c=createRevisionCalculator(house({children:[child(0,{tccaGrade:"2"}),child(9),child(11)]})).evaluate(0,0);
  expect(c.breakdown.childAllowanceWan).toBe(60);
  expect(c.breakdown.tccaWan).toBe(38930*12/10000);
  const highest=createRevisionCalculator(house()).evaluate(1500,1500);
  expect(highest.breakdown.tccaWan).toBe(0);
  expect(highest.breakdown.welfareWan).toBe(0);
});

test("主たる扶養者を入れ替えても収支は対称、同じ給与総額の配分を変えると税と手当が変わりうる",()=>{
  const c=createRevisionCalculator(house());
  for (const [x,y] of [[0,800],[831,123],[65,77],[999,1000],[100,1500]]) {
    expect(c.evaluate(x,y).breakdown).toEqual(c.evaluate(y,x).breakdown);
  }
  expect(c.evaluate(123,831).recipient).toBe("spouse");
  expect(c.evaluate(600,600).recipient).toBe("head");
  expect(c.evaluate(900,0).breakdown.tccaWan).toBe(0);
  expect(c.evaluate(450,450).breakdown.tccaWan).toBe(70.14);
  expect(c.evaluate(900,0).breakdown.taxWan).not.toBe(c.evaluate(450,450).breakdown.taxWan);
});

test("本人・配偶者の扶養人数、16歳以上の限度額加算、前年の給与所得控除・所得基準を区別する",()=>{
  const c=createRevisionCalculator(house({children:[severe(16)]}));
  expect(c.evaluate(800,123).details.benefits).toMatchObject({claimantLimitYen:4596000+2*380000+250000, otherLimitYen:6287000, obligorLimitYen:6749000});
  // 2025年給与123万＝所得58万、翌1万円は普通→特別控除へ。2026年給与とは控除表が異なる。
  expect(c.evaluate(800,124).details.benefits.claimantLimitYen).toBe(4596000+380000+250000);
  expect(c.evaluate(800,124).details.headTax.allowanceIncomeYen).toBe(6100000-100000-80000-400000-330000);
  expect(c.evaluate(800,123).details.headTax.allowanceIncomeYen).toBe(6100000-100000-80000-400000);
});

test("特児の算定所得＝限度額で停止する（わずかに超えたときからではない）",()=>{
  const c = createRevisionCalculator(house());
  const before = c.evaluate(823,0), at = c.evaluate(824,0);
  // 前年給与824万円 × 0.9 − 110万円 − 10万円 − 8万円 − 特障40万円＝573.6万円。
  // 無所得の配偶者・子2人を扶養する受給資格者の限度額も573.6万円。
  expect(at.details.headTax.allowanceIncomeYen).toEqual(5736000);
  expect(at.details.benefits.claimantLimitYen).toEqual(5736000);
  expect(before.breakdown.tccaWan).toEqual(70.14);
  expect(at.breakdown.tccaWan).toEqual(0);
  expect(at.breakdown.welfareWan).toEqual(before.breakdown.welfareWan);
});

test("就学奨励費・医療費助成・対応支出は、旧入力が残っていても試算対象にも内訳にもならない",()=>{
  const baseline=createRevisionCalculator(newHouse()).evaluate(400,300);
  const obsolete={education:{mode:"measured",annualNeedYen:8000000,childExpensesYen:[12000,6000]},
    medical:{annualExpenseYen:500000,annualAidYen:149531},programs:{n04EducationProfile:{},m01MedicalProfile:{}}};
  const raw=newHouse(obsolete);
  const out=createRevisionCalculator(raw).evaluate(400,300);
  expect(out).toEqual(baseline);
  for (const key of Object.keys(obsolete)) expect(validateRevisionHousehold(raw)).not.toHaveProperty(key);
  expect(Number.isFinite(out.disposableWan)).toBe(true);
  expect(out.studyDisposableWan).toBe(out.disposableWan);
  expect(out).not.toHaveProperty("partialDisposableWan");
  expect(out.details).not.toHaveProperty("school");
  expect(Object.keys(out.breakdown).sort()).toEqual(
    ["salaryWan","taxWan","socialWan","tccaWan","welfareWan","childAllowanceWan","serviceWan"].sort());
  // 旧版内訳を含む系列が渡されてもN04やM01を下落の制度要因とは判定しない。
  const oldPoint=(disposableWan,v)=>({disposableWan,breakdown:{...out.breakdown,educationAidWan:v,medicalAidWan:v}});
  const trace=classifyRevisionFalls([oldPoint(10,1),oldPoint(9,0)]);
  expect(trace.allFalls).toHaveLength(1);
  expect(trace.falls).toEqual([]);
});

test("合算と償還後の世帯上限。就学前無償と児童別設定、不利用を区別し食費等は含めない",()=>{
  const children=[severe(4),severe(10,{serviceAmountYen:2500}),child(8,{serviceUser:true,serviceAmountYen:1500})];
  const c=createRevisionCalculator(house({children,otherServiceMonthlyYen:2000}));
  expect(c.evaluate(0,0).details.service).toMatchObject({monthly:0,dayMonthlyBeforeCapYen:4000,otherServiceMonthlyYen:2000});
  expect(c.evaluate(600,0).details.service).toMatchObject({monthly:4600,householdCapYen:4600});
  expect(c.evaluate(1500,1500).details.service).toMatchObject({monthly:6000,householdCapYen:37200});
  const two=createRevisionCalculator(house({children:[severe(10),severe(8)]}));
  expect(two.evaluate(1500,1500).breakdown.serviceWan).toBe(44.64);
});

test("福祉所得逆転だけを抽出し、直前点の収支への最初の回復を取得、範囲外を捏造しない",()=>{
  const p=(v,tcca,tax)=>({disposableWan:v,breakdown:{tccaWan:tcca,welfareWan:0,serviceWan:0,taxWan:tax}});
  const res=classifyRevisionFalls([p(5,5,0),p(4,5,2),p(3,1,2),p(3.5,1,2),p(4,1,2),p(3,0,2)]);
  expect(res.allFalls.map(f=>f.at)).toEqual([1,2,5]);
  expect(res.falls).toEqual([{at:2,delta:1,recovered:4,causes:["特別児童扶養手当"]},{at:5,delta:1,recovered:null,causes:["特別児童扶養手当"]}]);
  const c=createRevisionCalculator(house());
  const head=evaluateRevisionSlice(c,"head",0), spouse=evaluateRevisionSlice(c,"spouse",0);
  expect(head.values).toHaveLength(1501);
  expect(head).toEqual(spouse);
  expect(head.allFalls.length).toBeGreaterThan(head.falls.length);
  for (const f of head.falls) {
    expect(f.causes.length).toBeGreaterThan(0);
    expect(head.values[f.at]).toBeLessThan(head.values[f.at-1]);
    if (f.recovered!==null) {
      expect(head.values.slice(f.at,f.recovered).every(n=>n<head.values[f.at-1])).toBe(true);
      expect(head.values[f.recovered]).toBeGreaterThanOrEqual(head.values[f.at-1]);
    }
  }
});
