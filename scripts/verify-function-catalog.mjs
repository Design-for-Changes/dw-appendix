#!/usr/bin/env node
/** 関数一覧の件数、ソース内容ハッシュ、行リンクと説明の欠落を点検する。 */
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const data=JSON.parse(fs.readFileSync('src/data/calculation-function-catalog.json','utf8'));
assert.equal(data.schemaVersion,1);
assert.equal(new Set(data.functions.map(f=>f.id)).size,data.functions.length);
assert.equal(data.functionCount,data.functions.filter(f=>f.kind==='function').length);
assert.equal(data.classCount,data.functions.filter(f=>f.kind==='class').length);
assert.ok(data.functionCount>40);
const sources=new Map();
for(const item of data.sources){
  assert.ok(/^src\/calc\/[^/]+\.js$|^scripts\/generate-appendix-data\.mjs$/.test(item.file));
  const text=fs.readFileSync(item.file,'utf8');
  assert.equal(crypto.createHash('sha256').update(text).digest('hex'),item.sha256,item.file);
  sources.set(item.file,text.split('\n'));
}
for(const f of data.functions){
  assert.ok(f.description&&f.signature&&f.category,f.id);
  assert.ok(sources.has(f.file),f.file);
  assert.ok(sources.get(f.file)[f.line-1].includes(f.name),f.id+' source line');
  assert.equal(f.sourceUrl,`https://github.com/Design-for-Changes/dw-appendix/blob/main/${f.file}#L${f.line}`);
  assert.ok(f.endLine>=f.line);
}
for(const name of ['buildHousehold','computeSeries','calculateSocialInsuranceComponents','computeOptimalModel','calcM01Detail','calcN04Detail','explainCliffCauses','compactBreakdown'])assert.ok(data.functions.some(f=>f.name===name),name);
assert.equal(data.revision,crypto.createHash('sha256').update(JSON.stringify(data.sources)).digest('hex'));
console.log(`✓ function catalog: ${data.functionCount} functions / ${data.classCount} classes, source lines and content hashes verified`);
