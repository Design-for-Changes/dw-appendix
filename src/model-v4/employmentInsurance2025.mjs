/* global BigInt */
/** Employment insurance from confirmed subject wages, determination dates and deduction dates only. */
export const EMPLOYMENT2025_SOURCES=Object.freeze({rates:"https://www.mhlw.go.jp/content/001401966.pdf",rounding:"https://www.mhlw.go.jp/new-info/kobetu/roudou/gyousei/hoken/kakikata/dl/keizoku-20.pdf",determination:"https://jsite.mhlw.go.jp/niigata-roudoukyoku/content/contents/R703_5_jimusyoriyouryouR7.3.pdf",wages:"https://jsite.mhlw.go.jp/osaka-roudoukyoku/hourei_seido_tetsuzuki/roudou_hoken/hourei_seido/kosin/keizoku/kakunin.html",taxPaid:"https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1130.htm"});
const K=data=>({status:"known",...data}),P=reason=>({status:"pending",reason}),O=reason=>({status:"out-of-scope",reason});
function check(c,m){if(!c)throw new TypeError(m);}
function text(v){return typeof v==="string"&&v.trim().length>0;}
function evidenced(v){return v?.status==="known"&&text(v.evidence?.source)&&text(v.evidence?.note);}
function date(v){check(typeof v==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!isNaN(Date.parse(v+"T00:00:00Z"))&&new Date(v+"T00:00:00Z").toISOString().slice(0,10)===v,"Valid ISO date required");}
/** Per-payment eligibility is confirmed externally, not inferred from health insurance or hours. */
export function employmentInsurancePremium2025({eligibility,payment}){
 if(!evidenced(eligibility))return P("Employment-insurance qualification must be independently confirmed");
 if(!text(eligibility.personId))return P("Eligibility person missing");
 if(payment?.personId)check(payment.personId===eligibility.personId,"Wage/payment belongs to another person");
 if(!text(eligibility.value))return P("Employment-insurance qualification value missing");
 if(eligibility.value==="confirmed-not-insured")return K({personId:eligibility.personId,amountYen:0,reason:"Explicit confirmed non-enrollment/applicability exclusion",evidence:structuredClone(eligibility.evidence)});
 if(eligibility.value!=="insured-general-business")return O("Only confirmed ordinary general-business insured status supported; this is not zero premium");
 if(eligibility.rounding===undefined)return P("Explicit payroll rounding/no-special-agreement status required");
 if(eligibility.rounding!=="ordinary-payroll-no-special-agreement")return O("Cash collection, special agreements or special qualification outside scope");
 if(!evidenced(payment))return P("Confirmed payment record required");
 if(!text(payment.personId))return P("Payment person missing");check(payment.personId===eligibility.personId,"Wage/payment belongs to another person");
 if(!["regular-wage","bonus","retroactive-difference"].includes(payment.kind))return P("Payment kind must be explicit");
 if(!payment.determinedOn)return P("Wage determination date required; payment date or attendance period cannot substitute");
 date(payment.determinedOn);
 if(payment.determinedOn<"2024-04-01"||payment.determinedOn>"2026-03-31")return O("Determination date outside verified 2024/2025 fiscal rate windows");
 const wage=payment.subjectWage;
 if(!evidenced(wage)||wage.amountYen===null||wage.amountYen===undefined)return P("Confirmed employment-insurance subject wage required; no standard-base or annual-salary inference");
 if(wage.basis!=="confirmed-employment-insurance-subject-wage")return P("Subject wage basis is not confirmed");
 check(Number.isSafeInteger(wage.amountYen)&&wage.amountYen>=0,"Subject wage must be nonnegative integer yen");
 const rateNumerator=payment.determinedOn<"2025-04-01"?12:11;
 const n=BigInt(wage.amountYen)*BigInt(rateNumerator),q=n/2000n,r=n%2000n;
 const exact={personId:eligibility.personId,determinedOn:payment.determinedOn,subjectWageYen:wage.amountYen,rateNumerator,rateDenominator:2000,exactNumerator:n.toString(),exactDenominator:2000,remainder:Number(r),sources:EMPLOYMENT2025_SOURCES};
 // The primary text says <=50 sen and >=50 sen1rin, leaving exactly 1001/2000 unresolved.
 if(r===1001n)return {...exact,...P("Fraction 1001/2000 yen (0.5005): between50sen and50sen1rin; primary-source rounding unresolved")};
 const rounded=q+(r>=1002n?1n:0n);check(rounded<=BigInt(Number.MAX_SAFE_INTEGER),"Premium exceeds safe range");
 return {...exact,...K({amountYen:Number(rounded)}),rounding:"<=50sen down; >=50sen1rin up; intermediate band held"};
}
/** Calendar-year aggregation requires a complete register and each actual deduction/burden date. */
export function employmentInsuranceDeductionsYear2025({payments}){
 const entries=payments?.entries||[];check(Array.isArray(entries),"Payment register must be an array");const ids=new Set();
 const rows=entries.map(entry=>{
  const p=entry.payment;if(p?.paymentId){check(!ids.has(p.paymentId),"Duplicate payment ID");ids.add(p.paymentId);}
  if(!evidenced(p)||!text(p.paymentId)||!p.deductedOn)return {paymentId:p?.paymentId,included:"unknown",result:P("Confirmed payment ID and actual deduction date required")};
  date(p.deductedOn);
  if(p.determinedOn){date(p.determinedOn);check(p.deductedOn>=p.determinedOn,"Deduction before confirmed wage determination is outside ordinary scope");}
  if(!p.deductedOn.startsWith("2025-"))return {paymentId:p.paymentId,deductedOn:p.deductedOn,included:false,result:O("Burden date outside2025; excluded from2025 total")};
  return {paymentId:p.paymentId,deductedOn:p.deductedOn,included:true,result:employmentInsurancePremium2025(entry)};
 });
 const relevant=rows.filter(r=>r.included===true);
 let total;
 if(!evidenced(payments)||!Array.isArray(payments?.entries)||rows.some(r=>r.included==="unknown"||r.included&&r.result.status!=="known"))total=P("Incomplete payment register, date, qualification, wage or rounding; no partial sum as annual total");
 else{const amountYen=relevant.reduce((n,r)=>n+r.result.amountYen,0);check(Number.isSafeInteger(amountYen),"Annual premium exceeds safe range");total=K({amountYen});}
 return {aggregationBasis:"2025-explicit-employment-insurance-deduction-dates",rows,total,taxOrAllowanceConnection:"none",mustNotAddToWithholdingStatementActuals:true,notAnEligibilityDetermination:true};
}
