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
const EXPECTED_ADDITIONAL_NEED_WAN = {
  case1: 51.492,
  case2: 72.936,
  case3: 102.984,
};

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
const expectedPointCount = summary.range.max - summary.range.min + 1;

for (const displayCase of summary.cases) {
  const fixtureId = DISPLAY_TO_FIXTURE[displayCase.id];
  const fixture = fixtures.cases.find((candidate) => candidate.id === fixtureId);
  if (!fixture) fail(`${displayCase.id}: fixture missing`);
  if (displayCase.series?.length !== expectedPointCount) fail(`${displayCase.id}: series length`);
  if (displayCase.optimalModel?.series?.length !== expectedPointCount) fail(`${displayCase.id}: optimal series length`);
  if (!(displayCase.optimalModel?.baseSupportWan > 0)) fail(`${displayCase.id}: optimal base support`);
  if (Math.abs(displayCase.optimalModel.additionalNeedAnnualWan - EXPECTED_ADDITIONAL_NEED_WAN[displayCase.id]) > 1e-9) {
    fail(`${displayCase.id}: optimal additional need`);
  }
  if (Math.abs(displayCase.optimalModel.baseSupportWan - 2.18 * displayCase.optimalModel.additionalNeedAnnualWan) > 1e-9) {
    fail(`${displayCase.id}: optimal common support multiplier`);
  }
  if (Math.abs(displayCase.optimalModel.needAnnualWan - (displayCase.optimalModel.baseNeedAnnualWan + displayCase.optimalModel.additionalNeedAnnualWan)) > 1e-9) {
    fail(`${displayCase.id}: optimal need identity`);
  }

  displayCase.series.forEach((point, index) => {
    if (point.x !== summary.range.min + index) fail(`${displayCase.id}: non-contiguous x at ${index}`);
    if (!Number.isFinite(point.disposable)) fail(`${displayCase.id}: invalid disposable at ${point.x}`);
  });

  displayCase.optimalModel.series.forEach((point, index) => {
    const expectedX = summary.range.min + index;
    if (point.x !== expectedX) fail(`${displayCase.id}: optimal non-contiguous x at ${index}`);
    for (const key of [
      "needAnnualWan",
      "baseNeedAnnualWan",
      "disabilityNeedAnnualWan",
      "careNeedAnnualWan",
      "additionalNeedAnnualWan",
      "preSupportResourcesWan",
      "supportRatio",
      "supportTransition",
      "directSupportWan",
      "postSupportResourcesWan",
      "burdenRatio",
      "burdenTransition",
      "burdenCapWan",
      "referenceBalanceWan",
      "rawModelBalanceWan",
      "balanceWan",
      "currentBalanceWan",
      "adjustmentWan",
      "plannedExpenseWan",
      "additionalExpenseWan",
      "eligibleExpenseWan",
      "modelBurdenWan",
      "refundWan",
      "disposableFloorWan",
      "takeHomeWan",
      "currentDisposableWan",
      "optimalDisposableWan",
    ]) {
      if (!Number.isFinite(point[key])) fail(`${displayCase.id}: invalid optimal ${key} at ${point.x}`);
    }
    if (Math.abs(point.referenceBalanceWan - (point.directSupportWan - point.burdenCapWan)) > 1e-9) {
      fail(`${displayCase.id}: optimal reference balance identity at ${point.x}`);
    }
    if (Math.abs(point.balanceWan - point.rawModelBalanceWan) > 1e-9) {
      fail(`${displayCase.id}: optimal balance identity at ${point.x}`);
    }
    if (Math.abs(point.modelBurdenWan - Math.min(point.eligibleExpenseWan, point.burdenCapWan)) > 1e-9) {
      fail(`${displayCase.id}: optimal burden identity at ${point.x}`);
    }
    if (Math.abs(point.eligibleExpenseWan - (point.plannedExpenseWan + point.additionalExpenseWan)) > 1e-9) {
      fail(`${displayCase.id}: eligible expense identity at ${point.x}`);
    }
    if (Math.abs(point.refundWan - Math.max(0, point.eligibleExpenseWan - point.modelBurdenWan)) > 1e-9) {
      fail(`${displayCase.id}: refund identity at ${point.x}`);
    }
    if (Math.abs(point.balanceWan - (point.directSupportWan - point.modelBurdenWan)) > 1e-9) {
      fail(`${displayCase.id}: optimal target balance identity at ${point.x}`);
    }
    if (Math.abs(point.adjustmentWan - (point.balanceWan - point.currentBalanceWan)) > 1e-9) {
      fail(`${displayCase.id}: optimal adjustment identity at ${point.x}`);
    }
    if (Math.abs(point.optimalDisposableWan - (point.takeHomeWan + point.otherCashSupportWan + point.balanceWan)) > 1e-9) {
      fail(`${displayCase.id}: optimal disposable identity at ${point.x}`);
    }
    if (Math.abs(point.currentDisposableWan - (point.takeHomeWan + point.otherCashSupportWan + point.currentBalanceWan)) > 1e-9) {
      fail(`${displayCase.id}: current disposable identity at ${point.x}`);
    }
    if (Math.abs(point.preSupportResourcesWan - (point.takeHomeWan + point.otherCashSupportWan)) > 1e-9) {
      fail(`${displayCase.id}: pre-support resources identity at ${point.x}`);
    }
    if (Math.abs(point.supportRatio - point.preSupportResourcesWan / point.needAnnualWan) > 1e-9) {
      fail(`${displayCase.id}: support ratio identity at ${point.x}`);
    }
    const expectedSupportTransition = Math.max(
      0,
      Math.min(1, (point.supportRatio - 1.5) / (2.5 - 1.5))
    );
    if (Math.abs(point.supportTransition - expectedSupportTransition) > 1e-9) {
      fail(`${displayCase.id}: support transition identity at ${point.x}`);
    }
    if (Math.abs(point.directSupportWan - displayCase.optimalModel.baseSupportWan * (1 - point.supportTransition)) > 1e-9) {
      fail(`${displayCase.id}: support amount identity at ${point.x}`);
    }
    if (Math.abs(point.postSupportResourcesWan - (point.preSupportResourcesWan + point.directSupportWan)) > 1e-9) {
      fail(`${displayCase.id}: post-support resources identity at ${point.x}`);
    }
    if (Math.abs(point.disposableFloorWan - (point.postSupportResourcesWan - point.burdenCapWan)) > 1e-9) {
      fail(`${displayCase.id}: disposable floor identity at ${point.x}`);
    }
    if (Math.abs(point.burdenRatio - point.postSupportResourcesWan / point.needAnnualWan) > 1e-9) {
      fail(`${displayCase.id}: burden ratio identity at ${point.x}`);
    }
    const expectedBurdenTransition = Math.max(
      0,
      Math.min(1, (point.burdenRatio - 1.5) / (2.5 - 1.5))
    );
    if (Math.abs(point.burdenTransition - expectedBurdenTransition) > 1e-9) {
      fail(`${displayCase.id}: burden transition identity at ${point.x}`);
    }
    if (Math.abs(point.burdenCapWan - 0.1 * point.needAnnualWan * point.burdenTransition) > 1e-9) {
      fail(`${displayCase.id}: burden cap identity at ${point.x}`);
    }
    if (index > 0) {
      const previous = displayCase.optimalModel.series[index - 1];
      if (Math.abs(point.balanceWan - previous.balanceWan) > 2) {
        fail(`${displayCase.id}: optimal balance discontinuity at ${point.x}`);
      }
    }
    if (point.supportRatio <= 1.5 && Math.abs(point.directSupportWan - displayCase.optimalModel.baseSupportWan) > 1e-9) {
      fail(`${displayCase.id}: support lower anchor at ${point.x}`);
    }
    if (point.supportRatio >= 2.5 && Math.abs(point.directSupportWan) > 1e-9) {
      fail(`${displayCase.id}: support upper anchor at ${point.x}`);
    }
    if (point.burdenRatio <= 1.5 && Math.abs(point.burdenCapWan) > 1e-9) {
      fail(`${displayCase.id}: burden lower anchor at ${point.x}`);
    }
    if (point.burdenRatio >= 2.5 && Math.abs(point.burdenCapWan - 0.1 * point.needAnnualWan) > 1e-9) {
      fail(`${displayCase.id}: burden upper anchor at ${point.x}`);
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
  for (let start = summary.range.min; start <= summary.range.max; start += summary.detailChunkSize) {
    const filePath = path.join(GENERATED_DIR, "details", `${displayCase.id}-${start}.json.gz`);
    if (!fs.existsSync(filePath)) fail(`${displayCase.id}: detail chunk ${start} missing`);
    const chunk = loadJSON(filePath);
    if (fs.statSync(filePath).size > 100_000) fail(`${displayCase.id}: detail chunk ${start} too large`);
    detailPoints.push(...(chunk.points || []));
  }
  if (detailPoints.length !== expectedPointCount) fail(`${displayCase.id}: detail point count`);

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
