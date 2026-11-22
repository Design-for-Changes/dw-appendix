// 考察用：特別支援学校小学部の通常の支弁区分だけを扱う。N04の費目、給付額、
// 教育支出、年度別需要額の推計は計算しない。第3区分＝全費目不支給ではない。
export const PAPER_EDUCATION_ASSESSMENT_BASIS = Object.freeze({
  scope: "special-school-elementary-ordinary",
  order: "https://laws.e-gov.go.jp/law/329CO0000000157#Mp-At_2",
  measurement: "https://www.dokyoi.pref.hokkaido.lg.jp/fs/1/2/2/3/8/2/6/4/_/特別支援学校への就学奨励に関する法律施行令第2条の規定に基づく保護者等の属する世帯の収入額及び需要額の測定要領.pdf",
  workedExamples: "https://www.pref.saitama.lg.jp/documents/27010/sibenkubun.pdf",
});

// 埼玉県教委資料の読み取り値。同じ世帯の所得条件を変えた例で、給与収入の3例でも、
// 本稿の船橋市3ケースでもない。PDFに適用年度の記載がないため、掲載日から推定しない。
export const PAPER_EDUCATION_PUBLISHED_EXAMPLES = Object.freeze({
  title:"埼玉県教育委員会「支弁区分について」：同一世帯の所得条件を変えた3例",
  householdLabel:"さいたま市。父40歳・母37歳・特別支援学校在籍の子7歳・妹5歳（前年12月31日時点）。",
  yearLabel:"資料に適用年度の記載なし。",
  sourceUrl:PAPER_EDUCATION_ASSESSMENT_BASIS.workedExamples,
  sourcePageUrl:"https://www.pref.saitama.lg.jp/f2212/904-20091216-84.html",
  measuredMonthlyNeedYen:229089,
  rows:Object.freeze([
    Object.freeze({annualIncomeYen:4000000,annualDeductionYen:900000,measuredMonthlyIncomeYen:258333,classification:"第1区分"}),
    Object.freeze({annualIncomeYen:6000000,annualDeductionYen:1200000,measuredMonthlyIncomeYen:400000,classification:"第2区分"}),
    Object.freeze({annualIncomeYen:9000000,annualDeductionYen:1400000,measuredMonthlyIncomeYen:633333,classification:"第3区分"}),
  ]),
});

/**
 * 政令第2条の通常判定。給与総額、手取り、税の課税所得は入力ではない。
 * 測定要領Ⅲ・Ⅴ：当該年度の住民税の基礎となった各人の所得から所定の控除だけを
 * 差し引いて月換算し、世帯員分を合算した「収入額」が必要。Ⅳ：前年12月末の世帯構成と
 * 基準に基づいて測定した生活・教育・住宅扶助の合計が「需要額」。代表住宅費で代用しない。
 * このモデルは在宅通学の特別支援学校小学部かつ比率で通常判定する世帯に限る。
 * 未就学、特別支援学級への在籍、要保護・施設入所等のみなし、家計急変時等に外挿しない。
 * @param {object|null} measurement 同一の世帯・判定年度・給与点の scope と制度所定の measuredMonthlyIncomeYen、measuredMonthlyNeedYen（いずれも円/月）。
 * @returns {string|null} 第1～第3区分。適用条件・二つの測定額が揃わなければnull。金額は返さない。
 */
export function assessPaperEducationClass(measurement) {
  if (measurement?.scope !== PAPER_EDUCATION_ASSESSMENT_BASIS.scope) return null;
  const {measuredMonthlyIncomeYen: income, measuredMonthlyNeedYen: need} = measurement;
  if (!Number.isFinite(income) || income < 0 || !Number.isFinite(need) || need <= 0) return null;
  // 倍率を表示用に丸めずに比較する。1.5倍に一致なら第2、2.5倍に一致なら第3。
  return income < need * 1.5 ? "第1区分" : income < need * 2.5 ? "第2区分" : "第3区分";
}

/**
 * 1万円給与グリッドに対応するN04の測定資料を外部から渡す。座標は資料の照合キーであって、
 * 給与収入自体をN04の収入額として流用しない。既存educationAidの給付額・初期値を呼ばない。
 * @param {Function} readMeasurement (point,{headWan,spouseWan})から同一点の測定資料またはnullを返す任意の関数。未指定は全点未判定。
 * @returns {object} scanPaperChangePointsのassessorsへ渡す{id,label,assess}。収支・判定元データを変更しない。
 */
export function createPaperEducationAssessor(readMeasurement) {
  if (readMeasurement !== undefined && typeof readMeasurement !== "function") throw new TypeError("N04の測定資料を取得する関数を指定してください。");
  return {
    id:"N04", label:"特別支援教育就学奨励費：特別支援学校小学部の支弁区分（考察用）",
    assess:(point, coordinates)=>point?.status === "calculated" && readMeasurement
      ? assessPaperEducationClass(readMeasurement(point,coordinates)) : null,
  };
}
