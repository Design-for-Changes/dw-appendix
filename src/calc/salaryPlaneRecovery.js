// netYen[y*width+x] は世帯主給与x万円・配偶者給与y万円での年間可処分所得（円）。
export const UNKNOWN_PLANE_NET_YEN = -2147483648;

/**
 * 一方の給与を固定した各断面で、制度切替えと同時に可処分所得が実際に減った箇所を抽出。
 * 下落前の値以上に初めて戻った箇所だけを回復線とする。穴・領域外の回復を推定しない。
 * 1万円格子上で観測した前後2点の境はその半目盛に描き、隣の断面とは補間しない。
 *
 * @param {object} input width：正方格子の幅。netYen：Int32Array（欠測＝INT32_MIN）。
 * changedX/Y：各給与を増やした直後の点に格納したUint8Array（特児1、児福2、通所4の和）。
 * @returns {object} head/spouse 各方向の drop/recovery は [x1,y1,x2,y2] の配列。
 * dropMasks[i] は下落iで変化した制度、recoveryDropIndex[j] は回復jに対応する下落i。
 * 制度に下落全額を帰属させない。複数の下落が同じ点で回復するときは各々を保存。
 */
export function buildSalaryPlaneRecovery({width,netYen,changedX,changedY}={}) {
  if (!Number.isSafeInteger(width) || width<1 || width>1501 ||
      !(netYen instanceof Int32Array) || !(changedX instanceof Uint8Array) || !(changedY instanceof Uint8Array) ||
      [netYen,changedX,changedY].some(a=>a.length!==width*width))
    throw new RangeError("給与格子の幅・配列の長さ・型が一致しません。");

  /** 片方の親の給与を1万円ずつ増やし、すべての他方給与について制度変更時の下落・初回回復を抽出する。 */
  const byDirection = (alongX,changes) => {
    const drop=[],recovery=[],dropMasks=[],recoveryDropIndex=[];
    const stack=new Int32Array(width), next=new Int32Array(width);
    for(let fixed=0;fixed<width;fixed++){
      const base=alongX?fixed*width:fixed, step=alongX?1:width;
      // 右から見る単調スタック。等値は捨てない（「回復」は超過ではなく以上）。
      // 各点は一度だけpushされ、popも高々一度。各断面O(width)。
      let count=0;
      for(let k=width-1;k>=0;k--){
        const i=base+k*step,v=netYen[i];
        if(changes[i]>7)throw new RangeError("制度切替えのビットマスクが不正です。");
        if(v===UNKNOWN_PLANE_NET_YEN){count=0;next[k]=-1;continue;}
        while(count && netYen[base+stack[count-1]*step]<v)count--;
        next[k]=count?stack[count-1]:-1;
        stack[count++]=k;
      }
      const lo=Math.max(0,fixed-.5),hi=Math.min(width-1,fixed+.5);
      /** 切替えを観測した給与kの直前の半目盛に、給与軸の向きに応じた線分を置く。 */
      const line=k=>alongX?[k-.5,lo,k-.5,hi]:[lo,k-.5,hi,k-.5];
      for(let k=1;k<width;k++){
        const i=base+k*step, before=netYen[i-step],after=netYen[i],mask=changes[i];
        if(!mask || before===UNKNOWN_PLANE_NET_YEN || after===UNKNOWN_PLANE_NET_YEN || after>=before)continue;
        const dropIndex=drop.length, firstRecovered=next[k-1];
        drop.push(line(k)); dropMasks.push(mask);
        if(firstRecovered!==-1){
          recovery.push(line(firstRecovered));
          recoveryDropIndex.push(dropIndex);
        }
      }
    }
    return {drop,recovery,dropMasks,recoveryDropIndex};
  };
  return {head:byDirection(true,changedX),spouse:byDirection(false,changedY)};
}
