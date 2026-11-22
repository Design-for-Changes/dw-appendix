/**
 * 整数へ切り捨てた値を上下限の範囲に収める。
 * @remarks 表参照。単位: 整数。式・境界条件・丸めは移動前の実装を維持。
 * @param {number} n 入力値
 * @param {number} lo 下限値
 * @param {number} hi 上限値
 * @returns {number} 範囲内の整数
 */
export const clampInt = (n, lo, hi) => Math.max(lo, Math.min(hi, Math.trunc(n)));

/**
 * 添字一致の行を優先し、なければキーの最近傍行を取得する。
 * @remarks 表参照。単位: 入力表のキー単位。式・境界条件・丸めは移動前の実装を維持。
 * @param {*} arr 判定対象・区分または補助値（呼出側の定義に従う）
 * @param {*} key 判定対象・区分または補助値（呼出側の定義に従う）
 * @param {*} xInt 判定対象・区分または補助値（呼出側の定義に従う）
 * @returns {*} 行またはnull。単位: 入力表のキー単位
 */
export function rowAtKeyInt(arr, key, xInt) {
  if (!arr || arr.length === 0) return null;
  const idx = clampInt(xInt, 0, arr.length - 1);
  const r = arr[idx];
  if (r && Number(r[key]) === idx) return r;

  let best = arr[0];
  let min = Math.abs((arr[0][key] ?? 0) - xInt);
  for (const rr of arr) {
    const d = Math.abs((rr[key] ?? 0) - xInt);
    if (d < min) {
      min = d;
      best = rr;
    }
  }
  return best;
}
