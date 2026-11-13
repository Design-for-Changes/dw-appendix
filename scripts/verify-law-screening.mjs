import fs from 'node:fs';
import assert from 'node:assert/strict';
const d=JSON.parse(fs.readFileSync(new URL('../public/data/research/egov-law-screening.json',import.meta.url),'utf8'));
assert.equal(new Set(d.laws.map(l=>l.law_id)).size,d.laws.length);
assert.equal(d.counts.total_laws,d.laws.length);
const count=f=>d.laws.filter(f).length;
assert.equal(d.counts.current_laws,count(l=>l.current_status.is_current));
assert.ok(d.laws.every(l=>l.current_status.is_current));
assert.equal(d.counts.candidate_laws,count(l=>l.screening.status==='candidate'));
assert.equal(d.counts.excluded_laws,count(l=>l.screening.status==='excluded'));
assert.equal(d.counts.scope_review_laws,count(l=>l.screening.scope_review_required));
assert.equal(d.counts.candidate_laws+d.counts.excluded_laws,d.counts.total_laws);
const categories = new Set(d.method.exclusion_categories.map(item=>item.id));
assert.equal(categories.size,d.method.exclusion_categories.length);
for(const id of categories)assert.equal(d.counts.exclusions_by_category[id],count(l=>l.screening.exclusion_category_id===id));
for(const law of d.laws){
 assert.match(law.law_id,/^\d{3}AC\d{10}$/);
 assert.equal(new URL(law.source_url).hostname,'laws.e-gov.go.jp');
 assert.ok(['candidate','excluded'].includes(law.screening.status));
 assert.equal(law.screening.review_status,'verified');
 assert.ok(law.screening.reason.length>20);
 assert.ok(law.screening.evidence.length>0);
 if(law.screening.status==='excluded')assert.ok(categories.has(law.screening.exclusion_category_id),law.law_id);
 else assert.equal(law.screening.exclusion_category_id,null,law.law_id);
 for(const e of law.screening.evidence){assert.ok(e.article&&e.text&&e.source_url);assert.equal(new URL(e.source_url).hostname,'laws.e-gov.go.jp');}
}
assert.ok(d.method.candidate_note.includes('試算への採用を意味しない'));
for(const id of ['338AC0000000182','420AC0100000081']){
 const law=d.laws.find(l=>l.law_id===id);
 assert.equal(law.screening.status,'excluded');
 assert.equal(law.screening.exclusion_category_id,'C1');
}
for(const id of ['322AC0000000164','417AC0000000123'])assert.equal(d.laws.find(l=>l.law_id===id).screening.status,'candidate');
assert.ok(!/"(?:municipality_code|category_id|private|raw_survey_batches|evidence_summary)"\s*:/.test(JSON.stringify(d)));
console.log(`✓ law screening: ${d.counts.total_laws} records, ${d.counts.current_laws} current, ${d.counts.candidate_laws} candidates, law-specific reasons and primary sources`);
