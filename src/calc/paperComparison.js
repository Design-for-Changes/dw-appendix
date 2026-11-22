import { createRevisionCalculator, classifyRevisionFalls } from "./revisionEngine.js";

// 比較値は利用児1人当たり・軽減後・世帯上限適用前。調査の区分別実支払額の分位点ではない。
export const paperMonthlyFees = [4600, 10406, 37200];
export const paperSpouseWages = [0, 200, 400];

/** 図表用の固定条件。対話画面で個別に変更した入力は使わない。旧版は明示時だけ再現する。 */
export function paperComparisonInputs(family, fee, protocol="paper-2029") {
  if (!["paper-2029","v3","legacy-v2"].includes(protocol)) throw new RangeError("図表に用いる計算条件が不正です。");
  const children = family.children.map(c=>protocol==="paper-2029" ? {...c} : {...c,taxDependentOf:"head",maintainedByRecipient:false});
  const base = {protocol,children,serviceAmountYen:fee,otherServiceMonthlyYen:0};
  if (protocol==="legacy-v2") return base;
  if (protocol==="paper-2029") return {...base,roles:{spouseDeductionClaimant:"head",allowanceRecipient:"highest-salary",welfareMaintainer:"highest-salary"}};
  return {...base,roles:{spouseDeductionClaimant:"head",allowanceRecipient:"head"},insurance:{
    residence:"funabashi",head:{mode:"contract",workPattern:"regular",workRegion:"chiba"},
    spouse:{mode:"contract",workPattern:"under20",workRegion:"chiba"},
    nationalEstimate:{confirmed:true,payer:"head",children:children.map(c=>({age:c.age,national:false}))},
  }};
}

/**
 * 指定断面の各給与点の収支・隣接点での下落幅を計算し、紙面の表5に掲載する下落をまとめる。
 * 判定だけが変化する点や、主試算対象外の制度の切替を調べる考察用スキャンとは異なる。
 * @param {object} family 論文の世帯ケース。childrenは年齢と制度ごとの認定条件。
 * @param {number} spouse 配偶者の固定給与（万円／年）。
 * @param {number} fee 通所を利用する児童1人当たりの世帯上限適用前負担（円／月）。
 * @returns {object} 収支曲線、逆転点・最初の回復点、通所の一般1→2境界での符号付き純変化。給与額は万円、収支差は円。
 */
export function analyzePaperSlice(family, spouse, fee, protocol="paper-2029") {
  const calculator = createRevisionCalculator(paperComparisonInputs(family,fee,protocol));
  const points = Array.from({length:1501}, (_, wage) => calculator.evaluate(wage, spouse));
  const {values, falls} = classifyRevisionFalls(points);
  const events = falls.map(({at, delta, recovered, causes, recoveryStatus}) => {
    const service = points[at].details.service;
    const labels = causes.map(cause => cause.startsWith("障害福祉サービス") ?
      (service.householdCapYen === 37200 ? "通所負担（一般1→一般2）" : "通所負担（非課税→一般1）") : cause);
    return {at, lossYen:Math.round(delta*10000), recovered,
      width:recovered === null ? null : recovered-at, recoveryStatus:recoveryStatus ?? (recovered==null ? "beyond-range":"observed"),labels};
  });
  const serviceSteps = [];
  for (let i=1; i<points.length; i++) {
    if (Number.isFinite(values[i-1]) && Number.isFinite(values[i]) &&
        points[i-1].details.service.householdCapYen === 4600 && points[i].details.service.householdCapYen === 37200) {
      serviceSteps.push({at:i, changeYen:Math.round((values[i]-values[i-1])*10000)});
    }
  }
  const gaps=[];
  for(let i=0;i<values.length;i++) if (!Number.isFinite(values[i])) {
    if(i===0 || Number.isFinite(values[i-1])) gaps.push({from:i,to:i,reasons:[]});
    const gap=gaps[gaps.length-1];
    gap.to=i;
    (points[i].reasons??[]).forEach(reason=>{if(!gap.reasons.includes(reason)) gap.reasons.push(reason);});
  }
  return {protocol,id:family.id,spouse,fee,values,events,serviceSteps,gaps,calculatedCount:values.filter(Number.isFinite).length};
}
