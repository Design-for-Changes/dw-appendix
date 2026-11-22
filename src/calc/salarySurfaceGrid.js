import { SURFACE_AMOUNT_COUNT, SURFACE_SYSTEMS, UNKNOWN_SURFACE_AMOUNT, surfaceChangeMask, writeSurfaceAmounts } from "./salarySurfaceSystems.js";

export { SURFACE_SYSTEMS, describeSurfaceChanges } from "./salarySurfaceSystems.js";
export const MAX_SURFACE_SALARY_WAN = 1500;

/**
 * 計算器の実測点だけを描画用の給与格子に格納する。高さの単位は万円。
 * 行は配偶者給与、列は世帯主給与。原点・算定不能点は補間せず NaN。
 * Float32 は表示専用で、円単位の比較・CSVには元の計算器を用いる。
 */
export function buildSalarySurfaceGrid(calculator, {maxSalaryWan = MAX_SURFACE_SALARY_WAN, onProgress} = {}) {
  if (!Number.isInteger(maxSalaryWan) || maxSalaryWan < 0 || maxSalaryWan > MAX_SURFACE_SALARY_WAN) {
    throw new RangeError("給与格子の上限は0～1,500万円の整数で指定してください。");
  }
  const width = maxSalaryWan + 1, total = width * width;
  const heights = new Float32Array(total);
  const allPoints=[],allLines=[];
  // 現在・左隣・真上の3制度の年額（整数円）。直近1行＋1点だけを循環利用する。
  const windowSize=width+1, amounts=new Int32Array(windowSize*SURFACE_AMOUNT_COUNT).fill(UNKNOWN_SURFACE_AMOUNT);
  const headMarksAbove = new Uint8Array(width);
  const layers = SURFACE_SYSTEMS.map(()=>({points:[],lines:[]}));
  const rowsPerUpdate = Math.ceil(width / 100);
  let min = Infinity, max = -Infinity, validCount = 0;
  onProgress?.(0, total);
  for (let spouse = 0; spouse < width; spouse++) {
    const rowStart = spouse * width;
    let spouseMarksLeft=0;
    for (let head = 0; head < width; head++) {
      const index = rowStart + head;
      const slot=index%windowSize, offset=slot*SURFACE_AMOUNT_COUNT;
      if (index === 0) { heights[index] = NaN; continue; }
      const point = calculator.evaluate(head, spouse);
      if (point.status !== "calculated" || !Number.isFinite(point.studyDisposableWan)) {
        heights[index] = NaN;
        amounts.fill(UNKNOWN_SURFACE_AMOUNT,offset,offset+SURFACE_AMOUNT_COUNT);
        headMarksAbove[head]=spouseMarksLeft=0;
        continue;
      }
      writeSurfaceAmounts(amounts,offset,point);
      const h=head===0?0:surfaceChangeMask(amounts,((slot+windowSize-1)%windowSize)*SURFACE_AMOUNT_COUNT,offset);
      const s=spouse===0?0:surfaceChangeMask(amounts,((slot+1)%windowSize)*SURFACE_AMOUNT_COUNT,offset);
      if (h|s) {
        // 各制度を独立に接続。別の制度の給与点や欠測を使用しない。
        const vertical=h & headMarksAbove[head], horizontal=s & spouseMarksLeft;
        allPoints.push(index);
        if (vertical) allLines.push(index-width,index);
        if (horizontal) allLines.push(index-1,index);
        for (let j=0;j<layers.length;j++) {
          const bit=SURFACE_SYSTEMS[j].bit, layer=layers[j];
          if ((h|s)&bit) layer.points.push(index);
          if (vertical&bit) layer.lines.push(index-width,index);
          if (horizontal&bit) layer.lines.push(index-1,index);
        }
      }
      headMarksAbove[head]=h; spouseMarksLeft=s;
      // 表示する格子の極値は送信する Float32 の値に揃える。
      const z = Math.fround(point.studyDisposableWan);
      heights[index] = z;
      if (z < min) min = z;
      if (z > max) max = z;
      validCount++;
    }
    const finishedRows = spouse + 1;
    if (finishedRows === width || finishedRows % rowsPerUpdate === 0) {
      onProgress?.(finishedRows * width, total);
    }
  }
  const changeBySystem=Object.fromEntries(layers.map(({points,lines},i)=>[SURFACE_SYSTEMS[i].id,
    {points:Uint32Array.from(points),lines:Uint32Array.from(lines)}]));
  return {width, heights, changePoints:Uint32Array.from(allPoints), changeLines:Uint32Array.from(allLines),
    changeBySystem, min:validCount ? min : null, max:validCount ? max : null, validCount};
}
