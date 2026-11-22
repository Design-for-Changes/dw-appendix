import {UNKNOWN_PLANE_NET_YEN} from "./salaryPlaneRecovery.js";

/**
 * 年間可処分所得を同一の高さ levelYen で水平に切ったときの給与平面上の境界。
 * 1万円格子上で実際に計算した2点のうち片方だけが基準額以上なら、間の半目盛に描く。
 * 隣り合う給与点の連続的な交差位置や特定の増収経路を推定するものではない。
 * @param {object} grid width：格子幅、netYen[y*width+x]：世帯の年間可処分所得（整数円）。
 * @param {number} levelYen 下落直前など、比較に用いる単一の年額（整数円）。同額も到達とする。
 * @returns {{levelYen:number,segments:number[][]}} [世帯主給与1,配偶者給与1,世帯主給与2,配偶者給与2]（万円）。
 */
export function buildSalaryLevelContour({width,netYen}={},levelYen) {
  if(!Number.isInteger(width)||width<1||width>1501||!(netYen instanceof Int32Array)||netYen.length!==width*width)
    throw new RangeError("給与格子の幅・配列の長さ・型が一致しません。");
  if(!Number.isSafeInteger(levelYen)||levelYen<=UNKNOWN_PLANE_NET_YEN||levelYen>2147483647)
    throw new RangeError("基準額は算定済みの円額で指定してください。");
  const max=width-1, segments=[];
  // -1＝未算定、0＝未達、1＝到達。直前の行と現在開いている線分だけを記憶する。
  const above=new Int8Array(width).fill(-1),verticalStart=new Int16Array(width).fill(-1);
  for(let y=0;y<width;y++){
    let left=-1,horizontalStart=-1;
    const row=y*width;
    for(let x=0;x<width;x++){
      const value=netYen[row+x];
      const here=value===UNKNOWN_PLANE_NET_YEN?-1:Number(value>=levelYen);
      if(left>=0&&here>=0&&left!==here){
        if(verticalStart[x]===-1)verticalStart[x]=y;
      }else if(verticalStart[x]!==-1){
        segments.push([x-.5,Math.max(0,verticalStart[x]-.5),x-.5,y-.5]);
        verticalStart[x]=-1;
      }
      if(above[x]>=0&&here>=0&&above[x]!==here){
        if(horizontalStart===-1)horizontalStart=x;
      }else if(horizontalStart!==-1){
        segments.push([Math.max(0,horizontalStart-.5),y-.5,x-.5,y-.5]);
        horizontalStart=-1;
      }
      left=here;above[x]=here;
    }
    if(horizontalStart!==-1)segments.push([Math.max(0,horizontalStart-.5),y-.5,max,y-.5]);
  }
  for(let x=1;x<width;x++)
    if(verticalStart[x]!==-1)segments.push([x-.5,Math.max(0,verticalStart[x]-.5),x-.5,max]);
  return {levelYen,segments};
}
