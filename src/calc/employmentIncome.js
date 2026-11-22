/**
 * 一人・一年分の給与収入から給与所得控除後の金額（所得金額調整控除前）を求める。
 * @param {number} grossYen その人の年間給与収入（整数円）。給与なしは0、未入力は0としない。
 * @param {number} incomeYear 所得を得た暦年（2025／2026）。住民税や保険料の「年度」ではない。
 * @returns {number} 整数円。配偶者・子・保険の条件も、前年給与の仮定も使わない。
 * 国税庁「電子計算機等による年末調整」各年p.1。R8は12月施行の年末確定額。
 * https://www.nta.go.jp/publication/pamph/gensen/nencho2025/pdf/204.pdf
 * https://www.nta.go.jp/publication/pamph/gensen/nencho2026/pdf/204.pdf
 * 2,000万円超は年末調整対象外だが、給与所得控除自体の上限は同じ（国税庁No.1410）。
 */
export function salaryIncomeBeforeAdjustmentYen(grossYen, incomeYear) {
  if (!Number.isSafeInteger(grossYen) || grossYen < 0) throw new RangeError("給与収入には0以上の整数円が必要です。");
  if (incomeYear !== 2025 && incomeYear !== 2026) throw new RangeError("給与所得は令和7・8年分のみ対応しています。");
  if (incomeYear === 2025) {
    if (grossYen < 651000) return 0;
    if (grossYen < 1900000) return grossYen - 650000;
  } else {
    if (grossYen < 741000) return 0;
    if (grossYen < 2191000) return grossYen - 740000;
    if (grossYen < 2193000) return 1451000;
    if (grossYen < 2196000) return 1453000;
    if (grossYen < 2200000) return 1456000;
  }
  // 4000円ごとの階級下端に70%／80%を掛ける。元の給与に直接掛けない。
  if (grossYen < 3600000) return Math.floor(grossYen / 4000) * 2800 - 80000;
  if (grossYen < 6600000) return Math.floor(grossYen / 4000) * 3200 - 440000;
  if (grossYen < 8500000) return Math.floor(grossYen * 9 / 10) - 1100000;
  return grossYen - 1950000;
}

/**
 * 子ども・特別障害者等に係る所得金額調整控除（年額、円）。給与・年金の併給調整とは別。
 * 適用資格は呼出側が指定する。夫婦で一方だけに割り当てる控除ではない。
 * 国税庁 No.1411：(上限1,000万円の給与－850万円)×10%、端数は上の給与所得計算と逆に切上げ。
 * https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1411.htm
 */
export function childOrDisabilityIncomeAdjustmentYen(grossYen, eligible) {
  if (!Number.isSafeInteger(grossYen) || grossYen < 0 || typeof eligible !== "boolean") {
    throw new RangeError("給与収入（整数円）と控除の適用可否が必要です。");
  }
  if (!eligible || grossYen <= 8500000) return 0;
  return Math.ceil((Math.min(grossYen, 10000000) - 8500000) / 10);
}
