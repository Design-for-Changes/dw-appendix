// src/pages/IncomeCalc.js
import React, { useMemo, useState } from "react";
import "../App.css";

/* ──────────────────────────────────────────────────────────────
  定数・ヘルパ
────────────────────────────────────────────────────────────── */
// 累進（速算表：所得税）
const defaultBands = [
  { min: 0, max: 1950000, rate: 0.05, ded: 0 },
  { min: 1950000, max: 3300000, rate: 0.10, ded: 97500 },
  { min: 3300000, max: 6950000, rate: 0.20, ded: 427500 },
  { min: 6950000, max: 9000000, rate: 0.23, ded: 636000 },
  { min: 9000000, max: 18000000, rate: 0.33, ded: 1536000 },
  { min: 18000000, max: 40000000, rate: 0.40, ded: 2796000 },
  { min: 40000000, max: Infinity, rate: 0.45, ded: 4796000 },
];

// 障害者控除（税額計算側で使用。手当判定は「一般/特別」のみ）
const DIS_IT_GENERAL = 270000; const DIS_LT_GENERAL = 260000;
const DIS_IT_SPECIAL = 400000; const DIS_LT_SPECIAL = 300000;
const DIS_IT_CORES   = 750000; const DIS_LT_CORES   = 530000; // 同居特別（税控除用）

// 配偶者控除（所得税・簡略）
function spouseDeductionIT(agi){
  if (agi > 10000000) return 0;
  if (agi <= 9000000) return 380000;
  if (agi <= 9500000) return 260000;
  return 130000;
}
const SPOUSE_SPECIAL_TABLE = [
  { sMin: 480001, sMax: 950000,  a900: 380000, a950: 260000, a1000: 130000 },
  { sMin: 950001, sMax: 1000000, a900: 360000, a950: 240000, a1000: 120000 },
  { sMin: 1000001,sMax: 1050000, a900: 310000, a950: 210000, a1000: 110000 },
  { sMin: 1050001,sMax: 1100000, a900: 260000, a950: 180000, a1000:  90000 },
  { sMin: 1100001,sMax: 1150000, a900: 210000, a950: 140000, a1000:  70000 },
  { sMin: 1150001,sMax: 1200000, a900: 160000, a950: 110000, a1000:  60000 },
  { sMin: 1200001,sMax: 1250000, a900: 110000, a950:  80000, a1000:  40000 },
  { sMin: 1250001,sMax: 1300000, a900:  60000, a950:  40000, a1000:  20000 },
  { sMin: 1300001,sMax: 1330000, a900:  30000, a950:  20000, a1000:  10000 },
];
function spouseSpecialIT(agi, sAgi, table = SPOUSE_SPECIAL_TABLE){
  if (agi > 10000000 || !Array.isArray(table)) return 0;
  for (const r of table){
    if (sAgi >= r.sMin && sAgi <= r.sMax){
      if (agi <= 9000000) return r.a900;
      if (agi <= 9500000) return r.a950;
      return r.a1000;
    }
  }
  return 0;
}

// 固定控除（税額計算）
// 2026改正：基礎控除（所得税はCPI連動で+14万円相当、住民税は据え置き）
const BASIC_DED_IT = 620000; // 62万円（合計所得2,350万円以下帯）
const BASIC_DED_LT = 430000; // 住民税は据え置き 43万円
const RATE_LOCAL_TAX = 0.10;
const DEFAULT_PER_CAPITA = 5000;

const DEP_IT_GENERAL_AMT  = 380000;
const DEP_LT_GENERAL_AMT  = 330000;
const DEP_IT_SPECIAL_AMT  = 630000; // 19–22歳
const DEP_LT_SPECIAL_AMT  = 450000;

const ADJ_CREDIT_RATE   = 0.05;
const ADJ_CREDIT_BORDER = 2000000;

// 社会保険（税額側の近似率。手当判定では使わない）
const FIXED_RATE_HEALTH  = 0.050;
const FIXED_RATE_PENSION = 0.0915;
const FIXED_RATE_UNEMP   = 0.006;   // 106万円未満は 0（本ファイルの実装）
const FIXED_RATE_CARE    = 0.018;   // 介護保険（第2号・40〜64歳のみ適用／近似率）
// 子ども・子育て支援金（2026年開始・被用者保険平均）：標準報酬×0.23% の労使折半 ≒ 0.115%
const CHILD_SUPPORT_RATE_EMP = 0.00115;
const FIXED_CAP_HEALTH_BONUS_ANNUAL = 5730000;
const FIXED_CAP_PENSION_BONUS_PER_PAY = 1500000;

const SHAHO_WALL_ANNUAL_YEN = 1060000;
const LT_NONTAXABLE_INCOME_WAGEONLY_YEN = 1000000;

// 手当（R7.4〜月額）
const MONTH_TOKUJIFU_G1 = 56800;   // 特別児童扶養手当 1級
const MONTH_TOKUJIFU_G2 = 37830;   // 特別児童扶養手当 2級
const MONTH_SHOJI_FUKUSHI = 16100; // 障害児福祉手当
const MONTH_TOKUSHO = 29590;       // 特別障害者手当

// 所得制限・限度額表
const LIMIT_TOKUJIFU = {
  person:  {0:4596000,1:4976000,2:5356000,3:5736000,4:6116000,5:6496000},
  obligor: {0:6287000,1:6536000,2:6749000,3:6962000,4:7175000,5:7388000}
};
const LIMIT_CHILD_OR_TOKUSHO = {
  person:  {0:3661000,1:4041000,2:4421000,3:4801000,4:5181000,5:5561000},
  obligor: {0:6287000,1:6536000,2:6749000,3:6962000,4:7175000,5:7388000}
};
const LIMIT_ADD_PER_SPECIAL_DEP = 250000;

// 単位
const WAN = 10000;
const toYen = (wan) => Math.round((Number(wan) || 0) * WAN);
const toWan = (yen) => (isFinite(yen) ? Math.round((Number(yen) || 0) / WAN * 10) / 10 : 0);
const fmtWan = (yen) => `${toWan(yen).toLocaleString("ja-JP", { maximumFractionDigits: 1 })} 万円`;
const z = (n) => Math.max(0, Math.floor(n || 0));
const floorThousand = (x) => Math.floor((x || 0) / 1000) * 1000;

// 所得控除（任意入力ぶん：税額計算／手当判定で共用）
function lifeInsuranceDeductionIT(p){ p=Math.max(0,p|0);
  if (p<=20000) return p;
  if (p<=40000) return Math.floor(p*0.5+10000);
  if (p<=80000)  return Math.floor(p*0.25+20000);
  return 40000;
}
function lifeInsuranceDeductionLT(p){ p=Math.max(0,p|0);
  if (p<=12000) return p;
  if (p<=32000) return Math.floor(p*0.5+6000);
  if (p<=56000) return Math.floor(p*0.25+14000);
  return 28000;
}
const quakeDeductionIT = (p)=> Math.min(Math.max(0,p|0),50000);
const quakeDeductionLT = (p)=> Math.min(Math.max(0,p|0),25000);
const smallKDeduction  = (p)=> Math.max(0,p|0);
function medicalDeduction(p,ins,agi){
  p=Math.max(0,p|0); ins=Math.max(0,ins|0);
  const base = Math.max(0, p - ins);
  const th = Math.min(100000, Math.floor((agi||0)*0.05));
  return Math.max(0, Math.min(2000000, base - th));
}
function donationDeductionIT(p,agi){
  const x=(Math.max(0,p|0)-2000); if (x<=0) return 0;
  return Math.min(x, Math.floor((agi||0)*0.4));
}

// 給与所得控除
// 2026年改正後の給与所得控除（最低65万円へ引上げ）
const EMP_DED_FLOOR = 650000;
function employmentIncomeDeduction(y, floor = EMP_DED_FLOOR){
  y=Math.max(0,y);
  if (y === 0) return 0;
  if (y<=1900000) return floor;
  if (y<=3600000) return y*0.30 + 80000;
  if (y<=6600000) return y*0.20 + 440000;
  if (y<=8500000) return y*0.10 + 1100000;
  return 1950000;
}
const calcFukkoTax = (it)=> Math.floor((it||0)*0.021);
function progressiveTax(taxable, bands){
  if (taxable<=0) return 0;
  const b = bands.find(v=> taxable>=v.min && taxable<v.max) || bands[bands.length-1];
  return Math.max(0, taxable*b.rate - b.ded);
}

/* 税額用：個人計算（年収ベース）
   ※ 失業保険（雇用保険）は 106 万円未満では 0 とする修正 */
function calcPerson({
  salaryWan, bonusWan, bonusTimes, careEligible,
  dependents, depDedPerPerson,
  basicDedIT, basicDedLT, rateLocalTax, perCapita,
  bands,
  employmentDedFloor = EMP_DED_FLOOR,
  employmentDedFn = null,
  addlDedIT = 0,
  addlDedLT = 0,
  basicDedITFn = null,
  basicDedLTFn = null,
}){
  const salary = toYen(salaryWan);
  const bonus  = toYen(bonusWan);
  const totalIncome = z(salary + bonus);

  // 収入ゼロなら控除・税ともに 0 で早期リターン
  if (totalIncome <= 0){
    return {
      totalIncome: 0,
      empDed: 0,
      salaryIncomeAfterEmpDed: 0,
      socialTotal: 0,
      childSupport: 0,
      deductionsIT: 0,
      deductionsLT: 0,
      baseBasicIT: 0,
      baseBasicLT: 0,
      taxableIT: 0,
      taxableLT: 0,
      incomeTaxBase: 0,
      fukkoTax: 0,
      incomeTaxTotal: 0,
      localTax: 0,
      net: 0,
    };
  }

  // 社保（雇用保険は106万円未満なら 0）
  const under106 = salary < SHAHO_WALL_ANNUAL_YEN;
  const healthSalary  = z(salary * FIXED_RATE_HEALTH);
  const pensionSalary = z(salary * FIXED_RATE_PENSION);
  const unempSalary   = z(under106 ? 0 : salary * FIXED_RATE_UNEMP);
  const careSalary    = z((careEligible ? salary : 0) * FIXED_RATE_CARE);

  // 賞与（標準賞与額）
  const n = Math.max(1, Math.floor(Number(bonusTimes)||1));
  let stdBonusH=0, stdBonusP=0;
  for (let i=0;i<n;i++){
    const per = bonus/n;
    stdBonusH += floorThousand(per);
    stdBonusP += Math.min(floorThousand(per), FIXED_CAP_PENSION_BONUS_PER_PAY);
  }
  stdBonusH = Math.min(stdBonusH, FIXED_CAP_HEALTH_BONUS_ANNUAL);
  const healthBonus  = z(stdBonusH * FIXED_RATE_HEALTH);
  const pensionBonus = z(stdBonusP * FIXED_RATE_PENSION);
  const unempBonus   = z(under106 ? 0 : bonus * FIXED_RATE_UNEMP);
  const careBonus    = z((careEligible ? stdBonusH : 0) * FIXED_RATE_CARE);

  const socialTotal = z(healthSalary+pensionSalary+unempSalary+careSalary+healthBonus+pensionBonus+unempBonus+careBonus);

  // 子ども・子育て支援金（本人負担分だけ計上・社会保険料控除に含める）
  const childSupport = z((salary + bonus) * CHILD_SUPPORT_RATE_EMP);
  const socialWithSupport = z(socialTotal + childSupport);

  const empDed = z(
    employmentDedFn
      ? employmentDedFn(totalIncome)
      : employmentIncomeDeduction(totalIncome, employmentDedFloor)
  );
  const agi    = z(totalIncome - empDed); // 合計所得金額相当（給与のみ）

  const depDed = z((parseInt(dependents||0)||0) * (Number(depDedPerPerson)||0));
  const baseIT = basicDedITFn ? basicDedITFn(agi) : basicDedIT;
  const baseLT = basicDedLTFn ? basicDedLTFn(agi) : basicDedLT;
  const dedIT  = z(baseIT + socialWithSupport + depDed + addlDedIT);
  const dedLT  = z(baseLT + socialWithSupport + depDed + addlDedLT);

  const taxableIT = z(agi - dedIT);
  const taxableLT = z(agi - dedLT);

  const incomeTaxBase = z(progressiveTax(taxableIT, bands));
  const fukko = calcFukkoTax(incomeTaxBase);
  const incomeTaxTotal = z(incomeTaxBase + fukko);

  const ltNonTaxable = (salary <= LT_NONTAXABLE_INCOME_WAGEONLY_YEN) || (taxableLT<=0);
  const localTax = ltNonTaxable ? 0 : z(taxableLT*rateLocalTax + DEFAULT_PER_CAPITA);

  const net = z(totalIncome - socialWithSupport - incomeTaxTotal - localTax);

  return {
    totalIncome, empDed, salaryIncomeAfterEmpDed: agi,
    socialTotal: socialWithSupport, childSupport,
    deductionsIT: dedIT, deductionsLT: dedLT,
    baseBasicIT: baseIT, baseBasicLT: baseLT,
    taxableIT, taxableLT, incomeTaxBase, fukkoTax: fukko, incomeTaxTotal,
    localTax, net
  };
}

/* ──────────────────────────────────────────────────────────────
   React 本体
────────────────────────────────────────────────────────────── */
export default function IncomeCalc(){
  // 収入（万円）
  const [aAge, setAAge] = useState(35);
  const [aSalaryWan, setASalaryWan] = useState(600);
  const [aBonusWan,  setABonusWan]  = useState(100);
  const [aBonusTimes,setABonusTimes]= useState(2);

  const [bAge, setBAge] = useState(35);
  const [bSalaryWan, setBSalaryWan] = useState(0);
  const [bBonusWan,  setBBonusWan]  = useState(0);
  const [bBonusTimes,setBBonusTimes]= useState(2);

  // 障害区分（主・配偶者は入力から外す = none 固定）
  const aDisability = "none";
  const [bDisability] = useState("none");

  // 子ども（年齢、年収（万円）、障害等級 1=特別 / 2=一般、同居フラグ）
  const [children, setChildren] = useState([]);
  const addChild = ()=> setChildren(p => p.length<5 ? [...p, {age:"", incomeWan:"", grade:"none", cohab:false}] : p);
  const delChild = ()=> setChildren(p => p.slice(0,-1));
  const updateChild = (i, k, v)=> setChildren(p => p.map((c,idx)=> idx===i? {...c,[k]:v}:c));

  // 住民税（均等割率や税率は固定。均等割だけ入力）
  const [perCapitaWan, setPerCapitaWan] = useState(DEFAULT_PER_CAPITA/WAN);
  const perCapita = useMemo(()=> toYen(perCapitaWan), [perCapitaWan]);
  const [rateLocalTax] = useState(RATE_LOCAL_TAX);

  // 所得税・住民税の基礎控除（参考表示用）
  const [basicDedITWan] = useState(BASIC_DED_IT/WAN);
  const [basicDedLTWan] = useState(BASIC_DED_LT/WAN);
  const basicDedIT = useMemo(()=> toYen(basicDedITWan), [basicDedITWan]);
  const basicDedLT = useMemo(()=> toYen(basicDedLTWan), [basicDedLTWan]);

  // 「認める控除」入力（円）
  const [lifeInsPaid, setLifeInsPaid] = useState(0);
  const [quakeInsPaid,setQuakeInsPaid]= useState(0);
  const [smallKPaid, setSmallKPaid]   = useState(0);
  const [medPaid, setMedPaid]         = useState(0);
  const [medInsRec, setMedInsRec]     = useState(0);
  const [donationPaid, setDonationPaid]=useState(0);

  const [bands, setBands] = useState(defaultBands);

  // 税額計算（まず仮：扶養人数カウントは子から）
  const depCount = useMemo(()=>{
    return children.reduce((acc,c)=>{
      const age = Number(c.age)||0;
      const inc = Number(c.incomeWan)||0;
      if (age>=16 && inc<=10.3) return acc+1;
      return acc;
    },0);
  },[children]);

  const depDedPerPersonYen = 380000;

  // 税額用 A/B
  const A = useMemo(()=> calcPerson({
    salaryWan:aSalaryWan, bonusWan:aBonusWan, bonusTimes:aBonusTimes,
    careEligible: (aAge>=40 && aAge<=64),
    dependents: depCount, depDedPerPerson: depDedPerPersonYen,
    basicDedIT, basicDedLT, rateLocalTax, perCapita, bands
  }), [aSalaryWan,aBonusWan,aBonusTimes,depCount,basicDedIT,basicDedLT,rateLocalTax,perCapita,bands,aAge]);

  const B = useMemo(()=> calcPerson({
    salaryWan:bSalaryWan, bonusWan:bBonusWan, bonusTimes:bBonusTimes,
    careEligible: (bAge>=40 && bAge<=64),
    dependents: 0, depDedPerPerson: depDedPerPersonYen,
    basicDedIT, basicDedLT, rateLocalTax, perCapita, bands
  }), [bSalaryWan,bBonusWan,bBonusTimes,basicDedIT,basicDedLT,rateLocalTax,perCapita,bands,bAge]);

  const AGI_A = A.salaryIncomeAfterEmpDed;
  const AGI_B = B.salaryIncomeAfterEmpDed;

  // 配偶者（特別）控除（税側）
  const spouseDedA_IT = (AGI_A<=480000) ? spouseDeductionIT(AGI_B) :
                        (AGI_A>480000 && AGI_A<=1330000) ? spouseSpecialIT(AGI_B, AGI_A) : 0;
  const spouseDedB_IT = (AGI_B<=480000) ? spouseDeductionIT(AGI_A) :
                        (AGI_B>480000 && AGI_B<=1330000) ? spouseSpecialIT(AGI_A, AGI_B) : 0;

  // 子の障害（手当用途：同居特別は使わない／税額側は下で差分のみ使用可）
  const childrenDisabilityForTax = useMemo(()=>{
    let it=0, lt=0;
    for (const c of children){
      if (c.grade==='1'){ it+=DIS_IT_SPECIAL; lt+=DIS_LT_SPECIAL; }
      else if (c.grade==='2'){ it+=DIS_IT_GENERAL; lt+=DIS_LT_GENERAL; }
    }
    return {it, lt};
  },[children]);

  // 特定扶養（19–22）/一般（16–18,23+）カウント
  const fuyoCount = useMemo(()=>{
    let general=0, special=0;
    for(const c of children){
      const age = Number(c.age)||0;
      const inc = Number(c.incomeWan)||0;
      if (inc>10.3) continue;
      if (age>=19 && age<=22) special++;
      else if ((age>=16 && age<=18) || age>=23) general++;
    }
    return {general, special, total: general+special};
  },[children]);

  // 住民税 調整控除（簡易：A側に集約）
  const adjPeopleDiff = useMemo(()=>{
    let diff = (BASIC_DED_IT - BASIC_DED_LT);
    diff += fuyoCount.general*(DEP_IT_GENERAL_AMT-DEP_LT_GENERAL_AMT);
    diff += fuyoCount.special*(DEP_IT_SPECIAL_AMT-DEP_LT_SPECIAL_AMT);
    // 本人障害（主は none 固定）、子の障害差分
    diff += (childrenDisabilityForTax.it - childrenDisabilityForTax.lt);
    return Math.max(0,diff);
  },[fuyoCount, childrenDisabilityForTax]);

  function calcAdjCreditLT(taxableLT, peopleDiffYen){
    const t=Math.max(0,taxableLT|0), d=Math.max(0,peopleDiffYen|0);
    if (t<=ADJ_CREDIT_BORDER) return Math.floor(Math.min(d,t)*ADJ_CREDIT_RATE);
    const rem = Math.max(0, d - (t-ADJ_CREDIT_BORDER));
    return Math.floor(rem*ADJ_CREDIT_RATE);
  }
  const adjCreditA = calcAdjCreditLT(A.taxableLT, adjPeopleDiff);
  const adjCreditB = 0;

  // 手取り
  const netA = z(A.totalIncome - A.socialTotal - A.incomeTaxTotal - Math.max(0, A.localTax - adjCreditA));
  const netB = z(B.totalIncome - B.socialTotal - B.incomeTaxTotal - Math.max(0, B.localTax - adjCreditB));
  const householdChildSupport = z(A.childSupport + B.childSupport);
  const household = {
    totalIncome: z(A.totalIncome+B.totalIncome),
    socialTotal: z(A.socialTotal+B.socialTotal),
    childSupport: householdChildSupport,
    incomeTaxTotal: z(A.incomeTaxTotal+B.incomeTaxTotal),
    localTax: z(Math.max(0,A.localTax-adjCreditA)+Math.max(0,B.localTax-adjCreditB)),
  };
  household.net = z(household.totalIncome - household.socialTotal - household.incomeTaxTotal - household.localTax);

  /* ─────────── 手当判定：共通方針 ───────────
    判定所得（本人／配偶者等）＝ AGI − 100,000（給与/年金あり） − 認める控除合計 − 80,000（社保控除）
    ※ 本ツールでは手当判定における社保控除は A/B とも一律 80,000 円
  */

  // 認める控除：A/B それぞれ（IT 側相当を流用）
  const allowedAList = [
    { key:"障害者控除等（A本人＋子由来）", val: 0 /* 主の障害は使用しない */ + childrenDisabilityForTax.it },
    { key:"生命保険料控除",               val: lifeInsuranceDeductionIT(lifeInsPaid) },
    { key:"地震保険料控除",               val: quakeDeductionIT(quakeInsPaid) },
    { key:"小規模企業共済等掛金控除",     val: smallKDeduction(smallKPaid) },
    { key:"医療費控除",                   val: medicalDeduction(medPaid, medInsRec, AGI_A) },
    { key:"寄附金控除（所得税側）",        val: donationDeductionIT(donationPaid, AGI_A) },
  ];
  const allowedBList = [
    { key:"障害者控除等（配偶者側）",       val: 0 /* 配偶者の障害は UI から外しているため 0 */ },
    { key:"生命保険料控除",               val: lifeInsuranceDeductionIT(lifeInsPaid) },
    { key:"地震保険料控除",               val: quakeDeductionIT(quakeInsPaid) },
    { key:"小規模企業共済等掛金控除",     val: smallKDeduction(smallKPaid) },
    { key:"医療費控除",                   val: medicalDeduction(medPaid, medInsRec, AGI_B) },
    { key:"寄附金控除（所得税側）",        val: donationDeductionIT(donationPaid, AGI_B) },
  ];
  const sumList = (lst)=> lst.reduce((s,x)=> s+(x.val|0), 0);

  // 判定所得の内訳ビルダー
  const fmtY = (n)=> (Math.round(n||0)).toLocaleString("ja-JP");
  function buildHandanParts({agi, hasWage, allowedList, socialYen=80000}){
    const tenK = hasWage ? 100000 : 0;
    const allowedSum = sumList(allowedList);
    const total = (agi|0) - tenK - allowedSum - (socialYen|0);
    const parts = [
      { label:"合計所得金額相当（AGI）",         val: agi },
      { label:"▲ 100,000（給与/年金あり）",       val: -tenK },
      { label:"▲ 認める控除合計",                val: -allowedSum, sub: allowedList },
      { label:"▲ 社会保険料控除（80,000円）",     val: -(socialYen|0) },
    ];
    return { parts, total };
  }

  const A_break = buildHandanParts({agi:AGI_A, hasWage:AGI_A>0, allowedList:allowedAList, socialYen:80000});
  const B_break = buildHandanParts({agi:AGI_B, hasWage:AGI_B>0, allowedList:allowedBList, socialYen:80000});
  const A_handan = A_break.total;
  const B_handan = B_break.total;

  // 扶養人数（限度額用）
  const fuyoCnt = Math.max(0, Math.min(5, fuyoCount.total));
  const limitTokujifuPerson  = LIMIT_TOKUJIFU.person[fuyoCnt]  + fuyoCount.special*LIMIT_ADD_PER_SPECIAL_DEP;
  const limitTokujifuObligor = LIMIT_TOKUJIFU.obligor[fuyoCnt] + fuyoCount.special*LIMIT_ADD_PER_SPECIAL_DEP;

  // 特別児童扶養手当（対象児）
  const tokujifuKids = children.filter(c => (Number(c.age)||0) < 20 && (c.grade==='1' || c.grade==='2'));
  const tokujifuMonthly = tokujifuKids.reduce((s,c)=> s + (c.grade==='1'? MONTH_TOKUJIFU_G1 : MONTH_TOKUJIFU_G2), 0);
  const tokujifuEligible = (tokujifuKids.length>0) && (A_handan<=limitTokujifuPerson) && (B_handan<=limitTokujifuObligor);
  const tokujifuResult = {
    eligibleCount: tokujifuEligible ? tokujifuKids.length : 0,
    monthly: tokujifuEligible ? tokujifuMonthly : 0,
    yearly: (tokujifuEligible ? tokujifuMonthly : 0) * 12,
    limitPerson: limitTokujifuPerson,
    limitObligor: limitTokujifuObligor,
    formulas: tokujifuKids.map((c,i)=> ({
      label:`対象児${i+1}（${c.grade==='1'?'1級':'2級'}）`,
      person:`本人(A) 判定所得 = ${fmtY(A_handan)} ≤ 限度額 ${fmtY(limitTokujifuPerson)} → ${A_handan<=limitTokujifuPerson?'OK':'NG'}`,
      oblig: `配偶者(B) 判定所得 = ${fmtY(B_handan)} ≤ 限度額 ${fmtY(limitTokujifuObligor)} → ${B_handan<=limitTokujifuObligor?'OK':'NG'}`
    }))
  };

  // 障害児福祉手当（20歳未満・重度=特別のみ）
  const shojiKids = children.filter(c => (Number(c.age)||0) < 20 && c.grade==='1');
  const shojiLimitP  = LIMIT_CHILD_OR_TOKUSHO.person[0]; // 子本人は人数0枠
  const shojiLimitOB = LIMIT_CHILD_OR_TOKUSHO.obligor[fuyoCnt] + fuyoCount.special*LIMIT_ADD_PER_SPECIAL_DEP;
  // 子本人の AGI（簡易：子の収入(万円)→円にして給与所得控除）
  const calcChildAGI = (c)=>{
    const sal = toYen(c.incomeWan||0);
    return Math.max(0, sal - employmentIncomeDeduction(sal));
  };
  const shojiFormulas = shojiKids.map((c,i)=>{
    const childAGI = calcChildAGI(c);
    const childHandan = childAGI - 100000 /*給与あり*/ - 0 /*子本人の任意控除なし想定*/ - 80000;
    const aok = childHandan<=shojiLimitP;
    const bok = B_handan<=shojiLimitOB && A_handan<=shojiLimitOB; // A/B どちらも限度内
    return {
      label:`児童${i+1}`,
      person:`本人(子) 判定所得 = ${fmtY(childHandan)} ≤ 限度額 ${fmtY(shojiLimitP)} → ${aok?'OK':'NG'}`,
      oblig: `配偶者等(A/B) 判定所得 = A:${fmtY(A_handan)} / B:${fmtY(B_handan)} ≤ 限度額 ${fmtY(shojiLimitOB)} → ${(A_handan<=shojiLimitOB && B_handan<=shojiLimitOB)?'OK':'NG'}`
    };
  });
  const shojiEligible = shojiKids.length>0 && shojiFormulas.every(f=> f.person.includes('OK') && f.oblig.includes('OK'));
  const shojiResult = {
    eligibleCount: shojiEligible ? shojiKids.length : 0,
    monthly: shojiEligible ? (MONTH_SHOJI_FUKUSHI * shojiKids.length) : 0,
    yearly: (shojiEligible ? (MONTH_SHOJI_FUKUSHI * shojiKids.length) : 0) * 12,
    formulas: shojiFormulas
  };

  // 特別障害者手当（20歳以上の特別）— 本ツールでは配偶者Bのみ候補に
  const tokushoEligiblePerson = (bAge>=20) && false /* 配偶者の特別フラグは UI から外しているため今回は常に false */;
  const tokushoCnt = tokushoEligiblePerson ? 1 : 0;
  const tokushoLimitP  = LIMIT_CHILD_OR_TOKUSHO.person[fuyoCnt]  + fuyoCount.special*LIMIT_ADD_PER_SPECIAL_DEP;
  const tokushoLimitOB = LIMIT_CHILD_OR_TOKUSHO.obligor[fuyoCnt] + fuyoCount.special*LIMIT_ADD_PER_SPECIAL_DEP;
  const tokushoPersonOK = tokushoEligiblePerson ? (B_handan<=tokushoLimitP) : false;
  const tokushoObligOK  = tokushoEligiblePerson ? (A_handan<=tokushoLimitOB) : false;
  const tokushoOK = tokushoEligiblePerson && tokushoPersonOK && tokushoObligOK;
  const tokushoResult = {
    eligibleCount: tokushoOK? 1:0,
    monthly: tokushoOK ? MONTH_TOKUSHO : 0,
    yearly: (tokushoOK? MONTH_TOKUSHO : 0) * 12,
    formulas: tokushoEligiblePerson ? [{
      label:"配偶者B",
      person:`本人(B) 判定所得 = ${fmtY(B_handan)} ≤ 限度額 ${fmtY(tokushoLimitP)} → ${tokushoPersonOK?'OK':'NG'}`,
      oblig: `配偶者(A) 判定所得 = ${fmtY(A_handan)} ≤ 限度額 ${fmtY(tokushoLimitOB)} → ${tokushoObligOK?'OK':'NG'}`
    }] : []
  };

  const allowanceYear =
    tokujifuResult.yearly + shojiResult.yearly + tokushoResult.yearly;

  const nset = (fn)=> (e)=> fn(e.target.value==="" ? "" : Number(e.target.value));

  /* ──────────────────────────────────────────────────────────────
     UI
  ────────────────────────────────────────────────────────────── */
  return (
    <div className="App page">
      <h1 className="App-title">世帯手取り額シミュレーター（年収・万円）</h1>
      <p className="App-text">更新ログ：2026-02-11 10:00　基礎控除（所得税）を62万円に更新／給与所得控除の最低額を65万円に更新／子ども・子育て支援金（0.115%）を社会保険料に加算。</p>

      <div className="grid2">
        {/* 左：入力 */}
        <div className="card mb">
          <h2 className="mt0">入力</h2>

          <h3>家族構成</h3>
          <div className="mb flex" style={{gap:8, flexWrap:'wrap'}}>
            <button type="button" onClick={addChild}>＋ 子を追加</button>
            <button type="button" onClick={delChild} disabled={children.length===0}>－ 末尾を削除</button>
            <span className="muted">（最大5人まで）</span>
          </div>
          <div className="scroll-x">
            <table className="table">
              <thead>
                <tr><th>#</th><th>年齢</th><th>年収（万円）</th><th>障害区分</th><th>同居</th></tr>
              </thead>
              <tbody>
                {children.map((c,idx)=>(
                  <tr key={idx}>
                    <td>{idx+1}</td>
                    <td><input type="number" min={0} step={1} value={c.age} onChange={e=>updateChild(idx,'age',e.target.value)} /></td>
                    <td><input type="number" step={0.1} value={c.incomeWan} onChange={e=>updateChild(idx,'incomeWan',e.target.value)} /></td>
                    <td>
                      <select value={c.grade} onChange={e=>updateChild(idx,'grade',e.target.value)}>
                        <option value="none">なし</option>
                        <option value="1">1級（=特別）</option>
                        <option value="2">2級（=一般）</option>
                      </select>
                    </td>
                    <td><input type="checkbox" checked={!!c.cohab} onChange={e=>updateChild(idx,'cohab',e.target.checked)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3>主（あなた）</h3>
          <div className="row"><label>年齢</label><input type="number" step={1} value={aAge} onChange={e=>setAAge(Number(e.target.value)||0)} /></div>
          <div className="row"><label>給与（万円/年）</label><input type="number" step={0.1} value={aSalaryWan} onChange={nset(setASalaryWan)} /></div>
          <div className="row"><label>賞与合計（万円/年）</label><input type="number" step={0.1} value={aBonusWan} onChange={nset(setABonusWan)} /></div>
          <div className="row"><label>賞与回数（回/年）</label><input type="number" min={1} max={6} step={1} value={aBonusTimes} onChange={e=>setABonusTimes(Math.max(1, Number(e.target.value)||1))} /></div>

          <h3>配偶者</h3>
          <div className="row"><label>年齢</label><input type="number" step={1} value={bAge} onChange={e=>setBAge(Number(e.target.value)||0)} /></div>
          <div className="row"><label>給与（万円/年）</label><input type="number" step={0.1} value={bSalaryWan} onChange={nset(setBSalaryWan)} /></div>
          <div className="row"><label>賞与合計（万円/年）</label><input type="number" step={0.1} value={bBonusWan} onChange={nset(setBBonusWan)} /></div>
          <div className="row"><label>賞与回数（回/年）</label><input type="number" min={1} max={6} step={1} value={bBonusTimes} onChange={e=>setBBonusTimes(Math.max(1, Number(e.target.value)||1))} /></div>

          <h3>認める控除（所得控除として判定所得から差し引く）</h3>
          <div className="row"><label>生命保険料（円）</label><input type="number" step={1000} value={lifeInsPaid} onChange={nset(setLifeInsPaid)} /></div>
          <div className="row"><label>地震保険料（円）</label><input type="number" step={1000} value={quakeInsPaid} onChange={nset(setQuakeInsPaid)} /></div>
          <div className="row"><label>小規模企業共済等（円）</label><input type="number" step={1000} value={smallKPaid} onChange={nset(setSmallKPaid)} /></div>
          <div className="row"><label>医療費支出（円）</label><input type="number" step={1000} value={medPaid} onChange={nset(setMedPaid)} /></div>
          <div className="row"><label>保険金等補填（円）</label><input type="number" step={1000} value={medInsRec} onChange={nset(setMedInsRec)} /></div>
          <div className="row"><label>寄附金（所得控除側・円）</label><input type="number" step={1000} value={donationPaid} onChange={nset(setDonationPaid)} /></div>

          <h3>固定で用いる控除（参考・表示のみ）</h3>
          <ul className="muted">
            <li>基礎控除（所得税）: {(BASIC_DED_IT).toLocaleString()} 円</li>
            <li>基礎控除（住民税）: {(BASIC_DED_LT).toLocaleString()} 円</li>
            <li>住民税 均等割: {(DEFAULT_PER_CAPITA).toLocaleString()} 円（自治体差）</li>
          </ul>
        </div>

        {/* 右：結果 */}
        <div>
          {/* 判定所得の計算式（共通） */}
          <div className="card mb" style={{background:'rgba(0,0,0,.03)'}}>
            <h3 className="mt0">判定所得の計算式（共通）</h3>
            <div className="muted">
              判定所得 ＝（合計所得金額相当＝給与収入 − 給与所得控除）
              − <b>100,000</b>（給与/年金がある場合）
              − <b>認める控除合計</b>
              − <b>80,000</b>（社会保険料控除・本人/配偶者等ともに一律）
            </div>
          </div>

          {/* 認める控除一覧 */}
          <div className="card mb" style={{background:'rgba(0,0,0,.03)'}}>
            <h3 className="mt0">判定所得に使う「認める控除」一覧</h3>
            <ul className="muted">
              <li>障害者控除（一般・特別）</li>
              <li>寡婦・ひとり親控除</li>
              <li>勤労学生控除</li>
              <li>配偶者特別控除</li>
              <li>社会保険料控除（本人・配偶者等ともに一律 80,000 円）</li>
              <li>小規模企業共済等掛金控除</li>
              <li>医療費控除</li>
              <li>生命保険料控除</li>
              <li>地震保険料控除</li>
              <li>寄附金控除</li>
              <li>雑損控除</li>
            </ul>
          </div>

          {/* 判定所得の内訳（A/B） */}
          <div className="card mb">
            <h3 className="mt0">判定所得の内訳（本人A / 配偶者B）</h3>
            <div className="grid2">
              <div>
                <h4 className="mt0">本人 A</h4>
                <ul className="muted">
                  {A_break.parts.map((p,i)=>(
                    <li key={i}>
                      {p.label}：{fmtY(p.val)} 円
                      {p.sub && (
                        <ul style={{marginTop:6}}>
                          {p.sub.map((s,j)=>(
                            <li key={j} style={{opacity:.9}}>・{s.key}：{fmtY(s.val)} 円</li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
                <div><b>判定所得（A）＝ {fmtY(A_break.total)} 円</b></div>
              </div>
              <div>
                <h4 className="mt0">配偶者 B</h4>
                <ul className="muted">
                  {B_break.parts.map((p,i)=>(
                    <li key={i}>
                      {p.label}：{fmtY(p.val)} 円
                      {p.sub && (
                        <ul style={{marginTop:6}}>
                          {p.sub.map((s,j)=>(
                            <li key={j} style={{opacity:.9}}>・{s.key}：{fmtY(s.val)} 円</li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
                <div><b>判定所得（B）＝ {fmtY(B_break.total)} 円</b></div>
              </div>
            </div>
          </div>

          {/* 手当：特別児童扶養手当 */}
          <div className="card mb">
            <h3 className="mt0">特別児童扶養手当</h3>
            <div className={tokujifuResult.eligibleCount>0 ? "ok" : "ng"}>
              月額合計：{tokujifuResult.monthly.toLocaleString()} 円（年 {tokujifuResult.yearly.toLocaleString()} 円）
            </div>
            <div className="muted" style={{marginTop:8}}>
              扶養人数（限度額用）: {fuyoCnt} 人（特定扶養 {fuyoCount.special} 人 → ＋{(LIMIT_ADD_PER_SPECIAL_DEP*fuyoCount.special).toLocaleString()} 円）
            </div>
            <ul className="muted">
              <li><b>本人(A) 判定所得</b>：{fmtY(A_handan)} 円 ／ <b>限度額</b>：{fmtY(tokujifuResult.limitPerson)} 円 → {A_handan<=tokujifuResult.limitPerson ? <b style={{color:'green'}}>OK</b> : <b style={{color:'crimson'}}>NG</b>}</li>
              <li><b>配偶者(B) 判定所得</b>：{fmtY(B_handan)} 円 ／ <b>限度額</b>：{fmtY(tokujifuResult.limitObligor)} 円 → {B_handan<=tokujifuResult.limitObligor ? <b style={{color:'green'}}>OK</b> : <b style={{color:'crimson'}}>NG</b>}</li>
            </ul>
            <details open>
              <summary>子ども別 計算式</summary>
              <ul className="muted">
                {tokujifuResult.formulas.map((f,i)=>(
                  <li key={i}><strong>{f.label}</strong>｜{f.person}｜{f.oblig}</li>
                ))}
              </ul>
            </details>
          </div>

          {/* 手当：障害児福祉手当 */}
          <div className="card mb">
            <h3 className="mt0">障害児福祉手当</h3>
            <div className={shojiResult.eligibleCount>0 ? "ok" : "ng"}>
              月額合計：{shojiResult.monthly.toLocaleString()} 円（年 {shojiResult.yearly.toLocaleString()} 円）
            </div>
            <ul className="muted">
              <li><b>本人(子) 限度額</b>：{fmtY(LIMIT_CHILD_OR_TOKUSHO.person[0])} 円</li>
              <li><b>配偶者等(A/B) 限度額</b>：{fmtY(LIMIT_CHILD_OR_TOKUSHO.obligor[fuyoCnt] + fuyoCount.special*LIMIT_ADD_PER_SPECIAL_DEP)} 円</li>
            </ul>
            <details open>
              <summary>対象児ごとの計算式</summary>
              <ul className="muted">
                {shojiResult.formulas.map((f,i)=>(
                  <li key={i}><strong>{f.label}</strong>｜{f.person}｜{f.oblig}</li>
                ))}
              </ul>
            </details>
          </div>

          {/* 手当：特別障害者手当（今回は UI 制約により配偶者の特別フラグ無し＝常に対象外） */}
          <div className="card mb">
            <h3 className="mt0">特別障害者手当</h3>
            <div className={tokushoResult.eligibleCount>0 ? "ok" : "ng"}>
              月額合計：{tokushoResult.monthly.toLocaleString()} 円（年 {tokushoResult.yearly.toLocaleString()} 円）
            </div>
            {tokushoResult.formulas.length>0 && (
              <>
                <ul className="muted">
                  <li><b>本人(B) 判定所得</b>：{fmtY(B_handan)} 円 ／ <b>限度額</b>：{fmtY(tokushoLimitP)} 円</li>
                  <li><b>配偶者(A) 判定所得</b>：{fmtY(A_handan)} 円 ／ <b>限度額</b>：{fmtY(tokushoLimitOB)} 円</li>
                </ul>
                <details open>
                  <summary>計算式ログ</summary>
                  <ul className="muted">
                    {tokushoResult.formulas.map((f,i)=>(
                      <li key={i}><strong>{f.label}</strong>｜{f.person}｜{f.oblig}</li>
                    ))}
                  </ul>
                </details>
              </>
            )}
            {tokushoResult.formulas.length===0 && (
              <div className="muted">※ 現在の入力では対象者（20歳以上の「特別」フラグ）がいないため判定なし。</div>
            )}
          </div>

          {/* 税額結果 */}
          <div className="card mb">
            <h2 className="mt0">個別結果（主 / 配偶者）</h2>
            <table className="table result-table">
              <thead>
                <tr><th></th><th className="text-right">主</th><th className="text-right">配偶者</th></tr>
              </thead>
              <tbody>
                <tr><td>総収入</td><td className="text-right">{fmtWan(A.totalIncome)}</td><td className="text-right">{fmtWan(B.totalIncome)}</td></tr>
                <tr><td>給与所得控除</td><td className="text-right">{fmtWan(A.empDed)}</td><td className="text-right">{fmtWan(B.empDed)}</td></tr>
                <tr><td>社会保険 合計</td><td className="text-right">{fmtWan(A.socialTotal)}</td><td className="text-right">{fmtWan(B.socialTotal)}</td></tr>
                <tr><td> └ 子育て支援金</td><td className="text-right">{fmtWan(A.childSupport)}</td><td className="text-right">{fmtWan(B.childSupport)}</td></tr>
                <tr><td>課税所得（所得税）</td><td className="text-right">{fmtWan(A.taxableIT)}</td><td className="text-right">{fmtWan(B.taxableIT)}</td></tr>
                <tr><td>所得税＋復興税</td><td className="text-right">{fmtWan(A.incomeTaxTotal)}</td><td className="text-right">{fmtWan(B.incomeTaxTotal)}</td></tr>
                <tr><td>課税所得（住民税）</td><td className="text-right">{fmtWan(A.taxableLT)}</td><td className="text-right">{fmtWan(B.taxableLT)}</td></tr>
                <tr><td>住民税（調整控除適用後）</td><td className="text-right">{fmtWan(Math.max(0, A.localTax - adjCreditA))}</td><td className="text-right">{fmtWan(Math.max(0, B.localTax - adjCreditB))}</td></tr>
              </tbody>
              <tfoot>
                <tr><td><strong>手取り（年）</strong></td><td className="text-right"><strong>{fmtWan(netA)}</strong></td><td className="text-right"><strong>{fmtWan(netB)}</strong></td></tr>
              </tfoot>
            </table>
          </div>

          {/* 世帯合計（手当前/後） */}
          <div className="card">
            <h2 className="mt0">世帯合計</h2>
            <table className="table result-table">
              <tbody>
                <tr><td>世帯総収入</td><td className="text-right">{fmtWan(household.totalIncome)}</td></tr>
                <tr><td>社会保険 合計</td><td className="text-right">{fmtWan(household.socialTotal)}</td></tr>
                <tr><td> └ 子育て支援金</td><td className="text-right">{fmtWan(household.childSupport)}</td></tr>
                <tr><td>所得税 合計（復興税含む）</td><td className="text-right">{fmtWan(household.incomeTaxTotal)}</td></tr>
                <tr><td>住民税 合計</td><td className="text-right">{fmtWan(household.localTax)}</td></tr>
                <tr><td><strong>手当前の世帯手取り（年）</strong></td><td className="text-right"><strong>{fmtWan(household.net)}</strong></td></tr>
                <tr><td><strong>手当合計（年）</strong></td><td className="text-right"><strong>{fmtWan(allowanceYear)}</strong></td></tr>
              </tbody>
              <tfoot>
                <tr><td><strong>手当込み世帯手取り（年）</strong></td><td className="text-right"><strong>{fmtWan(household.net + allowanceYear)}</strong></td></tr>
                <tr><td><strong>手当込み世帯手取り（月平均）</strong></td><td className="text-right"><strong>{fmtWan(Math.floor((household.net + allowanceYear)/12))}</strong></td></tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// 外部からグラフ等で再利用するための純関数
// IncomeGraph などからインポートして使えます。
// 入力は IncomeCalc 左ペインと同等（不足分は既定値で補完）。
// 戻り値は household（世帯計）と allowanceYear（手当年額）。
// ──────────────────────────────────────────────────────────────
export function simulateHousehold({
  aSalaryWan, aBonusWan = 0, aBonusTimes = 2,
  bSalaryWan, bBonusWan = 0, bBonusTimes = 2,
  aAge = 35, bAge = 35,
  children = [],
  // 任意：判定用の「認める控除」入力（円）— 未指定は 0
  lifeInsPaid = 0,
  quakeInsPaid = 0,
  smallKPaid = 0,
  medPaid = 0,
  medInsRec = 0,
  donationPaid = 0,
  perCapitaWan = (DEFAULT_PER_CAPITA / 10000),
  rateLocalTax = RATE_LOCAL_TAX,
  bands = defaultBands,
  basicDedITOverride = BASIC_DED_IT,
  basicDedLTOverride = BASIC_DED_LT,
  employmentDedFloorOverride = EMP_DED_FLOOR,
  spouseSpecialTableOverride = SPOUSE_SPECIAL_TABLE,
  basicDedITFn = null,
  basicDedLTFn = null,
  employmentDedFn = null,
  taxCreditYen = 0, // 時限的な定額減税等を世帯合算の所得税額から控除する用途
} = {}){
  // ユーティリティ（ローカル定義：IncomeCalc 内のものと同等）
  const toYen = (wan) => Math.round((Number(wan) || 0) * 10000);
  const z = (n) => Math.max(0, Math.floor(n || 0));
  const perCapita = toYen(perCapitaWan);

  // 子データの正規化
  const kids = Array.isArray(children) ? children : [];

  // 扶養人数（税額側・主に集約）：年齢>=16 & 収入<=103万円
  const depCount = kids.reduce((acc, c) => {
    const age = Number(c?.age) || 0;
    const incWan = Number(c?.incomeWan) || 0;
    return (age >= 16 && incWan <= 10.3) ? acc + 1 : acc;
  }, 0);
  const depDedPerPersonYen = 380000; // 1人あたり（簡易）

  // A/B の税額用計算
  // 1st pass（配偶者控除なしでAGI算出）
  const A0 = calcPerson({
    salaryWan: aSalaryWan, bonusWan: aBonusWan, bonusTimes: aBonusTimes,
    careEligible: (aAge>=40 && aAge<=64),
    dependents: depCount, depDedPerPerson: depDedPerPersonYen,
    basicDedIT: basicDedITOverride, basicDedLT: basicDedLTOverride,
    rateLocalTax, perCapita, bands,
    employmentDedFloor: employmentDedFloorOverride,
    employmentDedFn,
    basicDedITFn, basicDedLTFn,
  });
  const B0 = calcPerson({
    salaryWan: bSalaryWan, bonusWan: bBonusWan, bonusTimes: bBonusTimes,
    careEligible: (bAge>=40 && bAge<=64),
    dependents: 0, depDedPerPerson: depDedPerPersonYen,
    basicDedIT: basicDedITOverride, basicDedLT: basicDedLTOverride,
    rateLocalTax, perCapita, bands,
    employmentDedFloor: employmentDedFloorOverride,
    employmentDedFn,
    basicDedITFn, basicDedLTFn,
  });

  const AGI_A = A0.salaryIncomeAfterEmpDed;
  const AGI_B = B0.salaryIncomeAfterEmpDed;

  // 配偶者（特別）控除（税側）—シナリオ別テーブルを適用
  const spouseDedA_IT = (AGI_A<=480000) ? spouseDeductionIT(AGI_B) :
                        (AGI_A>480000 && AGI_A<=1330000) ? spouseSpecialIT(AGI_B, AGI_A, spouseSpecialTableOverride) : 0;
  const spouseDedB_IT = (AGI_B<=480000) ? spouseDeductionIT(AGI_A) :
                        (AGI_B>480000 && AGI_B<=1330000) ? spouseSpecialIT(AGI_A, AGI_B, spouseSpecialTableOverride) : 0;

  // 2nd pass（配偶者控除を加味）
  const A = calcPerson({
    salaryWan: aSalaryWan, bonusWan: aBonusWan, bonusTimes: aBonusTimes,
    careEligible: (aAge>=40 && aAge<=64),
    dependents: depCount, depDedPerPerson: depDedPerPersonYen,
    basicDedIT: basicDedITOverride, basicDedLT: basicDedLTOverride,
    rateLocalTax, perCapita, bands,
    employmentDedFloor: employmentDedFloorOverride,
    addlDedIT: spouseDedA_IT,
    addlDedLT: spouseDedA_IT, // 住民税側も同額近似で控除
    employmentDedFn,
    basicDedITFn, basicDedLTFn,
  });
  const B = calcPerson({
    salaryWan: bSalaryWan, bonusWan: bBonusWan, bonusTimes: bBonusTimes,
    careEligible: (bAge>=40 && bAge<=64),
    dependents: 0, depDedPerPerson: depDedPerPersonYen,
    basicDedIT: basicDedITOverride, basicDedLT: basicDedLTOverride,
    rateLocalTax, perCapita, bands,
    employmentDedFloor: employmentDedFloorOverride,
    addlDedIT: spouseDedB_IT,
    addlDedLT: spouseDedB_IT,
    employmentDedFn,
    basicDedITFn, basicDedLTFn,
  });

  // 子の障害（手当用途：一般/特別のみ — 税側は差分にのみ影響）
  const childrenDisabilityForTax = (() => {
    let it = 0, lt = 0;
    for (const c of kids){
      if (c?.grade === '1'){ it += DIS_IT_SPECIAL; lt += DIS_LT_SPECIAL; }
      else if (c?.grade === '2'){ it += DIS_IT_GENERAL; lt += DIS_LT_GENERAL; }
    }
    return { it, lt };
  })();

  // 特定扶養（19–22）/一般（16–18,23+）の人数
  const fuyoCount = (() => {
    let general = 0, special = 0;
    for (const c of kids){
      const age = Number(c?.age) || 0;
      const incWan = Number(c?.incomeWan) || 0;
      if (incWan > 10.3) continue;
      if (age >= 19 && age <= 22) special++;
      else if ((age >= 16 && age <= 18) || age >= 23) general++;
    }
    return { general, special, total: general + special };
  })();

  // 住民税 調整控除（A 側に集約）
  function calcAdjCreditLT(taxableLT, peopleDiffYen){
    const t = Math.max(0, taxableLT|0), d = Math.max(0, peopleDiffYen|0);
    if (t <= ADJ_CREDIT_BORDER) return Math.floor(Math.min(d,t) * ADJ_CREDIT_RATE);
    const rem = Math.max(0, d - (t - ADJ_CREDIT_BORDER));
    return Math.floor(rem * ADJ_CREDIT_RATE);
  }
  const peopleDiff = (() => {
    let diff = (BASIC_DED_IT - BASIC_DED_LT);
    diff += fuyoCount.general * (DEP_IT_GENERAL_AMT - DEP_LT_GENERAL_AMT);
    diff += fuyoCount.special * (DEP_IT_SPECIAL_AMT - DEP_LT_SPECIAL_AMT);
    diff += (childrenDisabilityForTax.it - childrenDisabilityForTax.lt);
    return Math.max(0, diff);
  })();
  const adjCreditA = calcAdjCreditLT(A.taxableLT, peopleDiff);
  const adjCreditB = 0;

  // 手取り
  const netA = z(A.totalIncome - A.socialTotal - A.incomeTaxTotal - Math.max(0, A.localTax - adjCreditA));
  const netB = z(B.totalIncome - B.socialTotal - B.incomeTaxTotal - Math.max(0, B.localTax - adjCreditB));
  const household = {
    totalIncome: z(A.totalIncome + B.totalIncome),
    socialTotal: z(A.socialTotal + B.socialTotal),
    incomeTaxTotal: z(A.incomeTaxTotal + B.incomeTaxTotal),
    localTax: z(Math.max(0, A.localTax - adjCreditA) + Math.max(0, B.localTax - adjCreditB)),
  };
  // 税額控除（所得税合算から控除、超過分は切り捨て）
  const credit = Math.max(0, Math.min(taxCreditYen, household.incomeTaxTotal));
  household.incomeTaxTotal = z(household.incomeTaxTotal - credit);

  // 人別の所得税にも反映（A優先で控除し、余ればB）
  let remCredit = credit;
  const personIncomeTaxA = Math.max(0, A.incomeTaxTotal - remCredit);
  remCredit = Math.max(0, remCredit - A.incomeTaxTotal);
  const personIncomeTaxB = Math.max(0, B.incomeTaxTotal - remCredit);

  household.net = z(household.totalIncome - household.socialTotal - household.incomeTaxTotal - household.localTax);

  // ───── 手当判定（IncomeCalc 本体と同じ式）─────
  const sumList = (lst) => lst.reduce((s, x) => s + (x.val|0), 0);
  function medicalDeduction(p, ins, agi){
    p = Math.max(0, p|0); ins = Math.max(0, ins|0);
    const base = Math.max(0, p - ins);
    const th = Math.min(100000, Math.floor((agi||0)*0.05));
    return Math.max(0, Math.min(2000000, base - th));
  }
  function donationDeductionIT(p, agi){
    const x = (Math.max(0, p|0) - 2000); if (x <= 0) return 0;
    return Math.min(x, Math.floor((agi||0) * 0.4));
  }
  // 認める控除：A/B
  const allowedAList = [
    { key:"障害者控除等（A本人＋子由来）", val: 0 + childrenDisabilityForTax.it },
    { key:"生命保険料控除",               val: lifeInsuranceDeductionIT(lifeInsPaid) },
    { key:"地震保険料控除",               val: quakeDeductionIT(quakeInsPaid) },
    { key:"小規模企業共済等掛金控除",     val: smallKDeduction(smallKPaid) },
    { key:"医療費控除",                   val: medicalDeduction(medPaid, medInsRec, AGI_A) },
    { key:"寄附金控除（所得税側）",        val: donationDeductionIT(donationPaid, AGI_A) },
  ];
  const allowedBList = [
    { key:"障害者控除等（配偶者側）",       val: 0 },
    { key:"生命保険料控除",               val: lifeInsuranceDeductionIT(lifeInsPaid) },
    { key:"地震保険料控除",               val: quakeDeductionIT(quakeInsPaid) },
    { key:"小規模企業共済等掛金控除",     val: smallKDeduction(smallKPaid) },
    { key:"医療費控除",                   val: medicalDeduction(medPaid, medInsRec, AGI_B) },
    { key:"寄附金控除（所得税側）",        val: donationDeductionIT(donationPaid, AGI_B) },
  ];
  function buildHandanTotal(agi, hasWage, allowedList, socialYen = 80000){
    const tenK = hasWage ? 100000 : 0;
    const allowedSum = sumList(allowedList);
    return (agi|0) - tenK - allowedSum - (socialYen|0);
  }
  const A_handan = buildHandanTotal(AGI_A, AGI_A > 0, allowedAList, 80000);
  const B_handan = buildHandanTotal(AGI_B, AGI_B > 0, allowedBList, 80000);

  // 扶養人数（限度額用）
  const fuyoCnt = Math.max(0, Math.min(5, fuyoCount.total));
  const limitTokujifuPerson  = LIMIT_TOKUJIFU.person[fuyoCnt]  + fuyoCount.special * LIMIT_ADD_PER_SPECIAL_DEP;
  const limitTokujifuObligor = LIMIT_TOKUJIFU.obligor[fuyoCnt] + fuyoCount.special * LIMIT_ADD_PER_SPECIAL_DEP;

  // 特別児童扶養手当
  const tokujifuKids = kids.filter(c => (Number(c?.age)||0) < 20 && (c?.grade === '1' || c?.grade === '2'));
  const tokujifuMonthly = tokujifuKids.reduce((s,c)=> s + (c.grade==='1' ? MONTH_TOKUJIFU_G1 : MONTH_TOKUJIFU_G2), 0);
  const tokujifuEligible = (tokujifuKids.length > 0) && (A_handan <= limitTokujifuPerson) && (B_handan <= limitTokujifuObligor);
  const tokujifuYearly = (tokujifuEligible ? tokujifuMonthly : 0) * 12;

  // 障害児福祉手当（子本人）
  const shojiKids = kids.filter(c => (Number(c?.age)||0) < 20 && c?.grade === '1');
  const shojiLimitP  = LIMIT_CHILD_OR_TOKUSHO.person[0];
  const shojiLimitOB = LIMIT_CHILD_OR_TOKUSHO.obligor[fuyoCnt] + fuyoCount.special * LIMIT_ADD_PER_SPECIAL_DEP;
  const calcChildAGI = (c)=>{
    const sal = toYen(c?.incomeWan || 0);
    return Math.max(0, sal - employmentIncomeDeduction(sal));
  };
  const shojiOK = shojiKids.every(c => {
    const childAGI = calcChildAGI(c);
    const childHandan = childAGI - 100000 - 0 - 80000; // 任意控除なし想定
    return (childHandan <= shojiLimitP) && (A_handan <= shojiLimitOB) && (B_handan <= shojiLimitOB);
  });
  const shojiYearly = (shojiOK ? (MONTH_SHOJI_FUKUSHI * shojiKids.length) : 0) * 12;

  // 特別障害者手当（今回は UI 制約により配偶者等の特別フラグ無し → 常に 0）
  const tokushoYearly = 0;

  const allowanceYear = z(tokujifuYearly + shojiYearly + tokushoYearly);

  const allowanceBreakdown = {
    tokujifuYearly,
    shojiYearly,
    tokushoYearly
  };

  const personA = {
    totalIncome: A.totalIncome,
    empDed: A.empDed,
    socialTotal: A.socialTotal,
    childSupport: A.childSupport,
    baseBasicIT: A.baseBasicIT,
    baseBasicLT: A.baseBasicLT,
    baseBasicITUsed: A.baseBasicIT,
    baseBasicLTUsed: A.baseBasicLT,
    taxableIT: A.taxableIT,
    incomeTaxTotal: personIncomeTaxA,
    taxableLT: A.taxableLT,
    localTax: A.localTax,
    localTaxAfterAdj: Math.max(0, A.localTax - adjCreditA),
    adjCredit: adjCreditA,
    net: netA,
  };

  const personB = {
    totalIncome: B.totalIncome,
    empDed: B.empDed,
    socialTotal: B.socialTotal,
    childSupport: B.childSupport,
    baseBasicIT: B.baseBasicIT,
    baseBasicLT: B.baseBasicLT,
    baseBasicITUsed: B.baseBasicIT,
    baseBasicLTUsed: B.baseBasicLT,
    taxableIT: B.taxableIT,
    incomeTaxTotal: personIncomeTaxB,
    taxableLT: B.taxableLT,
    localTax: B.localTax,
    localTaxAfterAdj: Math.max(0, B.localTax - adjCreditB),
    adjCredit: adjCreditB,
    net: netB,
  };

  return { household, allowanceYear, allowanceBreakdown, personA, personB };
}
