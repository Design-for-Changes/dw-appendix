import assert from "node:assert/strict";
import fs from "node:fs";
const data = JSON.parse(fs.readFileSync(new URL("../public/data/research/municipal-program-types.json", import.meta.url), "utf8"));
assert.equal(data.counts.program_types, 19);
assert.equal(data.counts.municipalities, 26);
assert.equal(data.program_types.length, 19);
let previous = 26;
for (const [index, row] of data.program_types.entries()) {
  assert.equal(row.id, `M${String(index + 1).padStart(2, "0")}`);
  assert.ok(Number.isInteger(row.confirmed_city_count));
  assert.ok(row.confirmed_city_count >= 0 && row.confirmed_city_count <= previous);
  assert.ok(row.program_type && row.effect);
  previous = row.confirmed_city_count;
}
assert.ok(data.method.count_definition.includes("未確認は未実施を意味しない"));
assert.ok(!/"(?:municipality_code|city_code|records|evidence_summary|raw_survey_batches|official_name)"\s*:/.test(JSON.stringify(data)));
console.log("✓ municipal aggregate: 19 types, sorted confirmation counts, no city-by-type matrix");
