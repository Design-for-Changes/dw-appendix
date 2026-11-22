// 東京支部・一般事業・45歳・賞与なし。年俸を12等分した定常的な月給に対し、
// 令和7/8年度それぞれの4月適用の料率を12か月固定する比較（暦年の実徴収額ではない）。
// 協会けんぽ各年度の東京支部保険料額表、日本年金機構の標準報酬表。
export const PAYROLL_SOURCES = {
  current: "https://www.kyoukaikenpo.or.jp/assets/R8_13tokyo.pdf",
  previous: "https://www.kyoukaikenpo.or.jp/~/media/Files/shared/hokenryouritu/r7/ippan/13tokyo.pdf",
  rounding: "https://www.mhlw.go.jp/hourei/doc/tsuchi/T260216S0101.pdf",
  employment: "https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/0000108634.html",
  coverage: "https://www.nenkin.go.jp/oshirase/taisetu/jigyosho/2026/202610/100104.html",
  minimum2025: "https://jsite.mhlw.go.jp/tokyo-hellowork/list/kiba/madoguchi_goannai_00003.html",
  minimum2026: "https://jsite.mhlw.go.jp/tokyo-hellowork/list/kiba/minimum-wage-information_2026.html",
  chibaHealth: "https://www.kyoukaikenpo.or.jp/shibu/chiba/public_relations/002/",
  chibaTable2025: "https://www.kyoukaikenpo.or.jp/assets/12chiba_7.pdf",
  chibaTable2026: "https://www.kyoukaikenpo.or.jp/assets/R8_12chiba.pdf",
  chibaMinimum2025: "https://jsite.mhlw.go.jp/chiba-roudoukyoku/news_topics/_20250903_chingin_00002.html",
  chibaMinimum2026: "https://jsite.mhlw.go.jp/chiba-roudoukyoku/news_topics/_20260901_chingin_00003.html",
};

// [報酬月額の下限（含む）, 健保標準報酬月額]、単位千円。厚生年金は下限88・上限650。
const GRADES = [
  [0,58],[63,68],[73,78],[83,88],[93,98],[101,104],[107,110],[114,118],[122,126],[130,134],
  [138,142],[146,150],[155,160],[165,170],[175,180],[185,190],[195,200],[210,220],[230,240],[250,260],
  [270,280],[290,300],[310,320],[330,340],[350,360],[370,380],[395,410],[425,440],[455,470],[485,500],
  [515,530],[545,560],[575,590],[605,620],[635,650],[665,680],[695,710],[730,750],[770,790],[810,830],
  [855,880],[905,930],[955,980],[1005,1030],[1055,1090],[1115,1150],[1175,1210],[1235,1270],[1295,1330],[1355,1390],
];
const rates = {2025:{healthCare:1150,support:0,employment:55},2026:{healthCare:1147,support:23,employment:50}};

/** 選択点の検算表示用。判定に使った同じ等級表から報酬月額の半開区間を読む。 */
export function healthGradeBandYen(grade) {
  if (!Number.isInteger(grade) || grade < 1 || grade > GRADES.length) throw new RangeError("健保の等級が範囲外です。");
  return {lower:GRADES[grade-1][0]*1000, upper:grade < GRADES.length ? GRADES[grade][0]*1000 : null};
}

/**
 * 賞与なし・毎月均等で、所定内賃金及び報酬に含まれる給与だけを入力するモデル。
 * 短時間労働者の「月8.8万円」要件のみを返す。勤務時間、事業所、扶養認定とは別。
 * 2026年10月以降は要件自体がない（最低賃金減額特例の対象者はモデル外）。
 * @returns {object} requirement: met / not-met / abolished、比較した月額・年額の境界（円）
 */
export function shortTimeWageTestFromAnnualPay(annualPayYen, year, month) {
  if (!Number.isSafeInteger(annualPayYen) || annualPayYen < 0 || ![2025,2026].includes(year) ||
      !Number.isInteger(month) || month < 1 || month > 12) throw new RangeError("年収（円）と対象年月が必要です。");
  if (year === 2026 && month >= 10) return {requirement:"abolished", monthlyThresholdYen:null, annualThresholdYen:null};
  const monthlyThresholdYen = 88000, annualThresholdYen = monthlyThresholdYen * 12;
  return {requirement:annualPayYen >= annualThresholdYen ? "met" : "not-met", monthlyThresholdYen, annualThresholdYen};
}

/**
 * 協会けんぽの等級表に年収÷12を当てる。端数処理前の年収と月額境界×12を比較。
 * @param {number} annualPayYen 本人加入者1人の賞与・変動手当なしの年間給与（整数円）。
 * @returns {object} 健保・厚年それぞれの等級と標準報酬月額（円）。加入資格の有無は判定しない。
 */
export function employeeGradesFromAnnualPay(annualPayYen) {
  if (!Number.isSafeInteger(annualPayYen) || annualPayYen <= 0) throw new RangeError("本人加入時の正の年間給与（円）が必要です。");
  let idx = 0;
  while (idx + 1 < GRADES.length && annualPayYen >= 12000 * GRADES[idx + 1][0]) idx++;
  const healthStandardYen = GRADES[idx][1]*1000;
  return {healthGrade:idx+1, pensionGrade:Math.min(32,Math.max(1,idx-2)),
    healthStandardYen, pensionStandardYen:Math.min(650000,Math.max(88000,healthStandardYen))};
}

/**
 * 勤務条件を固定した場合の加入判定。各年11月の制度を1年間継続した静学比較。
 * 常用・非学生・1事業所で通常週40時間、勤務期間に関する加入要件を満たすものとする。
 * 3/4以上（週30時間以上かつ日数要件充足）／週20時間以上の短時間労働者／20時間未満を区別。
 * @param {object} profile workPattern: regular / short-covered / short-outside / under20
 * @param {number} salaryWan 年間を通じ安定した所定内給与の年額換算（万円）。0は就労なし、休業は対象外。
 * @param {number} year 2025年11月又は2026年11月。東京・最低賃金減額特例なし・年52週換算。
 * @returns {object} 勤務先での医療・年金加入／加入なし／不明。これだけでは被扶養者かどうかは決まらない。
 */
export function resolveEmploymentContract(profile, salaryWan, year) {
  const pattern=profile?.workPattern;
  const unknown={mode:"unknown",employmentInsurance:null};
  if (!rates[year] || !Number.isInteger(salaryWan) || salaryWan<0 || salaryWan>1500 ||
      !["regular","short-covered","short-outside","under20"].includes(pattern)) return unknown;
  if (salaryWan===0 || pattern==="under20") return {mode:"outside",employmentInsurance:false};
  const region=profile.workRegion??"tokyo";
  if(!["tokyo","chiba"].includes(region)) return unknown;
  const minimumHours=pattern==="regular"?30:20;
  const hourlyMinimum=region==="tokyo" ? (year===2025?1226:1280) : (year===2025?1140:1195);
  if (salaryWan*10000 < minimumHours*52*hourlyMinimum) return {...unknown,reason:"この勤務時間で通年就労する場合の最低賃金に達しません。"};
  const eligible=pattern==="regular" || (pattern==="short-covered" &&
    shortTimeWageTestFromAnnualPay(salaryWan*10000,year,11).requirement!=="not-met");
  return {mode:eligible?"employee":"outside",employmentInsurance:true};
}

/** 給与天引き・端数特約なし。正の整数分数を50銭以下切捨て、50銭超切上げとする。 */
function payrollRound(numerator, denominator) {
  return Math.floor((numerator + denominator/2 - 1)/denominator);
}

/** 一般事業の雇用保険。加入は別に判定。端数のある年俸は月給を最大1円違いに割り振る。 */
export function annualEmploymentPremium(salaryWan, year) {
  if (!rates[year] || !Number.isInteger(salaryWan) || salaryWan<0 || salaryWan>1500) throw new RangeError("給与・料率年度が対象外です。");
  const annual=salaryWan*10000, base=Math.floor(annual/12), extra=annual%12;
  return (12-extra)*payrollRound(base*rates[year].employment,10000)+extra*payrollRound((base+1)*rates[year].employment,10000);
}

/**
 * 本人加入済みの45歳について、保険料の対象月と等級判定用報酬月額から、1か月の本人負担を返す。
 * @param {object} input remunerationYen（等級判定用の円／月）又はannualPayYen（賞与なしの均等給与、円／年）の一方、year, month（納付月ではない）、workRegion（加入支部）
 * @returns {object} 標準報酬月額、健保・介護・支援金の合計、厚年、合計（いずれも円）。賞与・雇用保険は別計算。
 * 給与天引き・端数特約なし。2026年3月の健保・介護料率改定と4月の支援金開始を別に扱う。
 */
export function monthlyEmployeePremiums45Yen({remunerationYen,annualPayYen,year,month,workRegion} = {}) {
  if ((remunerationYen === undefined) === (annualPayYen === undefined) ||
      (remunerationYen !== undefined && (!Number.isSafeInteger(remunerationYen) || remunerationYen <= 0)) ||
      ![2025,2026].includes(year) || !Number.isInteger(month) || month < 1 || month > 12 ||
      (year === 2025 && month < 3) || !["chiba","tokyo"].includes(workRegion)) {
    throw new RangeError("報酬月額又は均等割する年収の一方、加入支部、保険料対象月（2025年3月～2026年12月）を指定してください。");
  }
  const tableYear = year === 2026 && month >= 3 ? 2026 : 2025;
  const r = rates[tableYear];
  const hc = workRegion === "chiba" ? (tableYear === 2025 ? 1138 : 1135) : r.healthCare;
  const supportRate = year === 2026 && month >= 4 ? r.support : 0;
  const grades=employeeGradesFromAnnualPay(annualPayYen ?? remunerationYen*12);
  const {healthStandardYen,pensionStandardYen}=grades;
  const healthCareYen = payrollRound(healthStandardYen * hc, 20000);
  // 厚労省「子ども・子育て支援金に関するQ&A」：合算後に折半・端数処理。配賦した差を別途足さない。
  const combinedHealthYen = payrollRound(healthStandardYen * (hc + supportRate), 20000);
  const pensionYen = payrollRound(pensionStandardYen * 1830, 20000);
  return {...grades,healthCareYen,supportYen:combinedHealthYen-healthCareYen,
    combinedHealthYen,pensionYen,totalYen:combinedHealthYen+pensionYen};
}

/**
 * 本人加入が確定している45歳の親の標準報酬と年間被保険者負担を円で返す。
 * @param {number} salaryWan 賞与のない年間給与収入（万円）。勤務条件自体を給与額から逆算しない。
 * @param {number} year 2025または2026。事業主のみが負担する拠出金は含まない。
 * @param {boolean} employmentInsurance 雇用保険加入の有無（健康保険とは別）。
 * @returns {object} 標準報酬（月額）、保険料内訳・計（年額）。支援金は合算端数処理後の差として配賦。
 */
export function annualEmployeePremiums(salaryWan, year, employmentInsurance, workRegion="tokyo") {
  if (!Number.isInteger(salaryWan) || salaryWan<=0 || salaryWan>1500 || !rates[year] || typeof employmentInsurance!=="boolean") throw new RangeError("本人加入の給与・年度・雇用保険の条件を確認してください。");
  // 既存の年額比較は4月分を12倍する。暦年に実際に支払う額とは区別する。
  const monthly=monthlyEmployeePremiums45Yen({annualPayYen:salaryWan*10000,year,month:4,workRegion});
  const employmentYen=employmentInsurance ? annualEmploymentPremium(salaryWan,year) : 0;
  return {workRegion,healthGrade:monthly.healthGrade,pensionGrade:monthly.pensionGrade,
    healthStandardYen:monthly.healthStandardYen,pensionStandardYen:monthly.pensionStandardYen,
    healthCareYen:12*monthly.healthCareYen,supportYen:12*monthly.supportYen,pensionYen:12*monthly.pensionYen,
    employmentYen,totalYen:12*monthly.totalYen+employmentYen};
}
