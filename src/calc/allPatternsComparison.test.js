import {compareAllPatterns} from "./allPatternsComparison";
import {createDisabilityIncomeComparison} from "./disabilityIncomeDifference";
import {CHILD_ELIGIBILITY_OPTIONS} from "../data/childEligibilityOptions";
import globalBounds from "../data/disabilityDifferenceRange.json";

const plain="not:no:none", full="1:yes:special";
const byId=new Map(CHILD_ELIGIBILITY_OPTIONS.map(p=>[p.id,p]));
const select=(rows,ids)=>rows.find(row=>row.profileIds.join("/")===ids.join("/"));

test.each([1,2,3])("%i人分の障害要件の直積を重複・欠落なく比較し、公表済みの両端に達する",n=>{
  const ages=[7,10,12].slice(0,n);
  const cost=compareAllPatterns({ages,fees:ages.map(()=>37200)});
  const zero=compareAllPatterns({ages,fees:ages.map(()=>0)});
  expect(cost).toHaveLength(15**n);
  const keys=cost.map(row=>row.profileIds.join("/"));
  expect(new Set(keys).size).toBe(15**n);
  expect(cost.every(row=>row.profileIds.length===n&&row.profileIds.every(id=>byId.has(id)))).toBe(true);
  const {minimumYen,maximumYen}=globalBounds[n-1];
  expect(select(cost,Array(n).fill(plain)).minimum.differenceYen).toBe(minimumYen);
  expect(select(zero,Array(n).fill(full)).maximum.differenceYen).toBe(maximumYen);
});

test.each([
  [[2],[1],-12],
  [[3],[37200],0],
  [[5,6],[37200,4600],-55200],
  [[6,17],[37200,37200],-446400],
])("年齢・上限前月額 %j・%j に対応し、世帯単位で上限が適用される",(ages,fees,min)=>{
  const r=select(compareAllPatterns({ages,fees}),ages.map(()=>plain));
  expect(r.minimum.differenceYen).toBe(min);
  expect(r.maximum.differenceYen).toBe(0);
  if(min===0)for(const p of [r.minimum,r.maximum])expect(p).toMatchObject({headWan:1,spouseWan:0});
});

test("税の年齢区分と無償年齢が混在する組み合わせで、両端の座標・円額がEと一致する",()=>{
  const ages=[5,16,2], fees=[37200,4523,78], ids=[full,plain,"2:yes:ordinary"];
  const r=select(compareAllPatterns({ages,fees}),ids);
  const calc=createDisabilityIncomeComparison({protocol:"paper-2029",serviceAmountYen:0,
    children:ids.map((id,i)=>({...byId.get(id),age:ages[i],serviceUser:true,serviceAmountYen:fees[i]}))});
  for(const {headWan,spouseWan,differenceYen} of [r.minimum,r.maximum]){
    expect(calc.evaluate(headWan,spouseWan).differenceYen).toBe(differenceYen);
    expect(calc.evaluate(spouseWan,headWan).differenceYen).toBe(differenceYen);
  }
  const idx=[2,0,1];
  const perm=select(compareAllPatterns({ages:idx.map(i=>ages[i]),fees:idx.map(i=>fees[i])}),idx.map(i=>ids[i]));
  expect([perm.minimum,perm.maximum]).toEqual([r.minimum,r.maximum]);
});

test("利用料増額で各パターンの差は上昇しない。逆転しても個々の差額を0円で丸めない",()=>{
  const ages=[8];
  const flat=select(compareAllPatterns({ages,fees:[0]}),[plain]);
  const low=compareAllPatterns({ages,fees:[4600]});
  const high=compareAllPatterns({ages,fees:[4601]});
  for(const r of low){
    const h=select(high,r.profileIds);
    for(const field of ["minimum","maximum"]){
      const change=h[field].differenceYen-r[field].differenceYen;
      expect(change).toBeLessThanOrEqual(0);
      expect(change).toBeGreaterThanOrEqual(-12);
    }
  }
  const updated=select(high,[plain]).minimum;
  expect(updated.differenceYen).toBe(-55212);
  expect([updated.headWan,updated.spouseWan]).not.toEqual([flat.minimum.headWan,flat.minimum.spouseWan]);
});

// 児福は両親を個別判定。Eの通常の二世帯計算で、各行2,253,000点を全探索した。
// 最低点はともに(841,841)の1点。最高点は順に10点・8,434点で同額のため、
// 配偶者給与が小さい順、次いで世帯主給与が小さい順の代表座標を記録（--full-gridで再現）。
test.each([
  [[15,16],[12345,4600],["2:yes:ordinary","1:no:special"],[66960,841,841],[1580780,846,195]],
  [[2,5,16],[1,37200,37198],[full,"not:no:ordinary","2:no:none"],[-176088,841,841],[1599380,911,0]],
])("全給与点を直接走査したEの極値・同率時の座標と一致する：年齢 %j",(ages,fees,ids,min,max)=>{
  const r=select(compareAllPatterns({ages,fees}),ids);
  for(const [key,expected] of [["minimum",min],["maximum",max]]){
    const p=r[key];
    expect([p.differenceYen,p.headWan,p.spouseWan]).toEqual(expected);
  }
});
