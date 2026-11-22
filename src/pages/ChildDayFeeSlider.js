import {isFreeDayServiceAge, MAX_SERVICE_YEN} from "../calc/serviceBurdenLimits.js";

export default function ChildDayFeeSlider({id,className,age,value,onChange}) {
  const formatted=value.toLocaleString("ja-JP")+"円";
  return <div className={className}>
    <label htmlFor={id}>通所支援の月額負担（多子軽減後・世帯上限前）</label>
    <input id={id} type="range" min="0" max={MAX_SERVICE_YEN} step="1" value={value}
      aria-valuetext={formatted+"／月"} onChange={e=>onChange(Number(e.target.value))}/>
    <output htmlFor={id}>{formatted}{value>0 && isFreeDayServiceAge(age) ? " → 通所は無償" : ""}</output>
  </div>;
}
