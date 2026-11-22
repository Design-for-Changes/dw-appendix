import {REVISION_SPOUSE_DEDUCTION_TABLE} from "./revisionEngine.js";
import {calculatePaperSalaryTaxInputs2029} from "./paperSalaryTaxInputs2029.js";

/**
 * E/Gで共通の1万円刻み給与格子と、相手の給与所得を使う配偶者所得区分。
 * 下端・上端の代表給与は、もう一方の親を各帯内で置換しても申告者／扶養先を
 * 反転させないために使う。世帯主と配偶者の給与自体は格子の全点を残す。
 */
export function createPaperSalaryBands(maxSalaryWan=1500){
  if(!Number.isInteger(maxSalaryWan)||maxSalaryWan<1||maxSalaryWan>1500)throw new RangeError("給与上限は1～1,500万円です。");
  const wages=Array.from({length:maxSalaryWan+1},(_,i)=>i);
  const limits=[620000,...REVISION_SPOUSE_DEDUCTION_TABLE.map(([wan])=>wan*10000),Infinity];
  const band=wages.map(w=>limits.findIndex(limit=>calculatePaperSalaryTaxInputs2029({
    annualSalaryYen:w*10000,eligibleForIncomeAdjustment:true,
  }).salaryIncomeYen<=limit));
  const first=limits.map((_,i)=>band.indexOf(i)),last=limits.map((_,i)=>band.lastIndexOf(i));
  return {wages,band,first,last};
}
