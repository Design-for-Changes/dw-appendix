import assert from "node:assert/strict";
import fs from "node:fs";

const data = JSON.parse(fs.readFileSync(new URL("../public/data/research/municipal-source-list.json", import.meta.url), "utf8"));
assert.equal(data.municipalities.length, 26);
assert.equal(new Set(data.municipalities.map((city) => city.code)).size, 26);
assert.equal(data.municipalities.filter((city) => city.classification === "政令指定都市").length, 20);
assert.equal(data.municipalities.filter((city) => city.classification === "中核市").length, 6);
assert.equal(data.scope.population_reference_date, "2026-01-01");
const allowedCityKeys = new Set(["code", "name", "prefecture", "classification", "population", "sources"]);
const allowedSourceKeys = new Set(["title", "url", "edition", "checked_on", "kind"]);
for (const city of data.municipalities) {
  assert.match(city.code, /^\d{6}$/);
  assert.ok(city.sources.length > 0, `${city.name}: source missing`);
  assert.ok(city.sources.some((source) => source.kind === "guide"), `${city.name}: basic guide missing`);
  assert.equal(new Set(city.sources.map((source) => source.url)).size, city.sources.length, `${city.name}: duplicate source URL`);
  assert.ok(Object.keys(city).every((key) => allowedCityKeys.has(key)), `${city.name}: unexpected public field`);
  if (city.classification === "中核市") assert.ok(city.population >= 500000);
  for (const source of city.sources) {
    assert.ok(Object.keys(source).every((key) => allowedSourceKeys.has(key)), `${city.name}: unexpected source field`);
    const url = new URL(source.url);
    assert.equal(url.protocol, "https:");
    assert.match(url.hostname, /(?:^|\.)(?:city|pref|metro)\.[a-z.]+\.jp$|\.go\.jp$/);
    assert.ok(["guide", "supplement", "pdf"].includes(source.kind));
    assert.ok(source.checked_on === null || /^\d{4}-\d{2}-\d{2}$/.test(source.checked_on));
    if (source.checked_on) assert.ok(source.checked_on <= data.checked_on);
  }
}
for (const source of data.scope.references) assert.equal(new URL(source.url).protocol, "https:");
assert.ok(!/"(?:records|category_id|status|private|evidence_summary)"\s*:/.test(JSON.stringify(data)), "Reviewer-only findings must not enter public source data");
console.log(`✓ municipal sources: 26 cities, ${data.municipalities.reduce((n, city) => n + city.sources.length, 0)} source entries, no city-by-type findings`);
