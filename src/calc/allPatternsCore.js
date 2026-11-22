import {CHILD_ELIGIBILITY_OPTIONS} from "../data/childEligibilityOptions.js";
import {isFreeDayServiceAge,MAX_SERVICE_YEN} from "./serviceBurdenLimits.js";

/** Eと同率なら、配偶者の給与が小さい点、次に世帯主の給与が小さい点を表示する。 */
function earlier(a,b) {
  return a.spouseWan < b.spouseWan || (a.spouseWan === b.spouseWan && a.headWan < b.headWan);
}

/**
 * 手当の所得判定と世帯の利用者負担上限が同じ給与点群では、給付と負担の差は一定。
 * 群ごとの税額差の両端にこの差を足し、全群を比較すれば、給与格子を間引かずに済む。
 * @param {object} conditions 子どもごとの年齢（0～17歳）と多子軽減後・世帯上限前の月額（円）。
 * @param {object} data Eと同じ給与格子・制度仕様から生成した点群ごとの税額差と給与座標。
 * @returns {object[]} 障害要件の順序付き組み合わせ別の最低・最高差（円／年）とその給与点（万円／年）。
 */
export function comparePatternEnvelopes({ages,fees},data) {
  if (!Array.isArray(ages) || !Array.isArray(fees) || ages.length<1 || ages.length>3 || ages.length!==fees.length ||
      !ages.every(a=>Number.isInteger(a)&&a>=0&&a<=17) || !fees.every(f=>Number.isInteger(f)&&f>=0&&f<=MAX_SERVICE_YEN))
    throw new RangeError("児童別の年齢・通所負担が設定範囲外です。");
  const n=ages.length, older=ages.filter(a=>a>=16).length;
  const monthly=fees.reduce((sum,f,i)=>sum+(isFreeDayServiceAge(ages[i])?0:f),0);
  const rates=data.annualRatesYen, results=[], memo=new Map();
  /** 人数の内訳と利用額が等しければ、児童の順番が違っても所得差の計算結果は同じ。 */
  function extrema(first,second,welfare,ordinary,special) {
    const key=[first,second,welfare,ordinary,special].join(":");
    if (memo.has(key)) return memo.get(key);
    const bands=data.groups[[n,older,ordinary,special].join(":")];
    if (!bands?.length) throw new Error("給与格子の集計データがありません。");
    let minimum=null, maximum=null;
    for (const b of bands) {
      const offset=(b.tcca ? first*rates.first+second*rates.second : 0)+(b.welfare ? welfare*rates.welfare : 0)
        -12*Math.min(monthly,b.capYen);
      const low=b.minimum, high=b.maximum, lo=low.taxSavingYen+offset, hi=high.taxSavingYen+offset;
      if (!minimum||lo<minimum.differenceYen||(lo===minimum.differenceYen&&earlier(low,minimum)))
        minimum={differenceYen:lo,headWan:low.headWan,spouseWan:low.spouseWan};
      if (!maximum||hi>maximum.differenceYen||(hi===maximum.differenceYen&&earlier(high,maximum)))
        maximum={differenceYen:hi,headWan:high.headWan,spouseWan:high.spouseWan};
    }
    const pair={minimum,maximum};
    memo.set(key,pair);
    return pair;
  }
  /** 第1子・第2子・第3子のラベルを保ち、Dの選択肢から漏れ・重複なく各行を作る。 */
  function visit(ids,first,second,welfare,ordinary,special) {
    if (ids.length===n) {results.push({profileIds:ids,...extrema(first,second,welfare,ordinary,special)});return;}
    for (const p of CHILD_ELIGIBILITY_OPTIONS) visit([...ids,p.id],first+Number(p.tccaGrade==="1"),
      second+Number(p.tccaGrade==="2"),welfare+Number(p.welfareEligible),
      ordinary+Number(p.taxStatus==="ordinary"),special+Number(p.taxStatus==="special"));
  }
  visit([],0,0,0,0,0);
  return results;
}
