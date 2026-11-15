import fs from 'node:fs';
import assert from 'node:assert/strict';
import {validateN04EducationProfile} from '../src/calc/educationAid.js';

const data=JSON.parse(fs.readFileSync(new URL('../public/data/research/revision-scenarios.json',import.meta.url),'utf8'));
assert.equal(data.schema_version,'1.0.0');
assert.equal(data.family_profiles.length,31);
assert.equal(data.conditions.length,279);
assert.equal(new Set(data.conditions.map(c=>c.id)).size,279);
assert.deepEqual([1,2,3].map(n=>data.family_profiles.filter(f=>f.total_children===n).length),[3,9,19]);
assert.equal(data.scope.empirical_typicality,false);
assert.equal(data.scope.population_distribution_estimated,false);
assert.equal(data.scope.optimal_policy_claimed,false);
for(const c of data.conditions){
 const family=data.family_profiles.find(f=>f.id===c.family_profile_id);
 assert(family);
 const h=c.household;
 assert.equal(h.children.length,family.total_children);
 assert.equal(h.children.filter(child=>child.disabled).length,family.disabled_children);
 assert(h.children.every(child=>child.age===7));
 assert.equal(h.programs.m01,false);
 assert.equal(h.programs.n04,true);
 assert.deepEqual(h.programs.serviceUse.monthlyBurdenBeforeCapByChildYen,h.children.map(child=>child.disabled?c.service_use_yen_per_child_month:0));
 const issues=validateN04EducationProfile(h.programs.n04EducationProfile);
 assert.deepEqual(c.blocking_issues,issues);
 if(issues.length){assert.equal(c.calculation_status,'blocked');assert.equal(c.result,null);}
 else assert.notEqual(c.calculation_status,'blocked');
}
console.log(`✓ revision conditions: 31 profiles / 279 conditions; missing N04 inputs block results, no population weights`);
