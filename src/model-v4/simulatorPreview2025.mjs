import{evaluateSteadyCounterfactual2025}from'./conditionalSalary2025.mjs';
import{evaluateIllustrativeCaseOne2025}from'./illustrativeCaseOne2025.mjs';
import{evaluateIllustrativeComparison2025}from'./illustrativeComparisons2025.mjs';
const definitions=[['salary','給与合計','2025年・円/年'],['nationalTax','国税年調額','2025年・円/年'],['residentTax','住民税（市＋県）','2026年度・円/年度'],['forestNationalTax','森林環境税（国税）','2026年度・円/年度'],['personalInsurance','本人保険負担（健介厚＋雇用）','2025年暦年控除・円/年']];
const hasAmount=x=>Number.isSafeInteger(x?.amountYen),P=reason=>({status:'pending',reason});
const confirmedComponent={salary:'salary',nationalTax:'nationalYearEndTax',residentTax:'residentTax',forestNationalTax:'forestNationalTax',personalInsurance:'personalInsuranceBurden',tcca:'specialChildRearingAllowance',childWelfare:'disabledChildWelfareAllowance',day:'dayServiceCharge'};
/** Runtime browser adapter. No cached salary result, role selection, insurance-status inference, or financial formula. */
export function evaluateSimulatorPreview2025({caseNumber=1,axis='b',salaryYen='1200000',recognitionMode='confirmed-point'},presets){
 const frame={caseNumber,axis,recognitionMode,model:'two-salary-2025-preview',referenceMonth:'2026-08',notActualAnnualCashFlow:true,excluded:['医療自己負担・M01','N04の費用・補填','市独自手当','児童手当等の未採用費目','未選択の政策三候補']};
 if(![1,2,3].includes(caseNumber)||!['a','b'].includes(axis)||!['confirmed-point','if-a','if-b'].includes(recognitionMode))return{...frame,status:'invalid',reason:'ケース・給与軸・認定モードを選んでください。',components:[]};
 if(typeof salaryYen!=='string'||!/^\d+$/.test(salaryYen)||!Number.isSafeInteger(Number(salaryYen))||Number(salaryYen)>15000000)return{...frame,status:'invalid',reason:'給与は空欄にせず、0〜15,000,000円の整数を入力してください。入力範囲と計算の適用範囲は異なります。',components:[]};
 const g=Number(salaryYen),range={from:1170000,through:axis==='a'?9000000:8400000,step:30000},salaryByPerson={'parent-a':axis==='a'?g:3600000,'parent-b':axis==='b'?g:1200000},common={...frame,salaryByPerson,range};
 if(g<range.from||g>range.through||(g-range.from)%range.step!==0)return{...common,status:'out-of-scope',reason:'この検証版は表示された3万円刻みの断面だけに接続しています。0円・未整除点・範囲外を保険料0円や補間で埋めません。',components:[]};
 const input=presets?.cases?.[caseNumber],premises=presets?.premises;
 if(!input||!premises)return{...common,status:'pending',reason:'同一の架空条件データを読み込めません。',components:[]};
 const raw=evaluateSteadyCounterfactual2025({input,premises,caseNumber,salaryByPerson});
 if(raw.status!=='conditional-components')return{...common,status:'pending',reason:raw.reason||'必要な研究条件が未確認です。',components:[]};
 const domain=Object.values(raw.insuranceByPerson||{}).find(x=>x.healthPension?.status==='out-of-scope');
 if(domain)return{...common,status:'out-of-scope',reason:'週20時間の定常勤務・最低賃金・資格履歴の条件外です。無職や被扶養者へ自動変換しません。',components:[]};
 const anchor=salaryByPerson['parent-a']===3600000&&salaryByPerson['parent-b']===1200000,strict=recognitionMode==='confirmed-point';let reviewed;
 if(strict&&anchor){const e=caseNumber===1?evaluateIllustrativeCaseOne2025(input):evaluateIllustrativeComparison2025(input);reviewed=e.result||e;}
 const role=recognitionMode==='if-b'?'parent-b':'parent-a',branch=raw.conditionalBranches[role],t=raw.benefits.tccaByRecipient[role],cw=raw.benefits.childWelfareAggregate;
 const components=definitions.map(([id,label,period])=>({id,label,period,...raw.financial[id],status:hasAmount(raw.financial[id])?'calculated':'pending',basis:'固定した架空の就労・税申告条件から再計算'}));
 components.push({id:'day',label:'放デイ実負担',period:'2026年8月・円/月',...raw.dayService,status:hasAmount(raw.dayService)?'calculated':'pending',basis:caseNumber===3?'児別対象費50万円・現物世帯上限を一回':'対象費50万円・1割と上限の低い方'});
 for(const[id,label,v]of[['tcca','特別児童扶養手当',t],['childWelfare','国の障害児福祉手当',cw]])components.push({id,label,period:'2026年8月・円/月',...(strict&&!anchor?P('この給与点の認定・受給役割の記録は未確認。'):v),status:strict&&!anchor?'pending':hasAmount(v)?'conditional':'pending',basis:strict&&!anchor?'認定を基準点から持ち越さない':`${role==='parent-a'?'A':'B'}受給者の仮定。児福は児別の独立条件`});
 let status,indicatorYen,reason;
 if(strict&&reviewed?.status==='known'){status='confirmed-example';indicatorYen=reviewed.indicatorYen;for(const c of components){const v=reviewed.components.find(x=>x.id===confirmedComponent[c.id]);if(v?.status==='known'){c.amountYen=v.amountYen;c.status='confirmed-example';c.basis='独立記録を指定した確認済み架空一点';}}}
 else if(strict){status='pending';reason='この給与点の給付認定・主たる生計維持の根拠がないため、Y*は未算定です。税・保険・通所の研究条件下の内訳は表示します。';}
 else if(branch?.status==='conditional-calculated'){status='conditional';indicatorYen=branch.conditionalYen;reason='選んだ親が認定された場合の算術です。実際の認定・保険扶養・支払を確定しません。';}
 else{status='pending';reason='法6条の維持児加算・高所得接続などの条件が不足しています。未確認を0円にしません。';}
 return{...common,status,...(Number.isSafeInteger(indicatorYen)?{indicatorYen}:{}),reason,components,dayCap:raw.dayService.cap,dayAssessment:raw.dayService.householdAssessment,branchReason:branch?.reason,recipientAssumption:strict?'基準点A認定の記録のみ':role,actualRecognition:strict&&anchor?'確認済みの架空記録':'未確認',healthDependency:{status:strict&&anchor?'confirmed-example':'pending',reason:'子の保険扶養Aは独立条件。給与順位で変更しない。将来の共同扶養・勤務継続の認定は別審査。',candidate:raw.healthRuleCandidate?.status},perPersonInsurance:raw.calendarInsuranceInputs,fiscalMath:raw.fiscalMath,sourceEvidence:{tax:input.household.researchFacts.evidence,conditions:'2024年算定期から2025年末まで月給一定・両親45歳・週20h・協会けんぽ千葉・介護・厚年。健介厚は前年12月を含む翌月控除。雇用保険は一般事業・月末確定・当月控除。税扶養A、通所保護者Aは独立固定。'},rawIncome:raw.income};
}
