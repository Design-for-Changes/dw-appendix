

/**
 * 年度キーをs1/s2/s3へ正規化する。未知の値はs2とする。
 * @remarks 年度条件。単位: 無単位。式・境界条件・丸めは移動前の実装を維持。
 * @param {string} scenario 年度キー（s1/s2/s3または旧別名）
 * @returns {*} string（s1/s2/s3）。単位: 無単位
 */
export function normalizeScenario(scenario) {
  const s = String(scenario || "s2");
  if (s === "S1_R6") return "s1";
  if (s === "S2_R7") return "s2";
  if (s === "S3_R8_R9") return "s3";
  return ["s1", "s2", "s3"].includes(s) ? s : "s2";
}

/**
 * 有限数へ変換し、不正値は指定の既定値へ置き換える。
 * @remarks 共通。単位: 入力の単位を維持。式・境界条件・丸めは移動前の実装を維持。
 * @param {*} v 判定対象・区分または補助値（呼出側の定義に従う）
 * @param {*} fallback 判定対象・区分または補助値（呼出側の定義に従う）
 * @returns {*} number。単位: 入力の単位を維持
 */
export function toNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * 万円値を指定小数桁で四捨五入する。既定は小数4桁。
 * @remarks 表示内訳。単位: 万円。式・境界条件・丸めは移動前の実装を維持。
 * @param {*} v 判定対象・区分または補助値（呼出側の定義に従う）
 * @param {*} digits 判定対象・区分または補助値（呼出側の定義に従う）
 * @returns {*} number。単位: 万円
 */
export function roundWan(v, digits = 4) {
  const m = 10 ** digits;
  return Math.round(toNumber(v, 0) * m) / m;
}

/**
 * 控除内訳を万円4桁へ丸め、常時表示指定以外のゼロ行を除く。
 * @remarks 表示内訳。単位: 万円。式・境界条件・丸めは移動前の実装を維持。
 * @param {Array} items 計算行・系列または設定行の配列
 * @returns {*} 控除配列。単位: 万円
 */
export function compactDeductions(items) {
  return (Array.isArray(items) ? items : [])
    .map((item) => ({ ...item, wan: roundWan(item?.wan, 4) }))
    .filter((item) => Boolean(item?.alwaysShow) || Math.abs(toNumber(item?.wan, 0)) > 1e-9)
    .map(({ alwaysShow, ...item }) => item);
}
