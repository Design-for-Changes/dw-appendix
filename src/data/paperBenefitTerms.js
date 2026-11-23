// 各図で共通に使う表示名。通所負担は、試算で利用額を設定する障害児通所支援に限る。
export const PAPER_BOUNDARY_LABELS = {
  "N01-1": "特児",
  "N01-2": "児福",
  "N02/N03": "通所負担の上限",
};
// 通所以外の対象負担を含む場合は、合計を「通所負担」とは呼ばない。
export const serviceChargeName = otherMonthlyYen => otherMonthlyYen > 0 ? "合算対象サービスの利用者負担" : "通所負担";
export const PAPER_TERM_KEY = "特別児童扶養手当（特児）、障害児福祉手当（児福）、障害児通所支援の利用者負担（通所負担）";
