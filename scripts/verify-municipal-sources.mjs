import assert from "node:assert/strict";
import fs from "node:fs";

const data = JSON.parse(fs.readFileSync(new URL("../public/data/research/municipal-source-list.json", import.meta.url), "utf8"));
assert.equal(data.municipalities.length, 26);
assert.equal(new Set(data.municipalities.map((city) => city.code)).size, 26);
assert.equal(data.municipalities.filter((city) => city.classification === "政令指定都市").length, 20);
assert.equal(data.municipalities.filter((city) => city.classification === "中核市").length, 6);
assert.equal(data.scope.population_reference_date, "2025-01-01");
const allowedCityKeys = new Set(["code", "name", "prefecture", "classification", "population", "sources"]);
const allowedSourceKeys = new Set(["title", "url", "edition", "checked_on", "verification"]);
for (const city of data.municipalities) {
  assert.match(city.code, /^\d{6}$/);
  assert.ok(city.sources.length > 0, `${city.name}: source missing`);
  assert.ok(Object.keys(city).every((key) => allowedCityKeys.has(key)), `${city.name}: unexpected public field`);
  if (city.classification === "中核市") assert.ok(city.population >= 500000);
  for (const source of city.sources) {
    assert.ok(Object.keys(source).every((key) => allowedSourceKeys.has(key)), `${city.name}: unexpected source field`);
    assert.match(new URL(source.url).hostname, /(^|\.)city\.[a-z.]+\.jp$/);
    assert.equal(source.checked_on, data.checked_on);
  }
}
for (const source of data.scope.references) assert.equal(new URL(source.url).protocol, "https:");
assert.ok(!/"(?:records|category_id|status|private|evidence_summary)"\s*:/.test(JSON.stringify(data)), "Reviewer-only findings must not enter public source data");
console.log("✓ municipal sources: 26 cities, official guide links, no city-by-type findings");
