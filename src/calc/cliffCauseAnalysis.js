function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function wan(value, digits = 1) {
  return `${toNumber(value).toFixed(digits)}万`;
}

function yen(value) {
  return `${Math.round(toNumber(value)).toLocaleString("ja-JP")}円`;
}

function changed(a, b, eps = 1e-9) {
  if (typeof a === "boolean" || typeof b === "boolean") return Boolean(a) !== Boolean(b);
  if (typeof a === "string" || typeof b === "string") return String(a ?? "") !== String(b ?? "");
  return Math.abs(toNumber(a) - toNumber(b)) > eps;
}

function pushCause(out, cause, confidence, whatHappened) {
  out.push({ cause, confidence, whatHappened });
}

function compareTcca(out, before, after) {
  const b = before?.programs?.tcca || {};
  const a = after?.programs?.tcca || {};
  if (!changed(b.annualWan, a.annualWan) && !changed(b.eligible, a.eligible)) return;
  const eligibility = changed(b.eligible, a.eligible)
    ? `${b.eligible ? "支給" : "不支給"}→${a.eligible ? "支給" : "不支給"}`
    : "支給額変更";
  pushCause(
    out,
    "特別児童扶養手当",
    a.confidence || b.confidence || "strict",
    `${eligibility}、年額 ${wan(b.annualWan)}→${wan(a.annualWan)}`
  );
}

function compareWelfareAllowance(out, before, after) {
  const b = before?.programs?.welfareAllowance || {};
  const a = after?.programs?.welfareAllowance || {};
  if (!changed(b.annualWan, a.annualWan) && !changed(b.obligorOk, a.obligorOk)) return;
  const status = changed(b.obligorOk, a.obligorOk)
    ? `扶養義務者判定 ${b.obligorOk ? "通過" : "停止"}→${a.obligorOk ? "通過" : "停止"}`
    : "支給額変更";
  pushCause(
    out,
    "障害児福祉手当",
    a.confidence || b.confidence || "strict",
    `${status}、年額 ${wan(b.annualWan)}→${wan(a.annualWan)}`
  );
}

function detailKey(detail) {
  return String(detail?.who || "");
}

function compareService(out, before, after) {
  const b = before?.programs?.service || {};
  const a = after?.programs?.service || {};
  const beforeDetails = new Map((b.details || []).map((d) => [detailKey(d), d]));
  const afterDetails = new Map((a.details || []).map((d) => [detailKey(d), d]));
  const pieces = [];
  for (const [who, next] of afterDetails) {
    const prev = beforeDetails.get(who) || {};
    if (!changed(prev.type, next.type) && !changed(prev.monthlyUpperYen, next.monthlyUpperYen)) continue;
    pieces.push(
      `${who}: ${prev.type || "対象外"}→${next.type || "対象外"}、月額上限 ${yen(prev.monthlyUpperYen)}→${yen(next.monthlyUpperYen)}`
    );
  }
  if (!pieces.length && !changed(b.annualWan, a.annualWan)) return;
  const text = pieces.length ? pieces.join(" / ") : `年額利用料 ${wan(b.annualWan)}→${wan(a.annualWan)}`;
  pushCause(out, "障害児通所支援", a.confidence || b.confidence || "strict", text);
}

function compareM01(out, before, after) {
  const b = before?.programs?.m01 || {};
  const a = after?.programs?.m01 || {};
  if (!changed(b.annualWan, a.annualWan) && !changed(b.eligible, a.eligible)) return;
  const status = changed(b.eligible, a.eligible)
    ? `${b.eligible ? "該当" : "非該当"}→${a.eligible ? "該当" : "非該当"}`
    : `${b.status || "不明"}→${a.status || "不明"}`;
  pushCause(
    out,
    "M01 重心医療費助成",
    a.confidence || b.confidence || "representative",
    `${status}、助成年額 ${wan(b.annualWan)}→${wan(a.annualWan)}`
  );
}

function compareN04(out, before, after) {
  const b = before?.programs?.n04 || {};
  const a = after?.programs?.n04 || {};
  if (!changed(b.annualWan, a.annualWan) && !changed(b.supportClass, a.supportClass)) return;
  pushCause(
    out,
    "N04 就学奨励費",
    a.confidence || b.confidence || "provisional",
    `支弁区分 ${b.supportClass || b.status || "対象外"}→${a.supportClass || a.status || "対象外"}、補助年額 ${wan(b.annualWan)}→${wan(a.annualWan)}`
  );
}

function compareSpouseDeductions(out, before, after) {
  const b = before?.deductions || {};
  const a = after?.deductions || {};
  const bSpouse = b.spouse || {};
  const aSpouse = a.spouse || {};
  const bSpecial = b.spouseSpecial || {};
  const aSpecial = a.spouseSpecial || {};
  if (changed(bSpouse.itWan, aSpouse.itWan) || changed(bSpouse.ltWan, aSpouse.ltWan)) {
    pushCause(
      out,
      "配偶者控除",
      "strict",
      `控除額 所得税 ${wan(bSpouse.itWan)}→${wan(aSpouse.itWan)}、住民税 ${wan(bSpouse.ltWan)}→${wan(aSpouse.ltWan)}`
    );
  }
  if (changed(bSpecial.itWan, aSpecial.itWan) || changed(bSpecial.ltWan, aSpecial.ltWan)) {
    pushCause(
      out,
      "配偶者特別控除",
      "strict",
      `控除額 所得税 ${wan(bSpecial.itWan)}→${wan(aSpecial.itWan)}、住民税 ${wan(bSpecial.ltWan)}→${wan(aSpecial.ltWan)}`
    );
  }
}

function compareFallback(out, before, after) {
  if (out.length) return;
  const bTax = toNumber(before?.tax?.totalWan);
  const aTax = toNumber(after?.tax?.totalWan);
  const bSocial = toNumber(before?.socialInsurance?.totalWan);
  const aSocial = toNumber(after?.socialInsurance?.totalWan);
  const bAllowance = toNumber(before?.allowance?.totalWan);
  const aAllowance = toNumber(after?.allowance?.totalWan);
  const pieces = [];
  if (changed(bTax, aTax, 0.05)) pieces.push(`税 ${wan(bTax)}→${wan(aTax)}`);
  if (changed(bSocial, aSocial, 0.05)) pieces.push(`社会保険料 ${wan(bSocial)}→${wan(aSocial)}`);
  if (changed(bAllowance, aAllowance, 0.05)) pieces.push(`手当合計 ${wan(bAllowance)}→${wan(aAllowance)}`);
  pushCause(out, "その他", "strict", pieces.length ? pieces.join(" / ") : "主要制度・控除の状態変化なし");
}

export function explainCliffCauses(beforePoint, afterPoint) {
  const before = beforePoint?.breakdown || {};
  const after = afterPoint?.breakdown || {};
  const out = [];
  compareTcca(out, before, after);
  compareWelfareAllowance(out, before, after);
  compareService(out, before, after);
  compareM01(out, before, after);
  compareN04(out, before, after);
  compareSpouseDeductions(out, before, after);
  compareFallback(out, before, after);
  return out;
}

export function detectCliffCauseRows(series, options = {}) {
  const minDropManyen = toNumber(options.minDropManyen, 3);
  const xMin = toNumber(options.xMin, -Infinity);
  const xMax = toNumber(options.xMax, Infinity);
  const yAtMax = toNumber(
    series.find((p) => toNumber(p?.x) === xMax)?.disposable ?? series[series.length - 1]?.disposable
  );
  const rows = [];
  for (let i = 1; i < series.length; i += 1) {
    const before = series[i - 1];
    const after = series[i];
    if (toNumber(after?.x) < xMin || toNumber(after?.x) > xMax) continue;
    const delta = toNumber(after?.disposable) - toNumber(before?.disposable);
    if (delta > -minDropManyen) continue;
    const causes = explainCliffCauses(before, after);
    const q = findQ(series, i, toNumber(after?.disposable));
    const r = findR(series, i, toNumber(before?.disposable), xMax);
    rows.push({
      index: rows.length + 1,
      salaryManyen: toNumber(after?.x),
      yBeforeWan: toNumber(before?.disposable),
      yAfterWan: toNumber(after?.disposable),
      dropManyen: Math.round(delta * 10) / 10,
      qSalaryManyen: q ? toNumber(q.x) : null,
      ineffectiveWidthManyen: q ? toNumber(after?.x) - toNumber(q.x) : null,
      rSalaryManyen: r ? toNumber(r.x) : null,
      recoveryWidthManyen: r ? toNumber(r.x) - toNumber(after?.x) : null,
      unrecoveredShortfallWan: r ? 0 : Math.max(0, toNumber(before?.disposable) - yAtMax),
      causes,
    });
  }
  return rows;
}

function findQ(series, cliffIndex, yAfter) {
  for (let i = cliffIndex - 1; i >= 0; i -= 1) {
    const point = series[i];
    if (toNumber(point?.disposable) <= yAfter) return point;
  }
  return null;
}

function findR(series, cliffIndex, yBefore, xMax) {
  for (let i = cliffIndex + 1; i < series.length; i += 1) {
    const point = series[i];
    if (toNumber(point?.x) > xMax) return null;
    if (toNumber(point?.disposable) >= yBefore) return point;
  }
  return null;
}
