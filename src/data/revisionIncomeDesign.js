import design from "./revision-income-design.json";

// 旧279条件の試算結果・登録条件は引き継がず、両給与軸と新しい計算器の条件を共有する。
export const REVISION_INCOME_DESIGN = design;

/** 両端を含む各給与軸と、1家族構成・1利用額で比較する給与の組合せ数。 */
export function salaryGridSize() {
  const { min, max, step } = design.salary;
  const perAxis = (max - min) / step + 1;
  return { perAxis, pairs: perAxis ** 2 };
}

/** 入力中の空欄・単位未満の値・範囲外は所得ゼロと区別する。 */
export function readSalaryWan(value) {
  if (typeof value !== "number" && (typeof value !== "string" || !value.trim())) return null;
  const numeric = Number(value);
  const { min, max, step } = design.salary;
  return Number.isInteger(numeric) && numeric >= min && numeric <= max && (numeric - min) % step === 0 ? numeric : null;
}

/** 世帯の給与総額を変えずに、一方が取りうる給与の範囲（他方の上限・下限も守る）。 */
export function salaryBounds(total = null) {
  const { min, max } = design.salary;
  if (total === null) return { min, max };
  if (!Number.isInteger(total) || total < 2 * min || total > 2 * max) throw new RangeError("世帯給与総額が設定範囲外です。");
  return { min: Math.max(min, total - max), max: Math.min(max, total - min) };
}
