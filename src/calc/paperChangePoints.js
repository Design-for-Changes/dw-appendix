// 判定が切り替わる給与区間だけを抽出する。家計の金額計算・下落検出から独立した分析。
const MAX_WAN = 1500;
const standardSystems = new Set(["N01-1","N01-2","N02/N03"]);
/** 所得制限の通過・停止・未判定を、制度判定の表示名に変換する。 */
const incomeState = passes => passes === true ? "所得制限に該当しない" : passes === false ? "所得制限に該当" : null;
/** 判定された世帯員の識別子を表示名に変換する。 */
const memberLabel = id => id === "head" ? "世帯主" : id === "spouse" ? "配偶者" :
  /^child\d+$/.test(id) ? "子"+id.slice(5) : id;

/** 1給与点の制度別・対象者別の判定を読む。実際の手当額や自己負担額の変化は見ない。 */
function standardStates(point) {
  const rows = [];
  const b = point.details?.benefits;
  const special = b?.specialChildAllowance;
  // 所得停止前の障害要件に該当する児童がいない世帯は対象外。停止後の給付ゼロとは区別。
  if (special && special.status !== "no-qualifying-child") for (const c of special.checks) {
    const role = {claimant:"受給資格者",spouse:"受給資格者の配偶者",obligor:"扶養義務者"}[c.role];
    rows.push({system:"N01-1",subject:c.role+":"+c.id,label:"特別児童扶養手当："+role+"（"+memberLabel(c.id)+"）",
      person:c.id,state:incomeState(typeof c.stopped === "boolean" ? !c.stopped : null)});
  }
  for (const child of b?.welfareChildren ?? []) {
    if (child.reasons.includes("non-income-ineligible")) continue;
    const childId=child.checks.find(c=>c.role==="recipient")?.id;
    if (!childId) continue;
    const multiple=child.checks.filter(c=>c.role==="maintainer").length>1;
    for (const c of child.checks) {
      const kind={recipient:"本人",maintainer:"生計維持者",spouse:"本人の配偶者"}[c.role];
      // 単独の維持者が入れ替わった場合は、その時点の維持者の所得判定を比較する。
      // 両者とも制限内なら変化点ではない。判定が異なる場合のみ、入れ替わった人も出力する。
      const suffix=c.role==="maintainer" && multiple ? ":"+c.id : "";
      rows.push({system:"N01-2",subject:childId+":"+c.role+suffix,label:"障害児福祉手当："+memberLabel(childId)+"の"+kind+
        (suffix ? "（"+memberLabel(c.id)+"）" : ""),person:c.id,state:incomeState(c.passes)});
    }
  }
  const service=point.details?.service;
  if (service?.hasCapApplicableServiceUse) {
    const state=({0:"非課税等（上限0円）",4600:"一般1（上限4,600円）",37200:"一般2（上限37,200円）"})[service.householdCapYen] ?? null;
    rows.push({system:"N02/N03",subject:"household",label:"障害福祉サービス・障害児通所支援：世帯の負担上限区分",state});
  }
  return rows;
}

/** 直前の給与点と連続した判定不能区間をまとめる。欠測の前後を比較対象にはしない。 */
function appendGap(ranges,atWan,metadata={}) {
  const last=ranges[ranges.length-1];
  if (last && last.toWan+1===atWan) last.toWan=atWan;
  else ranges.push({...metadata,fromWan:atWan,toWan:atWan});
}

/**
 * 片方の給与を1万円ずつ増やし、隣接する2点の制度判定を比較する。atWanは変化後最初の観測点であり、
 * 円単位の厳密な閾値ではない。同一給与での複数制度／複数人の変化は1件ずつ返す。
 * @param {object} calculator evaluate(世帯主給与万円, 配偶者給与万円)を持つ計算器。
 * @param {"head"|"spouse"} axis 動かす給与軸。
 * @param {number} fixedWan 他方の固定年給（万円）。両者ゼロの原点は評価しない。
 * @param {object} options minWan・maxWanは整数の走査両端。assessorsは任意の外部判定器。
 * 外部判定器{id,subject?,label,assess(point,{headWan,spouseWan})}は、区分名（空でない文字列）または
 * 資料・条件不足ならnullを返す。M01/N04の判定式や代表額は本関数に含めない。外部判定は収支に反映しない。
 * subjectの既定はhousehold。児童別の適用判定は同一制度IDでchild1・child2等を別々に登録できる。
 * @returns {object} eventsは{fromWan,atWan,system,subject,label,before,after}、人別判定にはbeforePerson/afterPerson。
 * pointGapsは原点・全体の未算定区間、unknownRangesは制度別の判定不能区間。いずれも両端を含む。
 */
export function scanPaperChangePoints(calculator,axis,fixedWan,{assessors=[],minWan=0,maxWan=MAX_WAN}={}) {
  if (!calculator || typeof calculator.evaluate!=="function" || !["head","spouse"].includes(axis)) throw new TypeError("給与軸と計算器を指定してください。");
  if (![fixedWan,minWan,maxWan].every(v=>Number.isSafeInteger(v)&&v>=0&&v<=MAX_WAN) || minWan>maxWan)
    throw new RangeError("給与は0～1,500万円の整数、走査は昇順で指定してください。");
  if (!Array.isArray(assessors)) throw new TypeError("外部判定器は配列で指定してください。");
  const ids=new Set();
  for (const a of assessors) {
    const subject=a?.subject ?? "household", id=a?.id, key=JSON.stringify([id,subject]);
    if (!a || typeof id!=="string" || !id.trim() || standardSystems.has(id) || ids.has(key) || typeof subject!=="string" || !subject.trim() ||
        typeof a.label!=="string" || !a.label.trim() || typeof a.assess!=="function")
      throw new TypeError("外部判定器には固有の制度ID・対象者の組、表示名、判定関数が必要です。");
    ids.add(key);
  }
  let previous=new Map();
  const events=[],pointGaps=[],unknownByKey=new Map();
  for (let w=minWan;w<=maxWan;w++) {
    const headWan=axis==="head"?w:fixedWan, spouseWan=axis==="spouse"?w:fixedWan;
    const point=headWan===0 && spouseWan===0 ? null : calculator.evaluate(headWan,spouseWan);
    if (point?.status!=="calculated") {
      appendGap(pointGaps,w);
      previous=new Map();
      continue;
    }
    const rows=standardStates(point);
    for (const a of assessors) {
      const state=a.assess(point,{headWan,spouseWan});
      if (state!==null && (typeof state!=="string" || !state.trim())) throw new TypeError(a.id+"は判定区分名またはnullを返してください。");
      rows.push({system:a.id,subject:a.subject ?? "household",label:a.label,state});
    }
    const current=new Map();
    for (const row of rows) {
      const {system,subject,label,state}=row;
      const key=JSON.stringify([system,subject]);
      if (state===null) {
        if (!unknownByKey.has(key)) unknownByKey.set(key,[]);
        appendGap(unknownByKey.get(key),w,{system,subject});
        continue;
      }
      current.set(key,row);
      const prev=previous.get(key);
      if (prev && prev.state!==state) events.push({fromWan:w-1,atWan:w,system,subject,label,before:prev.state,after:state,
        ...(row.person ? {beforePerson:prev.person,afterPerson:row.person} : {})});
    }
    previous=current;
  }
  return {axis,fixedWan,events,unknownRanges:[...unknownByKey.values()].flat(),pointGaps};
}
