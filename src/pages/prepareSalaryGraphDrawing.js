import {SURFACE_SYSTEMS} from "../calc/salarySurfaceSystems.js";
import {salaryInkGeometry} from "./salarySurfaceInk.js";

const RESTART=0xffffffff;
export const DIFFERENCE_PALETTE={
  missing:[110,121,128],zero:[251,250,246],negative:[[251,221,228],[174,52,84]],positive:[[215,237,235],[19,127,131]]
};
const {missing,zero,negative,positive}=DIFFERENCE_PALETTE;
const colors=[missing,zero,...[negative,positive].flatMap(([a,b])=>Array.from({length:256},(_,i)=>
  a.map((v,c)=>Math.round(v+(b[c]-v)*i/255))))];

/** 1万円の各格子セルを三角形にする。未算定点の両側を面で橋渡ししない。 */
export function salaryMeshIndices(heights,width) {
  const out=new Uint32Array((2*width+1)*(width-1));
  let n=0;
  for(let y=0;y<width-1;y++){
    let start=n;
    for(let k=0;k<2*width;k++){
      const i=(y+(k%2))*width+(k>>>1);
      if(Number.isFinite(heights[i]))out[n++]=i;
      else{
        if(n-start>=3)out[n++]=RESTART;else n=start;
        start=n;
      }
    }
    if(n-start>=3)out[n++]=RESTART;else n=start;
  }
  return out.subarray(0,n);
}

/** 1給与点を1画素に変換。縦軸は下から増え、0円・正・負・算定外に別の色を割り当てる。 */
export function differenceHeatmapPixels({width,heights,min,max}) {
  const pixels=new Uint8ClampedArray(width*width*4);
  const bound=Math.max(Math.abs(min??0),Math.abs(max??0))||1;
  for(let y=0;y<width;y++){
    let dest=(width-1-y)*width*4;
    for(let x=0;x<width;x++,dest+=4){
      const v=heights[y*width+x];
      const code=!Number.isFinite(v)||(x===0&&y===0)?0:v===0?1:
        (v<0?2:258)+Math.min(255,Math.round(255*Math.abs(v)/bound));
      const [r,g,b]=colors[code];
      pixels[dest]=r;pixels[dest+1]=g;pixels[dest+2]=b;pixels[dest+3]=255;
    }
  }
  return pixels;
}

/** 全格子を走査する描画準備は、条件ごとの共有Workerで一度だけ行う。可処分所得・差額の数値は書き換えない。 */
export function prepareSalaryGraphDrawing(income,comparison){
  income.meshIndices=salaryMeshIndices(income.heights,income.width);
  income.inkGeometry=salaryInkGeometry(income,SURFACE_SYSTEMS);
  comparison.heatmapPixels=differenceHeatmapPixels(comparison);
}
