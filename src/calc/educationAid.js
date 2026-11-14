import { toNumber } from "./numeric.js";

export const N04_SHOGAKU_ANNUAL_YEN = { first: 72945, second: 36473, third: 0 };

export const N04_INCOME_NEED_SOURCE = {
  title: "特別支援教育就学奨励費に係る収入額・需要額の測定要領",
  url: "https://www.dokyoi.pref.hokkaido.lg.jp/fs/9/7/1/2/4/0/4/_/R7%20%E5%8F%8E%E5%85%A5%E9%A1%8D%E3%83%BB%E9%9C%80%E8%A6%81%E9%A1%8D%E3%81%AE%E6%B8%AC%E5%AE%9A%E8%A6%81%E9%A0%98.pdf",
  archivePath: "./sources/n04-income-and-need-measurement-guideline.pdf",
  section: "収入額・需要額の算定、1.5倍・2.5倍による支弁区分",
};

export const N04_LIVELIHOOD_SOURCE = {
  title: "千葉県 生活保護の基準（令和7年10月1日以降）",
  url: "https://www.pref.chiba.lg.jp/kenshidou/shien/book/seikatsuhogo.html",
  archivePath: "./sources/chiba-r7-livelihood-standards.png",
  section: "1級地-2の生活扶助・教育扶助・各種加算",
};

export const N04_FUNABASHI_SOURCE = {
  title: "船橋市 特別支援教育就学奨励制度（令和8年度）",
  url: "https://www.city.funabashi.lg.jp/kodomo/teate/005/p1008696.html",
  archivePath: "./sources/funabashi-r8-special-education-aid.png",
  section: "支弁区分の決定・支給内容",
};

export const N04_NEED_R7 = {
  firstClassByAgeYen: [
    [2, 43240],
    [5, 43240],
    [11, 45060],
    [17, 47790],
    [19, 45520],
    [40, 45520],
    [59, 45520],
    [64, 45520],
    [69, 45060],
    [74, 45060],
    [Infinity, 38690],
  ],
  diminishingRateBySize: { 1: 1, 2: 0.87, 3: 0.75, 4: 0.66, 5: 0.59, 6: 0.58, 7: 0.55, 8: 0.52, 9: 0.5 },
  secondClassBySizeYen: { 1: 27790, 2: 38060, 3: 44730, 4: 48900, 5: 49180, 6: 55650, 7: 58920, 8: 61910, 9: 64670 },
  winterBySizeYen: { 1: 2630, 2: 3730, 3: 4240, 4: 4580, 5: 4710, 6: 5010, 7: 5220, 8: 5380, 9: 5560 },
  yearEndBySizeYen: { 3: 23270, 4: 26170 },
  temporaryPerPersonYen: 1500,
  disabilitySpecialYen: 26810,
  disabilityOrdinaryYen: 17870,
  childUpbringingYen: 10190,
  elementaryEducationYen: 3400,
  housingYen: 56000,
};

/**
 * 年齢帯に対応する生活扶助第1類の月額を取得する。
 * @remarks N04 需要額。単位: 円/月。式・境界条件・丸めは移動前の実装を維持。
 * @param {number} age 年齢（歳）
 * @returns {*} number。単位: 円/月
 */
export function n04AmountForAge(age) {
  const a = Math.max(0, toNumber(age, 0));
  return N04_NEED_R7.firstClassByAgeYen.find(([upper]) => a <= upper)?.[1] || 0;
}

/**
 * 世帯人数別の需要額要素を取得し、9人超は9人値を使う。
 * @remarks N04 需要額。単位: 入力表により円/月または率。式・境界条件・丸めは移動前の実装を維持。
 * @param {*} table 判定対象・区分または補助値（呼出側の定義に従う）
 * @param {*} size 判定対象・区分または補助値（呼出側の定義に従う）
 * @returns {*} number。単位: 入力表により円/月または率
 */
export function n04BySize(table, size) {
  const n = Math.max(1, Math.trunc(toNumber(size, 1)));
  if (n <= 9) return toNumber(table[n], 0);
  return toNumber(table[9], 0);
}

/**
 * 需要額の指定要素を10円単位で切り上げる。
 * @remarks N04 端数処理。単位: 円。式・境界条件・丸めは移動前の実装を維持。
 * @param {*} value 判定対象・区分または補助値（呼出側の定義に従う）
 * @returns {*} number。単位: 円
 */
export function ceilToTenYen(value) {
  return Math.ceil(toNumber(value, 0) / 10) * 10;
}

/**
 * 生活保護基準に基づく需要額と世帯所得比から就学奨励費の支弁区分と年額を求める。
 * @remarks N04 就学奨励費。単位: 需要額=円/月、所得/給付=万円/年。ratio<1.5/<2.5。式・境界条件・丸めは移動前の実装を維持。
 * @param {object} ctx 世帯・制度設定または計算条件
 * @param {Array} rows 計算行・系列または設定行の配列
 * @returns {*} 判定・需要額内訳・年額・出典。単位: 需要額=円/月、所得/給付=万円/年。ratio<1.5/<2.5
 */
export function calcN04Detail(ctx, rows) {
  const salaryManyen = toNumber(rows?.find((r) => r.who === "世帯主")?.salaryWan, 0);
  if (!ctx.programs?.n04) {
    return {
      enabled: false,
      status: "対象外",
      salaryManyen: toNumber(salaryManyen, 0),
      supportClass: "対象外",
      annualWan: 0,
      educationCostReliefWan: 0,
      educationCostBurdenWan: 0,
      confidence: "provisional",
    };
  }
  const x = salaryManyen;
  const count = Math.max(1, Math.trunc(toNumber(ctx.programs?.n04Count, 1)));
  const householdRows = (Array.isArray(rows) ? rows : []).filter((row) =>
    ["世帯主", "配偶者"].includes(row.who) || String(row.who).startsWith("子ども")
  );
  const householdSize = householdRows.length;
  const totalIncomeWan = householdRows.reduce((sum, row) => sum + toNumber(row.totalIncomeWan, 0), 0);
  const socialDeductionWan = householdRows.reduce((sum, row) => sum + toNumber(row.socialWan, 0), 0);
  const allowedDeductionWan = socialDeductionWan;
  const annualMeasuredIncomeWan = Math.max(0, totalIncomeWan - allowedDeductionWan);
  const monthlyMeasuredIncomeYen = (annualMeasuredIncomeWan * 10000) / 12;

  const firstClassRawYen = householdRows.reduce((sum, row) => sum + n04AmountForAge(row.age), 0);
  const diminishingRate = n04BySize(N04_NEED_R7.diminishingRateBySize, householdSize);
  const firstClassAdjustedYen = ceilToTenYen(firstClassRawYen * diminishingRate);
  const secondClassYen = n04BySize(N04_NEED_R7.secondClassBySizeYen, householdSize);
  const temporaryAdditionYen = N04_NEED_R7.temporaryPerPersonYen * householdSize;
  const winterAnnualizedYen = n04BySize(N04_NEED_R7.winterBySizeYen, householdSize) * 5 / 12;
  const yearEndAnnualizedYen = n04BySize(N04_NEED_R7.yearEndBySizeYen, householdSize) / 12;
  const specialDisabledCount = householdRows.filter((row) => row.tccaSpecial).length;
  const ordinaryDisabledCount = householdRows.filter((row) => row.disabled && !row.tccaSpecial).length;
  const disabilityAdditionYen =
    specialDisabledCount * N04_NEED_R7.disabilitySpecialYen +
    ordinaryDisabledCount * N04_NEED_R7.disabilityOrdinaryYen;
  const childUpbringingCount = householdRows.filter((row) => toNumber(row.age, 0) < 18).length;
  const childUpbringingAdditionYen = childUpbringingCount * N04_NEED_R7.childUpbringingYen;
  const educationAssistanceYen = N04_NEED_R7.elementaryEducationYen * count;
  const housingAssistanceYen = toNumber(ctx.programs?.n04HousingYen, N04_NEED_R7.housingYen);
  const monthlyNeedYen =
    firstClassAdjustedYen +
    secondClassYen +
    temporaryAdditionYen +
    winterAnnualizedYen +
    yearEndAnnualizedYen +
    disabilityAdditionYen +
    childUpbringingAdditionYen +
    educationAssistanceYen +
    housingAssistanceYen;
  const ratio = monthlyNeedYen > 0 ? monthlyMeasuredIncomeYen / monthlyNeedYen : Infinity;
  const supportClass = ratio < 1.5 ? "第1区分" : ratio < 2.5 ? "第2区分" : "第3区分";
  const annualYenPerRecipient =
    supportClass === "第1区分"
      ? N04_SHOGAKU_ANNUAL_YEN.first
      : supportClass === "第2区分"
        ? N04_SHOGAKU_ANNUAL_YEN.second
        : N04_SHOGAKU_ANNUAL_YEN.third;
  return {
    enabled: true,
    status: supportClass,
    salaryManyen: x,
    supportClass,
    count,
    annualYenPerRecipient,
    annualWan: (annualYenPerRecipient * count) / 10000,
    educationCostReliefWan: (annualYenPerRecipient * count) / 10000,
    educationCostBurdenWan: 0,
    judgment: {
      salaryManyen: x,
      householdSize,
      totalIncomeWan,
      deductions: [
        { label: "社会保険料控除", wan: socialDeductionWan },
        { label: "生命保険料控除等", wan: 0 },
      ],
      deductionSumWan: allowedDeductionWan,
      annualMeasuredIncomeWan,
      monthlyMeasuredIncomeYen,
      monthlyNeedYen,
      ratio,
      firstThresholdYen: monthlyNeedYen * 1.5,
      secondThresholdYen: monthlyNeedYen * 2.5,
      supportClass,
      formula: "月額収入額 ÷ 月額需要額（1.5未満=第1、2.5未満=第2、それ以上=第3）",
      source: N04_INCOME_NEED_SOURCE,
    },
    need: {
      firstClassRawYen,
      diminishingRate,
      firstClassAdjustedYen,
      secondClassYen,
      temporaryAdditionYen,
      winterAnnualizedYen,
      yearEndAnnualizedYen,
      specialDisabledCount,
      ordinaryDisabledCount,
      disabilityAdditionYen,
      childUpbringingCount,
      childUpbringingAdditionYen,
      educationAssistanceYen,
      housingAssistanceYen,
      monthlyNeedYen,
      formulas: {
        firstClass: `${Math.round(firstClassRawYen).toLocaleString("ja-JP")}円 × ${diminishingRate}`,
        secondClass: `${Math.round(secondClassYen).toLocaleString("ja-JP")}円`,
        temporary: `${N04_NEED_R7.temporaryPerPersonYen.toLocaleString("ja-JP")}円 × ${householdSize}人`,
        winter: `${Math.round(n04BySize(N04_NEED_R7.winterBySizeYen, householdSize)).toLocaleString("ja-JP")}円 × 5か月 ÷ 12`,
        yearEnd: `${Math.round(n04BySize(N04_NEED_R7.yearEndBySizeYen, householdSize)).toLocaleString("ja-JP")}円 ÷ 12`,
        disability: `${specialDisabledCount}人 × ${N04_NEED_R7.disabilitySpecialYen.toLocaleString("ja-JP")}円 ＋ ${ordinaryDisabledCount}人 × ${N04_NEED_R7.disabilityOrdinaryYen.toLocaleString("ja-JP")}円`,
        childUpbringing: `${childUpbringingCount}人 × ${N04_NEED_R7.childUpbringingYen.toLocaleString("ja-JP")}円`,
        education: `${count}人 × ${N04_NEED_R7.elementaryEducationYen.toLocaleString("ja-JP")}円`,
        housing: `${Math.round(housingAssistanceYen).toLocaleString("ja-JP")}円（モデル入力）`,
        total: "N4a ＋ N4b ＋ N4c ＋ N4d ＋ N4e ＋ N4f ＋ N4g ＋ N4h ＋ N4i",
      },
      formula: "第1類×逓減率 + 第2類 + 臨時加算 + 冬季加算年平均 + 期末一時扶助月割 + 障害者加算 + 児童養育加算 + 教育扶助 + 住宅扶助",
      livelihoodSource: N04_LIVELIHOOD_SOURCE,
      localSource: N04_FUNABASHI_SOURCE,
      housingConfidence: "provisional",
      housingNote: "住宅扶助は船橋市3人以上の公開上限56,000円をモデル入力として使用",
    },
    amountFormula: {
      annualYenPerRecipient,
      count,
      annualWan: (annualYenPerRecipient * count) / 10000,
      educationCostReliefWan: (annualYenPerRecipient * count) / 10000,
      formula: "区分別補助単価 × 対象人数 = 高所得側0基準の教育費負担軽減",
      source: N04_FUNABASHI_SOURCE,
    },
    needAmountWan: monthlyNeedYen / 10000,
    ratio,
    confidence: "provisional",
  };
}
