#!/usr/bin/env node
/** 関数一覧と呼出箇所を、ソースの位置・引数・代表的な実行経路と照合する。 */
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {extractCallEdges} from './function-call-edges.mjs';
const require=createRequire(import.meta.url);
const {parse}=require('@babel/parser');
const traverse=require('@babel/traverse').default;
const data=JSON.parse(fs.readFileSync('src/data/calculation-function-catalog.json','utf8'));
assert.equal(data.schemaVersion,4);
assert.equal(new Set(data.functions.map(f=>f.id)).size,data.functions.length);
assert.equal(data.functionCount,data.functions.filter(f=>f.kind==='function').length);
assert.equal(data.classCount,data.functions.filter(f=>f.kind==='class').length);
assert.ok(data.functionCount>40);
const sources=new Map(), actualArguments=new Map();
for(const item of data.sources){
  assert.ok(/^src\/calc\/[^/]+\.js$|^scripts\/generate-(appendix-data|revision-scenarios|pattern-salary-envelopes)\.mjs$/.test(item.file));
  assert.ok(!item.file.endsWith('.test.js'));
  const text=fs.readFileSync(item.file,'utf8');
  assert.deepEqual(Object.keys(item).sort(),['file','sha256']);
  assert.equal(crypto.createHash('sha256').update(text).digest('hex'),item.sha256,item.file);
  sources.set(item.file,text.split('\n'));
  const ast=parse(text,{sourceType:'module',plugins:['jsx']});
  traverse(ast,{'CallExpression|OptionalCallExpression|NewExpression'(p){
    const n=p.node;
    actualArguments.set(`${item.file}:${n.loc.start.line}:${n.loc.start.column+1}`,n.arguments.map(a=>text.slice(a.start,a.end)));
  }});
}
for(const f of data.functions){
  assert.ok(f.description&&f.signature&&f.category,f.id);
  assert.ok(sources.has(f.file),f.file);
  assert.ok(sources.get(f.file)[f.line-1].includes(f.name),f.id+' source line');
  assert.ok(!('sourceUrl' in f) && !('localSource' in f),f.id);
  assert.ok(f.endLine>=f.line);
}
for(const name of ['buildHousehold','computeSeries','calculateSocialInsuranceComponents','computeOptimalModel','calcM01Detail','calcN04Detail','explainCliffCauses','compactBreakdown'])assert.ok(data.functions.some(f=>f.name===name),name);
assert.equal(data.revision,crypto.createHash('sha256').update(JSON.stringify(data.sources)).digest('hex'));
const ids=new Map(data.functions.map(f=>[f.id,f]));
const sites=new Set();
for(const e of data.calls){
  const from=ids.get(e.from);
  assert.ok(from && ids.has(e.to),e.from+' -> '+e.to);
  const site=from.file+':'+e.line+':'+e.column;
  assert.ok(from.line<=e.line && e.line<=from.endLine,site);
  const line=sources.get(from.file)[e.line-1];
  assert.ok(e.column>0 && e.column<=line.length && line[e.column-1].trim(),site);
  assert.ok(!('sourceUrl' in e),site);
  assert.ok(Array.isArray(e.arguments) && e.arguments.every(a=>typeof a==='string'),site);
  assert.deepEqual(e.arguments,actualArguments.get(site),'source arguments '+site);
  assert.ok(!sites.has(site),'duplicate '+site);
  sites.add(site);
}
function matching(from,to) {
  return data.calls.filter(e=>e.from===from && e.to===to);
}
assert.deepEqual(matching('src/calc/computePoint.js:computeSeries','src/calc/computePoint.js:computePoint').map(e=>e.arguments),[['ctx','x']]);
const revised = 'src/calc/revisionEngine.js:';
assert.deepEqual(matching(revised+'createRevisionCalculator.evaluate',revised+'revisionServiceBurden').map(e=>e.resultUse),['service に格納']);
assert.deepEqual(matching(revised+'createRevisionCalculator.evaluate',revised+'revisionCashBenefits').map(e=>e.resultUse),['benefits に格納']);
assert.ok(matching('src/calc/computePoint.js:computeSeries','src/calc/household.js:buildHousehold').length);
assert.ok(matching('scripts/generate-appendix-data.mjs:detectCliffs','src/calc/cliffCauseAnalysis.js:explainCliffCauses').length);
// Exercise lexical shadowing, immutable aliases, re-exports, and two calls on one line.
// In particular, passing a function as a value is *not* a direct call by the enclosing function.
const snippets={
  'a.js':'export function original(n) { return n; }',
  'b.js':"export {original as forwarded} from './a.js';",
  'c.js':`import {forwarded as actual} from './b.js'; import * as ns from './a.js';
    function caller(actualParam){ const alias=actual; alias(1); ns.original(2); actualParam(3); [1].map(actual); [2].map(x=>actual(x)); { const actual=x=>x; actual(4); } }`,
};
const modules=new Map(), byNode=new WeakMap();
for(const [file,code] of Object.entries(snippets)){
  const ast=parse(code,{sourceType:'module'});
  for(const item of ast.program.body){
    const n=item.type==='ExportNamedDeclaration'?item.declaration:item;
    if(n?.type==='FunctionDeclaration')byNode.set(n,file+':'+n.id.name);
  }
  modules.set(file,{ast,code});
}
assert.deepEqual(extractCallEdges(modules,byNode).map(e=>[e.from,e.to,e.arguments]),[
  ['c.js:caller','a.js:original',['1']],['c.js:caller','a.js:original',['2']],
]);
console.log(`✓ function catalog: ${data.functionCount} functions / ${data.classCount} classes, ${sites.size} direct call sites, lexical scoping, source lines and content hashes verified`);
