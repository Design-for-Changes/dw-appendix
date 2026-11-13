import assert from "node:assert/strict";
import fs from "node:fs";

const data = JSON.parse(fs.readFileSync(new URL("../public/data/research/income-assessment-rules.json", import.meta.url), "utf8"));
const keys = ["id", "program", "assessment_unit", "primary_target", "other_targets", "income_measure", "change_rule"];
const labels = ["ID", "制度・手当名", "判定単位", "主たる判定対象", "その他の判定対象", "所得指標", "変動方法"];
assert.deepEqual(data.columns.map((column) => column.key), keys);
assert.deepEqual(data.columns.map((column) => column.label), labels);
assert.equal(data.table_label, "表A1");
assert.equal(data.rows.length, 10);
assert.equal(data.scope.municipal_example, "船橋市");
assert.equal(new Set(data.rows.map((row) => `${row.id}:${row.program}`)).size, data.rows.length);
for (const row of data.rows) {
  assert.ok(Object.keys(row).every((key) => [...keys, "sources"].includes(key)), `${row.id}: unexpected public field`);
  for (const key of keys) assert.ok(typeof row[key] === "string" && row[key].length > 0, `${row.id}: ${key} missing`);
  assert.match(row.id, /^(?:N\d{2}(?:-\d)?|M0[1-3])$/);
  assert.ok(["個人所得", "世帯所得"].includes(row.assessment_unit));
  assert.ok(row.sources.length > 0, `${row.id}: source missing`);
  for (const source of row.sources) {
    const url = new URL(source.url);
    assert.equal(url.protocol, "https:");
    assert.match(url.hostname, /(?:^|\.)(?:go\.jp|city\.funabashi\.lg\.jp)$/);
    assert.ok(source.title);
  }
}
assert.ok(data.rows.find((row) => row.id === "M02").income_measure.includes("世帯分離"));
assert.ok(data.rows.find((row) => row.id === "M01").change_rule.includes("対象内"));
assert.ok(data.rows.some((row) => row.program.includes("育成医療")));
assert.ok(!/"(?:city_code|category_id|records|raw_survey_batches|evidence_summary|type_numbering)"\s*:/.test(JSON.stringify(data)));
console.log("✓ income assessment: 7 columns, 10 rules, official sources, no city-by-type survey findings");
