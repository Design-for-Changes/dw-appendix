import { toNumber, roundWan, compactDeductions } from "./numeric.js";

/**
 * 本人区分、20歳前所得制限、世帯主の子加算から障害基礎年金を求める。
 * @remarks 障害基礎年金。単位: 円/年。支給係数適用後Math.round。式・境界条件・丸めは移動前の実装を維持。
 * @param {object} ctx 世帯・制度設定または計算条件
 * @param {*} who 判定対象・区分または補助値（呼出側の定義に従う）
 * @param {number} totalIncomeWan 万円（年額。補助値は呼出側の定義に従う）
 * @returns {*} number。単位: 円/年。支給係数適用後Math.round
 */
export function calcBasicDisabilityPensionYenFor(ctx, who, totalIncomeWan) {
  const w = String(who || "");
  const headBase =
    ctx.head.basicDisabilityPensionGrade === "1" ? 1039625 : ctx.head.basicDisabilityPensionGrade === "2" ? 1036625 : 0;
  const spouseBase =
    ctx.spouse.basicDisabilityPensionGrade === "1"
      ? 1039625
      : ctx.spouse.basicDisabilityPensionGrade === "2"
        ? 1036625
        : 0;

  const incomeTotalYen = Math.round(toNumber(totalIncomeWan, 0) * 10000);
  const pre20 =
    w === "世帯主"
      ? Boolean(ctx.head.basicDisabilityPensionPre20)
      : w === "配偶者"
        ? Boolean(ctx.spouse.basicDisabilityPensionPre20)
        : false;
  const factor = !pre20 ? 1 : incomeTotalYen >= 4794001 ? 0 : incomeTotalYen >= 3761001 ? 0.5 : 1;

  if (w === "世帯主") {
    if (!ctx.head.disabled || headBase === 0) return 0;
    const n = ctx.children.filter((c) => toNumber(c?.age, 0) < 18).length;
    const add = 239300 * Math.min(n, 2) + 79800 * Math.max(n - 2, 0);
    return Math.round((headBase + add) * factor);
  }
  if (w === "配偶者") {
    if (!ctx.spouseEnabled || !ctx.spouse.disabled || spouseBase === 0) return 0;
    return Math.round(spouseBase * factor);
  }
  return 0;
}

/**
 * 所得要件を満たす扶養親族数と年齢による法定加算額を求める。
 * @remarks 手当・所得制限。単位: 人数、円/年。式・境界条件・丸めは移動前の実装を維持。
 * @param {object} ctx 世帯・制度設定または計算条件
 * @param {Array} rows 計算行・系列または設定行の配列
 * @returns {*} {count,statutoryAddYen,dependents}。単位: 人数、円/年
 */
export function calcLimitFuyoInfo(ctx, rows) {
  const cols = Array.isArray(rows) ? rows : [];
  const spouseRow = cols.find((r) => String(r?.who || "") === "配偶者");
  const maxIncome = toNumber(ctx.dependentDeductionCfg?.dependent_total_income_max_wan, 0);
  const spouseMax = toNumber(ctx.spouseDeductionITCfg?.spouse_total_income_max_wan, 0);
  const spouseIsTarget = ctx.spouseEnabled && spouseRow ? toNumber(spouseRow?.totalIncomeWan, 0) <= spouseMax : false;

  const dependents = [];
  if (spouseIsTarget) dependents.push(spouseRow);
  for (const r of cols) {
    if (!String(r?.who || "").startsWith("子ども")) continue;
    if (toNumber(r?.totalIncomeWan, 0) > maxIncome) continue;
    dependents.push(r);
  }

  const statutoryAddYen = dependents.reduce((sum, r) => {
    const age = toNumber(r?.age, 0);
    return sum + (age >= 19 && age < 23 ? 250000 : 0) + (age >= 70 ? 100000 : 0);
  }, 0);

  return { count: dependents.length, statutoryAddYen, dependents };
}

/**
 * 互換用に障害区分による旧式人数加算を求める。現特児限度人数には使わない。
 * @remarks 旧互換・児童扶養手当。単位: 人数。式・境界条件・丸めは移動前の実装を維持。
 * @param {object} ctx 世帯・制度設定または計算条件
 * @param {Array} rows 計算行・系列または設定行の配列
 * @returns {*} number。単位: 人数
 */
export function calcLegacyDisabilityAddedFuyoCount(ctx, rows) {
  const info = calcLimitFuyoInfo(ctx, rows);
  const headRow = Array.isArray(rows) ? rows.find((r) => String(r?.who || "") === "世帯主") : null;
/**
   * 旧互換の世帯主人員加算を求める。
   * @remarks 旧互換。単位: 人数。式・境界条件・丸めは移動前の実装を維持。
   * @param {*} row 判定対象・区分または補助値（呼出側の定義に従う）
   * @returns {*} number。単位: 人数
   */
  const addForHead = (row) => (Boolean(row?.disabled) ? 1 : 0);
/**
   * 障害と同居特別区分から旧互換の家族人員加算を求める。
   * @remarks 旧互換。単位: 人数。式・境界条件・丸めは移動前の実装を維持。
   * @param {*} row 判定対象・区分または補助値（呼出側の定義に従う）
   * @returns {*} number。単位: 人数
   */
  const addForFamily = (row) => {
    if (!Boolean(row?.disabled)) return 0;
    if (!Boolean(row?.tccaSpecial)) return 1;
    return Boolean(row?.cohabit) ? 2 : 1;
  };
  let add = addForHead(headRow);
  for (const r of info.dependents) add += addForFamily(r);
  return info.count + add;
}

/**
 * 受給資格者と家族の判定所得・限度額を計算し特別児童扶養手当の支給額を求める。
 * @remarks N01-1 特別児童扶養手当。単位: 所得=万円/年、限度/調整所得=円/年、支給=円/月。式・境界条件・丸めは移動前の実装を維持。
 * @param {object} ctx 世帯・制度設定または計算条件
 * @param {Array} cols 計算行・系列または設定行の配列
 * @param {*} spSpLT 判定対象・区分または補助値（呼出側の定義に従う）
 * @returns {*} 所得判定・限度額・Map・月額等。単位: 所得=万円/年、限度/調整所得=円/年、支給=円/月
 */
export function calcTccaComputedLocal(ctx, cols, spSpLT) {
  if (!cols || cols.length === 0) return null;
  const headRow = cols.find((r) => r.who === "世帯主");
  const spouseRow = cols.find((r) => r.who === "配偶者");
/**
   * 税計算で差し引いた所得金額調整控除を手当の所得判定用に戻す。
   * @remarks N01-1 所得。単位: 万円/年。式・境界条件・丸めは移動前の実装を維持。
   * @param {*} row 判定対象・区分または補助値（呼出側の定義に従う）
   * @returns {*} number。単位: 万円/年
   */
  const allowanceIncomeWan = (row) => toNumber(row?.totalIncomeWan, 0) + toNumber(row?.incomeAdjWan, 0);
  const headTotalWan = allowanceIncomeWan(headRow);
  const spouseTotalWan = allowanceIncomeWan(spouseRow);

/**
   * 扶養人数別基準額と法定加算から特児所得限度額の内訳を求める。
   * @remarks N01-1 所得制限。単位: 円/年、人数。式・境界条件・丸めは移動前の実装を維持。
   * @param {*} kind 判定対象・区分または補助値（呼出側の定義に従う）
   * @param {*} fuyoCount 判定対象・区分または補助値（呼出側の定義に従う）
   * @param {number} statutoryAddYen 円（年額/月額は関数の単位欄参照）
   * @returns {*} 限度額オブジェクト。単位: 円/年、人数
   */
  const incomeLimitParts = (kind, fuyoCount, statutoryAddYen = 0) => {
    const n = Math.max(0, Math.trunc(toNumber(fuyoCount, 0)));
    const add = Math.max(0, Math.trunc(toNumber(statutoryAddYen, 0)));
    const isHead = kind === "head";
    const base = isHead ? [4596000, 4976000, 5356000, 5736000] : [6287000, 6536000, 6749000, 6962000];
    const stepYen = isHead ? 380000 : 213000;
    const extraCount = Math.max(0, n - 3);
    const baseYen = n <= 3 ? base[n] : base[3] + stepYen * extraCount;
    return {
      kind,
      fuyoCount: n,
      baseYen,
      statutoryAddYen: add,
      stepYen,
      extraCount,
      limitYen: baseYen + add,
      formula: n <= 3 ? "基準額テーブル + 法定加算" : "3人基準額 + 追加人数×加算単価 + 法定加算",
    };
  };
/**
   * 世帯員名に対応する手当用障害者控除額を取得する。
   * @remarks N01-1 控除。単位: 万円。式・境界条件・丸めは移動前の実装を維持。
   * @param {*} who 判定対象・区分または補助値（呼出側の定義に従う）
   * @returns {*} number。単位: 万円
   */
  const tccaDisWan = (who) => {
    const r = cols.find((x) => String(x?.who || "") === String(who || ""));
    return toNumber(r?.tccaDisWan, 0);
  };
/**
   * 児童の合計所得が58万円以下かを判定する。
   * @remarks N01-1 控除。単位: 所得=万円/年。式・境界条件・丸めは移動前の実装を維持。
   * @param {*} who 判定対象・区分または補助値（呼出側の定義に従う）
   * @returns {*} boolean。単位: 所得=万円/年
   */
  const isChildDep = (who) => {
    const r = cols.find((x) => String(x?.who || "") === String(who));
    return r ? toNumber(r?.totalIncomeWan, 0) <= 58 : false;
  };

  const limitFuyoInfo = calcLimitFuyoInfo(ctx, cols);
  const fuyoCount = toNumber(limitFuyoInfo.count, 0);
  const legacyFuyoCount = calcLegacyDisabilityAddedFuyoCount(ctx, cols);
  const headLimit = incomeLimitParts("head", fuyoCount, limitFuyoInfo.statutoryAddYen);
  const familyLimit = incomeLimitParts("family", fuyoCount, limitFuyoInfo.statutoryAddYen);
  const headLimitYen = headLimit.limitYen;
  const familyLimitYen = familyLimit.limitYen;

  const employmentIncomeDeductWan = 10;
  const socialFixedWan = 8;
  const otherDedWan = toNumber(headRow?.otherDedWan, 0);

  const spouseSpecialWan = ctx.spouseEnabled && headRow && spouseRow ? toNumber(spSpLT, 0) : 0;
  let specialDependentCount = 0;
  for (const r of cols) {
    if (!String(r?.who || "").startsWith("子ども")) continue;
    const age = toNumber(r?.age, 0);
    if (age < 19 || age > 22) continue;
    if (!isChildDep(r?.who)) continue;
    specialDependentCount += 1;
  }
  const specialDependentDedWan = 25 * specialDependentCount;

  const hasDependentChild = cols.some((r) => String(r?.who || "").startsWith("子ども") && isChildDep(r?.who));
  const headIncomeOk = headTotalWan <= 500;
  const widowApplied =
    headIncomeOk && Boolean(headRow?.widowWan) && !(ctx.widowDeductionCfg?.requires_no_spouse && ctx.spouseEnabled);
  const singleParentApplied =
    headIncomeOk &&
    Boolean(headRow?.singleParentWan) &&
    !(ctx.singleParentDeductionCfg?.requires_no_spouse && ctx.spouseEnabled);
  const widowWan = hasDependentChild && widowApplied ? 27 : 0;
  const singleParentWan = hasDependentChild && singleParentApplied ? 35 : 0;
  const workingStudentWan = Boolean(headRow?.workingStudent) ? 27 : 0;

  const spouseMaxForDep = toNumber(ctx.spouseDeductionITCfg?.spouse_total_income_max_wan, 58);
  const spouseIsDep = ctx.spouseEnabled && spouseRow ? toNumber(spouseRow?.totalIncomeWan, 0) <= spouseMaxForDep : false;
  let disabilityDedWan = 0;
  disabilityDedWan += tccaDisWan("世帯主");
  if (spouseIsDep) disabilityDedWan += tccaDisWan("配偶者");
  for (const r of cols) {
    const who = String(r?.who || "");
    if (!who.startsWith("子ども")) continue;
    if (!isChildDep(who)) continue;
    disabilityDedWan += tccaDisWan(who);
  }

  const headDedSumWan =
    employmentIncomeDeductWan +
    socialFixedWan +
    otherDedWan +
    spouseSpecialWan +
    specialDependentDedWan +
    widowWan +
    singleParentWan +
    workingStudentWan +
    disabilityDedWan;
  const headAdjustedWan = Math.max(0, headTotalWan - headDedSumWan);
  const headJudgmentIncome = {
    totalWan: roundWan(headTotalWan, 4),
    deductions: compactDeductions([
      { label: "基礎控除引き上げ相当額(特児10万上限)", wan: employmentIncomeDeductWan, alwaysShow: true },
      { label: "社会保険料控除(特児8万固定)", wan: socialFixedWan, alwaysShow: true },
      { label: "その他控除", wan: otherDedWan },
      { label: "配偶者特別控除", wan: spouseSpecialWan },
      { label: "特定扶養親族控除", wan: specialDependentDedWan },
      { label: "寡婦控除", wan: widowWan },
      { label: "ひとり親控除", wan: singleParentWan },
      { label: "勤労学生控除", wan: workingStudentWan },
      { label: "障害者控除", wan: disabilityDedWan },
    ]),
    deductionSumWan: roundWan(headDedSumWan, 4),
    adjustedWan: roundWan(headAdjustedWan, 4),
    adjustedYen: Math.round(headAdjustedWan * 10000),
    formula: "総所得 − 控除合計 = 判定所得",
  };

  const familyByWho = new Map();
/**
   * 家族の判定所得と控除内訳を閉包のfamilyByWho Mapへ追加する。
   * @remarks N01-1 所得。単位: 万円/年と円/年。式・境界条件・丸めは移動前の実装を維持。
   * @param {*} who 判定対象・区分または補助値（呼出側の定義に従う）
   * @param {number} totalWan 万円（年額。補助値は呼出側の定義に従う）
   * @param {number} wsWan 万円（年額。補助値は呼出側の定義に従う）
   * @param {number} disWan 万円（年額。補助値は呼出側の定義に従う）
   * @returns {*} void（Map更新）。単位: 万円/年と円/年
   */
  const addFamily = (who, totalWan, wsWan, disWan) => {
    const dedSumWan = employmentIncomeDeductWan + socialFixedWan + wsWan + disWan;
    const adjustedWan = Math.max(0, toNumber(totalWan, 0) - dedSumWan);
    const judgmentIncome = {
      totalWan: roundWan(totalWan, 4),
      deductions: compactDeductions([
        { label: "基礎控除引き上げ相当額(特児10万上限)", wan: employmentIncomeDeductWan, alwaysShow: true },
        { label: "社会保険料控除(特児8万固定)", wan: socialFixedWan, alwaysShow: true },
        { label: "勤労学生控除", wan: wsWan },
        { label: "障害者控除", wan: disWan },
      ]),
      deductionSumWan: roundWan(dedSumWan, 4),
      adjustedWan: roundWan(adjustedWan, 4),
      adjustedYen: Math.round(adjustedWan * 10000),
      formula: "総所得 − 控除合計 = 判定所得",
    };
    familyByWho.set(String(who), {
      who: String(who),
      totalWan: toNumber(totalWan, 0),
      employmentIncomeDeductWan,
      socialFixedWan,
      wsWan,
      disWan,
      dedSumWan,
      adjustedWan,
      adjustedYen: Math.round(adjustedWan * 10000),
      judgmentIncome,
      limit: familyLimit,
    });
  };
  if (ctx.spouseEnabled && spouseRow) {
    addFamily("配偶者", spouseTotalWan, Boolean(spouseRow?.workingStudent) ? 27 : 0, spouseIsDep ? 0 : tccaDisWan("配偶者"));
  }
  for (const r of cols) {
    const who = String(r?.who || "");
    if (!who.startsWith("子ども")) continue;
    addFamily(who, allowanceIncomeWan(r), Boolean(r?.workingStudent) ? 27 : 0, isChildDep(who) ? 0 : tccaDisWan(who));
  }
  const familyTargets = Array.from(familyByWho.values());
  const familyMaxAdjustedYen = familyTargets.length ? Math.max(...familyTargets.map((x) => x.adjustedYen)) : 0;

/**
   * 特児の入力等級を月額手当額へ対応付ける。
   * @remarks N01-1 手当額。単位: 円/月。式・境界条件・丸めは移動前の実装を維持。
   * @param {*} g 判定対象・区分または補助値（呼出側の定義に従う）
   * @returns {*} number。単位: 円/月
   */
  const gradeToMonthlyYen = (g) => (g === "1" ? 58450 : g === "2" ? 38930 : 0);
  const baseMonthlyYen = cols
    .filter((r) => String(r?.who || "").startsWith("子ども"))
    .reduce((a, r) => {
      const age = toNumber(r?.age, 0);
      if (age >= 20) return a;
      const g = String(r?.tccaGrade || "not");
      if (g === "not") return a;
      return a + gradeToMonthlyYen(g);
    }, 0);

  const headOk = Math.round(headAdjustedWan * 10000) <= headLimitYen;
  const familyOk = familyMaxAdjustedYen <= familyLimitYen;
  const totalMonthlyYen = headOk && familyOk ? baseMonthlyYen : 0;

  return {
    fuyoCount,
    limitFuyoCount: fuyoCount,
    legacyFuyoCount,
    limitFuyoStatutoryAddYen: toNumber(limitFuyoInfo.statutoryAddYen, 0),
    limits: { headLimitYen, familyLimitYen, head: headLimit, family: familyLimit },
    head: {
      totalWan: headTotalWan,
      employmentIncomeDeductWan,
      socialFixedWan,
      otherDedWan,
      spouseSpecialWan,
      specialDependentCount,
      specialDependentDedWan,
      hasDependentChild,
      widowWan,
      singleParentWan,
      workingStudentWan,
      disabilityDedWan,
      dedSumWan: headDedSumWan,
      adjustedWan: headAdjustedWan,
      adjustedYen: Math.round(headAdjustedWan * 10000),
      judgmentIncome: headJudgmentIncome,
      limit: headLimit,
    },
    familyByWho,
    familyMaxAdjustedYen,
    totalMonthlyYen,
  };
}

/**
 * 障害児福祉手当等の本人所得限度額を扶養人数から求める。
 * @remarks N01-2 所得制限。単位: 円/年。式・境界条件・丸めは移動前の実装を維持。
 * @param {*} fuyoCount 判定対象・区分または補助値（呼出側の定義に従う）
 * @returns {*} number。単位: 円/年
 */
export function calcWelfareAllowanceLimitSelfYen(fuyoCount) {
  const n = Math.max(0, Math.trunc(toNumber(fuyoCount, 0)));
  const base = [3661000, 4041000, 4421000, 4801000];
  if (n <= 3) return base[n];
  return base[3] + 380000 * (n - 3);
}

/**
 * 障害児福祉手当等の配偶者・扶養義務者所得限度額を求める。
 * @remarks N01-2 所得制限。単位: 円/年。式・境界条件・丸めは移動前の実装を維持。
 * @param {*} fuyoCount 判定対象・区分または補助値（呼出側の定義に従う）
 * @returns {*} number。単位: 円/年
 */
export function calcWelfareAllowanceLimitObligorYen(fuyoCount) {
  const n = Math.max(0, Math.trunc(toNumber(fuyoCount, 0)));
  const base0to4 = [6287000, 6536000, 6749000, 6962000, 7175000];
  if (n <= 4) return base0to4[n];
  const base5 = base0to4[4] + 213000;
  return base5 + 213000 * (n - 5);
}
