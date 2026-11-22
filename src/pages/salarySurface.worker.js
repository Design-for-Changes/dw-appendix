/* global globalThis */
import { createRevisionCalculator } from "../calc/revisionEngine.js";
import { buildSalarySurfaceGrid } from "../calc/salarySurfaceGrid.js";
import { buildDisabilityDifferenceSurface, createDisabilityIncomeComparison } from "../calc/disabilityIncomeDifference.js";
import { buildSalaryDecisionMap } from "../calc/salaryDecisionMap.js";
import { buildSalaryGraphDataset } from "../calc/salaryGraphDataset.js";
import { prepareSalaryGraphDrawing } from "./prepareSalaryGraphDrawing.js";

// 複数の図が同一の描画配列を参照する場合もあるため、バッファごとに一度だけ転送する。
function gatherBuffers(value,seen,buffers){
  if(value===null||typeof value!=="object"||seen.has(value))return;
  seen.add(value);
  if(ArrayBuffer.isView(value)){buffers.add(value.buffer);return;}
  if(value instanceof ArrayBuffer){buffers.add(value);return;}
  for(const child of Object.values(value))gatherBuffers(child,seen,buffers);
}

globalThis.onmessage = ({data}) => {
  if (!["start","decision-map","household-dataset"].includes(data?.type)) return;
  try {
    if(data.type==="household-dataset"){
      const result=buildSalaryGraphDataset(data.inputs??data.household,{
        maxSalaryWan:data.maxSalaryWan??1500,
        onProgress:(done,total)=>globalThis.postMessage({type:"progress",done,total,percent:Math.floor(100*done/total)}),
      });
      prepareSalaryGraphDrawing(result.income,result.comparison);
      const seen=new Set(),buffers=new Set();
      // mapの線分は通常の小配列。巨大な給与格子・描画用typed arrayはコピーせずに渡す。
      for(const value of [result.income,result.comparison,result.grid])gatherBuffers(value,seen,buffers);
      globalThis.postMessage({type:"complete",...result},[...buffers]);return;
    }
    if(data.type==="decision-map"){
      const map=buildSalaryDecisionMap(createRevisionCalculator(data.household),{
        onProgress:percent=>globalThis.postMessage({type:"progress",percent}),
      });
      globalThis.postMessage({type:"complete",map});
      return;
    }
    if (data.comparison === true) {
      const surface = buildDisabilityDifferenceSurface(createDisabilityIncomeComparison(data.inputs), {
        onProgress:(done,total)=>globalThis.postMessage({type:"progress",done,total}),
      });
      globalThis.postMessage({type:"complete", ...surface}, [surface.heights.buffer]);
      return;
    }
    const calculator = createRevisionCalculator(data.inputs);
    const result = buildSalarySurfaceGrid(calculator, {
      onProgress: (done, total) => globalThis.postMessage({type:"progress", done, total}),
    });
    // 面の高さと、変化があった座標だけを描画スレッドへ転送。給与点は再計算しない。
    const transfers=[result.heights.buffer,result.changePoints.buffer,result.changeLines.buffer];
    for (const {points,lines} of Object.values(result.changeBySystem)) transfers.push(points.buffer,lines.buffer);
    globalThis.postMessage({type:"complete", ...result}, transfers);
  } catch (error) {
    globalThis.postMessage({type:"error", message:error instanceof Error ? error.message : String(error)});
  }
};
