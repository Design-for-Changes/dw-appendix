/**
 * 有限数へ変換し、不正値は指定の既定値へ置き換える。
 * @remarks 共通。単位: 入力の単位を維持。式・境界条件・丸めは移動前の実装を維持。
 * @param {*} value 判定対象・区分または補助値（呼出側の定義に従う）
 * @param {*} fallback 判定対象・区分または補助値（呼出側の定義に従う）
 * @returns {*} number。単位: 入力の単位を維持
 */
function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * 万円値を指定桁数の文字列にする。
 * @remarks 崖説明・表示。単位: 万円。式・境界条件・丸めは移動前の実装を維持。
 * @param {*} value 判定対象・区分または補助値（呼出側の定義に従う）
 * @param {*} digits 判定対象・区分または補助値（呼出側の定義に従う）
 * @returns {*} string。単位: 万円
 */
function wan(value, digits = 1) {
  return `${toNumber(value).toFixed(digits)}万`;
}

/**
 * 円額を整数四捨五入し、桁区切り文字列にする。
 * @remarks 崖説明・表示。単位: 円。式・境界条件・丸めは移動前の実装を維持。
 * @param {*} value 判定対象・区分または補助値（呼出側の定義に従う）
 * @returns {*} string。単位: 円
 */
function yen(value) {
  return `${Math.round(toNumber(value)).toLocaleString("ja-JP")}円`;
}

/**
 * 型別に値の変化を判定し、数値には許容差を適用する。
 * @remarks 崖の原因。単位: 数値の既定許容差1e-9。式・境界条件・丸めは移動前の実装を維持。
 * @param {*} a 判定対象・区分または補助値（呼出側の定義に従う）
 * @param {*} b 判定対象・区分または補助値（呼出側の定義に従う）
 * @param {*} eps 判定対象・区分または補助値（呼出側の定義に従う）
 * @returns {*} boolean。単位: 数値の既定許容差1e-9
 */
function changed(a, b, eps = 1e-9) {
  if (typeof a === "boolean" || typeof b === "boolean") return Boolean(a) !== Boolean(b);
  if (typeof a === "string" || typeof b === "string") return String(a ?? "") !== String(b ?? "");
  return Math.abs(toNumber(a) - toNumber(b)) > eps;
}

/**
 * 原因と設定属性・説明を出力配列へ追加する。
 * @remarks 崖の原因。単位: 無単位。式・境界条件・丸めは移動前の実装を維持。
 * @param {*} out 判定対象・区分または補助値（呼出側の定義に従う）
 * @param {*} cause 判定対象・区分または補助値（呼出側の定義に従う）
 * @param {*} confidence 判定対象・区分または補助値（呼出側の定義に従う）
 * @param {*} whatHappened 判定対象・区分または補助値（呼出側の定義に従う）
 * @returns {*} void（配列更新）。単位: 無単位
 */
function pushCause(out, cause, confidence, whatHappened) {
  out.push({ cause, confidence, whatHappened });
}

/**
 * 特児の支給資格・年額の変化を原因行に追加する。
 * @remarks N01-1 差分。単位: 万円/年。式・境界条件・丸めは移動前の実装を維持。
 * @param {*} out 判定対象・区分または補助値（呼出側の定義に従う）
 * @param {*} before 判定対象・区分または補助値（呼出側の定義に従う）
 * @param {*} after 判定対象・区分または補助値（呼出側の定義に従う）
 * @returns {*} void（配列更新）。単位: 万円/年
 */
function compareTcca(out, before, after) {
  const b = before?.programs?.tcca || {};
  const a = after?.programs?.tcca || {};
  if (!changed(b.annualWan, a.annualWan) && !changed(b.eligible, a.eligible)) return;
  const eligibility = changed(b.eligible, a.eligible)
    ? `${b.eligible ? "支給" : "不支給"}→${a.eligible ? "支給" : "不支給"}`
    : "支給額変更";
  pushCause(
    out,
    "特別児童扶養手当",
    a.confidence || b.confidence || "strict",
    `${eligibility}、年額 ${wan(b.annualWan)}→${wan(a.annualWan)}`
  );
}

/**
 * 福祉手当の年額・扶養義務者判定の変化を原因行に追加する。
 * @remarks N01-2 差分。単位: 万円/年。式・境界条件・丸めは移動前の実装を維持。
 * @param {*} out 判定対象・区分または補助値（呼出側の定義に従う）
 * @param {*} before 判定対象・区分または補助値（呼出側の定義に従う）
 * @param {*} after 判定対象・区分または補助値（呼出側の定義に従う）
 * @returns {*} void（配列更新）。単位: 万円/年
 */
function compareWelfareAllowance(out, before, after) {
  const b = before?.programs?.welfareAllowance || {};
  const a = after?.programs?.welfareAllowance || {};
  if (!changed(b.annualWan, a.annualWan) && !changed(b.obligorOk, a.obligorOk)) return;
  const status = changed(b.obligorOk, a.obligorOk)
    ? `扶養義務者判定 ${b.obligorOk ? "通過" : "停止"}→${a.obligorOk ? "通過" : "停止"}`
    : "支給額変更";
  pushCause(
    out,
    "障害児福祉手当",
    a.confidence || b.confidence || "strict",
    `${status}、年額 ${wan(b.annualWan)}→${wan(a.annualWan)}`
  );
}

/**
 * 利用料内訳の世帯員識別キーを取得する。
 * @remarks 通所差分。単位: 無単位。式・境界条件・丸めは移動前の実装を維持。
 * @param {*} detail 判定対象・区分または補助値（呼出側の定義に従う）
 * @returns {*} string。単位: 無単位
 */
function detailKey(detail) {
  return String(detail?.who || "");
}

// 制度上の負担上限月額（区分と年齢から導出）。コアは実負担(min結果)しか持たないため表示側で復元。
/**
 * 年齢と区分から説明用の制度上限月額を復元する。実負担とは区別する。
 * @remarks 通所差分。単位: 円/月。式・境界条件・丸めは移動前の実装を維持。
 * @param {*} detail 判定対象・区分または補助値（呼出側の定義に従う）
 * @returns {*} number。単位: 円/月
 */
function statutoryCapYen(detail) {
  const type = String(detail?.type || "");
  const age = toNumber(detail?.age, 0);
  if (type === "非課税" || type === "無償化") return 0;
  if (type === "一般2") return 37200;
  if (type === "一般1") return age >= 18 ? 9300 : 4600;
  return 0;
}

/**
 * 児童別と世帯合算の利用料変化を比較し、同じ内容の説明はまとめる。
 * @remarks 通所差分。単位: 円/月と万円/年。式・境界条件・丸めは移動前の実装を維持。
 * @param {*} out 判定対象・区分または補助値（呼出側の定義に従う）
 * @param {*} before 判定対象・区分または補助値（呼出側の定義に従う）
 * @param {*} after 判定対象・区分または補助値（呼出側の定義に従う）
 * @returns {*} void（配列更新）。単位: 円/月と万円/年
 */
function compareService(out, before, after) {
  const b = before?.programs?.service || {};
  const a = after?.programs?.service || {};
  const beforeDetails = new Map((b.details || []).map((d) => [detailKey(d), d]));
  const afterDetails = new Map((a.details || []).map((d) => [detailKey(d), d]));
  const changes = [];
  for (const [who, next] of afterDetails) {
    const prev = beforeDetails.get(who) || {};
    if (!changed(prev.type, next.type) && !changed(prev.monthlyUpperYen, next.monthlyUpperYen)) continue;
    changes.push({ who, prev, next });
  }
  if (!changes.length && !changed(b.annualWan, a.annualWan)) return;

/**
   * 採用実負担を取得し、欠損時だけ制度上限を使う。
   * @remarks 通所差分。単位: 円/月。式・境界条件・丸めは移動前の実装を維持。
   * @param {*} detail 判定対象・区分または補助値（呼出側の定義に従う）
   * @returns {*} number。単位: 円/月
   */
  const adoptedMonthlyYen = (detail) => {
    const value = toNumber(detail?.monthlyUpperYen, NaN);
    return Number.isFinite(value) ? value : statutoryCapYen(detail);
  };

/**
   * 通所区分・採用月額・制度上限と代表値の説明文字列を作る。
   * @remarks 通所差分。単位: 円/月。式・境界条件・丸めは移動前の実装を維持。
   * @returns {*} string。単位: 円/月
   */
  const describe = ({ prev, next }) => {
    const prevType = prev.type || "対象外";
    const nextType = next.type || "対象外";
    const prevAdopted = adoptedMonthlyYen(prev);
    const nextAdopted = adoptedMonthlyYen(next);
    const prevCap = statutoryCapYen(prev);
    const nextCap = statutoryCapYen(next);
    let s = `${prevType}→${nextType}、月額負担 ${yen(prevAdopted)}→${yen(nextAdopted)}`;
    // 一般2は制度上限ではなく代表値を採用するため、上限との差を注記する。
    if (next.rawMonthlyYen != null && next.rawMonthlyYen < nextCap) {
      s += `（制度上限 ${yen(prevCap)}→${yen(nextCap)}、代表値 ${yen(next.rawMonthlyYen)}を採用）`;
    }
    return s;
  };
/**
   * 同内容の通所変化を統合表示するための識別文字列を作る。
   * @remarks 通所差分。単位: 無単位。式・境界条件・丸めは移動前の実装を維持。
   * @returns {*} string。単位: 無単位
   */
  const signature = ({ prev, next }) =>
    `${prev.type || "対象外"}→${next.type || "対象外"}|${adoptedMonthlyYen(prev)}→${adoptedMonthlyYen(next)}|${statutoryCapYen(prev)}→${statutoryCapYen(next)}|${next.rawMonthlyYen}`;
  let text;
  if (!changes.length) {
    text = `年額利用料 ${wan(b.annualWan)}→${wan(a.annualWan)}`;
  } else if (changes.every((c) => signature(c) === signature(changes[0]))) {
    // 全児で変化内容が同一なら畳む（児童名・世帯上限行は重複なので省く）
    text = describe(changes[0]);
  } else {
    const pieces = changes.map((c) => `${c.who}: ${describe(c)}`);
    if (changed(b.monthlyTotalYen, a.monthlyTotalYen)) {
      pieces.push(`世帯上限 ${yen(b.monthlyTotalYen)}→${yen(a.monthlyTotalYen)}`);
    }
    text = pieces.join(" / ");
  }
  pushCause(out, "障害児通所支援", a.confidence || b.confidence || "strict", text);
}

/**
 * 医療費助成の資格・自己負担変化を原因行へ追加する。
 * @remarks M01 差分。単位: 万円/年。式・境界条件・丸めは移動前の実装を維持。
 * @param {*} out 判定対象・区分または補助値（呼出側の定義に従う）
 * @param {*} before 判定対象・区分または補助値（呼出側の定義に従う）
 * @param {*} after 判定対象・区分または補助値（呼出側の定義に従う）
 * @returns {*} void（配列更新）。単位: 万円/年
 */
function compareM01(out, before, after) {
  const b = before?.programs?.m01 || {};
  const a = after?.programs?.m01 || {};
  if (!changed(b.annualWan, a.annualWan) && !changed(b.eligible, a.eligible)) return;
  const status = changed(b.eligible, a.eligible)
    ? `${b.eligible ? "該当" : "非該当"}→${a.eligible ? "該当" : "非該当"}`
    : `${b.status || "不明"}→${a.status || "不明"}`;
  pushCause(
    out,
    "重心医療費助成",
    a.confidence || b.confidence || "representative",
    `${status}、医療費自己負担 ${wan(b.medicalCostBurdenWan)}→${wan(a.medicalCostBurdenWan)}`
  );
}

/**
 * 就学奨励費の区分・年額変化を原因行へ追加する。
 * @remarks N04 差分。単位: 万円/年。式・境界条件・丸めは移動前の実装を維持。
 * @param {*} out 判定対象・区分または補助値（呼出側の定義に従う）
 * @param {*} before 判定対象・区分または補助値（呼出側の定義に従う）
 * @param {*} after 判定対象・区分または補助値（呼出側の定義に従う）
 * @returns {*} void（配列更新）。単位: 万円/年
 */
function compareN04(out, before, after) {
  const b = before?.programs?.n04 || {};
  const a = after?.programs?.n04 || {};
  if (!changed(b.annualWan, a.annualWan) && !changed(b.supportClass, a.supportClass)) return;
  pushCause(
    out,
    "就学奨励費",
    a.confidence || b.confidence || "provisional",
    `支弁区分 ${b.supportClass || b.status || "対象外"}→${a.supportClass || a.status || "対象外"}、教育費負担軽減 ${wan(b.annualWan)}→${wan(a.annualWan)}`
  );
}

/**
 * 配偶者控除と特別控除の変化を税目ごとに説明する。
 * @remarks 税控除差分。単位: 万円。式・境界条件・丸めは移動前の実装を維持。
 * @param {*} out 判定対象・区分または補助値（呼出側の定義に従う）
 * @param {*} before 判定対象・区分または補助値（呼出側の定義に従う）
 * @param {*} after 判定対象・区分または補助値（呼出側の定義に従う）
 * @returns {*} void（配列更新）。単位: 万円
 */
function compareSpouseDeductions(out, before, after) {
  const b = before?.deductions || {};
  const a = after?.deductions || {};
  const bSpouse = b.spouse || {};
  const aSpouse = a.spouse || {};
  const bSpecial = b.spouseSpecial || {};
  const aSpecial = a.spouseSpecial || {};
  if (changed(bSpouse.itWan, aSpouse.itWan) || changed(bSpouse.ltWan, aSpouse.ltWan)) {
    pushCause(
      out,
      "配偶者控除",
      "strict",
      `控除額 所得税 ${wan(bSpouse.itWan)}→${wan(aSpouse.itWan)}、住民税 ${wan(bSpouse.ltWan)}→${wan(aSpouse.ltWan)}`
    );
  }
  if (changed(bSpecial.itWan, aSpecial.itWan) || changed(bSpecial.ltWan, aSpecial.ltWan)) {
    pushCause(
      out,
      "配偶者特別控除",
      "strict",
      `控除額 所得税 ${wan(bSpecial.itWan)}→${wan(aSpecial.itWan)}、住民税 ${wan(bSpecial.ltWan)}→${wan(aSpecial.ltWan)}`
    );
  }
}

/**
 * 他の原因がない場合に税・保険・給付・負担の差を説明する。
 * @remarks 崖の原因補助。単位: 万円/年。表示変化閾値0.05。式・境界条件・丸めは移動前の実装を維持。
 * @param {*} out 判定対象・区分または補助値（呼出側の定義に従う）
 * @param {*} before 判定対象・区分または補助値（呼出側の定義に従う）
 * @param {*} after 判定対象・区分または補助値（呼出側の定義に従う）
 * @returns {*} void（配列更新）。単位: 万円/年。表示変化閾値0.05
 */
function compareFallback(out, before, after) {
  if (out.length) return;
  const bTax = toNumber(before?.tax?.totalWan);
  const aTax = toNumber(after?.tax?.totalWan);
  const bSocial = toNumber(before?.socialInsurance?.totalWan);
  const aSocial = toNumber(after?.socialInsurance?.totalWan);
  const bAllowance = toNumber(before?.allowance?.totalWan);
  const aAllowance = toNumber(after?.allowance?.totalWan);
  const bBurden = toNumber(before?.costBurden?.totalWan);
  const aBurden = toNumber(after?.costBurden?.totalWan);
  const pieces = [];
  if (changed(bTax, aTax, 0.05)) pieces.push(`税 ${wan(bTax)}→${wan(aTax)}`);
  if (changed(bSocial, aSocial, 0.05)) pieces.push(`社会保険料 ${wan(bSocial)}→${wan(aSocial)}`);
  if (changed(bAllowance, aAllowance, 0.05)) pieces.push(`現金給付 ${wan(bAllowance)}→${wan(aAllowance)}`);
  if (changed(bBurden, aBurden, 0.05)) pieces.push(`自己負担 ${wan(bBurden)}→${wan(aBurden)}`);
  pushCause(out, "その他", "strict", pieces.length ? pieces.join(" / ") : "主要制度・控除の状態変化なし");
}

/**
 * 隣接する二つの給与点の内訳から制度別の変化原因を列挙する。
 * @remarks 崖の原因。単位: 表示内の金額は万円/年または円/月。式・境界条件・丸めは移動前の実装を維持。
 * @param {*} beforePoint 判定対象・区分または補助値（呼出側の定義に従う）
 * @param {*} afterPoint 判定対象・区分または補助値（呼出側の定義に従う）
 * @returns {*} 原因オブジェクト配列。単位: 表示内の金額は万円/年または円/月
 */
export function explainCliffCauses(beforePoint, afterPoint) {
  const before = beforePoint?.breakdown || {};
  const after = afterPoint?.breakdown || {};
  const out = [];
  compareTcca(out, before, after);
  compareWelfareAllowance(out, before, after);
  compareService(out, before, after);
  compareM01(out, before, after);
  compareN04(out, before, after);
  compareSpouseDeductions(out, before, after);
  compareFallback(out, before, after);
  return out;
}

/**
 * 下落閾値と表示範囲に従い崖・Q/R・回復幅・原因を抽出する。
 * @remarks 崖/Q/R。単位: 給与・幅・可処分所得=万円。dropは1桁丸め。式・境界条件・丸めは移動前の実装を維持。
 * @param {Array} series 計算行・系列または設定行の配列
 * @param {object} options 世帯・制度設定または計算条件
 * @returns {*} 崖レコード配列。単位: 給与・幅・可処分所得=万円。dropは1桁丸め
 */
export function detectCliffCauseRows(series, options = {}) {
  const minDropManyen = toNumber(options.minDropManyen, 3);
  const xMin = toNumber(options.xMin, -Infinity);
  const xMax = toNumber(options.xMax, Infinity);
  const yAtMax = toNumber(series.find((p) => toNumber(p?.x) === xMax)?.disposable ?? series[series.length - 1]?.disposable);
  const rows = [];
  for (let i = 1; i < series.length; i += 1) {
    const before = series[i - 1];
    const after = series[i];
    if (toNumber(after?.x) < xMin || toNumber(after?.x) > xMax) continue;
    const delta = toNumber(after?.disposable) - toNumber(before?.disposable);
    if (delta > -minDropManyen) continue;
    const causes = explainCliffCauses(before, after);
    const q = findQ(series, i, toNumber(after?.disposable));
    const r = findR(series, i, toNumber(before?.disposable), xMax);
    rows.push({
      index: rows.length + 1,
      salaryManyen: toNumber(after?.x),
      yBeforeWan: toNumber(before?.disposable),
      yAfterWan: toNumber(after?.disposable),
      dropManyen: Math.round(delta * 10) / 10,
      qSalaryManyen: q ? toNumber(q.x) : null,
      ineffectiveWidthManyen: q ? toNumber(after?.x) - toNumber(q.x) : null,
      rSalaryManyen: r ? toNumber(r.x) : null,
      recoveryWidthManyen: r ? toNumber(r.x) - toNumber(after?.x) : null,
      unrecoveredShortfallWan: r ? 0 : Math.max(0, toNumber(before?.disposable) - yAtMax),
      causes,
    });
  }
  return rows;
}

/**
 * 下落後水準以下にあった最後の給与点を後方探索する。
 * @remarks 崖/Q。単位: 給与・可処分所得=万円。式・境界条件・丸めは移動前の実装を維持。
 * @param {Array} series 計算行・系列または設定行の配列
 * @param {*} cliffIndex 判定対象・区分または補助値（呼出側の定義に従う）
 * @param {*} yAfter 判定対象・区分または補助値（呼出側の定義に従う）
 * @returns {*} Pointまたはnull。単位: 給与・可処分所得=万円
 */
function findQ(series, cliffIndex, yAfter) {
  for (let i = cliffIndex - 1; i >= 0; i -= 1) {
    const point = series[i];
    if (toNumber(point?.disposable) <= yAfter) return point;
  }
  return null;
}

/**
 * 下落前水準へ初めて回復する給与点を上限まで前方探索する。
 * @remarks 崖/R。単位: 給与・可処分所得=万円。式・境界条件・丸めは移動前の実装を維持。
 * @param {Array} series 計算行・系列または設定行の配列
 * @param {*} cliffIndex 判定対象・区分または補助値（呼出側の定義に従う）
 * @param {*} yBefore 判定対象・区分または補助値（呼出側の定義に従う）
 * @param {*} xMax 判定対象・区分または補助値（呼出側の定義に従う）
 * @returns {*} Pointまたはnull。単位: 給与・可処分所得=万円
 */
function findR(series, cliffIndex, yBefore, xMax) {
  for (let i = cliffIndex + 1; i < series.length; i += 1) {
    const point = series[i];
    if (toNumber(point?.x) > xMax) return null;
    if (toNumber(point?.disposable) >= yBefore) return point;
  }
  return null;
}
