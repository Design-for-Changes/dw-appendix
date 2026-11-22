// x＝世帯主給与、y＝配偶者給与。両軸とも1万円刻み。可処分所得の増減ではなく制度の判定を見る。
const IDS = ["N01-1", "N01-2", "N02/N03"];
const MAX = 1500;

/** 支給額の正・ゼロ・比較不能を区別し、同じ支給状態に線を引かないための判定符号を返す。 */
function paymentCode(yen) {
  return !Number.isSafeInteger(yen) || yen < 0 ? 0 : yen > 0 ? 2 : 1;
}
/** 給与点での二つの手当の支給状態と、利用中のサービスの世帯上限を一つの整数に格納する。 */
export function decisionCodes(point) {
  if (point?.status !== "calculated") return 0;
  const {benefits, service} = point.details ?? {};
  let cap = 0;
  if (service?.hasCapApplicableServiceUse) {
    // 実際の支払額が同じでも、利用するサービスの月額上限区分が変われば描く。
    const limit = service.householdCapYen;
    cap = limit === 0 ? 1 : limit === 4600 ? 2 : limit === 37200 ? 3 : 0;
  }
  return paymentCode(benefits?.tcca) | (paymentCode(benefits?.welfare) << 2) | (cap << 4);
}

/** 隣接する二点間の制度区分の切替えを方向別に符号化し、変化がない場合は0を返す。 */
function transition(previous, current, shift) {
  const a = (previous >> shift) & 3, b = (current >> shift) & 3;
  return a && b && a !== b ? (a << 2) | b : 0;
}

/** 隣接する給与点の有効な制度区分の変化を、境界図と断面図で共通の制度IDに戻す。 */
export function changedSalaryDecisionSystems(previous,current) {
  return IDS.filter((_,i)=>transition(previous,current,2*i)!==0);
}

/**
 * 給与格子の縦横に隣接する有効な2点だけを比較する。境界線はそれらの中間（半目盛）に描く。
 * 斜線の補間はしない。直線上で同じ切替えが続く場合だけ連結し、穴・別制度をまたがない。
 * @param {object} calculator 同じ世帯条件で evaluate(世帯主給与, 配偶者給与) する既存の計算器。
 * @param {object} options maxSalaryWan は両軸上限（万円）、onProgress は完了率（0～100）。
 * @returns {object} 有効点数と3制度それぞれの線分 [x1,y1,x2,y2]（万円）。
 */
export function buildSalaryDecisionMap(calculator, {maxSalaryWan = MAX, onProgress} = {}) {
  if (!Number.isInteger(maxSalaryWan) || maxSalaryWan < 0 || maxSalaryWan > MAX)
    throw new RangeError("給与上限は0～1,500万円の整数で指定してください。");
  const n = maxSalaryWan, width = n + 1;
  const layers = IDS.map(id => ({id, segments:[]}));
  const above = new Uint8Array(width);
  const openV = IDS.map(() => new Uint8Array(width)), startV = IDS.map(() => new Uint16Array(width));
  const openH = new Uint8Array(3), startH = new Uint16Array(3);
  /** 給与点を囲む半目盛の左端（または下端）を軸の表示範囲内に収める。 */
  const lower = i => Math.max(0, i - 0.5);
  /** 給与点を囲む半目盛の右端（または上端）を軸の表示範囲内に収める。 */
  const upper = i => Math.min(n, i + 0.5);
  let validCount = 0, previousPercent = 0;
  onProgress?.(0);
  for (let y = 0; y <= n; y++) {
    let left = 0;
    openH.fill(0);
    for (let x = 0; x <= n; x++) {
      const pt = (x === 0 && y === 0) ? null : calculator.evaluate(x, y);
      if (pt?.status === "calculated") validCount++;
      const current = decisionCodes(pt), up = above[x];
      for (let j = 0; j < IDS.length; j++) {
        const v = transition(left, current, 2*j), h = transition(up, current, 2*j);
        const lines = layers[j].segments;
        if (v !== openV[j][x]) {
          if (openV[j][x]) lines.push([x-0.5, lower(startV[j][x]), x-0.5, upper(y-1)]);
          openV[j][x] = v;
          if (v) startV[j][x] = y;
        }
        if (h !== openH[j]) {
          if (openH[j]) lines.push([lower(startH[j]), y-0.5, upper(x-1), y-0.5]);
          openH[j] = h;
          if (h) startH[j] = x;
        }
      }
      above[x] = current;
      left = current;
    }
    for (let j = 0; j < IDS.length; j++) {
      if (openH[j]) layers[j].segments.push([lower(startH[j]), y-0.5, n, y-0.5]);
    }
    const percent = Math.floor(100*(y+1)/width);
    if (percent !== previousPercent) { onProgress?.(percent); previousPercent = percent; }
  }
  for (let j = 0; j < IDS.length; j++) {
    for (let x = 1; x <= n; x++) {
      if (openV[j][x]) layers[j].segments.push([x-0.5, lower(startV[j][x]), x-0.5, n]);
    }
  }
  return {maxSalaryWan:n, validCount, layers};
}
