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

/**
 * 固定した家族条件につき、x＝世帯主給与、y＝配偶者給与を1万円刻みで一度だけ走査する。
 * 各点で必要な実世帯・対照世帯の計算を一度ずつ（条件が同一なら計一度）行い、すべての図に共用する。
 * @param {object} inputs Gの世帯条件。給与範囲の既定は両軸0～1,500万円、原点は除外。
 * @param {object} options maxSalaryWan、onProgress(done,total)、createCalculator（関数の検証用）。
 */
export function buildSalaryGraphDataset(inputs,{maxSalaryWan=1500,onProgress,createCalculator}={}){
  if(!Number.isInteger(maxSalaryWan)||maxSalaryWan<0||maxSalaryWan>1500)
    throw new RangeError("給与上限は0～1,500万円の整数で指定してください。");
  const width=maxSalaryWan+1,size=width*width;
  const netYen=new Int32Array(size).fill(UNKNOWN_PLANE_NET_YEN);
  const differenceYen=new Int32Array(size).fill(UNKNOWN_PLANE_NET_YEN),codes=new Uint8Array(size);
  const pair=createDisabilityIncomeComparison(inputs,{createCalculator});
  const income=buildSalarySurfaceGrid({evaluate(x,y){
    const index=y*width+x,{observedPoint,comparisonPoint}=pair.evaluatePair(x,y);
    if(observedPoint.status==="calculated"){
      netYen[index]=exactYen(Math.round(observedPoint.studyDisposableWan*10000));
      codes[index]=decisionCodes(observedPoint);
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
