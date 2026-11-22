import {useEffect,useMemo} from "react";
import {useSessionParameter} from "./salarySimulatorSession";

export const blankChild = () => ({age:8,tccaGrade:"not",welfareEligible:false,taxStatus:"none",serviceAmountYen:0});
const DEFAULT_ROLES={spouseDeductionClaimant:"head",allowanceRecipient:"highest-salary",welfareMaintainer:"highest-salary"};

// 全児童を特児の受給資格者と同じ親の税扶養に置くので、旧画面で選択した個別申告は引き継がない。
const formerFields=["taxDependentOf","maintainedBy","maintainedByRecipient"];
const hasFormerFields=c=>formerFields.some(k=>Object.hasOwn(c,k));
const withoutFormerFields=c=>Object.fromEntries(Object.entries(c).filter(([k])=>!formerFields.includes(k)));

/** G・変更点図・世帯間差で同じ設定を使用する。旧セッションを表示・計算する最初の描画から移行。 */
export function usePaperHousehold() {
  const [storedChildren,setChildren]=useSessionParameter("children",[blankChild()]);
  const [storedRoles,setRoles]=useSessionParameter("roles",DEFAULT_ROLES);
  const roles=useMemo(()=>storedRoles.allowanceRecipient==="highest-salary"?storedRoles:
    {...storedRoles,allowanceRecipient:"highest-salary"},[storedRoles]);
  const children=useMemo(()=>storedChildren.some(hasFormerFields)
    ? storedChildren.map(withoutFormerFields) : storedChildren,[storedChildren]);
  useEffect(()=>{
    if(children!==storedChildren)setChildren(children);
    if(roles!==storedRoles)setRoles(roles);
  },[children,roles,storedChildren,storedRoles,setChildren,setRoles]);
  const inputs=useMemo(()=>({protocol:"paper-2029",roles,serviceAmountYen:0,
    children:children.map(c=>({...c,taxDependentOf:"highest-salary",maintainedBy:null,serviceUser:c.serviceAmountYen>0}))}),[children,roles]);
  return {children,setChildren,roles,setRoles,inputs};
}
