import {createRevisionCalculator} from "./revisionEngine.js";
import {createPaperSalaryBands} from "./paperSalaryBands.js";
import {getChildDayServiceCapYen} from "./serviceBurdenLimits.js";
import {CALCULATION_SOURCES} from "./calculationSources.js";
import {PAPER_EDUCATION_ASSESSMENT_BASIS,assessPaperEducationClass} from "./paperEducationAssessment.js";
import {assessBoundaryEducationNeed} from "./policyEducationNeed.js";
import {assessFunabashiMedicalCoverage,funabashiMedicalSources} from "./paperMedicalCoverage.js";
import {ADDITIONAL_POLICY_LAYERS,createAdditionalPolicyClassifier} from "./policyAdditionalBands.js";

const BASE=[
  {id:"N01-1",label:"特別児童扶養手当",classes:["所得要件内","所得による停止"],source:CALCULATION_SOURCES.disabilityAllowances.url},
  {id:"N01-2",label:"障害児福祉手当",classes:["所得要件内","所得による停止"],source:CALCULATION_SOURCES.welfareAllowanceIncomeLimitR8.url},
  {id:"N02/N03",label:"障害福祉・障害児通所支援の世帯上限",classes:["月0円","月4,600円","月37,200円"],source:CALCULATION_SOURCES.serviceBurden.url},
  {id:"N04",label:"特別支援教育就学奨励費（小学部在籍を仮定・令和6年度需要額表）",classes:["第1区分","第2区分","第3区分"],source:PAPER_EDUCATION_ASSESSMENT_BASIS.measurement},
  {id:"M01",label:"重度心身障害者医療費助成（船橋市・保険単位の所得割23万5千円、障害要件該当・特例なし）",classes:["所得割非課税","所得割課税・23万5千円未満","所得制限（23万5千円以上）"],source:funabashiMedicalSources.m01},
  {id:"N02/M03",label:"補装具費・日常生活用具費（船橋市の児童）",classes:["所得割なし：上限0円","所得割あり：上限37,200円"],
    source:"https://www.city.funabashi.lg.jp/kenkou/shougaisha/002/p124977.html"},
];
const MAX=1500;
const educationCodes=new Map(BASE[3].classes.map((label,i)=>[label,i+1]));
const calculate="calculated",notApplicable="not-applicable",missing="needs-input";

/** 各制度の所得判定に必要な親別の税・所得・保険料を、Eと同じ計算結果から取り出す。 */
function parentRecord(t){
  return {income:t.previousIncomeYen,social:t.previousSocialYen,serviceLevy:t.serviceLevyYen,
    taxable:t.serviceTaxable,municipalLevy:t.residentTax.municipalIncomeLevyYen};
}

/** Conditional policy classifications, not actual service uptake, payable expenses, or disposable income. */
export function createPolicyOnlyClassifier(inputs,options={},maxSalaryWan=MAX){
  const {wages,band,first:lo,last:hi}=createPaperSalaryBands(maxSalaryWan);
  // Fixed public E specification: don't silently apply fast-path factorization to other claimant choices.
  if(inputs?.protocol && inputs.protocol!=="paper-2029")throw new Error("この図は論文の二給与条件に限ります。");
  const children=inputs.children;
  const model=createRevisionCalculator({protocol:"paper-2029",children,serviceAmountYen:inputs.serviceAmountYen??0});
  /** M01の障害要件に該当し、所得制限の特例がない場合の参考線。実際の資格は推定しない。 */
  function medicalClass(t){
    const levy=t.residentTax.municipalIncomeLevyYen;
    const {m01Status}=assessFunabashiMedicalCoverage({funabashiRegistered:true,insured:true,publicAssistance:false,
      m01DisabilityConfirmed:true,m01ExceptionConfirmed:false,adjustedInsuranceUnitLevyYen:levy});
    if(m01Status==="対象")return levy===0?1:2;
    return m01Status==="対象外（所得制限）"?3:0;
  }
  const highs=lo.map(rep=>rep<0?[]:wages.map(a=>{
    if(a<rep||a===0)return null;
    const d=model.evaluate(a,rep).details;
    // 本人（子）は無所得。代表点で評価した「他方の親」の可否はこの行に持ち込まない。
    const [child,highParent]=d.benefits.welfareChildren[0].checks;
    return {...parentRecord(d.headTax),medicalClass:medicalClass(d.headTax),tcca:!d.benefits.specialChildAllowance.checks[0].stopped,
      welfare:child.passes&&highParent.passes};
  }));
  const lows=hi.map(rep=>rep<0?[]:wages.map(b=>{
    if(rep<b)return null;
    const d=model.evaluate(rep,b).details;
    return {...parentRecord(d.spouseTax),tcca:!d.benefits.specialChildAllowance.checks[1].stopped,
      welfare:d.benefits.welfareChildren[0].checks[2].passes};
  }));
  const {applicable,monthlyNeedYen:need}=assessBoundaryEducationNeed(children,options.educationInputs??{});
  const educationStatus=!applicable?notApplicable:Number.isFinite(need)&&need>0?calculate:missing;
  const additional=createAdditionalPolicyClassifier(children);
  if(ADDITIONAL_POLICY_LAYERS.length>7)throw new Error("制度区分が格納上限を超えました。");
  const statuses=[children.some(c=>c.tccaGrade!=="not")?calculate:notApplicable,
    children.some(c=>c.welfareEligible)?calculate:notApplicable,calculate,educationStatus,calculate,calculate,
    ...additional.statuses];
  const layers=[...BASE,...ADDITIONAL_POLICY_LAYERS].map((layer,i)=>({...layer,status:statuses[i]}));
  const hasTcca=statuses[0]===calculate,hasWelfare=statuses[1]===calculate;
  /** 一組の夫婦給与について各制度の区分を2語に格納する。非該当・未設定は0とする。 */
  function classify(x,y,out){
    if(x===0&&y===0){out[0]=out[1]=0;return;}
    // h represents the higher-paid parent (head if wages tie), including the
    // only earner when the other has no wage. For the medical reference lines
    // the child is assumed to join this parent's insurance; this is not a
    // statutory determination or inferred from the child's tax category.
    const high=Math.max(x,y),low=Math.min(x,y),h=highs[band[low]][high],l=lows[band[high]][low];
    const tcca=hasTcca?(h.tcca&&l.tcca?1:2):0,welfare=hasWelfare?(h.welfare&&l.welfare?1:2):0;
    // The change of the cap itself does not depend on input fees and does not imply an actual expense.
    const cap=getChildDayServiceCapYen(h.serviceLevy+l.serviceLevy,h.taxable||l.taxable);
    const service=cap===0?1:cap===4600?2:3;
    let ed=0;
    if(educationStatus===calculate){
      // Measurement III(1), V(1): income per person less listed deductions, then
      // monthly and summed. Here there are no optional premiums/expenses and no
      // widow/single-parent deduction. No rounding of the ratio. A nonpositive
      // numerator is always class 1 with a positive measured monthly need.
      const measuredMonthlyIncomeYen=Math.max(0,(h.income-h.social+l.income-l.social)/12);
      ed=educationCodes.get(assessPaperEducationClass({scope:PAPER_EDUCATION_ASSESSMENT_BASIS.scope,
        measuredMonthlyIncomeYen,measuredMonthlyNeedYen:need}));
    }
    const equipment=h.municipalLevy>0||l.municipalLevy>0?2:1;
    out[0]=tcca|(welfare<<4)|(service<<8)|(ed<<12)|(h.medicalClass<<16)|(equipment<<20);
    out[1]=additional.classify(h,l);
  }
  return {layers,classify};
}

/** Consecutive adjacent 1万円 cells with the same *directed* change are merged,
 * never interpolated. A segment [x1,y1,x2,y2,before,after] lies halfway between
 * neighboring valid salaries; its class indices are 1-based. No financial height is read. */
export function buildPolicyOnlyMap(inputs,options={}, {maxSalaryWan=MAX,onProgress}={}){
  const {layers,classify}=createPolicyOnlyClassifier(inputs,options,maxSalaryWan);
  const width=maxSalaryWan+1,word=new Uint32Array(2);
  for(const layer of layers)layer.segments=[];
  const streams=layers.map((layer,i)=>({layer,active:layer.status===calculate,
    wordIndex:i<BASE.length?0:1,shift:4*(i<BASE.length?i:i-BASE.length),
    above:new Uint8Array(width),previous:0,
    openVertical:new Uint8Array(width),startVertical:new Uint16Array(width),openHorizontal:0,startHorizontal:0}));
  const active=streams.filter(stream=>stream.active);
  /** 格子点が代表する給与区間の下端・上端を描画範囲内に収める。 */
  const lower=i=>Math.max(0,i-.5),upper=i=>Math.min(maxSalaryWan,i+.5);
  let progress=-1;
  for(let y=0;y<width;y++){
    for(const s of active){s.previous=0;s.openHorizontal=0;}
    for(let x=0;x<width;x++){
      classify(x,y,word);
      for(const s of active){
        const v=(word[s.wordIndex]>>>s.shift)&15,left=s.previous,above=s.above[x];
        const vt=left&&v&&left!==v?(left<<4)|v:0,ht=above&&v&&above!==v?(above<<4)|v:0;
        const prevV=s.openVertical[x],prevH=s.openHorizontal;
        if(vt!==prevV){
          if(prevV)s.layer.segments.push([x-.5,lower(s.startVertical[x]),x-.5,upper(y-1),prevV>>>4,prevV&15]);
          s.openVertical[x]=vt;if(vt)s.startVertical[x]=y;
        }
        if(ht!==prevH){
          if(prevH)s.layer.segments.push([lower(s.startHorizontal),y-.5,upper(x-1),y-.5,prevH>>>4,prevH&15]);
          s.openHorizontal=ht;if(ht)s.startHorizontal=x;
        }
        s.above[x]=s.previous=v;
      }
    }
    for(const s of active)if(s.openHorizontal){
      const c=s.openHorizontal;s.layer.segments.push([lower(s.startHorizontal),y-.5,maxSalaryWan,y-.5,c>>>4,c&15]);
    }
    const pct=Math.floor(100*(y+1)/width);
    if(progress!==pct){onProgress?.(pct);progress=pct;}
  }
  for(const s of active)for(let x=1;x<width;x++)if(s.openVertical[x]){
    const c=s.openVertical[x];s.layer.segments.push([x-.5,lower(s.startVertical[x]),x-.5,maxSalaryWan,c>>>4,c&15]);
  }
  return {maxSalaryWan,validCount:width*width-1,layers};
}
