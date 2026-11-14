/**
 * 制度横断的調整の探索モデル。現行制度の計算と分離した純粋関数。
 * 実態分布・財政影響・最適な給付水準を推定する処理ではない。
 */

/**
 * 探索モデルの暫定パラメータ。careNeedMonthlyYenは令和7年度手当額の代理値。
 * 現行給付側の年度とは異なり、実測した介護費用ではなくモデル比較用の暫定設定である。
 */
export const DEFAULT_OPTIMAL_MODEL = {
  lowerRatio: 1.5,
  upperRatio: 2.5,
  burdenRate: 0.1,
  supportMultiplier: 2.18,
  careNeedMonthlyYen: 16100,
};

/** 数値を閉区間[min,max]へ制限する（単位を持たない比率の逓減・逓増に使用）。 */
function clampRatio(value, min, max) {
  return Math.max(min, Math.min(max, Number(value)));
}

/**
 * 同一の現行制度系列から、需要D・支給G・負担上限U・精算後所得Yを算出する。
 * 金額変数のWanは万円/年、原系列のNeedYenは円/月。
 * Hcは手当額を追加需要の代理とする暫定設定であり、観測した介護費用ではない。
 * Eplanは掃引内の最大負担と最大教育助成から置く世帯定数、Eextraは0で固定する。
 * 税・社会保険料の計算は原系列を利用し、制度横断的調整のみをここで行う。
 * @param {Array<object>} series 現行制度の給与点別計算結果（同一世帯・同一年度）
 * @param {object} household モデル世帯の条件（childrenの手当対象フラグを使用）
 * @param {object} parameters 逓減区間・負担率・保障係数・常時介護代理額
 * @returns {object} 需要・支出の世帯定数と、各給与点の支給/負担/所得系列
 */
export function computeOptimalModel(series, household, parameters = DEFAULT_OPTIMAL_MODEL) {
  const referenceN04 = series[0]?.breakdown?.programs?.n04 || {};
  const disabilityNeedAnnualWan =
    Number(referenceN04.need?.disabilityAdditionYen || 0) * 12 / 10000;
  const careNeedCount = (household?.children || [])
    .filter((child) => Boolean(child.childWelfareAllowance)).length;
  const careNeedAnnualWan =
    careNeedCount * parameters.careNeedMonthlyYen * 12 / 10000;
  const additionalNeedAnnualWan =
    disabilityNeedAnnualWan + careNeedAnnualWan;
  const currentNeedAnnualWan =
    Number(referenceN04.judgment?.monthlyNeedYen || 0) * 12 / 10000;
  const baseNeedAnnualWan =
    currentNeedAnnualWan - disabilityNeedAnnualWan;
  const needAnnualWan =
    baseNeedAnnualWan + additionalNeedAnnualWan;
  const baseSupportWan =
    parameters.supportMultiplier * additionalNeedAnnualWan;
  const maxCurrentBurdenWan = Math.max(
    ...series.map((point) => {
      const disposable = point.breakdown?.disposable || {};
      return (
        Number(disposable.medicalCostBurdenWan || 0) +
        Number(disposable.serviceFeeWan || 0) +
        Number(disposable.educationCostBurdenWan || 0)
      );
    })
  );
  const maxExistingExpenseReliefWan = Math.max(
    ...series.map((point) =>
      Number(point.breakdown?.programs?.n04?.educationCostReliefWan || 0)
    )
  );
  const plannedExpenseWan =
    maxCurrentBurdenWan + maxExistingExpenseReliefWan;
  const additionalExpenseWan = 0;
  const eligibleExpenseWan =
    plannedExpenseWan + additionalExpenseWan;
  const rawOptimalSeries = series.map((point) => {
    const programs = point.breakdown?.programs || {};
    const n04 = programs.n04 || {};
    const allowance = point.breakdown?.allowance || {};
    const disposable = point.breakdown?.disposable || {};
    const currentDirectSupportWan =
      Number(allowance.tccaWan || 0) + Number(allowance.welfareAllowanceWan || 0);
    const otherCashSupportWan = Math.max(
      0,
      Number(allowance.totalWan || 0) - currentDirectSupportWan
    );
    const takeHomeWan = Number(point.breakdown?.takeHome?.takeHomeWan || 0);
    const preSupportResourcesWan = takeHomeWan + otherCashSupportWan;
    const supportRatio =
      needAnnualWan > 0 ? preSupportResourcesWan / needAnnualWan : Infinity;
    const supportTransition = Number.isFinite(supportRatio)
      ? clampRatio(
          (supportRatio - parameters.lowerRatio) /
            (parameters.upperRatio - parameters.lowerRatio),
          0,
          1
        )
      : 1;
    const directSupportWan = baseSupportWan * (1 - supportTransition);
    const postSupportResourcesWan = preSupportResourcesWan + directSupportWan;
    const burdenRatio =
      needAnnualWan > 0 ? postSupportResourcesWan / needAnnualWan : Infinity;
    const burdenTransition = Number.isFinite(burdenRatio)
      ? clampRatio(
          (burdenRatio - parameters.lowerRatio) /
            (parameters.upperRatio - parameters.lowerRatio),
          0,
          1
        )
      : 1;
    const burdenCapWan =
      parameters.burdenRate * needAnnualWan * burdenTransition;
    const referenceBalanceWan = directSupportWan - burdenCapWan;
    const existingExpenseReliefWan = Number(n04.educationCostReliefWan || 0);
    const currentBurdenWan =
      Number(disposable.medicalCostBurdenWan || 0) +
      Number(disposable.serviceFeeWan || 0) +
      Number(disposable.educationCostBurdenWan || 0);
    const currentBalanceWan =
      currentDirectSupportWan + existingExpenseReliefWan - currentBurdenWan;
    const modelBurdenWan = Math.min(eligibleExpenseWan, burdenCapWan);
    const rawModelBalanceWan = directSupportWan - modelBurdenWan;
    return {
      x: Number(point.x),
      needAnnualWan,
      baseNeedAnnualWan,
      disabilityNeedAnnualWan,
      careNeedAnnualWan,
      additionalNeedAnnualWan,
      preSupportResourcesWan,
      supportRatio,
      supportTransition,
      directSupportWan,
      postSupportResourcesWan,
      burdenRatio,
      burdenTransition,
      burdenCapWan,
      referenceBalanceWan,
      rawModelBalanceWan,
      currentBalanceWan,
      currentDirectSupportWan,
      otherCashSupportWan,
      existingExpenseReliefWan,
      currentBurdenWan,
      plannedExpenseWan,
      additionalExpenseWan,
      eligibleExpenseWan,
      modelBurdenWan,
      refundWan: Math.max(0, eligibleExpenseWan - modelBurdenWan),
      disposableFloorWan:
        postSupportResourcesWan - burdenCapWan,
      takeHomeWan,
      currentDisposableWan: Number(disposable.disposableWan || 0),
    };
  });
  const optimalSeries = rawOptimalSeries.map((point) => {
    const balanceWan = point.rawModelBalanceWan;
    return {
      ...point,
      balanceWan,
      adjustmentWan: balanceWan - point.currentBalanceWan,
      optimalDisposableWan:
        point.takeHomeWan + point.otherCashSupportWan + balanceWan,
    };
  });

  return {
    ...parameters,
    baseSupportWan,
    baseNeedAnnualWan,
    disabilityNeedAnnualWan,
    careNeedCount,
    careNeedAnnualWan,
    additionalNeedAnnualWan,
    needAnnualWan,
    plannedExpenseWan,
    additionalExpenseWan,
    eligibleExpenseWan,
    series: optimalSeries,
  };
}
