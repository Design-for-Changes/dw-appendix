import data from "../data/patternSalaryEnvelopes.json";
import {comparePatternEnvelopes} from "./allPatternsCore.js";

/**
 * 指定された世帯条件について、給与格子上の可処分所得差の両端を障害要件の組み合わせごとに求める。
 * @param {object} conditions 各児の年齢と通所負担月額。
 * @returns {object[]} 選択した子どもの人数に対応する全パターンの可処分所得差の最小点・最大点。
 */
export function compareAllPatterns(conditions) {
  return comparePatternEnvelopes(conditions,data);
}
