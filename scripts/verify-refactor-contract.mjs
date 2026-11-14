#!/usr/bin/env node
/**
 * 数値を変更しない整理のための回帰契約。
 * 過去の計算と同じ結果かを検査するもので、法令上の正しさの検証とは別である。
 * 意図的に制度式・採用値を改定するときは、独立検証後に --record で基準を更新する。
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {computeSeries} from '../src/calc/computePoint.js';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const TARGET=path.join(ROOT,'fixtures/refactor-contract.json');
const read=p=>JSON.parse(fs.readFileSync(path.join(ROOT,p),'utf8'));
const tables={
  emp:read('public/data/emp_deduction.json'),
  basicIT:read('public/data/basic_it.json'),basicLT:read('public/data/basic_lt.json'),
  socialU40:read('public/data/social_u40.json'),socialO40:read('public/data/social_o40.json'),
  configs:Object.fromEntries([
    ['spouseDeductionITCfg','spouse_deduction_it'],['spouseDeductionLTCfg','spouse_deduction_lt'],
    ['spouseSpecialDeductionITCfg','spouse_special_deduction_it'],['spouseSpecialDeductionLTCfg','spouse_special_deduction_lt'],
    ['dependentDeductionCfg','dependent_deduction'],['specialKinDeductionITCfg','special_kin_deduction_it'],
    ['specialKinDeductionLTCfg','special_kin_deduction_lt'],['widowDeductionCfg','widow_deduction'],
    ['singleParentDeductionCfg','single_parent_deduction'],['workingStudentDeductionCfg','working_student_deduction'],
    ['disabilityDeductionCfg','disability_deduction'],
  ].map(([key,file])=>[key,read(`src/config/${file}.json`)])),
};

function canonical(value){
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.keys(value).sort().filter(k=>value[k]!==undefined).map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
  return JSON.stringify(value);
}
function digestSeries(series){
  const hash=crypto.createHash('sha256');
  for(const point of series)hash.update(canonical(point)).update('\n');
  return hash.digest('hex');
}
function listFiles(dir,prefix=''){
  return fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name)).flatMap(e=>
    e.isDirectory()?listFiles(path.join(dir,e.name),prefix+e.name+'/'):[prefix+e.name]);
}
function generatedHashes(){
  const dir=path.join(ROOT,'public/generated/appendix');
  return Object.fromEntries(listFiles(dir).filter(p=>p.endsWith('.json.gz')).map(p=>{
    const json=JSON.parse(gunzipSync(fs.readFileSync(path.join(dir,p))));
    return [p,crypto.createHash('sha256').update(canonical(json)).digest('hex')];
  }));
}

const recording=process.argv.includes('--record');
const existing=recording?null:read('fixtures/refactor-contract.json');
const confirmed=read('fixtures/cases.json').cases.filter(c=>c.status==='baseline_confirmed');
const base=confirmed.find(c=>c.id==='P1');
const extras=[
  ...['S1_R6','S2_R7'].map(scenario=>({id:`P1-${scenario}`,household:base.household,scenario})),
  ...[200,400,800].map(salaryWan=>({id:`P1-spouse-${salaryWan}`,household:{...base.household,spouse:{...base.household.spouse,salaryWan}},scenario:base.scenario})),
];
const inputs=recording?[...confirmed,...extras].map(({id,household,scenario})=>({id,household,scenario,sweep:{min:200,max:1500,step:1}})):existing.cases;
const cases=inputs.map(input=>{
  const series=computeSeries({...input,tables});
  return {...input,points:series.length,sha256:digestSeries(series)};
});
const generated=generatedHashes();
if(recording){
  const contract={
    schemaVersion:1,
    purpose:'数値を変更しないリファクタリングの回帰契約。法令・制度の正しさを保証するものではない。',
    sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim(),
    cases,generated,
  };
  fs.writeFileSync(TARGET,JSON.stringify(contract,null,2)+'\n');
  console.log(`Recorded ${cases.length} cases / ${cases.reduce((n,c)=>n+c.points,0)} points and ${Object.keys(generated).length} generated files`);
}else{
  assert.deepEqual(cases,existing.cases,'Calculation outputs changed; separate specification changes from refactoring');
  assert.deepEqual(generated,existing.generated,'Published generated outputs changed');
  console.log(`✓ refactor contract: ${cases.length} cases / ${cases.reduce((n,c)=>n+c.points,0)} points, ${Object.keys(generated).length} generated files unchanged`);
}
