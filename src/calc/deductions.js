import { toNumber } from "./numeric.js";

/**
 * 上下限を含む最初の所得帯から控除額を取得する。
 * @remarks 税・帯選択。単位: 万円。式・境界条件・丸めは移動前の実装を維持。
 * @param {Array} bands 計算行・系列または設定行の配列
 * @param {*} total 判定対象・区分または補助値（呼出側の定義に従う）
 * @returns {*} number。単位: 万円
 */
export function amountByBands(bands, total) {
  const b = bands.find((x) => (x.min_exclusive_wan !== undefined ? total > x.min_exclusive_wan : total >= toNumber(x.min_wan, 0)) && total <= toNumber(x.max_wan, 0));
  return toNumber(b?.amount_wan, 0);
}

/**
 * 児童の年齢帯と所得要件を用いて扶養控除を合計する。
 * @remarks 税・扶養控除。単位: 万円/年。式・境界条件・丸めは移動前の実装を維持。
 * @param {object} ctx 世帯・制度設定または計算条件
 * @param {Array} rows 計算行・系列または設定行の配列
 * @returns {*} {itWan,ltWan}。単位: 万円/年
 */
export function calcDependentDeductionFromRows(ctx, rows) {
  const maxIncome = toNumber(ctx.dependentDeductionCfg?.dependent_total_income_max_wan, 0);
  const bands = Array.isArray(ctx.dependentDeductionCfg?.bands) ? ctx.dependentDeductionCfg.bands : [];
  let it = 0;
  let lt = 0;
  for (const r of rows) {
    if (!String(r?.who || "").startsWith("子ども")) continue;
    const age = toNumber(r?.age, 0);
    const total = toNumber(r?.totalIncomeWan, 0);
    if (total > maxIncome) continue;
    for (const b of bands) {
      const ranges = Array.isArray(b?.age_ranges) ? b.age_ranges : [];
      const ok = ranges.some((x) => age >= toNumber(x.min_age, 0) && age <= toNumber(x.max_age, 0));
      if (!ok) continue;
      it += toNumber(b.amount_it_wan, 0);
      lt += toNumber(b.amount_lt_wan, 0);
      break;
    }
  }
  return { itWan: it, ltWan: lt };
}

/**
 * 19〜22歳で通常扶養所得要件を超える児童の特定親族特別控除を合計する。
 * @remarks 税・特定親族特別控除。単位: 万円/年。式・境界条件・丸めは移動前の実装を維持。
 * @param {object} ctx 世帯・制度設定または計算条件
 * @param {Array} rows 計算行・系列または設定行の配列
 * @returns {*} {itWan,ltWan}。単位: 万円/年
 */
export function calcSpecialKinDeductionFromRows(ctx, rows) {
  const maxDepIncome = toNumber(ctx.dependentDeductionCfg?.dependent_total_income_max_wan, 0);
  const itBands = Array.isArray(ctx.specialKinDeductionITCfg?.child_total_income_bands_wan)
    ? ctx.specialKinDeductionITCfg.child_total_income_bands_wan
    : [];
  const ltBands = Array.isArray(ctx.specialKinDeductionLTCfg?.child_total_income_bands_wan)
    ? ctx.specialKinDeductionLTCfg.child_total_income_bands_wan
    : [];
  let it = 0;
  let lt = 0;
  for (const r of rows) {
    if (!String(r?.who || "").startsWith("子ども")) continue;
    const age = toNumber(r?.age, 0);
    if (age < 19 || age > 22) continue;
    const total = toNumber(r?.totalIncomeWan, 0);
    if (total <= maxDepIncome) continue;
    it += amountByBands(itBands, total);
    lt += amountByBands(ltBands, total);
  }
  return { itWan: it, ltWan: lt };
}

/**
 * 配偶者所得と世帯主所得帯から配偶者控除額を選択する。
 * @remarks 税・配偶者控除。単位: 万円/年。式・境界条件・丸めは移動前の実装を維持。
 * @param {object} ctx 世帯・制度設定または計算条件
 * @param {object} cfg 世帯・制度設定または計算条件
 * @param {Array} rows 計算行・系列または設定行の配列
 * @returns {*} number。単位: 万円/年
 */
export function calcSpouseDeductionFromRows(ctx, cfg, rows) {
  if (!ctx.spouseEnabled) return 0;
  const headRow = rows.find((r) => r.who === "世帯主");
  const spouseRow = rows.find((r) => r.who === "配偶者");
  if (!headRow || !spouseRow) return 0;
  const headTotal = toNumber(headRow?.totalIncomeWan, 0);
  const spouseTotal = toNumber(spouseRow?.totalIncomeWan, 0);
  const spouseMax = toNumber(cfg?.spouse_total_income_max_wan, 0);
  if (spouseTotal > spouseMax) return 0;
  const bands = Array.isArray(cfg?.head_total_income_bands_wan) ? cfg.head_total_income_bands_wan : [];
  const b = bands.find((x) => (x.min_exclusive_wan !== undefined ? headTotal > x.min_exclusive_wan : headTotal >= toNumber(x.min_wan, 0)) && headTotal <= toNumber(x.max_wan, 0));
  return toNumber(b?.amount_wan, 0);
}

/**
 * 夫婦の所得帯と通常配偶者控除の適用状態から特別控除額を選択する。
 * @remarks 税・配偶者特別控除。単位: 万円/年。式・境界条件・丸めは移動前の実装を維持。
 * @param {object} ctx 世帯・制度設定または計算条件
 * @param {object} cfg 世帯・制度設定または計算条件
 * @param {number} spouseDeductionWan 万円（年額。補助値は呼出側の定義に従う）
 * @param {Array} rows 計算行・系列または設定行の配列
 * @returns {*} number。単位: 万円/年
 */
export function calcSpouseSpecialDeductionFromRows(ctx, cfg, spouseDeductionWan, rows) {
  if (!ctx.spouseEnabled) return 0;
  if (spouseDeductionWan !== 0 && cfg?.applies_when_spouse_deduction_is_zero) return 0;
  const headRow = rows.find((r) => r.who === "世帯主");
  const spouseRow = rows.find((r) => r.who === "配偶者");
  if (!headRow || !spouseRow) return 0;
  const headTotal = toNumber(headRow?.totalIncomeWan, 0);
  const spouseTotal = toNumber(spouseRow?.totalIncomeWan, 0);
  const headBands = Array.isArray(cfg?.head_total_income_bands_wan) ? cfg.head_total_income_bands_wan : [];
  const headBand = headBands.find(
    (b) => (b.head_min_exclusive_wan !== undefined ? headTotal > b.head_min_exclusive_wan : headTotal >= toNumber(b.head_min_wan, 0)) && headTotal <= toNumber(b.head_max_wan, 0)
  );
  if (!headBand) return 0;
  const spouseBands = Array.isArray(headBand.spouse_bands_wan) ? headBand.spouse_bands_wan : [];
  const sb = spouseBands.find(
    (b) => (b.spouse_min_exclusive_wan !== undefined ? spouseTotal > b.spouse_min_exclusive_wan : spouseTotal >= toNumber(b.spouse_min_wan, 0)) && spouseTotal <= toNumber(b.spouse_max_wan, 0)
  );
  return toNumber(sb?.amount_wan, 0);
}

/**
 * 所得・配偶者有無・入力指定から寡婦控除とひとり親控除を判定する。
 * @remarks 税・寡婦/ひとり親控除。単位: 万円/年。所得上限500。式・境界条件・丸めは移動前の実装を維持。
 * @param {object} ctx 世帯・制度設定または計算条件
 * @param {Array} rows 計算行・系列または設定行の配列
 * @returns {*} 控除内訳オブジェクト。単位: 万円/年。所得上限500
 */
export function calcWidowSingleParent(ctx, rows) {
  const headRow = rows.find((r) => r.who === "世帯主");
  const headTotalWan = toNumber(headRow?.totalIncomeWan, 0);
  const incomeOk = headTotalWan <= 500;
  const widowApplied =
    Boolean(ctx.head.widowWan) && incomeOk && !(ctx.widowDeductionCfg?.requires_no_spouse && ctx.spouseEnabled);
  const singleParentApplied =
    Boolean(ctx.head.singleParentWan) && incomeOk && !(ctx.singleParentDeductionCfg?.requires_no_spouse && ctx.spouseEnabled);
  return {
    widow: {
      itWan: widowApplied ? toNumber(ctx.widowDeductionCfg?.amount_it_wan, 0) : 0,
      ltWan: widowApplied ? toNumber(ctx.widowDeductionCfg?.amount_lt_wan, 0) : 0,
    },
    singleParent: {
      itWan: singleParentApplied ? toNumber(ctx.singleParentDeductionCfg?.amount_it_wan, 0) : 0,
      ltWan: singleParentApplied ? toNumber(ctx.singleParentDeductionCfg?.amount_lt_wan, 0) : 0,
    },
  };
}

/**
 * 世帯員の障害・同居区分に対応する障害者控除額を取得する。
 * @remarks 税・障害者控除。単位: 万円/年。式・境界条件・丸めは移動前の実装を維持。
 * @param {object} ctx 世帯・制度設定または計算条件
 * @param {*} col 判定対象・区分または補助値（呼出側の定義に従う）
 * @param {*} kind 判定対象・区分または補助値（呼出側の定義に従う）
 * @returns {*} number。単位: 万円/年
 */
export function getDisabilityDeductionWan(ctx, col, kind) {
  const it = ctx.disabilityDeductionCfg?.it_wan || {};
  const lt = ctx.disabilityDeductionCfg?.lt_wan || {};
  const table = kind === "it" ? it : lt;
/**
   * 選択した所得税・住民税の障害者控除表から金額を読む。
   * @remarks 税・障害者控除。単位: 万円。式・境界条件・丸めは移動前の実装を維持。
   * @param {*} k 判定対象・区分または補助値（呼出側の定義に従う）
   * @returns {*} number。単位: 万円
   */
  const amt = (k) => toNumber(table?.[k], 0);
  if (!col) return 0;
  const who = String(col.who || "");

  if (who === "世帯主") {
    if (!ctx.head.disabled) return 0;
    return ctx.head.disabilityKind === "special" ? amt("special") : amt("disabled");
  }
  if (who === "配偶者") {
    if (!ctx.spouseEnabled || !ctx.spouse.disabled) return 0;
    return ctx.spouse.disabilityKind === "special" ? amt("cohab_special") : amt("disabled");
  }
  if (who.startsWith("子ども")) {
    const idx = Number(who.replace("子ども", "")) - 1;
    const c = ctx.children[idx];
    if (!c || !c.disabled) return 0;
    if (c.specialDisabled && c.cohabit) return amt("cohab_special");
    if (c.specialDisabled) return amt("special");
    return amt("disabled");
  }
  return 0;
}

/**
 * 扶養家族の障害者控除を世帯主へ帰属させ、本人との二重適用を避ける。
 * @remarks 税・障害者控除。単位: 万円/年。扶養所得基準58。式・境界条件・丸めは移動前の実装を維持。
 * @param {object} ctx 世帯・制度設定または計算条件
 * @param {*} col 判定対象・区分または補助値（呼出側の定義に従う）
 * @param {*} kind 判定対象・区分または補助値（呼出側の定義に従う）
 * @param {Array} rows 計算行・系列または設定行の配列
 * @returns {*} number。単位: 万円/年。扶養所得基準58
 */
export function getDisabilityDeductionForTaxpayerWan(ctx, col, kind, rows) {
  if (!col) return 0;
  const who = String(col?.who || "");
  const depMaxWan = toNumber(ctx.taxDependentIncomeMaxWan, 58);
/**
   * 世帯員名に対応する個人計算行を探す。
   * @remarks 税・障害者控除補助。単位: 行の金額は万円。式・境界条件・丸めは移動前の実装を維持。
   * @param {*} w 判定対象・区分または補助値（呼出側の定義に従う）
   * @returns {*} 行またはnull。単位: 行の金額は万円
   */
  const findRow = (w) => (Array.isArray(rows) ? rows.find((r) => String(r?.who || "") === String(w)) : null);
/**
   * 世帯員の合計所得が58万円以下かを判定する。
   * @remarks 税・障害者控除補助。単位: 所得は万円/年。式・境界条件・丸めは移動前の実装を維持。
   * @param {*} w 判定対象・区分または補助値（呼出側の定義に従う）
   * @returns {*} boolean。単位: 所得は万円/年
   */
  const isDep = (w) => {
    const r = findRow(w);
    return r ? toNumber(r?.totalIncomeWan, 0) <= depMaxWan : false;
  };

  if (who === "世帯主") {
    let sum = 0;
    sum += getDisabilityDeductionWan(ctx, findRow("世帯主") || col, kind);
    if (ctx.spouseEnabled && isDep("配偶者")) sum += getDisabilityDeductionWan(ctx, findRow("配偶者"), kind);
    for (const r of rows) {
      const w = String(r?.who || "");
      if (!w.startsWith("子ども")) continue;
      if (!isDep(w)) continue;
      sum += getDisabilityDeductionWan(ctx, r, kind);
    }
    return sum;
  }
  if (who === "配偶者") {
    if (!ctx.spouseEnabled) return 0;
    if (isDep("配偶者") || !ctx.spouse.disabled) return 0;
    const table = kind === "it" ? ctx.disabilityDeductionCfg?.it_wan : ctx.disabilityDeductionCfg?.lt_wan;
    return toNumber(table?.[ctx.spouse.disabilityKind === "special" ? "special" : "disabled"], 0);
  }
  if (who.startsWith("子ども")) {
    if (isDep(who) || !col.disabled) return 0;
    const table = kind === "it" ? ctx.disabilityDeductionCfg?.it_wan : ctx.disabilityDeductionCfg?.lt_wan;
    return toNumber(table?.[col.tccaSpecial ? "special" : "disabled"], 0);
  }
  return 0;
}

/**
 * 所得から本人と世帯主に帰属する控除を減算して非負の課税所得を求める。
 * @remarks 税・課税所得。単位: 万円/年。式・境界条件・丸めは移動前の実装を維持。
 * @param {object} ctx 世帯・制度設定または計算条件
 * @param {*} col 判定対象・区分または補助値（呼出側の定義に従う）
 * @param {*} kind 判定対象・区分または補助値（呼出側の定義に従う）
 * @param {Array} rows 計算行・系列または設定行の配列
 * @param {*} headDedCommonWithKin 判定対象・区分または補助値（呼出側の定義に従う）
 * @returns {*} number。単位: 万円/年
 */
export function getTaxable(ctx, col, kind, rows, headDedCommonWithKin) {
  const total = toNumber(col?.totalIncomeWan, 0);
  const basic = kind === "it" ? toNumber(col?.basicITWan, 0) : toNumber(col?.basicLTWan, 0);
  const social = toNumber(col?.socialWan, 0);
  const ws = Boolean(col?.workingStudent) ? (kind === "it" ? ctx.wsAmtIT : ctx.wsAmtLT) : 0;
  const dis = getDisabilityDeductionForTaxpayerWan(ctx, col, kind, rows);
  if (String(col?.who || "") !== "世帯主") return Math.max(0, total - basic - social - ws - dis);
  return Math.max(0, total - basic - social - ws - dis - toNumber(headDedCommonWithKin, 0));
}
