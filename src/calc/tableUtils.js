export const clampInt = (n, lo, hi) => Math.max(lo, Math.min(hi, Math.trunc(n)));

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

export function interpTableValue(arr, xKey, xVal, yKey) {
  const x = Number(xVal);
  if (!Number.isFinite(x) || !arr || arr.length === 0) return 0;
  const lo = Math.floor(x);
  const hi = Math.ceil(x);
  const r0 = rowAtKeyInt(arr, xKey, lo);
  const r1 = rowAtKeyInt(arr, xKey, hi);
  const y0 = Number(r0?.[yKey]) || 0;
  const y1 = Number(r1?.[yKey]) || 0;
  if (hi === lo) return y0;
  const t = (x - lo) / (hi - lo);
  return y0 + (y1 - y0) * t;
}
