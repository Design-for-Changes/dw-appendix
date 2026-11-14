import { CALCULATION_SOURCES } from "./calculationSources.js";
import { toNumber, roundWan, compactDeductions } from "./numeric.js";
import { buildHousehold, createContext, buildRows } from "./household.js";
import { calcDependentDeductionFromRows, calcSpecialKinDeductionFromRows, calcSpouseDeductionFromRows, calcSpouseSpecialDeductionFromRows, calcWidowSingleParent, getDisabilityDeductionForTaxpayerWan, getTaxable } from "./deductions.js";
import { getIncomeTaxParts, getResidentTaxParts } from "./taxes.js";
import { calcBasicDisabilityPensionYenFor, calcTccaComputedLocal, calcWelfareAllowanceLimitSelfYen, calcWelfareAllowanceLimitObligorYen } from "./allowances.js";
import { calcM01Detail } from "./medicalAid.js";
import { calcN04Detail } from "./educationAid.js";

export { CALCULATION_SOURCES };
export { buildHousehold } from "./household.js";
export { calculateSocialInsuranceComponents } from "./socialInsurance.js";
export { M01_KENSHIN_ANNUAL_YEN_DEFAULT, M01_KENSHIN_ANNUAL_YEN_RANGE, M01_LEVY_CUTOFF_YEN, M01_INCOME_LIMIT_SOURCE } from "./medicalAid.js";
export { N04_SHOGAKU_ANNUAL_YEN, N04_INCOME_NEED_SOURCE, N04_LIVELIHOOD_SOURCE, N04_FUNABASHI_SOURCE } from "./educationAid.js";

const DEFAULT_SWEEP = { min: 1, max: 1500, step: 1 };
export const RAW_TSUSHO_CHILD_MONTHLY_YEN = 10406;

/**
 * 世帯条件を固定し、世帯主の給与収入を指定刻みで変化させて全返値を求める。
 * @remarks 統合。単位: 給与・年間収支は万円。式・境界条件・丸めは移動前の実装を維持。
 * @param {object} options 世帯・年度・入力表・給与掃引範囲
 * @param {object} options.household 正規化前または正規化済みの世帯条件
 * @param {string} [options.scenario="s2"] 年度キーまたは旧別名
 * @param {object} options.tables 給与所得控除・基礎控除の表と制度設定
 * @param {object} [options.sweep] min/max/step（給与収入、万円/年）
 * @returns {*} Point配列。単位: 給与・年間収支は万円
 */
export function computeSeries({ household, scenario = "s2", tables, sweep } = {}) {
  const normalized = buildHousehold(household || {});
  const ctx = createContext({ household: normalized, scenario, tables });
  const range = { ...DEFAULT_SWEEP, ...(sweep || {}) };
  const min = toNumber(range.min, DEFAULT_SWEEP.min);
  const max = toNumber(range.max, DEFAULT_SWEEP.max);
  const step = Math.max(1, toNumber(range.step, DEFAULT_SWEEP.step));
  const out = [];
  for (let x = min; x <= max; x += step) out.push(computePoint(ctx, x));
  return out;
}

/**
 * 各制度を同じ給与点に適用し、世帯収支と計算過程の詳細を集計する。
 * @remarks 制度横断統合。単位: 原則万円/年。Yen付き詳細は円、支給月額は円/月。式・境界条件・丸めは移動前の実装を維持。
 * @param {object} ctx 世帯・制度設定または計算条件
 * @param {number} x 世帯主の給与収入（万円/年）
 * @returns {*} Pointオブジェクト。単位: 原則万円/年。Yen付き詳細は円、支給月額は円/月
 */
function computePoint(ctx, x) {
  const rows = buildRows(ctx, x);
  const dep = calcDependentDeductionFromRows(ctx, rows);
  const kin = calcSpecialKinDeductionFromRows(ctx, rows);
  const spIT = calcSpouseDeductionFromRows(ctx, ctx.spouseDeductionITCfg, rows);
  const spLT = calcSpouseDeductionFromRows(ctx, ctx.spouseDeductionLTCfg, rows);
  const spSpIT = calcSpouseSpecialDeductionFromRows(ctx, ctx.spouseSpecialDeductionITCfg, spIT, rows);
  const spSpLT = calcSpouseSpecialDeductionFromRows(ctx, ctx.spouseSpecialDeductionLTCfg, spLT, rows);
  const ws = calcWidowSingleParent(ctx, rows);

  const headRow = rows.find((r) => r.who === "世帯主");
  const headDedCommonIT =
    toNumber(ws.widow.itWan, 0) +
    toNumber(ws.singleParent.itWan, 0) +
    (Boolean(headRow?.workingStudent) ? ctx.wsAmtIT : 0) +
    toNumber(headRow?.otherDedWan, 0) +
    toNumber(spIT, 0) +
    toNumber(spSpIT, 0) +
    toNumber(dep.itWan, 0);
  const headDedCommonLT =
    toNumber(ws.widow.ltWan, 0) +
    toNumber(ws.singleParent.ltWan, 0) +
    (Boolean(headRow?.workingStudent) ? ctx.wsAmtLT : 0) +
    toNumber(headRow?.otherDedWan, 0) +
    toNumber(spLT, 0) +
    toNumber(spSpLT, 0) +
    toNumber(dep.ltWan, 0);
  const headDedCommonITWithKin = headDedCommonIT + toNumber(kin.itWan, 0);
  const headDedCommonLTWithKin = headDedCommonLT + toNumber(kin.ltWan, 0);

  let socialWanTotal = 0;
  let taxWanTotal = 0;
  const levyByWho = new Map();
  const taxByWho = [];
  const byWho = new Map(rows.map((r) => [String(r.who), r]));
  for (const r of rows) {
    socialWanTotal += toNumber(r.socialWan, 0);
    const taxableIT = getTaxable(ctx, r, "it", rows, headDedCommonITWithKin);
    const taxableLT = getTaxable(ctx, r, "lt", rows, headDedCommonLTWithKin);
    const incomeTax = getIncomeTaxParts(taxableIT);
    const taxIT = incomeTax.taxWan;
    const residentTax = getResidentTaxParts(taxableLT);
    const taxLT = residentTax.totalWan;
    const residentIncomeLevyWan = residentTax.municipalIncomeLevyWan;
    const residentPerCapitaWan = residentTax.perCapitaWan;
    taxWanTotal += toNumber(taxIT, 0) + toNumber(taxLT, 0);
    levyByWho.set(String(r.who), {
      who: String(r.who),
      age: toNumber(r.age, 0),
      levyWan: residentIncomeLevyWan,
    });
    taxByWho.push({
      who: String(r.who),
      age: toNumber(r.age, 0),
      incomeTax: {
        taxableWan: incomeTax.taxableWan,
        taxableYen: incomeTax.taxableYen,
        rate: incomeTax.rate,
        quickDeductionYen: incomeTax.deductionYen,
        rawTaxYen: incomeTax.rawTaxYen,
        taxYen: incomeTax.taxYen,
        taxWan: toNumber(taxIT, 0),
        formula: `${incomeTax.taxableYen.toLocaleString("ja-JP")}円 × ${roundWan(incomeTax.rate * 100, 2)}% − ${incomeTax.deductionYen.toLocaleString("ja-JP")}円`,
        source: CALCULATION_SOURCES.incomeTax,
      },
      residentTax: {
        taxableWan: residentTax.taxableWan,
        taxableYen: residentTax.taxableYen,
        computedTaxWan: toNumber(taxLT, 0),
        incomeLevyWan: residentIncomeLevyWan,
        incomeLevyYen: residentTax.incomeLevyYen,
        perCapitaWan: residentPerCapitaWan,
        perCapitaYen: residentTax.perCapitaYen,
        rate: residentTax.rate,
        rawIncomeLevyYen: residentTax.rawIncomeLevyYen,
        adjustmentDeductionWan: residentTax.adjustmentDeductionWan,
        adjustmentDeductionYen: residentTax.adjustmentDeductionYen,
        municipalIncomeLevyWan: residentTax.municipalIncomeLevyWan,
        municipalIncomeLevyYen: residentTax.municipalIncomeLevyYen,
        prefecturalIncomeLevyWan: residentTax.prefecturalIncomeLevyWan,
        prefecturalIncomeLevyYen: residentTax.prefecturalIncomeLevyYen,
        formula: `${residentTax.taxableYen.toLocaleString("ja-JP")}円 × 10% − ${residentTax.adjustmentDeductionYen.toLocaleString("ja-JP")}円 ＋ ${residentTax.perCapitaYen.toLocaleString("ja-JP")}円`,
        source: CALCULATION_SOURCES.residentTax,
      },
      deductions: {
        basicITWan: toNumber(r.basicITWan, 0),
        basicLTWan: toNumber(r.basicLTWan, 0),
        basicITDetail: r.basicDeductionDetail?.incomeTax || null,
        basicLTDetail: r.basicDeductionDetail?.residentTax || null,
        socialWan: toNumber(r.socialWan, 0),
        workingStudentITWan: Boolean(r.workingStudent) ? ctx.wsAmtIT : 0,
        workingStudentLTWan: Boolean(r.workingStudent) ? ctx.wsAmtLT : 0,
        disabilityITWan: getDisabilityDeductionForTaxpayerWan(ctx, r, "it", rows),
        disabilityLTWan: getDisabilityDeductionForTaxpayerWan(ctx, r, "lt", rows),
        commonITWan: String(r.who) === "世帯主" ? headDedCommonITWithKin : 0,
        commonLTWan: String(r.who) === "世帯主" ? headDedCommonLTWithKin : 0,
      },
    });
  }

  const householdLevySumWan = Array.from(levyByWho.values()).reduce((a, v) => a + toNumber(v.levyWan, 0), 0);
/**
   * 利用者の年齢と続柄に応じた所得割の判定範囲を合算する。
   * @remarks 通所・福祉サービス。単位: 万円/年。式・境界条件・丸めは移動前の実装を維持。
   * @param {*} who 判定対象・区分または補助値（呼出側の定義に従う）
   * @returns {*} number。単位: 万円/年
   */
  const levySumWanFor = (who) => {
    const w = String(who);
    const r = levyByWho.get(w);
    if (!r) return 0;
    const age = toNumber(r.age, 0);
    if (w.startsWith("子ども") && age >= 18) return toNumber(r.levyWan, 0);
    if (age >= 18) {
      if (w === "世帯主") {
        const sp = ctx.spouseEnabled ? toNumber(levyByWho.get("配偶者")?.levyWan, 0) : 0;
        return toNumber(r.levyWan, 0) + sp;
      }
      if (w === "配偶者") {
        const hd = toNumber(levyByWho.get("世帯主")?.levyWan, 0);
        return toNumber(r.levyWan, 0) + hd;
      }
      return toNumber(r.levyWan, 0);
    }
    return householdLevySumWan;
  };
/**
   * 年齢と所得区分から採用月額負担を求め、児童では代表利用料と制度上限の小さい方を使う。
   * @remarks 通所・福祉サービス。単位: 円/月。式・境界条件・丸めは移動前の実装を維持。
   * @param {number} sumLevyWan 万円（年額。補助値は呼出側の定義に従う）
   * @param {number} age 年齢（歳）
   * @returns {*} number。単位: 円/月
   */
  const monthlyFeeYen = (sumLevyWan, age) => {
    const levyYen = Math.max(0, Math.round(toNumber(sumLevyWan, 0) * 10000));
    const a = toNumber(age, 0);
    if (levyYen <= 0) return 0;
    if (a >= 18) return levyYen < 160000 ? 9300 : 37200;
    if (a >= 3 && a <= 5) return 0;
    const upperLimitYen = levyYen < 280000 ? 4600 : 37200;
    return Math.min(RAW_TSUSHO_CHILD_MONTHLY_YEN, upperLimitYen);
  };
/**
   * 年齢と所得割から非課税・無償化・一般1/2を選ぶ。
   * @remarks 通所・福祉サービス。単位: 所得割は万円/年。式・境界条件・丸めは移動前の実装を維持。
   * @param {number} sumLevyWan 万円（年額。補助値は呼出側の定義に従う）
   * @param {number} age 年齢（歳）
   * @returns {*} string。単位: 所得割は万円/年
   */
  const serviceType = (sumLevyWan, age) => {
    const levyYen = Math.max(0, Math.round(toNumber(sumLevyWan, 0) * 10000));
    const a = toNumber(age, 0);
    if (a >= 3 && a <= 5) return "無償化";
    if (levyYen <= 0) return "非課税";
    if (a >= 18) return levyYen < 160000 ? "一般1" : "一般2";
    return levyYen < 280000 ? "一般1" : "一般2";
  };
/**
   * 児童一般2区分で代表利用料を用いる状態を区別する。
   * @remarks 通所・設定属性。単位: 無単位。式・境界条件・丸めは移動前の実装を維持。
   * @param {number} sumLevyWan 万円（年額。補助値は呼出側の定義に従う）
   * @param {number} age 年齢（歳）
   * @returns {*} strictまたはrepresentative。単位: 無単位
   */
  const serviceConfidence = (sumLevyWan, age) => {
    const levyYen = Math.max(0, Math.round(toNumber(sumLevyWan, 0) * 10000));
    const a = toNumber(age, 0);
    if (a < 18 && !(a >= 3 && a <= 5) && levyYen >= 280000) return "representative";
    return "strict";
  };
  let serviceFeeMonthlyYenTotal = 0;
  const serviceFeeDetails = [];
  for (const r of rows) {
    if (!Boolean(byWho.get(String(r.who))?.disabled)) continue;
    const levyWan = levySumWanFor(r.who);
    const monthlyYen = monthlyFeeYen(levyWan, r.age);
    const age = toNumber(r.age, 0);
    const type = serviceType(levyWan, age);
    const confidence = serviceConfidence(levyWan, age);
    serviceFeeMonthlyYenTotal = Math.max(serviceFeeMonthlyYenTotal, monthlyYen);
    serviceFeeDetails.push({
      who: String(r.who),
      age,
      householdLevyWan: levyWan,
      householdLevyYen: Math.max(0, Math.round(toNumber(levyWan, 0) * 10000)),
      type,
      monthlyUpperYen: monthlyYen,
      annualFeeWan: (monthlyYen * 12) / 10000,
      rawMonthlyYen: age < 18 && !(age >= 3 && age <= 5) ? RAW_TSUSHO_CHILD_MONTHLY_YEN : null,
      formula:
        age < 18 && !(age >= 3 && age <= 5)
          ? `min(${RAW_TSUSHO_CHILD_MONTHLY_YEN.toLocaleString("ja-JP")}円, ${type}の制度上限)`
          : `${type}の制度上限`,
      confidence,
      sources: {
        statutory: CALCULATION_SOURCES.serviceBurden,
        representative: CALCULATION_SOURCES.serviceRepresentative,
      },
    });
  }
  const serviceConfidenceOverall = serviceFeeDetails.some((d) => d.confidence === "representative") ? "representative" : "strict";
  const serviceFeeWanTotal = (serviceFeeMonthlyYenTotal * 12) / 10000;

  const basicPensionWan = (() => {
    const headYen = calcBasicDisabilityPensionYenFor(ctx, "世帯主", toNumber(byWho.get("世帯主")?.totalIncomeWan, 0));
    const spouseYen = ctx.spouseEnabled
      ? calcBasicDisabilityPensionYenFor(ctx, "配偶者", toNumber(byWho.get("配偶者")?.totalIncomeWan, 0))
      : 0;
    return (headYen + spouseYen) / 10000;
  })();

  const tcca = calcTccaComputedLocal(ctx, rows, spSpLT);
  const tccaAnnualWan = (toNumber(tcca?.totalMonthlyYen, 0) * 12) / 10000;
  const fuyo = toNumber(tcca?.fuyoCount, 0);
  const legacyFuyo = toNumber(tcca?.legacyFuyoCount ?? tcca?.fuyoCount, 0);

  const WELFARE_CHILD_MONTHLY_YEN = 16560;
  const TOKUBETSU_MONTHLY_YEN = 30450;
  const limitSelfYen = calcWelfareAllowanceLimitSelfYen(0);
  const limitObligorYen = calcWelfareAllowanceLimitObligorYen(fuyo);
  const obligorCols = [rows.find((r) => r.who === "世帯主"), ctx.spouseEnabled ? rows.find((r) => r.who === "配偶者") : null].filter(Boolean);
/**
   * 本人・扶養義務者区分に応じた障害家族の手当用控除額を合算する。
   * @remarks N01-2 控除。単位: 万円。式・境界条件・丸めは移動前の実装を維持。
   * @param {*} col 判定対象・区分または補助値（呼出側の定義に従う）
   * @param {*} mode 判定対象・区分または補助値（呼出側の定義に従う）
   * @returns {*} number。単位: 万円
   */
  const calcWelfareDisabilityDeductionWan = (col, mode) => {
    const who = String(col?.who || "");
    const selfDisWan = toNumber(col?.welfareDisWan, 0);
    const depMaxWan = 58;
/**
     * 世帯員名に対応する所得が58万円以下かを判定する。
     * @remarks N01-2 控除補助。単位: 所得=万円/年。式・境界条件・丸めは移動前の実装を維持。
     * @param {*} w 判定対象・区分または補助値（呼出側の定義に従う）
     * @returns {*} boolean。単位: 所得=万円/年
     */
    const isDepLike = (w) => {
      const rr = rows.find((xx) => String(xx?.who || "") === String(w));
      return rr ? toNumber(rr?.totalIncomeWan, 0) <= depMaxWan : false;
    };
    const depDisWan = (() => {
      if (who !== "世帯主") return 0;
      let sum = 0;
      if (ctx.spouseEnabled && isDepLike("配偶者")) {
        const rr = rows.find((xx) => String(xx?.who || "") === "配偶者");
        if (ctx.spouse.childWelfareAllowance || ctx.spouse.tokubetsuAllowance) sum += toNumber(rr?.welfareDisWan, 0);
      }
      for (const rr of rows) {
        const w = String(rr?.who || "");
        if (!w.startsWith("子ども")) continue;
        if (!isDepLike(w)) continue;
        const idx = Number(w.replace("子ども", "")) - 1;
        const child = ctx.children?.[idx];
        if (!child?.childWelfareAllowance && !child?.tokubetsuAllowance) continue;
        sum += toNumber(rr?.welfareDisWan, 0);
      }
      return sum;
    })();
    if (mode === "obligor") return depDisWan + selfDisWan;
    return depDisWan;
  };
/**
   * 本人と扶養義務者で異なる控除を適用し、福祉手当の判定所得内訳を作る。
   * @remarks N01-2 所得判定。単位: 万円/年と円/年。判定円はMath.round。式・境界条件・丸めは移動前の実装を維持。
   * @param {*} col 判定対象・区分または補助値（呼出側の定義に従う）
   * @param {*} mode 判定対象・区分または補助値（呼出側の定義に従う）
   * @returns {*} 控除・判定所得オブジェクト。単位: 万円/年と円/年。判定円はMath.round
   */
  const calcWelfareAdjustedIncomeDetail = (col, mode = "self") => {
    const totalWan = toNumber(col?.totalIncomeWan, 0);
    const who = String(col?.who || "");
    if (mode === "obligor") {
      const incomeAdjustmentWan = toNumber(col?.incomeAdjWan, 0);
      const allowanceTotalWan = totalWan + incomeAdjustmentWan;
      const employmentIncomeDeductWan = 10;
      const socialFixedWan = 8;
      const disWan = calcWelfareDisabilityDeductionWan(col, mode);
      const deductionsWan = employmentIncomeDeductWan + socialFixedWan + disWan;
      const adjustedWan = Math.max(0, allowanceTotalWan - deductionsWan);
      return {
        who,
        mode,
        totalWan: roundWan(totalWan, 4),
        incomeAdjustmentWan: roundWan(incomeAdjustmentWan, 4),
        allowanceTotalWan: roundWan(allowanceTotalWan, 4),
        deductions: compactDeductions([
          { label: "基礎控除引き上げ相当額(手当10万上限)", wan: employmentIncomeDeductWan, alwaysShow: true },
          { label: "社会保険料控除(手当8万固定)", wan: socialFixedWan, alwaysShow: true },
          { label: "障害者控除", wan: disWan },
        ]),
        deductionSumWan: roundWan(deductionsWan, 4),
        adjustedWan: roundWan(adjustedWan, 4),
        adjustedYen: Math.round(adjustedWan * 10000),
        formula: "総所得(+所得金額調整控除戻し) − 控除合計 = 判定所得",
      };
    }
    const headRow2 = rows.find((rr) => rr.who === "世帯主");
    const headTotalForLimitWan = toNumber(headRow2?.totalIncomeWan, 0);
    const headIncomeOk = headTotalForLimitWan <= 500;
    const otherDedWan = who === "世帯主" ? toNumber(headRow2?.otherDedWan, 0) : 0;
    const spouseSpecialWan = who === "世帯主" ? toNumber(spSpIT, 0) : 0;
    const socialWan = toNumber(col?.socialWan, 0);
    const widowWan =
      who === "世帯主" &&
      headIncomeOk &&
      toNumber(headRow2?.widowWan, 0) &&
      !(ctx.widowDeductionCfg?.requires_no_spouse && ctx.spouseEnabled)
        ? 27
        : 0;
    const singleParentWan =
      who === "世帯主" &&
      headIncomeOk &&
      toNumber(headRow2?.singleParentWan, 0) &&
      !(ctx.singleParentDeductionCfg?.requires_no_spouse && ctx.spouseEnabled)
        ? 35
        : 0;
    const wsWan = Boolean(col?.workingStudent) ? 27 : 0;
    const disWan = calcWelfareDisabilityDeductionWan(col, mode);
    const deductionsWan = otherDedWan + spouseSpecialWan + socialWan + widowWan + singleParentWan + wsWan + disWan;
    const adjustedWan = Math.max(0, totalWan - deductionsWan);
    return {
      who,
      mode,
      totalWan: roundWan(totalWan, 4),
      deductions: compactDeductions([
        { label: "その他控除", wan: otherDedWan },
        { label: "配偶者特別控除", wan: spouseSpecialWan },
        { label: "社会保険料控除(実額)", wan: socialWan },
        { label: "寡婦控除", wan: widowWan },
        { label: "ひとり親控除", wan: singleParentWan },
        { label: "勤労学生控除", wan: wsWan },
        { label: "障害者控除", wan: disWan },
      ]),
      deductionSumWan: roundWan(deductionsWan, 4),
      adjustedWan: roundWan(adjustedWan, 4),
      adjustedYen: Math.round(adjustedWan * 10000),
      formula: "総所得 − 控除合計 = 判定所得",
    };
  };
  const obligorJudgmentIncomeDetails = obligorCols.map((o) => calcWelfareAdjustedIncomeDetail(o, "obligor"));
  const obligorMaxYen = obligorJudgmentIncomeDetails.length ? Math.max(...obligorJudgmentIncomeDetails.map((o) => o.adjustedYen)) : 0;
  const obligorOk = obligorMaxYen <= limitObligorYen;

  const recipients = rows
    .map((c) => {
      const age = toNumber(c?.age, 0);
      const who = String(c?.who || "");
      const idx = who.startsWith("子ども") ? Number(who.replace("子ども", "")) - 1 : -1;
      const cc = idx >= 0 ? ctx.children?.[idx] : null;
      const isWelfareChild =
        age < 20 &&
        (who === "世帯主"
          ? Boolean(ctx.head.childWelfareAllowance)
          : who === "配偶者"
            ? Boolean(ctx.spouse.childWelfareAllowance)
            : Boolean(cc?.childWelfareAllowance));
      const isTokubetsu =
        age >= 20 &&
        (who === "世帯主"
          ? Boolean(ctx.head.tokubetsuAllowance)
          : who === "配偶者"
            ? Boolean(ctx.spouse.tokubetsuAllowance)
            : Boolean(cc?.tokubetsuAllowance));
      if (!isWelfareChild && !isTokubetsu) return null;
      const type = isWelfareChild ? "child" : "adult";
      const selfJudgmentIncome = calcWelfareAdjustedIncomeDetail(c, "self");
      const selfYen = selfJudgmentIncome.adjustedYen;
      const selfOk = selfYen <= limitSelfYen;
      const ok = selfOk && obligorOk;
      const monthlyYen = ok ? (type === "child" ? WELFARE_CHILD_MONTHLY_YEN : TOKUBETSU_MONTHLY_YEN) : 0;
      return {
        who,
        type,
        ok,
        selfYen,
        selfLimitYen: limitSelfYen,
        selfOk,
        selfJudgmentIncome,
        obligorMaxYen,
        obligorLimitYen: limitObligorYen,
        obligorOk,
        monthlyYen,
      };
    })
    .filter(Boolean);
  const welfareMonthly = recipients.reduce((a, r) => a + toNumber(r.monthlyYen, 0), 0);
  const welfareAnnualWan = (welfareMonthly * 12) / 10000;

  const childSupportAnnualWan = (() => {
    const isSingleParent = Boolean(ctx.head.singleParentWan) && !ctx.spouseEnabled;
    if (!isSingleParent) return 0;
    const idx = Math.min(5, Math.max(0, Math.trunc(toNumber(legacyFuyo, 0))));
    const h = tcca?.head || {};
    const totalWan = toNumber(h.totalWan, 0);
    const dedSumWan = toNumber(h.dedSumWan, 0);
    const dedSumNo =
      Math.max(0, dedSumWan - toNumber(h.widowWan, 0) - toNumber(h.singleParentWan, 0) - toNumber(h.spouseSpecialWan, 0) - toNumber(h.specialDependentDedWan, 0));
    const adjustedWan = Math.max(0, totalWan - dedSumNo);
    const incomeYen = Math.round(adjustedWan * 10000);
    const fullLimitWanByFuyo = [68, 106, 144, 183, 220, 259];
    const partialLimitWanByFuyo = [208, 246, 284, 322, 260, 398];
    const fullLimitYen = Math.round((fullLimitWanByFuyo[idx] ?? fullLimitWanByFuyo[5]) * 10000);
    const partialLimitYen = Math.round((partialLimitWanByFuyo[idx] ?? partialLimitWanByFuyo[5]) * 10000);
    const status = incomeYen <= fullLimitYen ? "満額" : incomeYen <= partialLimitYen ? "一部" : "対象外";
    const eligibleChildren = ctx.children.filter((c) => {
      const age = toNumber(c?.age, 0);
      return age < 19 || (Boolean(c?.disabled) && age < 20);
    });
    const n = eligibleChildren.length;
    if (n === 0 || status === "対象外") return 0;
    if (status === "満額") return (46690 + Math.max(0, n - 1) * 11030) * 12 / 10000;
    const delta = Math.max(0, incomeYen - fullLimitYen);
    const first = Math.max(0, 46690 - (delta * 0.0256619 + 10));
    const add = Math.max(0, 11030 - (delta * 0.0039568 + 10));
    return Math.round(first + Math.max(0, n - 1) * add) * 12 / 10000;
  })();

  const childAllowanceAnnualWan = (() => {
    const kids = ctx.children
      .map((c, i) => ({ ...c, __idx: i, age: toNumber(c?.age, 0) }))
      .filter((c) => c.age < 18)
      .sort((a, b) => b.age - a.age || a.__idx - b.__idx);
    let monthly = 0;
    for (let i = 0; i < kids.length; i++) {
      const c = kids[i];
      const order = i + 1;
      if (order >= 3) {
        monthly += 30000;
        continue;
      }
      if (c.age <= 2) monthly += 15000;
      else monthly += 10000;
    }
    return (monthly * 12) / 10000;
  })();

  const m01Detail = calcM01Detail(ctx, householdLevySumWan);
  const n04Detail = calcN04Detail(ctx, rows);
  const m01AnnualWan = m01Detail.annualWan;
  const n04AnnualWan = n04Detail.annualWan;
  const m01FullReliefWan = toNumber(m01Detail.fullReliefWan ?? m01Detail.sensitivityRangeWan?.min, 0);
  const medicalCostBurdenWan = Math.max(0, m01FullReliefWan - toNumber(m01AnnualWan, 0));
  const educationCostBurdenWan = 0;
  const educationCostReliefWan = toNumber(n04AnnualWan, 0);
  const costBurdenWanTotal =
    toNumber(medicalCostBurdenWan, 0) +
    toNumber(serviceFeeWanTotal, 0);

  const allowanceWanTotal =
    toNumber(basicPensionWan, 0) +
    toNumber(tccaAnnualWan, 0) +
    toNumber(welfareAnnualWan, 0) +
    toNumber(childSupportAnnualWan, 0) +
    toNumber(childAllowanceAnnualWan, 0);

  const grossWan = rows.reduce((a, r) => a + toNumber(r.salaryWan, 0) + toNumber(r.otherIncomeWan, 0), 0);
  const takeHomeWan = grossWan - toNumber(socialWanTotal, 0) - toNumber(taxWanTotal, 0);
  const disposableWan =
    toNumber(takeHomeWan, 0) +
    toNumber(allowanceWanTotal, 0) +
    toNumber(educationCostReliefWan, 0) -
    toNumber(costBurdenWanTotal, 0);
  const expTax = -toNumber(taxWanTotal, 0);
  const expSocial = -toNumber(socialWanTotal, 0);
  const expService = -toNumber(serviceFeeWanTotal, 0);
  const expMedicalCost = -toNumber(medicalCostBurdenWan, 0);
  const expEducationCost = -toNumber(educationCostBurdenWan, 0);
  const totalPlusWan = toNumber(grossWan, 0) + toNumber(allowanceWanTotal, 0);
  const allowanceBreakdown = {
    basicDisabilityPensionWan: toNumber(basicPensionWan, 0),
    tccaWan: toNumber(tccaAnnualWan, 0),
    welfareAllowanceWan: toNumber(welfareAnnualWan, 0),
    childSupportWan: toNumber(childSupportAnnualWan, 0),
    childAllowanceWan: toNumber(childAllowanceAnnualWan, 0),
  };
  const costBurdenBreakdown = {
    medicalCostBurdenWan: toNumber(medicalCostBurdenWan, 0),
    educationCostBurdenWan: toNumber(educationCostBurdenWan, 0),
    serviceFeeWan: toNumber(serviceFeeWanTotal, 0),
    totalWan: toNumber(costBurdenWanTotal, 0),
  };
  const rowsDetail = rows.map((r) => ({
    who: String(r.who),
    age: toNumber(r.age, 0),
    salaryWan: toNumber(r.salaryWan, 0),
    otherIncomeWan: toNumber(r.otherIncomeWan, 0),
    employmentIncomeDeductionWan: toNumber(r.empWan, 0),
    employmentIncomeBaseDeductionWan: toNumber(r.empBaseWan, 0),
    incomeAdjustmentDeductionWan: toNumber(r.incomeAdjWan, 0),
    employmentIncomeWan: toNumber(r.incomeWan, 0),
    totalIncomeWan: toNumber(r.totalIncomeWan, 0),
    socialInsuranceWan: toNumber(r.socialWan, 0),
    employmentIncomeDeductionDetail: r.employmentIncomeDeductionDetail || null,
    basicDeductionDetail: r.basicDeductionDetail || null,
    socialInsuranceBreakdown: {
      ...(r.socialInsuranceDetail || {}),
      totalWan: toNumber(r.socialWan, 0),
      healthWan: toNumber(r.socialInsuranceDetail?.healthWan, 0),
      careWan: toNumber(r.socialInsuranceDetail?.careWan, 0),
      pensionWan: toNumber(r.socialInsuranceDetail?.pensionWan, 0),
      employmentWan: toNumber(r.socialInsuranceDetail?.employmentWan, 0),
      childSupportContributionWan: toNumber(r.socialInsuranceDetail?.childSupportContributionWan, 0),
    },
    disabled: Boolean(r.disabled),
    disabilityKind: r.tccaSpecial ? "special" : r.disabled ? "disabled" : "none",
    cohabit: Boolean(r.cohabit),
  }));
  const tccaDetail = {
    confidence: "strict",
    fuyoCount: toNumber(tcca?.fuyoCount, 0),
    statutoryAddYen: toNumber(tcca?.limitFuyoStatutoryAddYen, 0),
    headAdjustedIncomeYen: toNumber(tcca?.head?.adjustedYen, 0),
    headLimitYen: toNumber(tcca?.limits?.headLimitYen, 0),
    headLimit: tcca?.limits?.head || null,
    familyMaxAdjustedIncomeYen: toNumber(tcca?.familyMaxAdjustedYen, 0),
    familyLimitYen: toNumber(tcca?.limits?.familyLimitYen, 0),
    familyLimit: tcca?.limits?.family || null,
    eligible:
      toNumber(tcca?.head?.adjustedYen, 0) <= toNumber(tcca?.limits?.headLimitYen, 0) &&
      toNumber(tcca?.familyMaxAdjustedYen, 0) <= toNumber(tcca?.limits?.familyLimitYen, 0),
    monthlyYen: toNumber(tcca?.totalMonthlyYen, 0),
    annualWan: toNumber(tccaAnnualWan, 0),
    head: tcca?.head || null,
    family: Array.from(tcca?.familyByWho?.values?.() || []),
    source: CALCULATION_SOURCES.disabilityAllowances,
    formulas: {
      headJudgmentIncome: "A1 − B1a − T2",
      headLimit: `${toNumber(tcca?.limits?.head?.baseYen, 0).toLocaleString("ja-JP")}円 ＋ ${toNumber(tcca?.limits?.head?.statutoryAddYen, 0).toLocaleString("ja-JP")}円`,
      familyLimit: `${toNumber(tcca?.limits?.family?.baseYen, 0).toLocaleString("ja-JP")}円 ＋ ${toNumber(tcca?.limits?.family?.statutoryAddYen, 0).toLocaleString("ja-JP")}円`,
      annual: "T10 × 12",
    },
  };
  const welfareAllowanceDetail = {
    confidence: "strict",
    fuyoCount: fuyo,
    obligorLimitYen: limitObligorYen,
    obligorMaxAdjustedIncomeYen: obligorMaxYen,
    obligorOk,
    obligorJudgmentIncomeDetails,
    selfLimitYen: limitSelfYen,
    recipients,
    monthlyYen: welfareMonthly,
    annualWan: welfareAnnualWan,
    source: CALCULATION_SOURCES.disabilityAllowances,
    formulas: {
      obligorJudgmentIncome: "A1 − B1a − W2",
      obligorLimit: "W1に対応する扶養義務者限度額表",
      annual: "W7 × 12",
    },
  };
  const taxDetail = {
    byWho: taxByWho,
    incomeTaxWan: taxByWho.reduce((a, r) => a + toNumber(r.incomeTax.taxWan, 0), 0),
    residentTaxWan: taxByWho.reduce((a, r) => a + toNumber(r.residentTax.computedTaxWan, 0), 0),
    residentIncomeLevyWan: householdLevySumWan,
    totalWan: toNumber(taxWanTotal, 0),
  };
  const deductionsDetail = {
    dependent: dep,
    specialKin: kin,
    spouse: { itWan: spIT, ltWan: spLT },
    spouseSpecial: { itWan: spSpIT, ltWan: spSpLT },
    widowSingleParent: ws,
  };

  return {
    x,
    gross: grossWan,
    allowance: allowanceWanTotal,
    m01: m01AnnualWan,
    n04: n04AnnualWan,
    takeHome: takeHomeWan,
    disposable: disposableWan,
    householdLevySumWan,
    levyByWho: Array.from(levyByWho.values()),
    expTax,
    expSocial,
    expService,
    expMedicalCost,
    expEducationCost,
    educationCostRelief: educationCostReliefWan,
    service: toNumber(serviceFeeWanTotal, 0),
    medicalCostBurden: toNumber(medicalCostBurdenWan, 0),
    educationCostBurden: toNumber(educationCostBurdenWan, 0),
    costBurden: toNumber(costBurdenWanTotal, 0),
    tax: toNumber(taxWanTotal, 0),
    social: toNumber(socialWanTotal, 0),
    totalPlus: totalPlusWan,
    breakdown: {
      salaryWan: grossWan,
      rows: rowsDetail,
      deductions: deductionsDetail,
      socialInsurance: {
        totalWan: toNumber(socialWanTotal, 0),
        byWho: rowsDetail.map((r) => ({
          who: r.who,
          totalWan: r.socialInsuranceWan,
          ...r.socialInsuranceBreakdown,
        })),
      },
      tax: taxDetail,
      takeHome: {
        salaryWan: grossWan,
        socialWan: toNumber(socialWanTotal, 0),
        taxWan: toNumber(taxWanTotal, 0),
        takeHomeWan,
      },
      programs: {
        tcca: tccaDetail,
        welfareAllowance: welfareAllowanceDetail,
        service: {
          confidence: serviceConfidenceOverall,
          householdLevySumWan,
          details: serviceFeeDetails,
          calculation: {
            method: "householdMax",
            monthlyCandidateYenByChild: serviceFeeDetails.map((d) => ({
              who: d.who,
              type: d.type,
              monthlyYen: d.monthlyUpperYen,
              confidence: d.confidence,
            })),
            monthlyTotalYen: serviceFeeMonthlyYenTotal,
            annualWan: serviceFeeWanTotal,
            formula: "児童ごとの月額候補の最大値を世帯月額負担として採用",
            annualFormula: "世帯月額負担 × 12",
          },
          monthlyTotalYen: serviceFeeMonthlyYenTotal,
          annualWan: serviceFeeWanTotal,
        },
        m01: m01Detail,
        n04: n04Detail,
      },
      allowance: {
        totalWan: allowanceWanTotal,
        ...allowanceBreakdown,
      },
      costBurden: costBurdenBreakdown,
      disposable: {
        takeHomeWan,
        allowanceWan: allowanceWanTotal,
        medicalCostBurdenWan,
        educationCostBurdenWan,
        serviceFeeWan: serviceFeeWanTotal,
        costBurdenWan: costBurdenWanTotal,
        educationCostReliefWan,
        disposableWan,
        formula: "手取り ＋ 現金給付 − 医療費自己負担 − 通所利用者負担 ＋ 教育費負担軽減",
      },
    },
  };
}
