/**
 * 所得逆転の緩和方法を調べるための条件付き比較例。
 * 政策上の最適化、財政中立化又は障害追加費用の推計は行わない。
 */

/** 比率を0〜1に制限する。金額を丸める関数ではない。 */
function unitInterval(value) {
  return Math.max(0, Math.min(1, value));
}

/** 欠損や数値文字列を0円へ暗黙変換せず、有限の金額入力だけを受け付ける。 */
function requireFiniteNumber(value, name) {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new TypeError(`${name}は有限の数値が必要です。`);
  return value;
}

/**
 * 給与掃引範囲内の最大現金給付を上限Bとして、支給Gと負担上限Uを連続化する。
 * @param {Array<object>} series 同じ家族・利用条件における給与系列
 * @param {object} options 年間需要額と対象実支出、逓減区間、負担上限率
 * @returns {object} 円滑化の比較系列と、同じ給与での現行との差
 * @remarks 金額は全て万円/年。Bは系列範囲に依存し、制度上の満額を保証しない。
 * 既存手当額を追加需要と呼んで係数を重ねない。
 */
export function computeIllustrativeAdjustment(series, options) {
  const { needAnnualWan, eligibleExpenseAnnualWan, lowerRatio = 1.5, upperRatio = 2.5, burdenRate = 0.1 } = options || {};
  for (const [name, value] of Object.entries({ needAnnualWan, eligibleExpenseAnnualWan, lowerRatio, upperRatio, burdenRate })) requireFiniteNumber(value, name);
  if (!(needAnnualWan > 0) || !(eligibleExpenseAnnualWan >= 0) || !(upperRatio > lowerRatio) || !(burdenRate >= 0)) throw new RangeError("調整例の需要額・対象支出・比率の条件が不正です。");
  if (!Array.isArray(series) || !series.length) throw new RangeError("現行制度系列が必要です。");
  /** 総現金給付から取り出す調整対象の二手当額。欠損は未受給0円と区別する。 */
  const direct = (point) => requireFiniteNumber(point.breakdown?.allowance?.tccaWan, "特児額") + requireFiniteNumber(point.breakdown?.allowance?.welfareAllowanceWan, "障害児福祉手当額");
  const fullSupportAnnualWan = Math.max(...series.map(direct));
  const points = series.map((point) => {
    const allowance = point.breakdown?.allowance || {};
    const otherCashAnnualWan = requireFiniteNumber(allowance.totalWan, "現金給付合計") - direct(point);
    const takeHomeAnnualWan = requireFiniteNumber(point.breakdown?.takeHome?.takeHomeWan, "手取額");
    const beforeSupportAnnualWan = takeHomeAnnualWan + otherCashAnnualWan;
    const supportRatio = beforeSupportAnnualWan / needAnnualWan;
    const supportTransition = unitInterval((supportRatio - lowerRatio) / (upperRatio - lowerRatio));
    const supportAnnualWan = fullSupportAnnualWan * (1 - supportTransition);
    const afterSupportAnnualWan = beforeSupportAnnualWan + supportAnnualWan;
    const burdenRatio = afterSupportAnnualWan / needAnnualWan;
    const burdenTransition = unitInterval((burdenRatio - lowerRatio) / (upperRatio - lowerRatio));
    const burdenCapAnnualWan = burdenRate * needAnnualWan * burdenTransition;
    const finalBurdenAnnualWan = Math.min(eligibleExpenseAnnualWan, burdenCapAnnualWan);
    const refundAnnualWan = eligibleExpenseAnnualWan - finalBurdenAnnualWan;
    const disposableAnnualWan = afterSupportAnnualWan - finalBurdenAnnualWan;
    const currentDisposableAnnualWan = requireFiniteNumber(point.disposable, "現行可処分所得");
    return { x: requireFiniteNumber(point.x, "給与収入"), beforeSupportAnnualWan, supportRatio, supportTransition, supportAnnualWan, afterSupportAnnualWan, burdenRatio, burdenTransition, burdenCapAnnualWan, finalBurdenAnnualWan, refundAnnualWan, disposableAnnualWan, currentDisposableAnnualWan, differenceAnnualWan: disposableAnnualWan - currentDisposableAnnualWan };
  });
  return { kind: "illustrative-not-optimal", needAnnualWan, eligibleExpenseAnnualWan, fullSupportAnnualWan, lowerRatio, upperRatio, burdenRate, populationWeights: null, points, impact: summarizeAdjustmentImpact(points) };
}

/** 同じ給与における増減額と、負担増側になる連続給与区間を求める。人口比ではない。 */
export function summarizeAdjustmentImpact(points) {
  if (!points.length) return { minimumDifferenceAnnualWan: null, maximumDifferenceAnnualWan: null, lowerIncomeIntervals: [] };
  const lowerIncomeIntervals = [];
  let interval = null;
  for (const point of points) {
    if (point.differenceAnnualWan < -1e-9) {
      if (!interval) interval = { fromSalaryWan: point.x, toSalaryWan: point.x, minimumDifferenceAnnualWan: point.differenceAnnualWan };
      else { interval.toSalaryWan = point.x; interval.minimumDifferenceAnnualWan = Math.min(interval.minimumDifferenceAnnualWan, point.differenceAnnualWan); }
    } else if (interval) { lowerIncomeIntervals.push(interval); interval = null; }
  }
  if (interval) lowerIncomeIntervals.push(interval);
  return { minimumDifferenceAnnualWan: Math.min(...points.map((point) => point.differenceAnnualWan)), maximumDifferenceAnnualWan: Math.max(...points.map((point) => point.differenceAnnualWan)), lowerIncomeIntervals };
}
