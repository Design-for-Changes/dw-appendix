import assert from "node:assert/strict";
import fs from "node:fs";

const data = JSON.parse(fs.readFileSync(new URL("../public/data/research/income-assessment-rules.json", import.meta.url), "utf8"));
const keys = ["id", "program", "income_condition", "assessment_unit", "primary_target", "other_targets", "income_measure", "change_rule"];
const labels = ["ID", "制度・手当名", "所得による区分・制限の有無", "判定単位", "主たる判定対象", "その他の判定対象", "所得指標", "変動方法"];
const extraKeys = ["rule_id", "scope_group", "income_status", "presence_status", "child_application", "coordination", "verification_note", "checked_on", "sources"];
assert.equal(data.schema_version, "2.0.0");
assert.deepEqual(data.columns.map(column => column.key), keys);
assert.deepEqual(data.columns.map(column => column.label), labels);
assert.equal(data.table_label, "表A1");
assert.equal(data.scope.municipal_example, "船橋市");
assert.deepEqual(data.scope.national_law_ids, Array.from({ length: 9 }, (_, i) => `N${String(i + 1).padStart(2, "0")}`));
assert.deepEqual(data.scope.municipal_categories.map(type => type.id), Array.from({ length: 19 }, (_, i) => `M${String(i + 1).padStart(2, "0")}`));
assert.ok(data.scope.coverage_note.includes("9法律は9制度を意味しない"));
assert.ok(data.scope.coverage_note.includes("国の小児慢性特定疾病医療"));
assert.equal(new Set(data.rows.map(row => row.rule_id)).size, data.rows.length);
for (const row of data.rows) {
  assert.ok(Object.keys(row).every(key => [...keys, ...extraKeys].includes(key)), `${row.rule_id}: unexpected public field`);
  for (const key of [...keys, "rule_id", "child_application", "coordination", "verification_note", "checked_on"]) assert.ok(typeof row[key] === "string" && row[key].length > 0, `${row.rule_id}: ${key} missing`);
  assert.match(row.id, /^(?:N0[1-9](?:-\d+)?|M(?:0[1-9]|1[0-9]))$/);
  assert.ok(["national", "funabashi"].includes(row.scope_group));
  assert.equal(row.id.startsWith("N"), row.scope_group === "national");
  assert.ok(["yes", "no", "pending"].includes(row.income_status));
  assert.ok(["confirmed", "unconfirmed"].includes(row.presence_status));
  assert.match(row.checked_on, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(row.sources.length > 0, `${row.rule_id}: source missing`);
  for (const source of row.sources) {
    const url = new URL(source.url);
    assert.equal(url.protocol, "https:");
    assert.match(url.hostname, /(?:^|\.)(?:go\.jp|lg\.jp)$/);
    assert.ok(source.title && source.section, `${row.rule_id}: source title/section missing`);
  }
  if (row.income_status === "no") {
    assert.ok(row.income_condition.startsWith("なし"));
    assert.ok(!row.verification_note.includes("規則未確認"), `${row.rule_id}: unverified absence`);
  }
  if (row.income_status === "pending") assert.ok(row.income_condition.startsWith("未確認"));
  if (row.presence_status === "unconfirmed") {
    assert.equal(row.income_status, "pending");
    assert.ok(row.verification_note.includes("不実施を意味しない"));
  }
}
for (const id of data.scope.national_law_ids) assert.ok(data.rows.some(row => row.scope_group === "national" && row.id.split("-")[0] === id), `${id}: no confirmation row`);
for (const type of data.scope.municipal_categories) assert.ok(data.rows.some(row => row.scope_group === "funabashi" && row.id === type.id), `${type.id}: no confirmation row`);
assert.ok(data.rows.find(row => row.id === "M02").income_measure.includes("世帯分離"));
assert.ok(data.rows.find(row => row.id === "M01").change_rule.includes("対象内"));
assert.ok(data.rows.some(row => row.program.includes("育成医療")));
assert.ok(data.rows.some(row => row.program.includes("所得金額調整控除")));
assert.equal(data.rows.find(row => row.rule_id === "n02-prosthetic-costs").income_status, "yes");
assert.equal(data.rows.find(row => row.rule_id === "m10-child-welfare-allowance").income_status, "no");
assert.ok(data.rows.find(row => row.rule_id === "m10-child-welfare-allowance").coordination.includes("支給を受ける資格"));
assert.deepEqual(data.rows.filter(row => row.presence_status === "unconfirmed").map(row => row.id), ["M16", "M17", "M18", "M19"]);
assert.ok(!/"(?:city_code|category_id|records|raw_survey_batches|confirmed_city_count|evidence_summary|type_numbering)"\s*:/.test(JSON.stringify(data)));
const totals = Object.fromEntries(["yes", "no", "pending"].map(status => [status, data.rows.filter(row => row.income_status === status).length]));
console.log(`✓ income assessment: 8 columns, ${data.rows.length} confirmation rows, 9 laws/19 categories, official sources; income yes/no/pending=${totals.yes}/${totals.no}/${totals.pending}; no 26-city matrix`);
