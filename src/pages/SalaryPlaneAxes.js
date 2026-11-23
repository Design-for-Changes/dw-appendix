// Both salary axes span the same 0–1,500万円: one increment must occupy the same length.
export const WIDTH=1032, LEFT=83, RIGHT=998, TOP=28, BOTTOM=TOP+(RIGHT-LEFT), HEIGHT=BOTTOM+81;
export const viewBox=`0 0 ${WIDTH} ${HEIGHT}`;
export const xPlot=(v,max)=>LEFT+v/max*(RIGHT-LEFT), yPlot=(v,max)=>BOTTOM-v/max*(BOTTOM-TOP);
export function toSalaryPlanePath(segments,max,digits=3) {
  return segments.map(([a,b,c,d])=>"M"+xPlot(a,max).toFixed(digits)+" "+yPlot(b,max).toFixed(digits)+
    "L"+xPlot(c,max).toFixed(digits)+" "+yPlot(d,max).toFixed(digits)).join("");
}
export default function SalaryPlaneAxes({max}) {
  const ticks=Array.from({length:7},(_,i)=>i*max/6);
  return <>
    <rect x={LEFT} y={TOP} width={RIGHT-LEFT} height={BOTTOM-TOP} fill="white"/>
    {ticks.map(t=><g key={t}><line x1={xPlot(t,max)} x2={xPlot(t,max)} y1={TOP} y2={BOTTOM} className="decision-grid"/>
      <line x1={LEFT} x2={RIGHT} y1={yPlot(t,max)} y2={yPlot(t,max)} className="decision-grid"/>
      <text x={xPlot(t,max)} y={BOTTOM+29} textAnchor="middle">{t.toLocaleString("ja-JP")}</text>
      <text x={LEFT-12} y={yPlot(t,max)+5} textAnchor="end">{t.toLocaleString("ja-JP")}</text></g>)}
    <path d={`M${LEFT} ${TOP}V${BOTTOM}H${RIGHT}`} stroke="#3b505a" fill="none"/>
    <text className="decision-axis" x={(LEFT+RIGHT)/2} y={HEIGHT-15} textAnchor="middle">世帯主の年間給与（万円）</text>
    <text className="decision-axis" transform={`translate(21 ${(TOP+BOTTOM)/2}) rotate(-90)`} textAnchor="middle">配偶者の年間給与（万円）</text>
  </>;
}
