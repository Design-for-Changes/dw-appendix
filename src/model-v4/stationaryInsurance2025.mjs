import{employeeInsuranceYear2025,employeePayrollDeductions2025}from'./employeeInsurance2025.mjs';
import{employmentInsuranceDeductionsYear2025}from'./employmentInsurance2025.mjs';
export const STATIONARY2025_SOURCES=Object.freeze({table:'https://www.kyoukaikenpo.or.jp/assets/12chiba_7.pdf',table2024:'https://www.kyoukaikenpo.or.jp/assets/r60212chiba.pdf',determination:'https://www.nenkin.go.jp/section/faq/kounen/hyoujunhoushu/20140602-02.html',eligibility:'https://www.hellowork.mhlw.go.jp/enterprise/laborlaw.html',minimum:'https://jsite.mhlw.go.jp/chiba-roudoukyoku/news_topics/_20250903_chingin_00002.html',minimumMethod:'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/roudoukijun/chingin/newpage_43899.html'});
const standards=[58000,68000,78000,88000,98000,104000,110000,118000,126000,134000,142000,150000,160000,170000,180000,190000,200000,220000,240000,260000,280000,300000,320000,340000,360000,380000,410000,440000,470000,500000,530000,560000,590000,620000,650000,680000,710000,750000,790000,830000,880000,930000,980000,1030000,1090000,1150000,1210000,1270000,1330000,1390000];
const lower=[0,63000,73000,83000,93000,101000,107000,114000,122000,130000,138000,146000,155000,165000,175000,185000,195000,210000,230000,250000,270000,290000,310000,330000,350000,370000,395000,425000,455000,485000,515000,545000,575000,605000,635000,665000,695000,730000,770000,810000,855000,905000,955000,1005000,1055000,1115000,1175000,1235000,1295000,1355000];
export const HEALTH_STANDARD_TABLE2025=Object.freeze(standards.map((standardYen,i)=>Object.freeze({grade:i+1,standardYen,fromYen:lower[i],untilYen:lower[i+1]??null})));
export const PENSION_STANDARD_TABLE2025=Object.freeze(HEALTH_STANDARD_TABLE2025.slice(3,35).map((r,i)=>Object.freeze({grade:i+1,standardYen:r.standardYen,fromYen:i===0?0:r.fromYen,untilYen:i===31?null:r.untilYen})));
const text=x=>typeof x==='string'&&x.trim().length>0;
const known=x=>x?.status==='known'&&text(x.evidence?.source)&&text(x.evidence?.note);
const yen=x=>Number.isSafeInteger(x)&&x>=0;
const P=reason=>({status:'pending',reason}),O=reason=>({status:'out-of-scope',reason}),K=(e,data)=>({status:'known',evidence:structuredClone(e),...data});
const months=Array.from({length:12},(_,i)=>`2025-${String(i+1).padStart(2,'0')}`);
function date(x){return typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&!Number.isNaN(Date.parse(x))&&new Date(x).toISOString().slice(0,10)===x;}
/** Raw remuneration lookup only; low table grades never determine coverage or minimum wage. */
export function stationaryStandardBases2025({remunerationMonth,monthlyRemunerationYen}){
 if(typeof remunerationMonth!=='string'||remunerationMonth<'2024-04'||remunerationMonth>'2025-12'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(remunerationMonth))return O('Only verified stationary2024/2025 remuneration months');
 if(!yen(monthlyRemunerationYen))return P('Exact nonnegative integer monthly remuneration required');
 const lookup=table=>table.find(r=>monthlyRemunerationYen>=r.fromYen&&(r.untilYen===null||monthlyRemunerationYen<r.untilYen));
 return {status:'known',remunerationMonth,monthlyRemunerationYen,health:lookup(HEALTH_STANDARD_TABLE2025),pension:lookup(PENSION_STANDARD_TABLE2025),source:STATIONARY2025_SOURCES.table,coverageOrMinimumWageDetermination:'not-performed'};
}
function validate(personId,salaryYen,s){
 if(!known(s)||s.personId!==personId||s.kind!=='stationary-basic-monthly-salary-history'||s.incomeYear!==2025||!text(s.scenarioId))return P('Evidenced separate stationary scenario and person/year required');
 if(!yen(salaryYen))return P('Annual salary must be exact integer yen');
 if(salaryYen%12)return O('Uniform monthly contract requires annual salary divisible by12; no irregular allocation or rounding');
 if(salaryYen<1185600)return O('Below fixed20h/1040h Chiba2025 minimum-wage scenario, not zero insurance');
 if(salaryYen>15000000)return O('Stationary research salary range capped at15000000; no extrapolation');
 const flags=['sameCoordinateBasicSalaryFrom202404Through202512','noBonuses','noCommutingAllowance','noOvertimeOrOtherAllowances','noNoncashPay','noExemptionsOrUnpaidLeave','noCoverageOrEmployerChange','noInterimOrInsurerDecision','nonStudent','indefiniteEmployment','ordinaryPayrollNoSpecialAgreement','noHigherIndustryMinimum','noMinimumWageSpecialPermission','coverageConfirmedThroughout'];
 if(flags.some(k=>s[k]!==true))return P('All stationary history, remuneration, eligibility and ordinary-payroll assumptions must be explicit');
 if(s.historyFromMonth!=='2024-04'||s.historyThroughMonth!=='2025-12'||!date(s.acquiredOn)||s.acquiredOn>='2024-01-01'||s.healthScheme!=='kyoukaikenpo-chiba'||s.pensionScheme!=='employees-pension')return P('Pre2024 acquisition, complete history and explicit Chiba/employee-pension schemes required');
 if(s.weeklyHours!==20||s.regularWorkerWeeklyHours!==40||s.annualScheduledHours!==1040||s.minimumWageRegion!=='Chiba'||s.employerPensionInsuredAtLeast101Throughout2024And2025!==true)return P('Only explicit fixed20h/40h comparison,1040h/year,101+ employer and Chiba minimum-wage scope supported');
 if(![2024,2025].every(y=>Array.isArray(s.aprilJuneBasisDays?.[y])&&s.aprilJuneBasisDays[y].length===3&&s.aprilJuneBasisDays[y].every(d=>Number.isInteger(d)&&d>=11&&d<=31)))return P('Confirmed April/May/June basis days >=11 in both2024/2025 required');
 if(!date(s.birthDate)||!['category2','not-category2'].includes(s.fixedCareCategory))return P('Birthdate and explicit fixed care category required');
 const [y,m,d]=s.birthDate.split('-').map(Number),careFrom=new Date(Date.UTC(y+40,m-1,d)-86400000).toISOString().slice(0,7),careUntil=new Date(Date.UTC(y+65,m-1,d)-86400000).toISOString().slice(0,7);
 const adultFrom=new Date(Date.UTC(y+20,m-1,d)-86400000).toISOString().slice(0,7);
 if(adultFrom>'2024-12'||careUntil<='2025-12')return O('First stationary scenario only ages20..64 throughout supported insurance months');
 if(['2024-12',...months].some(month=>(month>=careFrom&&month<careUntil)!==(s.fixedCareCategory==='category2')))return O('Care category changes during required months; fixed-category scenario not applicable');
 return {status:'known',monthlySalaryYen:salaryYen/12,minimumMonthlySalaryYen:98800,minimumAnnualSalaryYen:1185600,monthly88000RequirementMet:salaryYen/12>=88000,careFromMonth:careFrom,careUntilMonthExclusive:careUntil};
}
/** Each coordinate is a different steady household, never an in-year wage-change path. */
export function stationaryEmployeeInsurance2025({personId,annualSalaryYen,scenario,payrollPolicy}){
 const checked=validate(personId,annualSalaryYen,scenario);if(checked.status!=='known')return {personId,annualSalaryYen,...checked,insurancePremiumYen:undefined};
 const s=scenario,e=s.evidence,M=checked.monthlySalaryYen,bases=stationaryStandardBases2025({remunerationMonth:'2025-04',monthlyRemunerationYen:M});
 const standard=(month,scheme)=>K(e,{personId,insuranceMonth:month,scheme,basis:'confirmed-standard-monthly',amountYen:bases[scheme].standardYen,derivation:'Explicit stationary remuneration history and verified separate scheme table, not real annual-income inference'});
 const record=insuranceMonth=>({insuranceMonth,healthStandard:standard(insuranceMonth,'health'),pensionStandard:standard(insuranceMonth,'pension')});
 const insuranceInput={personId,profile:K(e,{personId,fromInsuranceMonth:'2024-12',throughInsuranceMonth:'2025-12',continuousSingleEmployerNoExemptions:true,rounding:'ordinary-payroll-no-special-agreement',healthScheme:s.healthScheme,pensionScheme:s.pensionScheme,fixedCareCategory:s.fixedCareCategory}),monthlyRecords:months.map(record),bonuses:K(e,{entries:[]})};
 const insuranceYear=employeeInsuranceYear2025(insuranceInput);let payrollYear={total:P('Separate complete prior-month deduction policy and2024-12 carry-in required')};
 const policy=payrollPolicy;
 if(known(policy)&&policy.personId===personId&&policy.scenarioId===s.scenarioId&&policy.incomeYear===2025&&policy.arrangement==='previous-month-salary-and-same-bonus'&&policy.priorDecemberSameStationaryRemunerationConfirmed===true&&policy.complete2025DeductionDatesConfirmed===true&&Array.isArray(policy.entries)&&policy.entries.length===12){
  const validDates=policy.entries.every((x,i)=>(x.personId===undefined||x.personId===personId)&&x.kind==='monthly'&&x.insuranceMonth===(i===0?'2024-12':months[i-1])&&date(x.deductedOn)&&x.deductedOn.slice(0,7)===months[i]);
  if(validDates){const schedule=K(policy.evidence,{arrangement:policy.arrangement,entries:policy.entries.map(x=>K(policy.evidence,x))});payrollYear=employeePayrollDeductions2025({insuranceInput,priorDecemberRecord:record('2024-12'),schedule});}
  else payrollYear={total:P('Complete ordered source months2024-12..2025-11 and actual next-month2025 deduction dates required')};
 }
 return {status:insuranceYear.total.status,personId,scenarioId:s.scenarioId,annualSalaryYen,monthlySalaryYen:M,standardBases:bases,qualificationAndMinimumChecks:checked,determinationHistory:[{determinationYear:2024,fromInsuranceMonth:'2024-12',throughInsuranceMonth:'2025-08',monthlyRemunerationYen:M,basisDays:s.aprilJuneBasisDays[2024]},{determinationYear:2025,fromInsuranceMonth:'2025-09',throughInsuranceMonth:'2025-12',monthlyRemunerationYen:M,basisDays:s.aprilJuneBasisDays[2025]}],insuranceYear,payrollYear,priorDecemberStandardRecord:record('2024-12'),inputScenario:structuredClone(s),payrollPolicy:structuredClone(policy),sources:STATIONARY2025_SOURCES,interpretation:'Separate synthetic stationary coordinate; insurance-month total is not calendar-year paid amount or company actuals',taxOrAllowanceConnection:'none unless explicit separate research adapter is invoked'};
}
/** Optional employment-insurance path: qualification, wages and dates are separate from health/pension. */
export function stationaryEmploymentInsurance2025({stationaryResult:r,policy}){
 if(r?.status!=='known')return P('Supported stationary salary remuneration required');
 if(!known(policy)||policy.personId!==r.personId||policy.scenarioId!==r.scenarioId||policy.incomeYear!==2025||policy.wageScopeFixedBasicSalaryOnly!==true||policy.completeRegisterConfirmed!==true||!Array.isArray(policy.entries)||policy.entries.length!==12)return P('Separate evidenced employment qualification, basic-wage scope and complete dates required');
 if(policy.eligibility?.personId!==r.personId||policy.eligibility?.value!=='insured-general-business')return P('First stationary employment path requires independently confirmed general-business insured qualification');
 const valid=policy.entries.every((x,i)=>(x.personId===undefined||x.personId===r.personId)&&x.determinedOn===new Date(Date.UTC(2025,i+1,0)).toISOString().slice(0,10)&&date(x.deductedOn)&&x.deductedOn===x.determinedOn&&x.paidOn===x.determinedOn);
 if(!valid)return P('First stationary employment path requires explicit month-end determination/same-month payment and deduction dates; health prior-month dates cannot substitute');
 return employmentInsuranceDeductionsYear2025({payments:K(policy.evidence,{entries:policy.entries.map((x,i)=>({eligibility:policy.eligibility,payment:K(policy.evidence,{...x,personId:r.personId,paymentId:r.personId+'-2025-'+(i+1),kind:'regular-wage',subjectWage:K(policy.evidence,{basis:'confirmed-employment-insurance-subject-wage',amountYen:r.monthlySalaryYen})})}))})});
}
