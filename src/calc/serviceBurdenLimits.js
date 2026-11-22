export const MAX_SERVICE_YEN = 37200;

/** 年度当初3～5歳の対象通所は、世帯上限を適用する前に利用者負担から除く。 */
export const isFreeDayServiceAge = age => age >= 3 && age <= 5;

/**
 * 通所判定用の市町村民税所得割から、旧年少・特定扶養控除相当税額を差し引く。
 * @remarks 児童福祉法施行規則第18条の3の2。単位: 円/年。16歳未満19,800円、16～18歳7,200円。税の徴収額そのものは変更しない。
 */
export function calcServiceAssessmentLevyYen(municipalIncomeLevyYen, dependentAges) {
  const reliefYen = dependentAges.reduce((sum, age) => sum + (age < 16 ? 19800 : age < 19 ? 7200 : 0), 0);
  return Math.max(0, Math.round(municipalIncomeLevyYen) - reliefYen);
}

/**
 * 障害児通所支援の世帯課税状況と判定用所得割から月額上限を選ぶ。
 * @remarks 単位: 円/月。28万円未満は一般1、28万円以上は一般2。所得割0円だけでは住民税非課税と判断しない。
 */
export function getChildDayServiceCapYen(assessmentLevyYen, householdTaxable) {
  if (!householdTaxable) return 0;
  return assessmentLevyYen < 280000 ? 4600 : MAX_SERVICE_YEN;
}
