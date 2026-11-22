import {estimateFunabashiNational} from "./funabashiNational";

const cases = (overrides={}) => estimateFunabashiNational({
  fiscalYear:2026,headWan:480,spouseWan:130,nationalRoles:["head","spouse"],
  children:[{age:13,national:true},{age:10,national:true}],
  payer:"head",standardPension:true,...overrides,
});
const headOnly={nationalRoles:["head"],children:[{age:13,national:false}],spouseWan:0};

test("船橋市公式計算例の所得・世帯条件で、双方45歳の介護分だけを入れ替える",()=>{
  const q=cases();
  expect(q.known).toBe(true);
  expect(q.breakdown).toMatchObject({incomeYear:2025,medical:382090,elderly:138200,
    // 公表例は妻38歳、介護分69,730円。妻も45歳なら所得割+均等割が加わる。
    care:87770,childSupport:12210,insuredBasisYen:3190000});
  expect(q.healthYen).toBe(620270);
  expect(q.pensionYen).toEqual({head:215040,spouse:215040});
  expect(q.byPayer).toEqual({head:835310,spouse:215040});
  expect(cases({payer:"spouse"}).byPayer).toEqual({head:215040,spouse:835310});
});

test("令和7年度には令和6年給与所得・令和7年度料率と年金を用いる",()=>{
  const q=cases({fiscalYear:2025});
  expect(q.breakdown).toMatchObject({incomeYear:2024,income:{head:3400000,spouse:750000},
    insuredBasisYen:3290000,medical:359840,elderly:131300,care:72020,childSupport:0});
  expect(q.healthYen).toBe(563160);
  expect(q.pensionYen).toEqual({head:210120,spouse:210120});
});

test("均等割7割軽減後に未就学児の医療・支援金の均等割を半額とする",()=>{
  const q=cases({headWan:0,spouseWan:0,children:[{age:0,national:true},{age:8,national:true}]});
  expect(q.breakdown).toMatchObject({lowIncomeReductionPercent:70,medical:41260,elderly:13330,
    care:8340,childSupport:1080});
  expect(q.healthYen).toBe(64010);
});

test("加入していない世帯主も均等割軽減の判定に含むが、非加入の非世帯主は含まない",()=>{
  const pseudoHead=cases({...headOnly,headWan:1000,spouseWan:0,nationalRoles:["spouse"]});
  const outsideSpouse=cases({...headOnly,headWan:0,spouseWan:1000});
  expect(pseudoHead.breakdown).toMatchObject({lowIncomeReductionPercent:0,insuredBasisYen:0});
  expect(pseudoHead.healthYen).toBe(67700);
  expect(outsideSpouse.breakdown).toMatchObject({lowIncomeReductionPercent:70,insuredBasisYen:0});
  expect(outsideSpouse.healthYen).toBe(20310);
});

test.each([[108,70],[109,50],[139,50],[140,20],[165,20],[166,0]])(
  "加入人数1人で給与%s万円の令和8年度均等割軽減率%s％", (headWan,expected)=>{
    expect(cases({...headOnly,headWan}).breakdown.lowIncomeReductionPercent).toBe(expected);
  });

test("低所得軽減の給与所得者等2人の10万円加算・児童の国保加入の有無を区別",()=>{
  // 所得45万+5万=50万。2人の給与収入が各55万超なら基準額53万。
  expect(cases({headWan:110,spouseWan:70}).breakdown.lowIncomeReductionPercent).toBe(70);
  const base=cases({...headOnly,headWan:165});
  const withChild=cases({...headOnly,headWan:165,children:[{age:13,national:true}]});
  expect(base.breakdown.lowIncomeReductionPercent).toBe(20);
  expect(withChild.breakdown.lowIncomeReductionPercent).toBe(50);
});

test("子あり所得金額調整控除は双方の所得に適用し、各年度の4区分の世帯上限を超えない",()=>{
  const hi=cases({headWan:1500,spouseWan:1500});
  expect(hi.breakdown.income).toEqual({head:12900000,spouse:12900000});
  expect(hi.healthYen).toBe(1130000);
  expect(cases({fiscalYear:2025,headWan:1500,spouseWan:1500}).healthYen).toBe(1090000);
});

test.each([{children:[{age:8}]},{nationalRoles:[]},{payer:undefined},{standardPension:false},
  {children:[{age:18,national:true}]},{headWan:83.7},{fiscalYear:2024}])(
  "加入・支払・年齢・年度等の条件不足を0円としない %#",overrides=>{
    expect(cases(overrides)).toMatchObject({known:false,byPayer:null,healthYen:null,pensionYen:null});
  });
