/* global BigInt */
/** Confirmed standard bases only. No annual-salary estimation or tax/allowance connection. */
export const INSURANCE2025_SOURCES=Object.freeze({
 rates2024:"https://www.kyoukaikenpo.or.jp/about/business/insurance_rate/rate_prefectures/r06/",
 rates2025:"https://www.kyoukaikenpo.or.jp/about/business/insurance_rate/rate_prefectures/r07/",
 care:"https://www.kyoukaikenpo.or.jp/about/business/insurance_rate/002/",
 pension:"https://www.nenkin.go.jp/service/kounen/hokenryo/hoshu/20150515-01.html",
 bonus:"https://www.nenkin.go.jp/service/kounen/hokenryo/hoshu/20141203.html",
 rounding:"https://www.nenkin.go.jp/service/kounen/hokenryo/nofu/20121026.html",
 deductionMonth:"https://www.nenkin.go.jp/service/kounen/hokenryo/nofu/nofu.html",
 taxPaid:"https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1130.htm",
});
const K=data=>({status:"known",...data}),P=reason=>({status:"pending",reason}),O=reason=>({status:"out-of-scope",reason});
function check(c,m){if(!c)throw new TypeError(m);}
function text(v){return typeof v==="string"&&v.trim().length>0;}
function evidenced(v){return v?.status==="known"&&text(v.evidence?.source)&&text(v.evidence?.note);}
function ym(v){check(typeof v==="string"&&/^\d{4}-(0[1-9]|1[0-2])$/.test(v),"Insurance month must be YYYY-MM");}
function date(v){check(typeof v==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!isNaN(Date.parse(v+"T00:00:00Z"))&&new Date(v+"T00:00:00Z").toISOString().slice(0,10)===v,"Valid ISO date required");}
function yen(v){check(Number.isSafeInteger(v)&&v>=0,"Nonnegative integer yen required");}
function sum(states){if(states.some(s=>s?.status!=="known"))return P("Some required premium entries are unconfirmed or outside scope");const amountYen=states.reduce((n,s)=>n+s.amountYen,0);yen(amountYen);return K({amountYen});}
export function roundEmployeePayrollFraction({numerator,denominator}){
 const n=BigInt(numerator),d=BigInt(denominator);check(n>=0n&&d>0n,"Nonnegative fraction required");
 const q=n/d,r=n%d;const rounded=q+(r*2n>d?1n:0n);check(rounded<=BigInt(Number.MAX_SAFE_INTEGER),"Premium exceeds safe range");
 return K({amountYen:Number(rounded),exactNumerator:n.toString(),exactDenominator:d.toString(),remainder:r.toString(),rounding:"payroll: half-yen or less down; more than half up",source:INSURANCE2025_SOURCES.rounding});
}
function baseAmount(f,{personId,month,scheme,bonus}){
 if(!evidenced(f)||f.amountYen===undefined||f.amountYen===null)return P("Confirmed standard base and evidence required; no salary/12 inference");
 if(!text(f.personId))return P("Base person missing");check(f.personId===personId,"Standard base belongs to another person");
 if(f.insuranceMonth!==month)return P("Standard base month does not match insurance/bonus month");
 if(f.scheme!==scheme||f.basis!==(bonus?"confirmed-standard-bonus-after-caps":"confirmed-standard-monthly"))return P("Wrong scheme/base type; raw remuneration is not a confirmed standard base");
 yen(f.amountYen);check(f.amountYen%1000===0,"Standard base must be a multiple of 1000 yen");
 if(bonus){if(f.capsApplied!==true)return P("Scheme-specific bonus caps must already be confirmed");check(f.amountYen<=(scheme==="health"?5730000:1500000),"Confirmed bonus base exceeds statutory cap");}
 else check(scheme==="health"?f.amountYen>0:f.amountYen>=88000&&f.amountYen<=650000,"Monthly base outside insured no-exemption scope");
 return K({amountYen:f.amountYen,evidence:structuredClone(f.evidence)});
}
function commonProfile(profile,personId,month){
 if(!evidenced(profile))return P("Confirmed coverage profile required; municipality does not determine branch");
 if(!text(profile.personId))return P("Profile person missing");check(profile.personId===personId,"Coverage profile belongs to another person");
 if(!profile.fromInsuranceMonth||!profile.throughInsuranceMonth)return P("Explicit coverage period required");
 ym(profile.fromInsuranceMonth);ym(profile.throughInsuranceMonth);
 if(month<profile.fromInsuranceMonth||month>profile.throughInsuranceMonth)return P("Coverage for requested insurance month is not confirmed");
 if(profile.continuousSingleEmployerNoExemptions===undefined)return P("Ordinary continuous single-employer/no-exemption scope unconfirmed");
 if(profile.continuousSingleEmployerNoExemptions!==true)return O("Acquisition/loss, exemptions, employer changes or multiple employers require a separate contract");
 if(profile.rounding===undefined)return P("Payroll deduction/no-special-agreement rounding must be explicit");
 if(profile.rounding!=="ordinary-payroll-no-special-agreement")return O("Cash collection or special rounding agreement is outside this calculation");
 return K({});
}
function parts({personId,profile,insuranceMonth,healthStandard,pensionStandard,bonus=false}){
 check(text(personId),"Explicit person ID required");ym(insuranceMonth);
 const metadata={personId,insuranceMonth,periodBasis:bonus?"bonus-payment-month":"insurance-month",taxOrAllowanceConnection:"none"};
 if(insuranceMonth<"2024-12"||insuranceMonth>"2025-12")return {...metadata,healthAndCare:O("Only 2025 plus explicit Dec2024 carry-in is supported"),pension:O("Unsupported insurance month"),total:O("Unsupported insurance month")};
 const common=commonProfile(profile,personId,insuranceMonth);
 if(common.status!=="known")return {...metadata,healthAndCare:common,pension:common,total:common};
 const old=insuranceMonth<"2025-03",healthBasisPoints=old?977:979,careBasisPoints=old?160:159;
 let healthAndCare,pension;
 if(!text(profile.healthScheme))healthAndCare=P("Health insurer/branch missing");
 else if(profile.healthScheme!=="kyoukaikenpo-chiba")healthAndCare=O("Only confirmed Kyokai Kenpo Chiba ordinary insured coverage is supported");
 else if(!["category2","not-category2"].includes(profile.fixedCareCategory))healthAndCare=P("Explicit fixed care category required; age is not inferred");
 else{
  const b=baseAmount(healthStandard,{personId,month:insuranceMonth,scheme:"health",bonus});
  const care=profile.fixedCareCategory==="category2"?careBasisPoints:0;
  healthAndCare=b.status!=="known"?b:{...roundEmployeePayrollFraction({numerator:BigInt(b.amountYen)*BigInt(healthBasisPoints+care),denominator:20000}),standardBaseYen:b.amountYen,healthBasisPoints,careBasisPoints:care,fullRateDenominator:10000,employeeShareDenominator:2,
   combinedBeforeRounding:true,careCategory:profile.fixedCareCategory,healthExactNumerator:(BigInt(b.amountYen)*BigInt(healthBasisPoints)).toString(),careExactNumerator:(BigInt(b.amountYen)*BigInt(care)).toString()};
 }
 if(!text(profile.pensionScheme))pension=P("Pension coverage missing");
 else if(profile.pensionScheme!=="employees-pension")pension=O("Unsupported pension scheme");
 else{const b=baseAmount(pensionStandard,{personId,month:insuranceMonth,scheme:"pension",bonus});pension=b.status!=="known"?b:{...roundEmployeePayrollFraction({numerator:BigInt(b.amountYen)*1830n,denominator:20000}),standardBaseYen:b.amountYen,pensionBasisPoints:1830,fullRateDenominator:10000,employeeShareDenominator:2};}
 return {...metadata,healthAndCare,pension,total:sum([healthAndCare,pension])};
}
export function monthlyEmployeePremium2025(input){return parts(input);}
export function bonusEmployeePremium2025({personId,profile,bonus}){
 if(!evidenced(bonus))return {healthAndCare:P("Confirmed bonus date and record required"),pension:P("Confirmed bonus record required"),total:P("Bonus unconfirmed")};
 if(!bonus.paidOn)return {healthAndCare:P("Bonus payment date missing"),pension:P("Bonus payment date missing"),total:P("Bonus payment date missing")};
 date(bonus.paidOn);check(text(bonus.bonusId),"Bonus ID required");
 if(!bonus.paidOn.startsWith("2025-"))return {bonusId:bonus.bonusId,paidOn:bonus.paidOn,healthAndCare:O("Bonus outside2025"),pension:O("Bonus outside2025"),total:O("Bonus outside2025")};
 return {...parts({personId,profile,insuranceMonth:bonus.paidOn.slice(0,7),healthStandard:bonus.healthStandard,pensionStandard:bonus.pensionStandard,bonus:true}),bonusId:bonus.bonusId,paidOn:bonus.paidOn};
}
export function employeeInsuranceYear2025(input){
 const {personId,profile,monthlyRecords,bonuses}=input;check(text(personId),"Person ID required");
 const records=monthlyRecords||[];check(Array.isArray(records),"Explicit monthly records required");const seen=new Set();
 for(const r of records){ym(r.insuranceMonth);check(r.insuranceMonth.startsWith("2025-"),"Annual insurance records must be2025; carry-in supplied separately");check(!seen.has(r.insuranceMonth),"Duplicate insurance month");seen.add(r.insuranceMonth);}
 const monthly=Array.from({length:12},(_,i)=>{const m=`2025-${String(i+1).padStart(2,"0")}`,r=records.find(r=>r.insuranceMonth===m);return monthlyEmployeePremium2025({personId,profile,insuranceMonth:m,healthStandard:r?.healthStandard,pensionStandard:r?.pensionStandard});});
 const bonusComplete=evidenced(bonuses)&&Array.isArray(bonuses.entries),entries=bonuses?.entries||[];check(Array.isArray(entries),"Explicit bonus register required");
 const ids=new Set(),months=new Set();let repeatedMonth=false;
 for(const b of entries){check(text(b.bonusId),"Bonus ID required");check(!ids.has(b.bonusId),"Duplicate bonus ID");ids.add(b.bonusId);if(b.paidOn){date(b.paidOn);const m=b.paidOn.slice(0,7);if(months.has(m))repeatedMonth=true;months.add(m);}}
 const bonusRows=entries.map(b=>bonusEmployeePremium2025({personId,profile,bonus:b}));
 // Inputs are capped final bases, not raw-bonus cap calculations. Still reject contradictory within-year totals.
 for(const phase of ["2024-fiscal-tail","2025-fiscal-head"]){
  const relevant=bonusRows.filter(b=>b.paidOn&&(phase==="2024-fiscal-tail"?b.paidOn<"2025-04-01":b.paidOn>="2025-04-01"));
  if(relevant.every(b=>b.healthAndCare?.status==="known"))check(relevant.reduce((n,b)=>n+b.healthAndCare.standardBaseYen,0)<=5730000,"Health bonus bases contradict fiscal-year cap");
 }
 const bonusHealth=!bonusComplete?P("Bonus register not confirmed complete; absence is not assumed"):repeatedMonth?O("Multiple bonuses in one month require separate cap/rounding contract"):sum(bonusRows.map(b=>b.healthAndCare));
 const bonusPension=!bonusComplete?P("Bonus register not confirmed complete"):repeatedMonth?O("Multiple bonuses in one month unsupported"):sum(bonusRows.map(b=>b.pension));
 const healthAndCare=sum([...monthly.map(r=>r.healthAndCare),bonusHealth]),pension=sum([...monthly.map(r=>r.pension),bonusPension]);
 return {personId,aggregationBasis:"2025-insurance-months-plus-2025-paid-bonuses",monthly,bonuses:bonusRows,bonusRegisterComplete:bonusComplete,bonusStructureSupported:!repeatedMonth,
  healthAndCare,pension,total:sum([healthAndCare,pension]),calendarYearPayrollDeductions:P("Separate deduction dates and Dec2024 record required"),taxOrAllowanceConnection:"none",notActualCompanyLedger:true};
}
export function householdEmployeeInsuranceYear2025({people}){
 const entries=people?.entries||[];check(Array.isArray(entries),"Explicit people array required");check(new Set(entries.map(p=>p.personId)).size===entries.length,"Duplicate person");
 const rows=entries.map(employeeInsuranceYear2025);return {aggregationBasis:"2025-insurance-months-plus-2025-paid-bonuses",people:rows,
 total:evidenced(people)&&entries.length>0?sum(rows.map(r=>r.total)):P("Household people not confirmed complete"),taxOrAllowanceConnection:"none"};
}
function nextMonth(m){const[y,n]=m.split("-").map(Number);return n===12?`${y+1}-01`:`${y}-${String(n+1).padStart(2,"0")}`;}
/** Calendar-year calculated withholding under explicit prior-month salary deduction dates. */
export function employeePayrollDeductions2025({insuranceInput,priorDecemberRecord,schedule}){
 const yearly=employeeInsuranceYear2025(insuranceInput);const personId=insuranceInput.personId;
 if(!evidenced(schedule)||!Array.isArray(schedule.entries))return {personId,aggregationBasis:"2025-explicit-deduction-dates",rows:[],total:P("Complete evidenced deduction schedule required"),taxOrAllowanceConnection:"none"};
 if(schedule.arrangement!=="previous-month-salary-and-same-bonus")return {personId,total:O("Only explicitly confirmed prior-month salary/same-bonus arrangement supported")};
 const rows=[],seen=new Set(),includedMonths=new Set(),includedBonuses=new Set();let missingDate=false;
 for(const e of schedule.entries){
  if(!evidenced(e)||!e.deductedOn){rows.push({result:P("Deduction date/record unconfirmed")});missingDate=true;continue;}
  date(e.deductedOn);check(["monthly","bonus"].includes(e.kind),"Unknown deduction kind");
  const key=e.kind==="monthly"?`month:${e.insuranceMonth}`:`bonus:${e.bonusId}`;check(!seen.has(key),"Duplicate deduction source");seen.add(key);
  if(e.kind==="monthly"){ym(e.insuranceMonth);check(e.deductedOn.slice(0,7)===nextMonth(e.insuranceMonth),"Deduction date conflicts with prior-month arrangement");}
  if(!e.deductedOn.startsWith("2025-")){rows.push({...e,result:O("Deduction outside2025; excluded from calendar total"),included:false});continue;}
  let r;
  if(e.kind==="monthly"){
   includedMonths.add(e.insuranceMonth);
   if(e.insuranceMonth==="2024-12")r=monthlyEmployeePremium2025({personId,profile:insuranceInput.profile,insuranceMonth:"2024-12",healthStandard:priorDecemberRecord?.healthStandard,pensionStandard:priorDecemberRecord?.pensionStandard});
   else r=yearly.monthly.find(r=>r.insuranceMonth===e.insuranceMonth)||{total:P("Insurance-month record missing")};
  }else{
   includedBonuses.add(e.bonusId);r=yearly.bonuses.find(b=>b.bonusId===e.bonusId)||{total:P("Bonus missing")};
   if(r.paidOn)check(r.paidOn===e.deductedOn,"Bonus must use its actual supplied bonus deduction date");
  }
  rows.push({...e,result:r.total,included:true});
 }
 const requiredMonths=["2024-12",...yearly.monthly.slice(0,11).map(r=>r.insuranceMonth)];
 const complete=!missingDate&&requiredMonths.every(m=>includedMonths.has(m))&&yearly.bonusRegisterComplete&&yearly.bonusStructureSupported&&yearly.bonuses.every(b=>includedBonuses.has(b.bonusId));
 return {personId,aggregationBasis:"2025-explicit-deduction-dates",rows,total:complete?sum(rows.filter(r=>r.included).map(r=>r.result)):P("Incomplete calendar-year source/deduction coverage"),
  nature:"Calculated from confirmed bases and supplied dates, not a substitute for company actuals",taxOrAllowanceConnection:"none",mustNotAddToWithholdingStatementActuals:true};
}
