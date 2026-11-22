import {assessBoundaryEducationNeed} from "../calc/policyEducationNeed";
import "./policy-boundaries.css";

const costs={
  annualMaterialsYen:"学校指定の教材費（世帯年額・円）",
  previousAnnualCommuteYen:"前年の通学費（世帯年額・円）",
};

export default function BoundaryEducationFields({children,values,onChange}) {
  const assessment=assessBoundaryEducationNeed(children,values);
  if(!assessment.applicable)return null;
  const {monthlyNeedYen,requiredInputs,previousSpecialPupilsRange}=assessment;
  const change=(key,value)=>onChange(previous=>{
    const next={...previous};
    if(value==="")delete next[key]; else next[key]=Number(value);
    return next;
  });
  return <details className="boundary-school-costs">
    <summary>就学奨励費の制度境界</summary>
    <div className="revision-fields">
      {requiredInputs.includes("previousSpecialPupils")&&<label>前年末の特別支援教育の対象者数
        <select value={values.previousSpecialPupils??""} onChange={e=>change("previousSpecialPupils",e.target.value)}>
          <option value="">未指定</option>
          {Array.from({length:previousSpecialPupilsRange.max-previousSpecialPupilsRange.min+1},(_,i)=>i+previousSpecialPupilsRange.min)
            .map(n=><option key={n} value={n}>{n}人</option>)}
        </select></label>}
      {Object.entries(costs).filter(([key])=>requiredInputs.includes(key)).map(([key,label])=>
        <label key={key}>{label}<input type="number" step="1" min="0" placeholder="未入力" value={values[key]??""}
          onChange={e=>change(key,e.target.value)}/></label>)}
    </div>
    <p>世帯の月需要額：<output>{Number.isFinite(monthlyNeedYen)?monthlyNeedYen.toLocaleString("ja-JP")+"円":"未算定"}</output></p>
  </details>;
}
