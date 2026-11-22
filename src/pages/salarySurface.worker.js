/* global globalThis */
import { createRevisionCalculator } from "../calc/revisionEngine.js";
import { buildSalarySurfaceGrid } from "../calc/salarySurfaceGrid.js";
import { buildDisabilityDifferenceSurface, createDisabilityIncomeComparison } from "../calc/disabilityIncomeDifference.js";
import { buildSalaryDecisionMap } from "../calc/salaryDecisionMap.js";

globalThis.onmessage = ({data}) => {
  if (data?.type !== "start" && data?.type !== "decision-map") return;
  try {
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
