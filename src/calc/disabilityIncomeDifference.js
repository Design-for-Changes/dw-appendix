import {createRevisionCalculator} from "./revisionEngine.js";

const WAN=10000;
/** 差額を算出できない点は、上下限や符号の集計に使われないよう金額を null とする。 */
function uncalculated(status,reasons) {
  return {status,reasons,differenceYen:null,withYen:null,withoutYen:null,taxSavingYen:null,
    extraBenefitsYen:null,extraServiceYen:null,insuranceSavingYen:null};
}

/**
 * 同一の給与・家族構成・扶養申告先の2世帯を比較。対照世帯では全児童の障害要件と
 * 障害福祉サービスの利用のみを解除し、通常の税、社会保険料、児童手当は両世帯とも計算する。
 * @param {object} inputs Gのモデル世帯条件（子ども1～3人、各人の税扶養・利用額等）。
 * @returns {object} 比較用の evaluate(世帯主給与万円,配偶者給与万円) と対照世帯の設定。
 */
export function createDisabilityIncomeComparison(inputs) {
  const observedInputs={...inputs,protocol:inputs?.protocol??"paper-2029"};
  const observed=createRevisionCalculator(observedInputs);
  const baselineInputs={...observedInputs,serviceAmountYen:0,otherServiceMonthlyYen:0,
    children:observedInputs.children.map(c=>({...c,tccaGrade:"not",welfareEligible:false,taxStatus:"none",
      serviceUser:false,serviceAmountYen:0}))};
  // 受給対象がなく、障害者控除も利用負担もない入力では同じ給与点を二度評価する必要はない。
  // 利用していない子の入力額（スライダーの残り値）や属する年齢帯は収支を変えない。
  const identical=!observedInputs.otherServiceMonthlyYen && observedInputs.children.every(c=>
    c.tccaGrade==="not" && !c.welfareEligible && c.taxStatus==="none" && !c.serviceUser);
  const baseline=identical?observed:createRevisionCalculator(baselineInputs);
  /** 指定した二給与を両世帯に適用し、年間収支の差と、給付・税・保険・負担の寄与を円で返す。 */
  function evaluate(headWan,spouseWan) {
    if(headWan===0 && spouseWan===0)return uncalculated("excluded",["夫婦とも給与0円の原点は試算対象外です。"]);
    const a=observed.evaluate(headWan,spouseWan), b=identical?a:baseline.evaluate(headWan,spouseWan);
    if(a.status!=="calculated" || b.status!=="calculated"){
      const status=a.status==="excluded" || b.status==="excluded"?"excluded":"insufficient";
      return uncalculated(status,[...new Set([...(a.reasons??[]),...(b.reasons??[])])]);
    }
    const da=a.details,db=b.details;
    const withYen=Math.round(a.studyDisposableWan*WAN), withoutYen=Math.round(b.studyDisposableWan*WAN);
    const taxSavingYen=db.headTax.totalTaxYen+db.spouseTax.totalTaxYen-da.headTax.totalTaxYen-da.spouseTax.totalTaxYen;
    const insuranceSavingYen=db.coverage.head.social+db.coverage.spouse.social-da.coverage.head.social-da.coverage.spouse.social;
    const extraBenefitsYen=da.benefits.tcca+da.benefits.welfare+da.benefits.childAllowance
      -db.benefits.tcca-db.benefits.welfare-db.benefits.childAllowance;
    const extraServiceYen=da.service.annual-db.service.annual;
    // 世帯全体の差と税・給付・保険・利用負担の内訳の差を独立に突き合わせる。
    const differenceYen=withYen-withoutYen;
    if(differenceYen!==taxSavingYen+insuranceSavingYen+extraBenefitsYen-extraServiceYen)
      throw new Error("二世帯の可処分所得差が計算内訳と一致しません。");
    return {status:"calculated",reasons:[],differenceYen,withYen,withoutYen,taxSavingYen,extraBenefitsYen,
      extraServiceYen,insuranceSavingYen};
  }
  return {evaluate,baselineInputs};
}

/**
 * J用：給与1万円格子で可処分所得の世帯間差（障害の要件あり側－なし側）を評価する。
 * 符号・最低点・最高点は整数円で判定し、描画用の高さだけを万円のFloat32に変換する。原点・未算定はNaN。
 * 同率の点数はすべて数え、代表座標には配偶者給与が小さい方、次に世帯主給与が小さい方を記録する。
 */
export function buildDisabilityDifferenceSurface(calculator,{maxSalaryWan=1500,onProgress}={}) {
  if(!Number.isInteger(maxSalaryWan)||maxSalaryWan<0||maxSalaryWan>1500)
    throw new RangeError("給与上限は0～1,500万円の整数で指定してください。");
  const width=maxSalaryWan+1,total=width*width,heights=new Float32Array(total).fill(NaN);
  let minYen=Infinity,maxYen=-Infinity,minimum=null,maximum=null,validCount=0,negativeCount=0;
  const rowsPerUpdate=Math.ceil(width/100);
  onProgress?.(0,total);
  for(let spouse=0;spouse<width;spouse++){
    for(let head=0;head<width;head++){
      if(head===0&&spouse===0)continue;
      const p=calculator.evaluate(head,spouse);
      if(p?.status!=="calculated")continue;
      const v=p.differenceYen;
      if(!Number.isSafeInteger(v))throw new RangeError("世帯間差は整数円で指定してください。");
      heights[spouse*width+head]=v/WAN;
      if(v<minYen){minYen=v;minimum={headWan:head,spouseWan:spouse,differenceYen:v,count:1};}
      else if(v===minYen)minimum.count++;
      if(v>maxYen){maxYen=v;maximum={headWan:head,spouseWan:spouse,differenceYen:v,count:1};}
      else if(v===maxYen)maximum.count++;
      if(v<0)negativeCount++;
      validCount++;
    }
    if(spouse+1===width || (spouse+1)%rowsPerUpdate===0)onProgress?.((spouse+1)*width,total);
  }
  return {kind:"disability-difference",width,heights,validCount,negativeCount,minimum,maximum,
    min:validCount?minYen/WAN:null,max:validCount?maxYen/WAN:null};
}
