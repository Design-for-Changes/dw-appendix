#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "public", "data");
const CONFIG_DIR = path.join(ROOT, "src", "config");

function loadJSON(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function loadTables() {
  return {
    emp: loadJSON(path.join(DATA_DIR, "emp_deduction.json")),
    basicIT: loadJSON(path.join(DATA_DIR, "basic_it.json")),
    basicLT: loadJSON(path.join(DATA_DIR, "basic_lt.json")),
    socialU40: loadJSON(path.join(DATA_DIR, "social_u40.json")),
    socialO40: loadJSON(path.join(DATA_DIR, "social_o40.json")),
    configs: {
      spouseDeductionITCfg: loadJSON(path.join(CONFIG_DIR, "spouse_deduction_it.json")),
      spouseDeductionLTCfg: loadJSON(path.join(CONFIG_DIR, "spouse_deduction_lt.json")),
      spouseSpecialDeductionITCfg: loadJSON(path.join(CONFIG_DIR, "spouse_special_deduction_it.json")),
      spouseSpecialDeductionLTCfg: loadJSON(path.join(CONFIG_DIR, "spouse_special_deduction_lt.json")),
      dependentDeductionCfg: loadJSON(path.join(CONFIG_DIR, "dependent_deduction.json")),
      specialKinDeductionITCfg: loadJSON(path.join(CONFIG_DIR, "special_kin_deduction_it.json")),
      specialKinDeductionLTCfg: loadJSON(path.join(CONFIG_DIR, "special_kin_deduction_lt.json")),
      widowDeductionCfg: loadJSON(path.join(CONFIG_DIR, "widow_deduction.json")),
      singleParentDeductionCfg: loadJSON(path.join(CONFIG_DIR, "single_parent_deduction.json")),
      workingStudentDeductionCfg: loadJSON(path.join(CONFIG_DIR, "working_student_deduction.json")),
      disabilityDeductionCfg: loadJSON(path.join(CONFIG_DIR, "disability_deduction.json")),
    },
  };
}

function parseArgs(argv) {
  const args = { cases: ["P1", "P2", "P3"], format: "text" };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--json") args.format = "json";
    if (arg === "--cases" && argv[i + 1]) {
      args.cases = argv[i + 1].split(",").map((x) => x.trim()).filter(Boolean);
      i += 1;
    }
  }
  return args;
}

function fmt(n, digits = 1) {
  return Number(n).toLocaleString("ja-JP", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function confidenceLabel(kind) {
  if (kind === "representative") return "代表値";
  if (kind === "provisional") return "暫定";
  return "厳密";
}

function joinUnique(values) {
  return [...new Set(values.filter(Boolean))].join("<br>");
}

function printText(reports) {
  for (const report of reports) {
    console.log(`\n## ${report.id} ${report.label}`);
    console.log("| 崖の給与 | 原因 | 何が起きたか | 落差 | 実質無効幅(P−Q) | 回復に必要な年収(R−P) | 確度 |");
    console.log("|---:|---|---|---:|---:|---:|---|");
    for (const cliff of report.cliffs) {
      const causes = joinUnique(cliff.causes.map((cause) => cause.cause));
      const whatHappened = cliff.causes.map((cause) => cause.whatHappened).join("<br>");
      const confidence = joinUnique(cliff.causes.map((cause) => confidenceLabel(cause.confidence)));
      const ineffective = cliff.ineffectiveWidthManyen == null ? "—" : `${fmt(cliff.ineffectiveWidthManyen, 0)}万`;
      const recovery =
        cliff.recoveryWidthManyen == null
          ? `1500万でも回復せず・不足${fmt(cliff.unrecoveredShortfallWan, 1)}万`
          : `${fmt(cliff.recoveryWidthManyen, 0)}万`;
      console.log(
        `| ${fmt(cliff.salaryManyen, 0)}万 | ${causes} | ${whatHappened} | ${fmt(cliff.dropManyen, 1)}万 | ${ineffective} | ${recovery} | ${confidence} |`
      );
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const core = await import(pathToFileURL(path.join(ROOT, "src", "calc", "computePoint.js")).href);
  const analysis = await import(pathToFileURL(path.join(ROOT, "src", "calc", "cliffCauseAnalysis.js")).href);
  const fixture = loadJSON(path.join(ROOT, "fixtures", "cases.json"));
  const tables = loadTables();
  const reports = [];

  for (const id of args.cases) {
    const c = fixture.cases.find((x) => x.id === id);
    if (!c) throw new Error(`case not found: ${id}`);
    const household = core.buildHousehold(c.household);
    const series = core.computeSeries({ household, scenario: c.scenario, tables });
    const minDropManyen = Number.isFinite(Number(c.expected?.minDropManyen)) ? Number(c.expected.minDropManyen) : 3;
    reports.push({
      id: c.id,
      label: c.label,
      minDropManyen,
      cliffs: analysis.detectCliffCauseRows(series, { minDropManyen }),
    });
  }

  if (args.format === "json") {
    console.log(JSON.stringify(reports, null, 2));
    return;
  }
  printText(reports);
}

main().catch((e) => {
  console.error(e?.stack || e?.message || e);
  process.exit(1);
});
