import fs from 'node:fs';
import assert from 'node:assert/strict';
const d=JSON.parse(fs.readFileSync(new URL('../public/data/research/egov-law-screening.json',import.meta.url),'utf8'));
assert.equal(new Set(d.laws.map(l=>l.law_id)).size,d.laws.length);
assert.equal(d.counts.total_laws,d.laws.length);
const count=f=>d.laws.filter(f).length;
assert.equal(d.counts.current_laws,count(l=>l.current_status.is_current));
assert.equal(d.counts.noncurrent_laws,count(l=>!l.current_status.is_current));
assert.equal(d.counts.candidate_laws,count(l=>l.screening.status==='candidate'));
assert.equal(d.counts.excluded_laws,count(l=>l.screening.status==='excluded'));
assert.equal(d.counts.scope_review_laws,count(l=>l.screening.scope_review_required));
assert.equal(d.counts.candidate_laws+d.counts.excluded_laws,d.counts.total_laws);
for(const law of d.laws){
 assert.match(law.law_id,/^\d{3}AC\d{10}$/);
 assert.equal(new URL(law.source_url).hostname,'laws.e-gov.go.jp');
 assert.ok(['candidate','excluded'].includes(law.screening.status));
 assert.equal(law.screening.review_status,'verified');
 assert.ok(law.screening.reason.length>20);
 assert.ok(law.screening.evidence.length>0);
 if(!law.current_status.is_current)assert.equal(law.screening.status,'excluded');
 for(const e of law.screening.evidence){assert.ok(e.article&&e.text&&e.source_url);assert.equal(new URL(e.source_url).hostname,'laws.e-gov.go.jp');}
}
assert.ok(d.method.candidate_note.includes('試算への採用を意味しない'));
assert.ok(!/"(?:municipality_code|category_id|private|raw_survey_batches|evidence_summary)"\s*:/.test(JSON.stringify(d)));
console.log(`✓ law screening: ${d.counts.total_laws} records, ${d.counts.current_laws} current, ${d.counts.candidate_laws} candidates, law-specific reasons and primary sources`);
