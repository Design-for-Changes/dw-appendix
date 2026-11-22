// 子ども1人の所得制限前の障害要件。各行は手当2制度の組で、税の認定は別軸。
const allowancePairs = [["not", false], ["2", false], ["2", true], ["1", false], ["1", true]];
const taxes = [["none", "非該当"], ["ordinary", "障害者"], ["special", "特別障害者"]];
export function childEligibilityId({ tccaGrade, welfareEligible, taxStatus }) {
  return [tccaGrade, welfareEligible ? "yes" : "no", taxStatus].join(":");
}
export const CHILD_ELIGIBILITY_OPTIONS = allowancePairs.flatMap(([tccaGrade, welfareEligible]) =>
  taxes.map(([taxStatus, taxLabel]) => {
    const fields = {tccaGrade, welfareEligible, taxStatus};
    const grade = tccaGrade === "not" ? "非該当" : tccaGrade + "級";
    return {...fields, id: childEligibilityId(fields),
      label: "特児：" + grade + " ／ 児福：" + (welfareEligible ? "該当" : "非該当") + " ／ 税：" + taxLabel};
  })
);
