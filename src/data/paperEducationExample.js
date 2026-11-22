import {
  calcN04ExpenseSupport, ceilToTenYen, n04AmountForAge, n04VerifiedSizeValue,
  N04_EXPENSE_SOURCE_R8, N04_INCOME_NEED_SOURCE, N04_LIVELIHOOD_SOURCE,
  N04_NEED_R7, N04_SUPPLIES_LIMIT_R8,
} from '../calc/educationAid.js';

export const PAPER_EDUCATION_SOURCES = Object.freeze([
  { title: '収入額・需要額の測定要領（Ⅲ1、Ⅳ2）', url: N04_INCOME_NEED_SOURCE.url },
  { title: '千葉県：船橋市の級地、令和7年10月以降の生活扶助第1類・第2類', url: N04_LIVELIHOOD_SOURCE.url },
  { title: '埼玉県教育委員会：施行令第2条の支弁区分と世帯例（さいたま市の需要額は流用しない）', url: 'https://www.pref.saitama.lg.jp/documents/27010/sibenkubun.pdf' },
  { title: '千葉県教育委員会：支給対象経費と学校区分・学部別の扱い', url: 'https://www.pref.chiba.lg.jp/kyouiku/zaimu/tetsuzuki/syoureihi.html' },
  { title: '令和8年度・特別支援学校小学部「学用品・通学用品購入費」区分別支給上限', url: N04_EXPENSE_SOURCE_R8.url },
]);

/**
 * 給与のみの特定のモデル世帯について、需要額の総額を仮置きせず、「確実にI区分」といえる十分条件を検証する。
 * これは全給与範囲の制度判定でも、受給額の平均・典型値でもない。前年末年齢45・45・10・8歳、
 * 船橋市（1級地-2）、在宅、対象児は特別支援学校小学部・通学生、申請済み、他制度による重複支給なし。
 * 対象児数は手帳等級から推定せず、在学条件を別途設定する。費目は通常の学用品・通学用品だけ。
 * @param {object} options 前年給与収入（円/年）、対象児数（1又は2）、1人分の仮想対象実費（円/年）。
 * @returns {object} 需要額の下限、十分条件による判定、区分を所与とした費目試算（世帯円/年）。
 */
export function buildPaperEducationExample({
  recipientCount = 1, headSalaryYen = 2000000, spouseSalaryYen = 1000000,
  expensePerChildYen = N04_SUPPLIES_LIMIT_R8.first,
} = {}) {
  if (![1, 2].includes(recipientCount)) throw new RangeError('この4人世帯例の対象児数は1人又は2人');
  if ([headSalaryYen, spouseSalaryYen, expensePerChildYen].some((v) => !Number.isSafeInteger(v) || v < 0)) {
    throw new RangeError('給与収入・対象実費は0以上の整数円で指定');
  }
  const memberAges = [45, 45, 10, 8];
  const size = memberAges.length;
  const firstClassYen = ceilToTenYen(memberAges.reduce((s, a) => s + n04AmountForAge(a), 0) *
    n04VerifiedSizeValue(N04_NEED_R7.diminishingRateBySize, size));
  const secondClassYen = n04VerifiedSizeValue(N04_NEED_R7.secondClassBySizeYen, size);
  // 教材、前年度国予算の給食単価、通学費、住宅費、加算等は未確定。いずれも足し上げるので、
  // 第1類＋第2類は需要額の下限となる。未確定要素をゼロと見なして需要額そのものを返してはいけない。
  const monthlyNeedFloorYen = firstClassYen + secondClassYen;
  const annualFirstThresholdFloorYen = monthlyNeedFloorYen * 12 * 1.5;
  const annualSalarySumYen = headSalaryYen + spouseSalaryYen;
  // 給与以外に算定対象所得がないケースでは、所定の控除後の収入額（年換算）は額面給与合計を超えない。
  // この上側評価がI→II境界の下側評価「未満」ならI。満たさないときは他区分と断定できない。
  const firstClassGuaranteed = annualSalarySumYen < annualFirstThresholdFloorYen;
  const profile = { fiscalYear: 2026, schoolType: 'special-needs-school', department: 'elementary', enrollment: 'day',
    expenses: [{ id: 'school-supplies', annualExpenseYen: expensePerChildYen }] };
  const householdExpenseYen = expensePerChildYen * recipientCount;
  const rows = ['第1区分', '第2区分', '第3区分'].map((supportClass) => {
    const perChild = calcN04ExpenseSupport(profile, supportClass);
    const householdAidYen = perChild.annualSupportYen * recipientCount;
    return { supportClass, householdExpenseYen, householdAidYen, householdNetExpenseYen: householdExpenseYen - householdAidYen };
  });
  return { fiscalYear: 2026, basisDate: '2025-12-31', memberAges, recipientCount,
    headSalaryYen, spouseSalaryYen, annualSalarySumYen, expensePerChildYen,
    firstClassYen, secondClassYen, monthlyNeedFloorYen, annualFirstThresholdFloorYen,
    firstClassGuaranteed, guaranteedSupportClass: firstClassGuaranteed ? '第1区分' : null,
    actualMonthlyNeedYen: null, actualAnnualThresholdYen: null, rows };
}
