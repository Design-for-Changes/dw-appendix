import {useEffect,useMemo} from "react";
import {useSessionParameter} from "./salarySimulatorSession";
import {PAPER_ALLOWANCE_ROLES} from "../calc/revisionEngine";

export const blankChild = () => ({age:8,tccaGrade:"not",welfareEligible:false,taxStatus:"none",serviceAmountYen:0});
const PAPER_ROLES=Object.freeze({spouseDeductionClaimant:"highest-salary",...PAPER_ALLOWANCE_ROLES});

// 全児童を特児の受給資格者と同じ親の税扶養に置くので、旧画面で選択した個別申告は引き継がない。
const formerFields=["taxDependentOf","maintainedBy","maintainedByRecipient"];
const hasFormerFields=c=>formerFields.some(k=>Object.hasOwn(c,k));
const withoutFormerFields=c=>Object.fromEntries(Object.entries(c).filter(([k])=>!formerFields.includes(k)));

/** 可処分所得・制度境界・世帯間差の各図で同じ設定を使用する。旧セッションを表示・計算する最初の描画から移行。 */
export function usePaperHousehold() {
  const [storedChildren,setChildren]=useSessionParameter("children",[blankChild()]);
  const [storedRoles,setRoles]=useSessionParameter("roles",PAPER_ROLES);
  const children=useMemo(()=>storedChildren.some(hasFormerFields)
    ? storedChildren.map(withoutFormerFields) : storedChildren,[storedChildren]);
  useEffect(()=>{
    if(children!==storedChildren)setChildren(children);
    if(Object.keys(storedRoles).length!==Object.keys(PAPER_ROLES).length ||
        Object.keys(PAPER_ROLES).some(k=>storedRoles[k]!==PAPER_ROLES[k]))setRoles(PAPER_ROLES);
  },[children,storedChildren,storedRoles,setChildren,setRoles]);
  // 旧タブで手動選択した親を、初回のグラフ計算や保存済み計算結果の検索にも使わない。
  const inputs=useMemo(()=>({protocol:"paper-2029",roles:PAPER_ROLES,serviceAmountYen:0,
    children:children.map(c=>({...c,taxDependentOf:"highest-salary",maintainedBy:null,serviceUser:c.serviceAmountYen>0}))}),[children]);
  return {children,setChildren,inputs};
}
