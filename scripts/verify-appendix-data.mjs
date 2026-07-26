#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GENERATED_DIR = path.join(ROOT, "public", "generated", "appendix");
const SUMMARY_PATH = path.join(GENERATED_DIR, "summary.json.gz");
const FIXTURES_PATH = path.join(ROOT, "fixtures", "cases.json");
const PAGE_PATH = path.join(ROOT, "src", "pages", "AppendixCliffMap.js");
const DISPLAY_TO_FIXTURE = { case1: "P1", case2: "P2", case3: "P3" };

function loadJSON(filePath) {
  if (filePath.endsWith(".gz")) return JSON.parse(gunzipSync(fs.readFileSync(filePath)).toString("utf8"));
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function fail(message) {
  throw new Error(message);
}

const summary = loadJSON(SUMMARY_PATH);
const fixtures = loadJSON(FIXTURES_PATH);
if (summary.schemaVersion !== 1) fail("summary schemaVersion");
if (summary.cases?.length !== 3) fail("summary case count");

for (const displayCase of summary.cases) {
  const fixtureId = DISPLAY_TO_FIXTURE[displayCase.id];
  const fixture = fixtures.cases.find((candidate) => candidate.id === fixtureId);
  if (!fixture) fail(`${displayCase.id}: fixture missing`);
  if (displayCase.series?.length !== 1201) fail(`${displayCase.id}: series length`);
  if (displayCase.optimalModel?.series?.length !== 1201) fail(`${displayCase.id}: optimal series length`);
  if (!(displayCase.optimalModel?.baseSupportWan > 0)) fail(`${displayCase.id}: optimal base support`);

  displayCase.series.forEach((point, index) => {
    if (point.x !== 200 + index) fail(`${displayCase.id}: non-contiguous x at ${index}`);
    if (!Number.isFinite(point.disposable)) fail(`${displayCase.id}: invalid disposable at ${point.x}`);
  });

  displayCase.optimalModel.series.forEach((point, index) => {
    const expectedX = 200 + index;
    if (point.x !== expectedX) fail(`${displayCase.id}: optimal non-contiguous x at ${index}`);
    for (const key of ["ratio", "needAnnualWan", "directSupportWan", "burdenCapWan", "balanceWan", "currentBalanceWan"]) {
      if (!Number.isFinite(point[key])) fail(`${displayCase.id}: invalid optimal ${key} at ${point.x}`);
    }
    if (Math.abs(point.balanceWan - (point.directSupportWan - point.burdenCapWan)) > 1e-9) {
      fail(`${displayCase.id}: optimal balance identity at ${point.x}`);
    }
    if (point.ratio <= 1.5 && (Math.abs(point.directSupportWan - displayCase.optimalModel.baseSupportWan) > 1e-9 || Math.abs(point.burdenCapWan) > 1e-9)) {
      fail(`${displayCase.id}: optimal lower anchor at ${point.x}`);
    }
    if (point.ratio >= 2.5 && (Math.abs(point.directSupportWan) > 1e-9 || Math.abs(point.burdenCapWan - 0.1 * point.needAnnualWan) > 1e-9)) {
      fail(`${displayCase.id}: optimal upper anchor at ${point.x}`);
    }
  });

  const expectedCliffs = fixture.expected?.cliffs || [];
  for (const expected of expectedCliffs) {
    const actual = displayCase.cliffs.find((cliff) => cliff.x === expected.salaryManyen);
    if (!actual) fail(`${displayCase.id}: cliff ${expected.salaryManyen} missing`);
    if (Math.abs(actual.drop - expected.dropManyen) > 1) {
      fail(`${displayCase.id}: cliff drop ${expected.salaryManyen}`);
    }
  }

  const detailPoints = [];
  for (let start = 200; start <= 1400; start += summary.detailChunkSize) {
    const filePath = path.join(GENERATED_DIR, "details", `${displayCase.id}-${start}.json.gz`);
    if (!fs.existsSync(filePath)) fail(`${displayCase.id}: detail chunk ${start} missing`);
    const chunk = loadJSON(filePath);
    if (fs.statSync(filePath).size > 100_000) fail(`${displayCase.id}: detail chunk ${start} too large`);
    detailPoints.push(...(chunk.points || []));
  }
  if (detailPoints.length !== 1201) fail(`${displayCase.id}: detail point count`);

  detailPoints.forEach((point, index) => {
    const summaryPoint = displayCase.series[index];
    if (point.x !== summaryPoint.x) fail(`${displayCase.id}: detail x ${index}`);
    const detailDisposable = Number(point.breakdown?.disposable?.disposableWan);
    if (Math.abs(detailDisposable - summaryPoint.disposable) > 1e-9) {
      fail(`${displayCase.id}: detail/summary mismatch at ${point.x}`);
    }
  });
}

const pageSource = fs.readFileSync(PAGE_PATH, "utf8");
for (const forbidden of ["computeSeries", "buildHousehold", "useStaticTables", 'from "../calc/computePoint"']) {
  if (pageSource.includes(forbidden)) fail(`browser calculation dependency remains: ${forbidden}`);
}

console.log("✓ appendix JSON/core separation checks passed");
