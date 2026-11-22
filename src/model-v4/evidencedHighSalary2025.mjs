import{salaryIncome2025}from'./funabashi2026.mjs';
import{statutoryIncomeFromSalary2025,auditDisabilityTaxClaims2026}from'./salaryAllowance2025.mjs';
import{assessAllowancePerson2026}from'./allowanceIncome2026.mjs';
import{assessHighSalaryAllowance2025}from'./highSalaryAllowance2025.mjs';
export const EVIDENCED_HIGH_SALARY2025_SOURCES=Object.freeze({decree:'https://www.mhlw.go.jp/web/t_doc?dataId=82091000&dataType=0',prefecturalTax:'https://laws.e-gov.go.jp/law/325AC0000000226/20260401_507AC0000000007',salary:'https://www.city.funabashi.lg.jp/kurashi/zei/007/003/p000868.html',spouseSpecial:'https://www.city.funabashi.lg.jp/kurashi/zei/007/003/p000869.html',tccaForm:'https://laws.e-gov.go.jp/data/MinisterialOrdinance/339M50000100038/618093_1/pict/2FH00000072009.pdf',childForm:'https://www.mhlw.go.jp/content/001708586.pdf',adjustment:'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1411.htm'});
const text=x=>typeof x==='string'&&x.trim().length>0,known=x=>x?.status==='known'&&text(x.evidence?.source)&&text(x.evidence?.note),yen=x=>Number.isSafeInteger(x)&&x>=0,P=reason=>({status:'pending',reason}),sameYears=x=>x?.referenceIncomeYear===2025&&x?.prefecturalTaxFiscalYear===2026;
/** Narrow data connection: an explicitly reviewed FY2026 prefectural salary-income base, not a taxable base or a national-tax amount. */
export function reconstructEvidencedHighSalary2025({program,targetMonth,role,personId,salaryFacts:f,prefecturalSalaryFact:b,taxDisabilityClaimsByPerson:ledgers={}}){
 if(Object.hasOwn(f||{},'statutoryIncome')||Object.hasOwn(f||{},'confirmedSalaryIncomeYen'))return P('Already assessed income or salary-income input must bypass gross reconstruction; no double deduction');
 if(!known(f)||f.personId!==personId||!sameYears(f)||!yen(f.annualGrossTaxableSalaryYen)||f.inputKind!=='gross-taxable-salary'||f.noPublicPensionIncome!==true||f.domesticResident!==true)return P('Same-person2025 gross taxable salary, FY2026 and explicitly no public pension required');
 const G=f.annualGrossTaxableSalaryYen;
 if(G<=8500000)return{status:'out-of-scope',reason:'Use the existing <=8500000 salary reconstruction'};
 if(G>15000000)return{status:'out-of-scope',reason:'This isolated evidenced high-salary connection is limited to15000000 yen; no household-domain generalization'};
 if(!known(b)||b.personId!==personId||!sameYears(b)||b.taxType!=='prefectural-resident-tax'||b.basis!=='salary-income-after-income-amount-adjustment-before-income-deductions'||b.grossTaxableSalaryYen!==G||!['confirmed-prefectural-record','explicit-research-scenario'].includes(b.originKind))return P('Reviewed same-person FY2026 prefectural salary-income base required; national income/tax, taxable base and unlabelled aggregates rejected');
 if(b.originKind==='explicit-research-scenario'&&b.scenarioAssumptionExplicit!==true)return P('Research inputs must be explicitly conditional, not fabricated tax records');
 const q=b.incomeAdjustmentReview,criteria=['selfSpecialDisability','hasUnder23Dependent','hasSpecialDisabledSameLivelihoodSpouseOrDependent'];
 if(!known(q)||q.personId!==personId||!sameYears(q)||q.kind!=='children-special-disability-income-adjustment'||q.reviewComplete!==true||!criteria.every(k=>typeof q.criteria?.[k]==='boolean')||q.qualifies!==criteria.some(k=>q.criteria[k])||b.adjustmentApplied!==q.qualifies||!yen(b.incomeAdjustmentYen))return P('Independent complete income-adjustment review and actual/scenario application required; tax-dependent owner alone is insufficient');
 const A=q.qualifies?Math.ceil((Math.min(G,10000000)-8500000)/10):0,base=salaryIncome2025({incomeYear:2025,salaryYen:G,adjustmentQualification:{status:'known',qualifies:q.qualifies,evidence:q.evidence.source+' '+q.evidence.note}});
 if(base.status!=='known'||b.incomeAdjustmentYen!==A||b.salaryIncomeBeforeAdjustmentYen!==base.salaryIncomeBeforeAdjustmentYen||b.salaryIncomeYen!==base.salaryIncomeYen)return P('Prefectural salary-income record/formula conflicts with the cap, ceiling or annual gross salary');
 if(Object.hasOwn(b,'extraAllowanceAdjustmentDeductionYen')&&b.extraAllowanceAdjustmentDeductionYen!==0)return P('Income adjustment is already in the confirmed salary base; no second subtraction');
 const spouse=f.spouseSpecialTaxDeduction;if(!known(spouse)||spouse.taxpayerId!==personId||!sameYears(spouse)||!['confirmed-none','applied'].includes(spouse.taxTreatment)||spouse.taxTreatment==='confirmed-none'&&spouse.amountYen!==0||spouse.taxTreatment==='applied'&&b.salaryIncomeYen>9000000)return P('Confirmed FY2026 spouse-special treatment required; applied deductions above9000000 own income are not connected');
 const audit=auditDisabilityTaxClaims2026(ledgers);if(audit.byPerson[personId]?.status!=='known')return P(audit.byPerson[personId]?.reason||'Complete exclusive FY2026 disability-tax ledger required');
 if(audit.byPerson[personId].entries.some(c=>c.classification==='special'&&(c.relationship==='self'?!q.criteria.selfSpecialDisability:!q.criteria.hasSpecialDisabledSameLivelihoodSpouseOrDependent)))return P('Reviewed adjustment criteria contradict confirmed special-disability tax claims');
 // Validate only the existing role-specific deductions at an internal anchor, never return that anchor as actual income.
 const probe=statutoryIncomeFromSalary2025({program,targetMonth,role,personId,disabilityTaxClaims:ledgers[personId],salaryFacts:{...f,annualGrossTaxableSalaryYen:8500000,inputKind:'confirmed-salary-income',confirmedSalaryIncomeYen:6550000}});
 if(probe.status!=='known')return probe;
 const W=b.salaryIncomeYen,after=Math.max(W-100000,0),signed=after-probe.insuranceDeductionYen-probe.disabilityDeductionYen-probe.spouseSpecialDeductionYen;
 if(!Number.isSafeInteger(signed))return P('Assessed income exceeds safe integer yen');
 const income={...probe.income,annualYen:signed,evidence:{source:EVIDENCED_HIGH_SALARY2025_SOURCES.tccaForm,note:'FY2026 prefectural salary-income base explicitly reviewed, then separate statutory100000/insurance/disability deductions. Not a recognition record.'}};
 return{...probe,status:'known',salaryIncomeYen:W,afterSalaryPensionAdjustmentYen:after,signedFormulaYen:signed,income,inputFacts:structuredClone(f),prefecturalSalaryFact:structuredClone(b),salaryIncomeBeforeAdjustmentYen:base.salaryIncomeBeforeAdjustmentYen,incomeAdjustmentAlreadyIncludedYen:A,additionalIncomeAdjustmentAtAllowanceStageYen:0,taxableBaseOrTaxDeductionTotalsNotImported:true,connectionKind:'evidenced-FY2026-prefectural-salary-income',interpretation:b.originKind==='explicit-research-scenario'?'Conditional research arithmetic; no actual tax filing, recognition or recipient selection':'Calculation from separately confirmed tax-income information; no entitlement determination',sources:{...probe.sources,...EVIDENCED_HIGH_SALARY2025_SOURCES},taxDisabilityAudit:audit};
}
/** Missing reviewed tax base retains the old interval result; a branch-invariant restriction is still not a point income. */
export function assessEvidencedHighSalary2025(input){
 if(input.subject&&Object.hasOwn(input.subject,'income'))return P('Already assessed statutory income bypasses reconstruction');
 const probe=assessAllowancePerson2026({program:input.program,targetMonth:input.targetMonth,role:input.role,subject:input.subject});if(probe.status==='out-of-scope')return probe;
 if(probe.assignment?.status!=='known'||probe.limit?.status!=='known')return P(probe.assignment?.reason||probe.limit?.reason||'Explicit role and additions required');
 const r=reconstructEvidencedHighSalary2025({...input,personId:probe.personId});
 if(r.status==='known'){const comparison=assessAllowancePerson2026({program:input.program,targetMonth:input.targetMonth,role:input.role,subject:{...input.subject,income:r.income}});return{...r,restriction:comparison.restriction,comparison,pointIncomeEstablished:true};}
 const bounded=assessHighSalaryAllowance2025(input);if(input.prefecturalSalaryFact===undefined&&bounded.resultKind==='confirmed-non-applicability-point-income'&&Number.isSafeInteger(bounded.incomeYen))return{...bounded,pointIncomeEstablished:true,connectionKind:'existing-confirmed-non-applicability',reviewedPrefecturalBaseProvided:false};return{status:bounded.status==='known'?'known':'pending',restriction:bounded.restriction,incomeYen:undefined,income:{status:'pending',reason:r.reason},pointIncomeEstablished:false,connectionPendingReason:r.reason,boundedResult:bounded,scope:'Existing interval-based restriction retained; no new assessed-income point or entitlement'};
}

/** Explicit opt-in router. The old <=8500000 function remains unchanged. */
export function reconstructSalaryWithHighEvidence2025(input){
 if(input.salaryFacts?.annualGrossTaxableSalaryYen>8500000)return reconstructEvidencedHighSalary2025(input);
 const audit=auditDisabilityTaxClaims2026(input.taxDisabilityClaimsByPerson||{});if(audit.byPerson[input.personId]?.status!=='known')return P(audit.byPerson[input.personId]?.reason||'Complete disability tax ledger required');
 return statutoryIncomeFromSalary2025({...input,disabilityTaxClaims:input.taxDisabilityClaimsByPerson[input.personId]});
}
