import {PAPER_EDUCATION_ASSESSMENT_BASIS} from "./paperEducationAssessment.js";

// N04の支弁区分の参考線には令和6年度の表を一組として用いる。
// 給付額や世帯の可処分所得には加算しない。
// 旧モデルの住居確保給付金上限、生活保護の特例加算・児童養育加算は使わない。
const SOURCE_TABLE = "https://syusys.p-space.jp/Documents/Institution/allowance-grade/";
export const BOUNDARY_EDUCATION_BASIS = Object.freeze({
  fiscalYear:2024, basisDate:"2023-12-31", gradeArea:"1-2", winterRegion:"VI",
  measurement:PAPER_EDUCATION_ASSESSMENT_BASIS.measurement,
  // 教委掲載の文科省測定要領Ⅳ・Ⅴ。国の令和5年10月改定表による照合と、
  // 令和5年12月末現在の就学奨励費専用早見表の掲載抜粋（原表の各費目）を分けて示す。
  protectionTable:"https://jsite.mhlw.go.jp/niigata-roudoukyoku/content/contents/R070808_2_1ST_senmon_h07.pdf",
  // 委員会の算定資料でも給食月額4,207/4,953円を確認（別制度のため同資料から他の値は取らない）。
  schoolLunchCrossCheck:"https://www.chuo-tky.ed.jp/~usami-es/index.cfm/105%2C2586%2Cc%2Chtml/2586/20250123-190515.pdf",
  rateTable:SOURCE_TABLE,
  sections:Object.freeze({firstClass:SOURCE_TABLE+"FirstAid.png",diminishingRate:SOURCE_TABLE+"DiminishingRate.png",
    yearEnd:SOURCE_TABLE+"TermEndAid.png",secondAndWinter:SOURCE_TABLE+"WinterAid.png",school:SOURCE_TABLE+"SecondAid.png",
    schoolAddition:SOURCE_TABLE+"HandicappedAndMaternalChildAid.png",housing:SOURCE_TABLE+"HouseAid.png"}),
});

// 船橋市・1級地-2、千葉県・冬季VI区。表の冬季加算・期末一時扶助は既に月額換算済み。
// 2人の親と子1〜3人に限定。各列の順序は世帯員3,4,5人。
const RATES = Object.freeze({
  firstChild:[43240,45060,47790], firstAdult:45520, ratePercent:[75,66,59],
  second:[44730,48900,49180], winter:[1767,1908,1963], yearEnd:[1893,2129,2219],
  primaryBase:2600, middleBase:5100, primaryLunch:4207, middleLunch:4953, schoolAddition:26810, housing:13000,
});

/** 前年末の月需要額を、両親45歳＋子1～3人・船橋市の在宅通学生モデルについて測定する。
 * 子の入力年齢を4月1日現在とし、全員が前年末から4月1日までに誕生日を迎えない設定。
 * 進級は通常どおり、転学なし。小学部相当児(6～11歳)のうち少なくとも1人が特別支援学校に
 * 通うとした参考境界。きょうだいの学校種を固定せず、障害者控除や特児等級から在学を推定しない。
 * 新小1は前年末は未就学なので加算・教育扶助に含めない。
 * @param {object[]} children 共有設定の子ども（age:0～17歳）
 * @param {object} inputs 指定教材代（年額・世帯計）、前年度の対象通学費（年額・世帯計）、
 * 一意に定まらない場合は前年末の障害者加算対象の在籍児童生徒数 previousSpecialPupils。
 * 0円と未入力を区別し、該当者のいない費目だけは入力なしで算入不要とする。
 * @returns {object} 計算可能なら月需要額とその内訳。費目が未確定なら月需要額=null。
 */
export function assessBoundaryEducationNeed(children, inputs={}) {
  if (!Array.isArray(children) || children.length<1 || children.length>3 ||
      !children.every(c=>Number.isInteger(c?.age) && c.age>=0 && c.age<=17)) {
    throw new RangeError("N04のモデル条件は0～17歳の子ども1～3人です。");
  }
  const {fiscalYear,basisDate}=BOUNDARY_EDUCATION_BASIS;
  const ages=children.map(c=>c.age);
  const eligibleAges=ages.filter(a=>a>=6 && a<=11);
  if (!eligibleAges.length) return {applicable:false, monthlyNeedYen:null,missing:[],requiredInputs:[],
    fiscalYear,basisDate,components:null,previousSpecialPupils:null,previousSpecialPupilsRange:null};
  // 前年12月時点の学段。4月に中1(12歳)になる子は前年末には小6、高1(15歳)なら中3。
  const primary=ages.filter(a=>a>=7 && a<=12).length, middle=ages.filter(a=>a>=13 && a<=15).length;
  // 前年在籍が必要なのは、新入学児が候補にいない場合だけ。高校生のきょうだいは
  // 要領Ⅳ(1)の「特別支援学校…の児童生徒」から除かないが、Ⅳ(2)の小・中の教育費は計上しない。
  const min=eligibleAges.includes(6)?0:1, max=ages.filter(a=>a>=7).length;
  const requiredInputs=[],missing=[];
  let previousSpecialPupils=min;
  if(min!==max){
    requiredInputs.push("previousSpecialPupils");
    const n=inputs?.previousSpecialPupils;
    previousSpecialPupils=Number.isInteger(n)&&n>=min&&n<=max?n:null;
    if(previousSpecialPupils===null)missing.push("previousSpecialPupils");
  }
  if(primary+middle)requiredInputs.push("annualMaterialsYen");
  if(primary+middle && previousSpecialPupils!==0)requiredInputs.push("previousAnnualCommuteYen");
  for(const key of requiredInputs){
    if(key!=="previousSpecialPupils" && (!Number.isSafeInteger(inputs?.[key]) || inputs[key]<0))missing.push(key);
  }
  const offset=ages.length-1;
  const firstRaw=2*RATES.firstAdult+ages.reduce((s,a)=>s+RATES.firstChild[a<=5?0:a<=11?1:2],0);
  const components={
    // 10円未満切上げ。百分率を整数のまま掛けて二進小数による余分な切上げを避ける。
    firstClassYen:Math.ceil(firstRaw*RATES.ratePercent[offset]/1000)*10,
    secondClassYen:RATES.second[offset],winterYen:RATES.winter[offset],yearEndYen:RATES.yearEnd[offset],
    monthlyDisabilityAdditionYen:previousSpecialPupils===null?null:previousSpecialPupils*RATES.schoolAddition,
    schoolBaseYen:primary*RATES.primaryBase+middle*RATES.middleBase,
    schoolLunchYen:primary*RATES.primaryLunch+middle*RATES.middleLunch,housingYen:RATES.housing,
    materialsYen:!primary&&!middle?0:missing.includes("annualMaterialsYen")?null:inputs.annualMaterialsYen/12,
    commuteYen:!requiredInputs.includes("previousAnnualCommuteYen")?0:
      missing.includes("previousAnnualCommuteYen")?null:inputs.previousAnnualCommuteYen/12,
  };
  // 測定要領が年額の1/12とする実費は中間丸めをせず、境界判定にも表示用の丸めを渡さない。
  return {applicable:true,monthlyNeedYen:missing.length?null:Object.values(components).reduce((a,b)=>a+b,0),
    missing,requiredInputs,fiscalYear,basisDate,components,primary,middle,previousSpecialPupils,
    previousSpecialPupilsRange:{min,max}};
}
