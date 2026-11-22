import { childOrDisabilityIncomeAdjustmentYen, salaryIncomeBeforeAdjustmentYen } from "./employmentIncome.js";

/**
 * 船橋市・国保の年度賦課モデル。医療の診療費・助成額とは別の「保険料」だけを扱う。
 * 対象は45歳の夫婦・0～17歳の無所得児1～3人。全員所得申告済み、給与のみ、
 * 年度初の年齢・加入・世帯構成で通年、前年も同額給与、個別申請減免なしの比較条件。
 * 所得連動の法定軽減・未就学児軽減は適用する。年度賦課を12か月分納付する
 * 定常仮定であり、実世帯の納付通知額・暦年の実納付額を推認するものではない。
 */
export const FUNABASHI_NATIONAL_SOURCES = {
  ratesAndThresholds:"https://www.city.funabashi.lg.jp/kenkou/kokuho/002/p145350.html",
  formulaAndExamples:"https://www.city.funabashi.lg.jp/kenkou/kokuho/002/p001880.html",
  pension:"https://www.nenkin.go.jp/service/kokunen/hokenryo/hensen.html",
  salary2024:"https://www.nta.go.jp/taxes/shiraberu/shinkoku/tebiki/2024/pdf/Q/Q17.pdf",
  salary2025:"https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1410.htm",
  adjustment:"https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1411.htm",
};
// [所得割の万分率, 均等割額（円／人）, 世帯別の賦課限度額（円）]。4区分を個別計算。
const RATE = {
  2025:{medical:[667,35100,660000], elderly:[269,10700,260000], care:[149,11500,170000], childSupport:[0,0,0],
    half:305000, fifth:560000, pensionMonthly:17510},
  2026:{medical:[705,39300,670000], elderly:[274,12700,260000], care:[188,13900,170000], childSupport:[27,1800,30000],
    half:310000, fifth:570000, pensionMonthly:17920},
};
const roles = ["head","spouse"];
/** 1万円格子専用：当該年度ではなく、前年の給与所得（申告基準値・円）。 */
function priorEarnedIncome(salaryWan, fiscalYear) {
  const y=salaryWan*10000, unit=Math.floor(y/4000);
  let gross;
  if(fiscalYear===2026) gross=salaryIncomeBeforeAdjustmentYen(y,2025);
  else if(y<=1620000) gross=Math.max(0,y-550000);
  else if(y<1800000) gross=unit*2400+100000;
  else if(y<3600000) gross=unit*2800-80000;
  else if(y<6600000) gross=unit*3200-440000;
  else if(y<=8500000) gross=y*9/10-1100000;
  else gross=y-1950000;
  // 2親とも23歳未満の子あり。税の扶養控除の申告先とは別（国税庁 No.1411）。
  return gross-childOrDisabilityIncomeAdjustmentYen(y,true);
}

/**
 * 個人分の所得割を足し、低所得・未就学児等の軽減後均等割を加えてから区分ごとに10円未満を切り捨てる。
 * 低所得世帯の残存率は十分率（3,5,8,10）、均等割人数は半人単位（未就学児）。
 */
function categoryAnnualYen([bps,flat,cap],basisYen,doubleCount,remainingTenths) {
  const tenThousandthsOfYen=basisYen*bps+flat*doubleCount*remainingTenths*500;
  return Math.min(cap,Math.floor(tenThousandthsOfYen/100000)*10);
}

/**
 * 船橋市の加入者・被扶養者条件から世帯国保を年度別に算定し、通常納付の国民年金とともに実支払者へ割り当てる。
 * @param {object} input fiscalYear,headWan,spouseWan,nationalRoles（国保加入の親）、
 * children（全児の年度初年齢age・国保加入national）、payer（国保世帯分の実支払者）、
 * standardPension（各国保加入親は国民年金第1号・免除等なしで各自通常納付する前提）。
 * @returns {object} 国保世帯額、加入した親ごとの年金額、支払者別の年間モデル額（円）。条件不足時はnull。
 */
export function estimateFunabashiNational({fiscalYear,headWan,spouseWan,nationalRoles,children,payer,standardPension}={}) {
  const reasons=[];
  if (![2025,2026].includes(fiscalYear)) reasons.push("船橋市国保の対応年度は令和7・8年度です。");
  if (![headWan,spouseWan].every(v=>Number.isSafeInteger(v)&&v>=0&&v<=1500)) reasons.push("給与は0～1,500万円の整数を指定してください。");
  if (!Array.isArray(nationalRoles)||!nationalRoles.length||new Set(nationalRoles).size!==nationalRoles.length||
      !nationalRoles.every(r=>roles.includes(r))) reasons.push("国保に通年加入する親を指定してください。");
  if (!Array.isArray(children)||children.length<1||children.length>3||!children.every(c=>c && Number.isInteger(c.age)&&c.age>=0&&c.age<=17&&typeof c.national==="boolean"))
    reasons.push("各児の年度初年齢と、国保への加入の有無を指定してください。");
  if (!roles.includes(payer)) reasons.push("世帯の国保保険料を実際に支払う親を指定してください。");
  if (standardPension!==true) reasons.push("国民年金第1号の通常納付（免除・猶予・前納なし）が前提です。該当しなければ実払額を用いてください。");
  if(reasons.length) return {known:false,reasons,healthYen:null,pensionYen:null,byPayer:null,breakdown:null};
  const r=RATE[fiscalYear], wages={head:headWan,spouse:spouseWan};
  const income={head:priorEarnedIncome(headWan,fiscalYear),spouse:priorEarnedIncome(spouseWan,fiscalYear)};
  const nationalChildren=children.filter(c=>c.national), insuredCount=nationalRoles.length+nationalChildren.length;
  // 均等割軽減の判定には擬制世帯主の所得も含む。世帯主でない未加入の配偶者は含めない。
  const tested=roles.filter(role=>role==="head"||nationalRoles.includes(role));
  const judgedIncomeYen=tested.reduce((sum,role)=>sum+income[role],0);
  const earnerAdjustment=100000*Math.max(0,tested.filter(role=>wages[role]>55).length-1);
  const base=430000+earnerAdjustment;
  const remaining=judgedIncomeYen<=base ? 3 : judgedIncomeYen<=base+r.half*insuredCount ? 5 : judgedIncomeYen<=base+r.fifth*insuredCount ? 8 : 10;
  const insuredBasisYen=nationalRoles.reduce((sum,role)=>sum+Math.max(0,income[role]-430000),0);
  const units=insuredCount*2-nationalChildren.filter(c=>c.age<6).length;
  // 児童に所得なし：介護分・子育て分の所得割基礎もこの場合は成人の賦課基準額と一致。
  const medical=categoryAnnualYen(r.medical,insuredBasisYen,units,remaining);
  const elderly=categoryAnnualYen(r.elderly,insuredBasisYen,units,remaining);
  const care=categoryAnnualYen(r.care,insuredBasisYen,nationalRoles.length*2,remaining);
  const childSupport=categoryAnnualYen(r.childSupport,insuredBasisYen,nationalRoles.length*2,remaining);
  const healthYen=medical+elderly+care+childSupport;
  const pensionYen={head:0,spouse:0};
  for(const role of nationalRoles) pensionYen[role]=12*r.pensionMonthly;
  const byPayer={...pensionYen};
  byPayer[payer]+=healthYen;
  return {known:true,reasons:[],healthYen,pensionYen,byPayer,breakdown:{
    fiscalYear,ageBasis:"固定した年度初年齢",incomeYear:fiscalYear-1,income,judgedIncomeYen,insuredBasisYen,insuredCount,
    lowIncomeReductionPercent:100-10*remaining,medical,elderly,care,childSupport,payer,
  }};
}
