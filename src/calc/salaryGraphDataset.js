import {createDisabilityIncomeComparison,buildDisabilityDifferenceSurface} from "./disabilityIncomeDifference.js";
import {buildSalarySurfaceGrid} from "./salarySurfaceGrid.js";
import {buildSalaryDecisionMapFromGrid,decisionCodes} from "./salaryDecisionMap.js";
import {buildSalaryPlaneRecovery,UNKNOWN_PLANE_NET_YEN} from "./salaryPlaneRecovery.js";

/** 年額が整数円として保存でき、欠測用の値とも重ならないことを確認して返す。 */
function exactYen(value){
  if(!Number.isInteger(value)||value<=UNKNOWN_PLANE_NET_YEN||value>2147483647)
    throw new RangeError("給与格子の円額が整数の格納範囲外です。");
  return value;
}

/** 図が読む3制度の実額だけを保存。区分が同じでも実額が異なる場合、その区分は再計算する。 */
function rememberSurfacePoint(states,code,{details:{benefits,service}}){
  const state=states[code];
  if(state===undefined){
    states[code]={status:"calculated",studyDisposableWan:0,
      details:{benefits:{tcca:benefits.tcca,welfare:benefits.welfare},service:{annual:service.annual}}};
  }else if(state!==null && (state.details.benefits.tcca!==benefits.tcca ||
    state.details.benefits.welfare!==benefits.welfare || state.details.service.annual!==service.annual)){
    states[code]=null;
  }
}

/**
 * 固定した家族条件につき、x＝世帯主給与、y＝配偶者給与を1万円刻みで一度だけ走査する。
 * 実世帯・対照世帯の各計算は高々一度行い、すべての図に共用する。対称条件では反対側の世帯合計を再利用する。
 * @param {object} inputs モデル世帯の条件。給与範囲の既定は両軸0～1,500万円、原点は除外。
 * @param {object} options maxSalaryWan、onProgress(done,total)、createCalculator（関数の検証用）。
 */
export function buildSalaryGraphDataset(inputs,{maxSalaryWan=1500,onProgress,createCalculator}={}){
  if(!Number.isInteger(maxSalaryWan)||maxSalaryWan<0||maxSalaryWan>1500)
    throw new RangeError("給与上限は0～1,500万円の整数で指定してください。");
  const width=maxSalaryWan+1,size=width*width;
  const netYen=new Int32Array(size).fill(UNKNOWN_PLANE_NET_YEN);
  const differenceYen=new Int32Array(size).fill(UNKNOWN_PLANE_NET_YEN),codes=new Uint8Array(size);
  const pair=createDisabilityIncomeComparison(inputs,{createCalculator});
  // 論文モデルは同じ税・保険条件の父母、全児童の扶養・受給者は高給与側、児福は両親を個別判定。
  // 配偶者控除も高給与側（または申告なし）なら、父母を入れ替えても世帯の円額と区分は同一。
  // 固定した申告者・旧仕様・外部計算器には仮定しない。同給点は世帯主優先で必ず実算する。
  const filing=inputs.roles?.spouseDeductionClaimant??"highest-salary";
  const states=!createCalculator && (inputs.protocol??"paper-2029")==="paper-2029" &&
    (filing==="highest-salary" || filing==="none") ? [] : null;
  const income=buildSalarySurfaceGrid({evaluate(x,y){
    const index=y*width+x;
    if(states && x<y){
      // 行順は変えず、既に走査した反対側の点から世帯合計だけ読む（親ID・個人明細は複製しない）。
      const source=x*width+y,code=codes[source],state=states[code],net=netYen[source];
      if(state && net!==UNKNOWN_PLANE_NET_YEN){
        netYen[index]=net;differenceYen[index]=differenceYen[source];codes[index]=code;
        state.studyDisposableWan=net/10000;
        return state;
      }
    }
    const {observedPoint,comparisonPoint}=pair.evaluateGraphPair(x,y);
    if(observedPoint.status==="calculated"){
      netYen[index]=exactYen(Math.round(observedPoint.studyDisposableWan*10000));
      codes[index]=decisionCodes(observedPoint);
      if(states && x>y)rememberSurfacePoint(states,codes[index],observedPoint);
    }
    if(comparisonPoint.status==="calculated")differenceYen[index]=exactYen(comparisonPoint.differenceYen);
    return observedPoint;
  }},{maxSalaryWan,onProgress});
  // ここから先は各世帯の税・給付を再計算せず、前段で確定した金額と区分を読む。
  const missing={status:"excluded"},known={status:"calculated",differenceYen:0};
  const comparison=buildDisabilityDifferenceSurface({evaluate(x,y){
    const v=differenceYen[y*width+x];if(v===UNKNOWN_PLANE_NET_YEN)return missing;
    known.differenceYen=v;return known;
  }},{maxSalaryWan});
  const grid={width,netYen,differenceYen,decisionCodes:codes};
  const changedX=new Uint8Array(size),changedY=new Uint8Array(size);
  const map=buildSalaryDecisionMapFromGrid({...grid,validCount:income.validCount},changedX,changedY);
  map.outcomeLines=buildSalaryPlaneRecovery({width,netYen,changedX,changedY});
  return {income,comparison,map,grid};
}
