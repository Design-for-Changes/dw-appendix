// 特別児童扶養手当（N01-1）だけの所得制限。児童扶養手当・障害児福祉手当とは別。
// 在宅の父母（45歳）・無所得の子1～3人、認定済みの等級を前提とする。
export const specialChildAllowanceBasis = Object.freeze({
  amountBasis: "2026-04", // 2026年4月以降の公表月額。2029年確定額の意味ではない。
  law: "https://www.mhlw.go.jp/web/t_doc?dataId=82090000&dataType=0&pageNo=1",
  order: "https://www.mhlw.go.jp/web/t_doc?dataId=82091000&dataType=0",
});
const monthlyByGrade = {not:0, "1":58450, "2":38930};

/** 扶養人数・前年所得・控除額の入力を検査し、円や人数の未設定を0として扱わない。 */
function natural(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(label + "には0以上の整数が必要です。");
  return value;
}

/**
 * 施行令5条。給与収入ではなく前年の所得税法28条2項の給与所得額（所得金額調整控除前）を渡す。
 * 給与所得から最大10万円、一律8万円、住民税の配偶者特別控除及び令所定の障害者控除を引く。
 * 住民税の同居特別障害者控除額や社会保険料の実払額は渡さない。他の個別控除は本稿ではない。
 * 低所得では判定用の表示下限を0円とする（全限度額は正なので採否に影響しない）。
 * @param {object} input 前年の給与所得・住民税の配偶者特別控除額（円）と障害者控除の人数。
 * @returns {number} 受給資格者または家族1人の特児判定用所得（年間・円）。
 */
export function salaryOnlySpecialChildIncome({salaryIncomeBeforeAdjustmentYen, spouseSpecialDeductionYen,
  ordinaryDisabilityCount, specialDisabilityCount}) {
  const salary = natural(salaryIncomeBeforeAdjustmentYen,"前年給与所得");
  const spouse = natural(spouseSpecialDeductionYen,"配偶者特別控除");
  const ordinary = natural(ordinaryDisabilityCount,"障害者数");
  const special = natural(specialDisabilityCount,"特別障害者数");
  return Math.max(0, Math.max(0,salary-100000) - 80000 - spouse - ordinary*270000 - special*400000);
}

/**
 * 法6条（受給資格者）と7条（配偶者及び同一生計の扶養義務者）を人別に判定。
 * 同じ「扶養人数」でも2つの限度額表は別。所得は各人の前年の判定所得、扶養人数も各人のもの。
 * 児童等級は所得停止前の障害要件。老人扶養親族などモデル世帯に存在しない条件は対象外。
 * @param {object} input 児童ごとの等級、受給者、配偶者等の扶養人数・判定所得および法6条の加算対象人数。
 * @returns {object} 各人の所得判定、停止者、所得停止前の月額と停止反映後の月額・年額（円）。
 */
export function calculateSpecialChildAllowance({grades, claimant, spouse, otherObligors=[],
  additionalMaintainedChildren=0, claimantOlderTaxDependents=0}) {
  if (!Array.isArray(grades) || grades.length < 1 || grades.length > 3 ||
      grades.some(g=>!["not","1","2"].includes(g))) throw new RangeError("児童1～3人の認定等級が必要です。");
  if (!Array.isArray(otherObligors)) throw new TypeError("扶養義務者は配列で指定してください。");
  const extra = natural(additionalMaintainedChildren,"税扶養外の前年末生計維持児童数");
  const older = natural(claimantOlderTaxDependents,"受給資格者の16～18歳の控除対象扶養親族数");
  const count = natural(claimant.dependentCount,"受給資格者の扶養親族等の数");
  if (older > count || older + extra > grades.length) throw new RangeError("生計維持児童・年齢加算の人数が不正です。");
  const claimantLimit = 4596000 + (count+extra)*380000 + older*250000;
  const seen = new Set();
  /** 人の重複を検出し、この1人の判定所得が指定された限度額以上かを記録する。 */
  function check(p, role, limitYen) {
    if (typeof p.id !== "string" || !p.id || seen.has(p.id)) throw new TypeError("所得判定対象は各人1回だけ指定してください。");
    seen.add(p.id);
    const assessmentIncomeYen = natural(p.assessmentIncomeYen,"前年の判定所得");
    return {id:p.id, role, dependentCount:p.dependentCount, assessmentIncomeYen, limitYen,
      stopped:assessmentIncomeYen >= limitYen};
  }
  /** 配偶者・同一生計の扶養義務者自身の扶養人数から法7条の限度額を求めて照合する。 */
  function checkOther(p, role) {
    const n = natural(p.dependentCount,"配偶者・扶養義務者の扶養親族等の数");
    return check(p, role, n === 0 ? 6287000 : 6323000 + 213000*n);
  }
  const checks = [check(claimant,"claimant",claimantLimit), checkOther(spouse,"spouse"),
    ...otherObligors.map(p=>checkOther(p,"obligor"))];
  const stoppedBy = checks.filter(person=>person.stopped);
  const monthlyBeforeIncomeYen = grades.reduce((total, g)=>total+monthlyByGrade[g],0);
  const monthlyYen = stoppedBy.length ? 0 : monthlyBeforeIncomeYen;
  return {basis:specialChildAllowanceBasis, checks, stoppedBy, incomeEligible:stoppedBy.length===0,
    status:monthlyBeforeIncomeYen===0 ? "no-qualifying-child" : stoppedBy.length ? "income-stopped" : "payable",
    monthlyBeforeIncomeYen, monthlyYen, annualYen:12*monthlyYen};
}
