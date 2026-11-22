import "./income-difference.css";

const integer = n => n.toLocaleString("ja-JP");
const signed = n => (n > 0 ? "＋" : n < 0 ? "−" : "") + integer(Math.abs(n)) + "円";

export function DifferenceExtrema({surface}) {
  const {minimum,maximum,negativeCount,validCount} = surface;
  if (!minimum || !maximum) return null;
  const flat=minimum.differenceYen===maximum.differenceYen;
  return <section className="income-difference-extrema" aria-label="差額の最低点と最高点">
    <p>{flat ? "全給与点で可処分所得差は"+signed(minimum.differenceYen)+"（最低＝最高）です。"
      : negativeCount ? "設定した世帯の可処分所得が下回るのは、全"+integer(validCount)+"給与点のうち"+integer(negativeCount)+"点です。"
      : "設定した給与範囲に、障害がない世帯の可処分所得を下回る点はありません。"}</p>
    {!flat && <div className="income-difference-range">{[["最低点",minimum],["最高点",maximum]].map(([label,v])=>{
      return <div key={label}><span>{label}</span> <strong>{signed(v.differenceYen)}／年</strong>
        <p>世帯主 {integer(v.headWan)}万円・配偶者 {integer(v.spouseWan)}万円
          {v.count>1 ? "（同額 "+integer(v.count)+"点の一例）" : ""}</p>
      </div>;})}</div>}
  </section>;
}
