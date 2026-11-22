#!/usr/bin/env node
/** 計算ソースから、説明・引数・戻り値・直接呼出を記録した公開用の関数資料を生成する。 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {extractCallEdges} from './function-call-edges.mjs';
const require=createRequire(import.meta.url);
const {parse}=require('@babel/parser');
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const files=[...fs.readdirSync(path.join(ROOT,'src/calc')).filter(f=>f.endsWith('.js')&&!f.endsWith('.test.js')).map(f=>'src/calc/'+f),
  'scripts/generate-appendix-data.mjs','scripts/generate-revision-scenarios.mjs','scripts/generate-pattern-salary-envelopes.mjs'].sort();
const apiNames=new Set(['createRevisionCalculator','calculateHouseholdInsurance2029','calculatePaperSalaryTaxInputs2029','calculateSpecialChildAllowance','calculateDisabledChildWelfareAllowance','scanPaperChangePoints','calculateHouseholdCoverage','estimateFunabashiNational','annualEmployeePremiums','buildHousehold','computeSeries','calculateSocialInsuranceComponents','computeOptimalModel','computeIllustrativeAdjustment','generateRevisionScenarios']);
function category(file){
  if(/allPatternsComparison|generate-pattern-salary-envelopes/.test(file))return '全パターンの可処分所得差';
  if(/policyOnlyBoundaries|policyAdditionalBands/.test(file))return '制度ごとの所得区分の境界';
  if(/paperSalaryBands/.test(file))return '二給与格子と配偶者所得区分';
  if(/disabilityIncomeDifference/.test(file))return '障害の有無による可処分所得差';
  if(/salaryDecisionMap/.test(file))return '二給与平面での制度変更点';
  if(/salaryIncomeSection/.test(file))return '給与断面での下落・後退・回復';
  if(/paperChangePoints/.test(file))return '考察専用・制度上の変化点（収支に算入しない）';
  if(/householdInsurance2029/.test(file))return '主試算・夫婦別の社会保険料';
  if(/paperSalaryTaxInputs2029/.test(file))return '主試算・給与所得と所得控除';
  if(/specialChildAllowance|disabledChildWelfareAllowance/.test(file))return '主試算・障害児の手当と対象者別の所得制限';
  if(/serviceBurdenLimits/.test(file))return 'サービス利用料と負担上限';
  if(/generate-(appendix|revision)/.test(file))return '表示データ生成';
  if(/revisionCoverage/.test(file))return '改定版・夫婦の保険加入';
  if(/revisionPayroll/.test(file))return '改定版・勤務先の社会保険料';
  if(/funabashiNational/.test(file))return '改定版・船橋市国保と国民年金';
  if(/revisionEngine/.test(file))return '改定版・二給与軸の制度計算';
  if(/paperComparison/.test(file))return '論文ケースの比較';
  if(/optimalModel|illustrativeAdjustment/.test(file))return '探索的調整モデル';
  if(file.includes('cliffCause'))return '低下・回復の抽出';
  if(/numeric|tableUtils/.test(file))return '数値・表の補助処理';
  if(/household/.test(file))return '世帯・入力条件';
  if(/socialInsurance/.test(file))return '社会保険料';
  if(/educationAid/.test(file))return '就学奨励費';
  if(/medicalAid/.test(file))return '医療費助成';
  if(/allowance/.test(file))return '現金給付';
  if(/tax|deduction/i.test(file))return '税・所得控除';
  return '統合計算';
}
function documentation(comments=[]){
  const comment=[...comments].reverse().find(c=>c.type==='CommentBlock'&&c.value.startsWith('*'));
  if(!comment)return {description:'',params:[],returns:''};
  const lines=comment.value.replace(/^\*/,'').split('\n').map(s=>s.replace(/^\s*\*\s?/,'').trim());
  const summary=[];const params=[];let returns='';
  for(const line of lines){
    if(line.startsWith('@param '))params.push(line.slice(7));
    else if(/^@returns?\s/.test(line))returns=line.replace(/^@returns?\s+/,'');
    else if(!line.startsWith('@')&&!params.length&&!returns)summary.push(line);
  }
  return {description:summary.join(' ').trim(),params,returns};
}
const functions=[];const sources=[];
const modules=new Map(), symbolByNode=new WeakMap();
for(const file of files){
  const code=fs.readFileSync(path.join(ROOT,file),'utf8');
  sources.push({file,sha256:crypto.createHash('sha256').update(code).digest('hex')});
  const ast=parse(code,{sourceType:'module',plugins:['jsx']});
  modules.set(file,{ast,code});
  const exported=new Set();
  for(const node of ast.program.body){
    if(node.type==='ExportNamedDeclaration'&&node.declaration?.id)exported.add(node.declaration.id.name);
    if(node.type==='ExportNamedDeclaration'&&node.declaration?.declarations)for(const d of node.declaration.declarations)if(d.id.type==='Identifier')exported.add(d.id.name);
  }
  function walk(node,ancestors=[],scope=[]){
    if(!node||typeof node!=='object')return;
    let declaration=null;let name=null;let kind='function';
    if(node.type==='FunctionDeclaration'&&node.id){declaration=node;name=node.id.name;}
    if(node.type==='ClassDeclaration'&&node.id){declaration=node;name=node.id.name;kind='class';}
    if(node.type==='VariableDeclarator'&&node.id?.type==='Identifier'&&['ArrowFunctionExpression','FunctionExpression'].includes(node.init?.type)){declaration=node.init;name=node.id.name;}
    let childScope=scope;
    if(name){
      const parent=ancestors.at(-1),grandparent=ancestors.at(-2);
      const carriers=[node];
      if(['ExportNamedDeclaration','ExportDefaultDeclaration','VariableDeclaration'].includes(parent?.type))carriers.push(parent);
      if(node.type==='VariableDeclarator'&&grandparent?.type==='ExportNamedDeclaration')carriers.push(grandparent);
      const doc=carriers.map(n=>documentation(n.leadingComments)).find(d=>d.description)||documentation();
      const isExport=scope.length===0&&exported.has(name);
      const id=`${file}:${[...scope,name].join('.')}`;
      symbolByNode.set(node,id);
      symbolByNode.set(declaration,id);
      functions.push({
        id,
        name,qualifiedName:[...scope,name].join('.'),kind,file,
        category:category(file),line:node.loc.start.line,endLine:declaration.loc.end.line,
        role:apiNames.has(name)&&scope.length===0?'計算エントリ':isExport?'内部モジュール間':'内部関数',
        signature:`${name}(${(declaration.params||[]).map(p=>code.slice(p.start,p.end).replace(/\s+/g,' ')).join(', ')})`,
        ...doc,
      });
      childScope=[...scope,name];
    }
    for(const [key,value]of Object.entries(node)){
      if(['loc','start','end','leadingComments','trailingComments','innerComments','tokens','comments'].includes(key))continue;
      if(Array.isArray(value)){
        for(const child of value)if(child?.type)walk(child,[...ancestors,node],childScope);
      }else if(value?.type){
        walk(value,[...ancestors,node],childScope);
      }
    }
  }
  walk(ast.program);
}
const missing=functions.filter(f=>!f.description);
if(missing.length){console.error('関数のJSDoc概要が未記載:\n'+missing.map(f=>`${f.file}:${f.line} ${f.qualifiedName}`).join('\n'));process.exit(1);}
const revision=crypto.createHash('sha256').update(JSON.stringify(sources)).digest('hex');
const catalog={
  schemaVersion:4,revision,
  scope:'src/calcと表示データ・条件・全パターン比較の生成スクリプトにある名前付き関数・クラス。匿名コールバック、画面部品、テスト・検証専用スクリプトは対象外。',
  callScope:'対象ソースの名前付き関数が直接呼ぶ関数を、実装上の呼出箇所ごとに掲載。匿名コールバック内、ファイル直下、外部ライブラリ、動的に決まる呼出先は含めない。掲載順は実行履歴ではない。',
  unitNote:'金額変数のWanは万円、Yenは円。年額・月額は関数の注記と引数・返り値を参照。',
  functionCount:functions.filter(f=>f.kind==='function').length,
  classCount:functions.filter(f=>f.kind==='class').length,
  sources,functions,calls:extractCallEdges(modules,symbolByNode),
};
const output=path.join(ROOT,'src/data/calculation-function-catalog.json');
fs.mkdirSync(path.dirname(output),{recursive:true});
fs.writeFileSync(output,JSON.stringify(catalog,null,2)+'\n');
console.log(`✓ function catalog: ${catalog.functionCount} functions, ${catalog.classCount} classes, ${catalog.calls.length} call sites, ${sources.length} source files`);
