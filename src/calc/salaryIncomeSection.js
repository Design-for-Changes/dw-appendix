import {changedSalaryDecisionSystems,decisionCodes} from "./salaryDecisionMap.js";

/**
 * 一方の親の給与を固定し、他方の給与を1万円ずつ増やして可処分所得の断面と制度境界を求める。
 * 曲線にはすべての収支変動を含む。一方、境界は地図と同じ3制度の切替えに限り、同時に
 * 変わる税・社会保険料も含む可処分所得の下落額を、個々の制度の効果とはみなさない。
 * @param {object} calculator シミュレーターと同じ evaluate(世帯主給与万円,配偶者給与万円) を持つ計算器。
 * @param {object} options axis は増やす親の給与軸、fixedWan は他方の年給与（万円）、maxSalaryWan は走査上限。
 * @returns {object} points は各年給与に対応する円単位の可処分所得（未算定はnull）。events は境界の直前・直後の値と
 * 直後から測った後退幅・回復幅（給与万円）、および回復までに重なる他の制度境界での下落数。
 */
export function buildSalaryIncomeSection(calculator,{axis="head",fixedWan,maxSalaryWan=1500}={}) {
  if(!["head","spouse"].includes(axis))throw new RangeError("給与を動かす軸は世帯主か配偶者を指定してください。");
  if(![fixedWan,maxSalaryWan].every(v=>Number.isInteger(v)&&v>=0&&v<=1500))
    throw new RangeError("固定給与と走査上限は0～1,500万円の整数で指定してください。");
  const points=Array(maxSalaryWan+1).fill(null),events=[];
  let prevCode=0;
  for(let wage=0;wage<=maxSalaryWan;wage++){
    const p=wage===0&&fixedWan===0?null:axis==="head"?calculator.evaluate(wage,fixedWan):calculator.evaluate(fixedWan,wage);
    if(p?.status!=="calculated"){prevCode=0;continue;}
    if(!Number.isFinite(p.studyDisposableWan))throw new TypeError("算定済み点には可処分所得が必要です。");
    const afterYen=Math.round(p.studyDisposableWan*10000);
    if(!Number.isSafeInteger(afterYen))throw new RangeError("可処分所得を円単位に変換できません。");
    points[wage]=afterYen;
    const code=decisionCodes(p),systems=changedSalaryDecisionSystems(prevCode,code);
    prevCode=code;
    if(!systems.length)continue;
    const beforeYen=points[wage-1],dropYen=Math.max(0,beforeYen-afterYen);
    events.push({beforeWan:wage-1,afterWan:wage,beforeYen,afterYen,systems,dropYen,
      retreatWan:null,retreatAtWan:null,recoveryWan:null,recoveryAtWan:null,interveningDrops:0});
  }
  const dropAt=new Set(events.filter(e=>e.dropYen>0).map(e=>e.afterWan));
  for(const e of events){
    if(e.dropYen===0)continue;
    // 離散格子では同額点が存在するとは限らない。下落直後の水準以下だった最後の給与点を選ぶ。
    for(let k=e.beforeWan;k>=0&&points[k]!==null;k--){
      if(points[k]<=e.afterYen){e.retreatAtWan=k;e.retreatWan=e.afterWan-k;break;}
    }
    // 他制度の境界を越えても追跡する。元の水準以上に初めて戻った点で打ち切り、欠測はまたがない。
    for(let k=e.afterWan+1;k<=maxSalaryWan&&points[k]!==null;k++){
      if(points[k]>=e.beforeYen){e.recoveryAtWan=k;e.recoveryWan=k-e.afterWan;break;}
      if(dropAt.has(k))e.interveningDrops++;
    }
  }
  return {axis,fixedWan,maxSalaryWan,points,events};
}
