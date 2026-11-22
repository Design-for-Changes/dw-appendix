import{salaryIncomeBeforeAdjustment2025}from'./salaryIncome2025.mjs';
import{nationalSalaryIncome2025}from'./nationalTax2025.mjs';
import{statutoryIncomeFromSalary2025,auditDisabilityTaxClaims2026}from'./salaryAllowance2025.mjs';
import{assessAllowancePerson2026}from'./allowanceIncome2026.mjs';
const text=x=>typeof x==='string'&&x.trim().length>0;
const known=x=>x?.status==='known'&&text(x.evidence?.source)&&text(x.evidence?.note);
const yen=x=>Number.isSafeInteger(x)&&x>=0;
const pending=reason=>({status:'pending',reason});
export const HIGH_SALARY2025_SOURCES=Object.freeze({salary:'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1410.htm',taxAdjustment:'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1411.htm',allowance:'https://www.mhlw.go.jp/web/t_doc?dataId=82091000&dataType=0'});
/** Inclusive/exclusive statutory operators on an unresolved bounded income connection. */
export function classifyAllowanceIncomeInterval({lowerYen,upperYen,limitYen,comparisonOperator}){
 if(![lowerYen,upperYen,limitYen].every(Number.isSafeInteger)||lowerYen>upperYen||!['>=','>'].includes(comparisonOperator))return pending('Ordered integer income endpoints, limit and statutory operator required');
 const restricted=comparisonOperator==='>='?lowerYen>=limitYen:lowerYen>limitYen,pass=comparisonOperator==='>='?upperYen<limitYen:upperYen<=limitYen;
 return restricted?{status:'known',restriction:'restricted'}:pass?{status:'known',restriction:'not-restricted'}:pending('Unresolved adjustment branches cross the statutory limit');
}
/** Individual role only, not household entitlement or a full high-income model. */
export function assessHighSalaryAllowance2025({program,targetMonth,role,subject,salaryFacts,taxAdjustmentFact,taxDisabilityClaimsByPerson}){
 const context={program,targetMonth,role,referenceIncomeYear:2025,prefecturalTaxFiscalYear:2026,sources:HIGH_SALARY2025_SOURCES,scope:'Individual income restriction only; no entitlement, household total, Y* or automatic insurance connection'};
 if(subject&&Object.hasOwn(subject,'income'))return {...context,...pending('Already assessed statutory income must bypass reconstruction; no double deduction')};
 const probe=assessAllowancePerson2026({program,targetMonth,role,subject});if(probe.status==='out-of-scope')return probe;
 if(probe.assignment.status!=='known'||probe.limit?.status!=='known')return {...context,...pending(probe.assignment.reason||probe.limit?.reason||'Confirmed role and additions required')};
 const personId=probe.personId,f=salaryFacts,q=taxAdjustmentFact;
 if(!known(f)||f.personId!==personId||f.referenceIncomeYear!==2025||f.prefecturalTaxFiscalYear!==2026||!yen(f.annualGrossTaxableSalaryYen))return {...context,personId,...pending('Same-person exact taxable2025 salary and FY2026 facts required')};
 const G=f.annualGrossTaxableSalaryYen;
 if(G<=8500000)return {...context,status:'out-of-scope',reason:'Use existing <=8500000 salary connection'};
 if(f.inputKind!=='gross-taxable-salary'||f.noPublicPensionIncome!==true)return {...context,personId,...pending('Gross taxable salary only and explicit no public-pension income required')};
 const criteria=['selfSpecialDisability','hasUnder23Dependent','hasSpecialDisabledSameLivelihoodSpouseOrDependent'];
 if(!known(q)||q.personId!==personId||q.incomeYear!==2025||q.salaryYen!==G||q.taxType!=='income-tax'||q.kind!=='children-special-disability-income-adjustment'||q.qualificationReviewComplete!==true||!criteria.every(k=>typeof q.criteria?.[k]==='boolean')||q.qualifies!==criteria.some(k=>q.criteria[k])||!yen(q.amountYen))return {...context,personId,...pending('Complete evidenced tax-adjustment eligibility criteria and salary-bound amount required; ordinary dependent allocation is insufficient')};
 const expectedA=q.qualifies?Math.ceil((Math.min(G,10000000)-8500000)/10):0;
 if(q.amountYen!==expectedA)return {...context,personId,...pending('Confirmed tax adjustment amount conflicts with statutory cap/rounding')};
 const tax=nationalSalaryIncome2025({incomeYear:2025,personId,salaryFacts:{...f,incomeYear:2025,salaryYen:G,incomeAdjustmentQualification:q}});
 if(tax.status!=='known')return {...context,personId,...pending(tax.reason)};
 const spouse=f.spouseSpecialTaxDeduction;
 if(!known(spouse)||spouse.taxpayerId!==personId||spouse.referenceIncomeYear!==2025||spouse.prefecturalTaxFiscalYear!==2026||spouse.taxTreatment!=='confirmed-none'||spouse.amountYen!==0)return {...context,personId,...pending('High-salary connection currently requires explicitly no prefectural spouse-special deduction; higher-income table columns not connected')};
 const audit=auditDisabilityTaxClaims2026(taxDisabilityClaimsByPerson||{}),ledger=taxDisabilityClaimsByPerson?.[personId];
 if(audit.byPerson[personId]?.status!=='known')return {...context,personId,...pending(audit.byPerson[personId]?.reason||'Complete nonconflicting ordinary-disability tax ledger required')};
 // Validate existing role-dependent deduction rules at a computational anchor W=6550000.
 // This anchor is never returned as this person's actual salary or assessed income.
 const deductionProbe=statutoryIncomeFromSalary2025({program,targetMonth,role,personId,disabilityTaxClaims:ledger,salaryFacts:{...f,annualGrossTaxableSalaryYen:8500000,inputKind:'confirmed-salary-income',confirmedSalaryIncomeYen:6550000}});
 if(deductionProbe.status!=='known')return {...context,personId,...pending(deductionProbe.reason)};
 const W=salaryIncomeBeforeAdjustment2025(G),H=W-100000-deductionProbe.insuranceDeductionYen-deductionProbe.disabilityDeductionYen-deductionProbe.spouseSpecialDeductionYen,L=H-q.amountYen;
 if(!Number.isSafeInteger(H)||!Number.isSafeInteger(L))return {...context,...pending('Income formula exceeds supported integer range')};
 const common={...context,personId,salaryYen:G,salaryIncomeBeforeTaxAdjustmentYen:W,taxSide:{...tax,qualification:structuredClone(q)},deductions:{salaryPension100000Yen:100000,insuranceYen:deductionProbe.insuranceDeductionYen,insuranceKind:deductionProbe.insuranceDeductionKind,disabilityYen:deductionProbe.disabilityDeductionYen,ordinaryDisabilityYen:deductionProbe.eligibleTaxClaims.filter(c=>c.classification==='ordinary').length*270000,specialDisabilityYen:deductionProbe.eligibleTaxClaims.filter(c=>c.classification==='special').length*400000,spouseSpecialYen:0,eligibleTaxClaims:deductionProbe.eligibleTaxClaims,ignoredSelfTaxClaims:deductionProbe.ignoredSelfTaxClaims},limitYen:probe.limit.limitYen,comparisonOperator:probe.comparisonOperator,assignment:probe.assignment,additions:probe.limit.additions,inputSalaryFacts:structuredClone(f),taxDisabilityAudit:audit};
 const income=value=>({...deductionProbe.income,annualYen:value,evidence:{source:HIGH_SALARY2025_SOURCES.allowance,note:'High2025 salary-only reconstruction with explicit tax-adjustment qualification and separately validated statutory deductions'}});
 if(!q.qualifies){const row=assessAllowancePerson2026({program,targetMonth,role,subject:{...subject,income:income(H)}});return {...common,status:row.status,restriction:row.restriction,resultKind:'confirmed-non-applicability-point-income',income:income(H),incomeYen:H,comparison:row};}
 const classification=classifyAllowanceIncomeInterval({lowerYen:L,upperYen:H,limitYen:probe.limit.limitYen,comparisonOperator:probe.comparisonOperator});
 return {...common,...classification,resultKind:classification.status==='known'?'connection-independent-income-restriction':'unresolved-income-connection',income:{status:'pending',reason:'Tax-side adjustment to allowance income remains unresolved; no point estimate'},incomeInterval:{lowerYen:L,upperYen:H},
 branches:[{connection:'tax-adjustment-not-subtracted',incomeYen:H,comparison:assessAllowancePerson2026({program,targetMonth,role,subject:{...subject,income:income(H)}})},{connection:'tax-adjustment-subtracted',incomeYen:L,comparison:assessAllowancePerson2026({program,targetMonth,role,subject:{...subject,income:income(L)}})}],
 adjustmentConnection:'unresolved; branch-invariant restriction is not a confirmed assessed-income amount'};
}
