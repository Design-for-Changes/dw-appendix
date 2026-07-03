// src/pages/DeductionGraph.js
import React, { useMemo, useState, useEffect } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  ReferenceLine,
  BarChart,
  Bar,
  AreaChart,
  Area,
} from "recharts";
import "../App.css";
import scenarios from "../config/scenarios.json";

// グラフ共通スタイル
const LINE_PROPS = { dot: false, activeDot: false, strokeWidth: 2, isAnimationActive: false };
const DIAG_LINE_PROPS = {
  type: "linear",
  dataKey: "income_axis",
  name: "y=x（給与そのまま）",
  stroke: "#9e9e9e",
  dot: false,
  activeDot: false,
  strokeWidth: 1,
  strokeDasharray: "4 2",
  isAnimationActive: false,
};
// 固定タブ（X軸が x）用の y=x
const DIAG_X_PROPS = {
  type: "linear",
  dataKey: "x",
  name: "y=x（給与そのまま）",
  stroke: "#9e9e9e",
  dot: false,
  activeDot: false,
  strokeWidth: 1,
  strokeDasharray: "4 2",
  isAnimationActive: false,
};
const DIAG_TOTAL_PROPS = {
  type: "linear",
  dataKey: "total_income",
  name: "y=x（総収入そのまま）",
  stroke: "#9e9e9e",
  dot: false,
  activeDot: false,
  strokeWidth: 1,
  strokeDasharray: "4 2",
  isAnimationActive: false,
};
// チャート下の凡例・軸ラベルが被らないよう余白を広めに確保
const BASE_MARGIN = { top: 24, right: 24, left: 10, bottom: 40 };
// vhベースだが過度に大きく/小さくならないよう上下限を設定
const CHART_BOX_STYLE = { width: "100%", height: "50vh", maxHeight: 420, minHeight: 260 };
// HMR中の参照ズレ対策（過去の変数名互換）
const CHART_STYLE = CHART_BOX_STYLE;
const MARKER_LINE_COLOR = "#F3B08A";

const MarkerLineX = ({ x, stroke = MARKER_LINE_COLOR, strokeDasharray = "4 2" }) => {
  const n = Number(x);
  if (!Number.isFinite(n)) return null;
  return <ReferenceLine x={n} stroke={stroke} strokeDasharray={strokeDasharray} />;
};

const ChartLegend = ({ items }) => {
  if (!items || items.length === 0) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", margin: "6px 0 8px" }}>
      {items.map((it) => (
        <div key={it.label} className="chart-legend-item" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              width: 18,
              borderTop: `3px ${it.dash ? "dashed" : "solid"} ${it.color}`,
              display: "inline-block",
            }}
          />
          <span>{it.label}</span>
        </div>
      ))}
    </div>
  );
};

const nearestRow = (arr, key, target) => {
  if (!arr || arr.length === 0) return null;
  let best = arr[0];
  let min = Math.abs((arr[0][key] ?? 0) - target);
  for (const r of arr) {
    const d = Math.abs((r[key] ?? 0) - target);
    if (d < min) {
      min = d;
      best = r;
    }
  }
  return best;
};

const clampInt = (n, lo, hi) => Math.max(lo, Math.min(hi, Math.trunc(n)));

// 0..N の連番テーブル（key の値が index と一致）を優先して index 参照する。
// ずれがある場合は最近傍を使う（安全側）。
const rowAtKeyInt = (arr, key, xInt) => {
  if (!arr || arr.length === 0) return null;
  const idx = clampInt(xInt, 0, arr.length - 1);
  const r = arr[idx];
  if (r && Number(r[key]) === idx) return r;
  return nearestRow(arr, key, xInt);
};

// key が 0..N の1刻みテーブル前提で、valueKey を線形補間して返す（例: 税額テーブル）。
const interpTableValue = (arr, key, x, valueKey) => {
  if (!arr || arr.length === 0) return 0;
  const maxIdx = arr.length - 1;
  const x0 = clampInt(Math.floor(x), 0, maxIdx);
  const x1 = clampInt(Math.ceil(x), 0, maxIdx);
  const r0 = rowAtKeyInt(arr, key, x0);
  const r1 = rowAtKeyInt(arr, key, x1);
  const v0 = Number(r0?.[valueKey]) || 0;
  const v1 = Number(r1?.[valueKey]) || 0;
  if (x1 === x0) return v0;
  const t = (Number(x) - x0) / (x1 - x0);
  return v0 + (v1 - v0) * t;
};

export default function DeductionGraph() {
  // 実計算に使う値（描画ボタン押下でのみ更新）
  const [xMax, setXMax] = useState(1500); // 万円
  const [age, setAge] = useState(35);
  const [otherIncome, setOtherIncome] = useState(0); // 給与以外の所得（万円）
  const [spouseDedInput, setSpouseDedInput] = useState(0); // 手入力（万）
  const [spouseSpecInput, setSpouseSpecInput] = useState(0); // 手入力（万）
  const [deductions, setDeductions] = useState({
    otherDed: 0, // 各種控除合算（雑損・医療・小規模・生保・地震・寄付・扶養をまとめる）
    widow: 0,
    singleParent: 0,
    workingStudent: 0,
  });

  const [xMaxDraft, setXMaxDraft] = useState(1500);
  const [displaySalaryDraft, setDisplaySalaryDraft] = useState(500);
  const [ageDraft, setAgeDraft] = useState(35);
  const [otherIncomeDraft, setOtherIncomeDraft] = useState(0);
  const [spouseDedDraft, setSpouseDedDraft] = useState(0);
  const [spouseSpecDraft, setSpouseSpecDraft] = useState(0);
  const [deductionsDraft, setDeductionsDraft] = useState({
    otherDed: 0,
    widow: 0,
    singleParent: 0,
    workingStudent: 0,
  });
  // 静的データ（JSON）と入力用ドラフト値（ボタン押下で実計算値に反映）
  const [staticReady, setStaticReady] = useState(false);
  const [empStatic, setEmpStatic] = useState([]);
  const [basicITStatic, setBasicITStatic] = useState([]);
  const [basicLTStatic, setBasicLTStatic] = useState([]);
  const [socialStatic, setSocialStatic] = useState([]);
  const [taxTableStatic, setTaxTableStatic] = useState([]); // taxable -> tax amount (万円)

  // 計算トリガー（初期ロード時とボタン押下時）
  const [calcVersion, setCalcVersion] = useState(0); // dynamic 計算トリガー
  const [displaySalary, setDisplaySalary] = useState(500); // 万円、全グラフで縦線と数値表示に使用
  const [viewTab, setViewTab] = useState("inputs"); // inputs / fixed / dynamic
  const [ratioScenario, setRatioScenario] = useState("s2"); // 割合グラフ表示対象（S1/S2/S3）

  // 静的JSONをロード
  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        setStaticReady(false);
        // dev環境でも /visualization/calc-001/ のようなサブパス配下で動くように、
        // PUBLIC_URL が空のときは相対パスで読む。
        const base = process.env.PUBLIC_URL || ".";
        const [empRes, basicITRes, basicLTRes, socU, socO, taxRes] = await Promise.all([
          fetch(`${base}/data/emp_deduction.json`).then((r) => r.json()),
          fetch(`${base}/data/basic_it.json`).then((r) => r.json()),
          fetch(`${base}/data/basic_lt.json`).then((r) => r.json()),
          fetch(`${base}/data/social_u40.json`).then((r) => r.json()),
          fetch(`${base}/data/social_o40.json`).then((r) => r.json()),
          fetch(`${base}/data/tax_table.json`).then((r) => r.json()),
        ]);
        if (ignore) return;
        setEmpStatic(empRes);
        setBasicITStatic(basicITRes);
        setBasicLTStatic(basicLTRes);
        setSocialStatic(age >= 40 ? socO : socU);
        setTaxTableStatic(taxRes);
        setStaticReady(true);
      } catch (e) {
        console.error("static json load error", e);
      }
    })();
    return () => {
      ignore = true;
    };
  }, [age]);

  const nsetDraft = (setter) => (e) => setter(e.target.value === "" ? "" : Number(e.target.value));
  const nsetDedDraft = (key) => (e) =>
    setDeductionsDraft((p) => ({
      ...p,
      [key]: e.target.value === "" ? "" : Number(e.target.value),
    }));

  // 横軸最大値を下げた時に、縦線ラインが最大値を超えないようにする
  useEffect(() => {
    const max = Number(xMaxDraft) || 0;
    setDisplaySalaryDraft((v) => Math.min(Number(v) || 0, max));
  }, [xMaxDraft]);

  const applyDraft = () => {
    const newXMax = Number(xMaxDraft) || 0;
    const newOther = Number(otherIncomeDraft) || 0;
    setXMax(newXMax);
    setAge(Number(ageDraft) || 0);
    setOtherIncome(newOther);
    setSpouseDedInput(Number(spouseDedDraft) || 0);
    setSpouseSpecInput(Number(spouseSpecDraft) || 0);
    setDeductions({
      otherDed: Number(deductionsDraft.otherDed) || 0,
      widow: Number(deductionsDraft.widow) || 0,
      singleParent: Number(deductionsDraft.singleParent) || 0,
      workingStudent: Number(deductionsDraft.workingStudent) || 0,
    });
    setDisplaySalary(Math.min(Number(displaySalaryDraft) || 0, newXMax));
    setCalcVersion((v) => v + 1);
  };

  // 描画刻みを固定（2万円刻み）して負荷を抑える
  const effStep = 2;

  // 1) 計算 (動的タブでのみ実行)
  const data = useMemo(() => {
    if (viewTab !== "dynamic") return [];
    if (!staticReady) return [];
    const rows = [];
    const round1 = (n) => (Number.isFinite(Number(n)) ? Math.round(Number(n) * 10) / 10 : 0);
    const otherWanFixed = Number(otherIncome) || 0;
    const spouseDedWan = Number(spouseDedInput) || 0;
    const spouseSpecWan = Number(spouseSpecInput) || 0;
    const dedSumWan =
      (Number(deductions.otherDed) || 0) +
      (Number(deductions.widow) || 0) +
      (Number(deductions.singleParent) || 0) +
      (Number(deductions.workingStudent) || 0);

    // x=0 だと「所得合計(total_income) = otherIncome」に張り付いて傾きが不自然になるので、
    // グラフ用の計算は 1万円から開始する。
    //
    // 「グラフ比較」の横軸は「所得の合計（給与＋給与以外）」なので、横軸上限(xMax)に合わせるために
    // 計算上の給与上限は (xMax - 給与以外の所得) とする。
    const salaryUpperWan = Math.max(0, (Number(xMax) || 0) - otherWanFixed);
    const salaries = [];
    for (let x = 1; x <= salaryUpperWan; x += effStep) salaries.push(x);
    // 端点が入らない（例: 2万円刻みで 1->1499 で止まる）問題を避けるため、上限点を必ず追加する
    if (salaryUpperWan >= 1 && salaries[salaries.length - 1] !== salaryUpperWan) salaries.push(salaryUpperWan);

    for (const x of salaries) {
      const empRow = rowAtKeyInt(empStatic, "x", x);
      const socialRow = rowAtKeyInt(socialStatic, "x", x);
      const row = { x };

      scenarios.forEach((s) => {
        // 以降、単位はすべて「万円」。
        const empWan = Number(empRow?.[`emp_${s.key}`]) || 0; // 給与所得控除
        const salaryIncomeWan = Math.max(0, x - empWan); // 給与所得
        const incomeWan = salaryIncomeWan + otherWanFixed; // 所得合計（給与所得+給与以外）

        const basicITRow = rowAtKeyInt(basicITStatic, "income_axis", Math.round(incomeWan));
        const basicLTRow = rowAtKeyInt(basicLTStatic, "income_axis", Math.round(incomeWan));
        const basicITWan = Number(basicITRow?.[`basicIT_${s.key}`]) || 0;
        const basicLTWan = Number(basicLTRow?.basicLT_common) || 0;

        const socialWan = Number(socialRow?.[`social_${s.key}`]) || 0;

        // 控除（配偶者系は手入力のまま。所得控除の共通分は dedSumWan にまとめている）
        const taxableITWan = Math.max(0, incomeWan - basicITWan - dedSumWan - spouseDedWan - spouseSpecWan - socialWan);
        const taxableLTWan = Math.max(0, incomeWan - basicLTWan - dedSumWan - spouseDedWan - spouseSpecWan - socialWan);

        const taxITWan = interpTableValue(taxTableStatic, "taxable", taxableITWan, "tax_it");
        const taxLTWan = interpTableValue(taxTableStatic, "taxable", taxableLTWan, "tax_lt");

        // 税額（代表で格納: 後続の表・表示用）
        if (s.key === "s1") {
          row.taxIT = round1(taxITWan);
          row.taxLT = round1(taxLTWan);
        }

        const grossTotalWan = x + otherWanFixed;
        const netWan = grossTotalWan - socialWan - taxITWan - taxLTWan;

        // 保存（表示側で小数1桁）
        row[`emp_${s.key}`] = round1(empWan);
        row[`income_${s.key}`] = round1(salaryIncomeWan);
        row[`gross_${s.key}`] = round1(incomeWan);
        row[`basicIT_${s.key}`] = round1(basicITWan);
        row[`basicLT_${s.key}`] = round1(basicLTWan);
        row[`social_${s.key}`] = round1(socialWan);
        row[`taxableIT_${s.key}`] = round1(taxableITWan);
        row[`taxableLT_${s.key}`] = round1(taxableLTWan);
        row[`taxIT_${s.key}`] = round1(taxITWan);
        row[`taxLT_${s.key}`] = round1(taxLTWan);
        row[`spouseDedIT_${s.key}`] = round1(spouseDedWan);
        row[`spouseSpecIT_${s.key}`] = round1(spouseSpecWan);
        row[`spouseDedLT_${s.key}`] = round1(spouseDedWan);
        row[`spouseSpecLT_${s.key}`] = round1(spouseSpecWan);
        row[`net_${s.key}`] = round1(netWan);
      });

      // X軸・表示用
      row.income_axis = x; // 万円（給与）
      row.income_display = row.gross_s2; // 万円（給与所得＋その他）
      row.total_income = round1(x + otherWanFixed); // 万円（給与＋その他）

      rows.push(row);
    }
    return rows;
  // calcVersion を依存に含め、ボタン押下でのみ再計算
  }, [xMax, effStep, otherIncome, deductions, spouseDedInput, spouseSpecInput, calcVersion, viewTab, staticReady, empStatic, basicITStatic, basicLTStatic, socialStatic, taxTableStatic]);

  // 描画負荷を下げるための間引き刻み（万円）※線形補間なので5万円刻みでも滑らか
  const displayStep = 5; // 万円
  const downsample = (arr, key = "income_axis") => {
    if (!arr) return [];
    const out = [];
    let last = null;
    // 先頭1点は必ず残す（給与以外の所得を入れたときに X が 100+ の値から始まって見えるのを防ぐ）
    const first = arr[0];
    if (first && first[key] !== undefined) out.push(first);
    arr.forEach((r, idx) => {
      if (!r) return;
      if (idx === 0) {
        last = r;
        return;
      }
      last = r;
      const v = Number(r[key]);
      if (Number.isFinite(v) && v % displayStep === 0) out.push(r);
    });
    if (last && out[out.length - 1] !== last) out.push(last);
    return out;
  };

  // 描画用に必要なキーだけを取り出すヘルパ
  const pickScenario = (row, prefix, axisKeys = []) => {
    const out = {};
    axisKeys.forEach((k) => {
      if (row[k] !== undefined) out[k] = row[k];
    });
    scenarios.forEach((s) => {
      const k = `${prefix}${s.key}`;
      if (row[k] !== undefined) out[k] = row[k];
    });
    return out;
  };

  // 動的タブ用の表示配列（5万円刻み）
  const dataDisplay = useMemo(() => {
    if (viewTab !== "dynamic") return [];
    return downsample(data, "income_axis");
  }, [data, viewTab]);

  const dataNetDisplay = useMemo(
    () => dataDisplay.map((r) => pickScenario(r, "net_", ["total_income"])),
    [dataDisplay]
  );
  const tickCountX = useMemo(
    () => Math.min(16, Math.floor((xMax || 0) / displayStep) + 1),
    [xMax, displayStep]
  );
  // 税額カーブの横軸（課税所得）は「横軸の最大値」に合わせて固定（給与以外の所得に追従させない）
  const taxXAxisMax = useMemo(() => Math.min(3000, Math.max(0, Number(xMax) || 0)), [xMax]);

  // 固定タブ用：静的JSONから間引き
  const staticEmpDisplay = useMemo(
    () => downsample(empStatic.filter((r) => r.x <= xMax), "x"),
    [empStatic, xMax, displayStep]
  );
  const staticBasicITDisplay = useMemo(
    () => downsample(basicITStatic.filter((r) => r.income_axis <= xMax), "income_axis"),
    [basicITStatic, xMax, displayStep]
  );
  const staticBasicLTDisplay = useMemo(
    () => downsample(basicLTStatic.filter((r) => r.income_axis <= xMax), "income_axis"),
    [basicLTStatic, xMax, displayStep]
  );
  const staticSocialDisplay = useMemo(
    () => downsample(socialStatic.filter((r) => r.x <= xMax), "x"),
    [socialStatic, xMax, displayStep]
  );
  const taxTableDisplay = useMemo(
    () => downsample(taxTableStatic.filter((r) => (r.taxable ?? 0) <= taxXAxisMax), "taxable"),
    [taxTableStatic, displayStep, taxXAxisMax]
  );
  const staticEmpIncomeDisplay = useMemo(() => {
    if (!staticEmpDisplay || staticEmpDisplay.length === 0) return [];
    return staticEmpDisplay.map((r) => {
      const out = { x: r.x };
      scenarios.forEach((s) => {
        const emp = Number(r[`emp_${s.key}`]) || 0;
        out[`emp_${s.key}`] = emp;
        out[`income_${s.key}`] = Math.max(0, (Number(r.x) || 0) - emp);
      });
      return out;
    });
  }, [staticEmpDisplay]);

  // 表示用の最近傍ポイント（間引き済み配列で探索し、負荷を軽減）
  const displayRow = useMemo(() => {
    if (!dataDisplay || dataDisplay.length === 0) return null;
    let closest = dataDisplay[0];
    let minDiff = Math.abs((closest.income_axis ?? 0) - displaySalary);
    for (const r of dataDisplay) {
      const diff = Math.abs((r.income_axis ?? 0) - displaySalary);
      if (diff < minDiff) {
        minDiff = diff;
        closest = r;
      }
    }
    return closest;
  }, [dataDisplay, displaySalary]);

  // 固定タブの表示用1行
  const displayRowFixed = useMemo(() => {
    if (!staticReady) return null;
    const empRow = nearestRow(empStatic, "x", displaySalary);
    const basicITRow = nearestRow(basicITStatic, "income_axis", displaySalary);
    const basicLTRow = nearestRow(basicLTStatic, "income_axis", displaySalary);
    const socialRow = nearestRow(socialStatic, "x", displaySalary);
    if (!empRow || !basicITRow || !basicLTRow || !socialRow) return null;
    const row = { income_axis: displaySalary, total_income: displaySalary };
    scenarios.forEach((s) => {
      const emp = empRow[`emp_${s.key}`] ?? 0;
      const income = Math.max(0, displaySalary - emp);
      row[`emp_${s.key}`] = emp;
      row[`income_${s.key}`] = income;
      row[`gross_${s.key}`] = income;
      row[`basicIT_${s.key}`] = basicITRow[`basicIT_${s.key}`];
      row[`basicLT_${s.key}`] = basicLTRow.basicLT_common;
      row[`social_${s.key}`] = socialRow[`social_${s.key}`];
    });
    return row;
  }, [staticReady, empStatic, basicITStatic, basicLTStatic, socialStatic, displaySalary]);

  // 固定タブ：税額グラフは「課税所得 → 税額」の固定カーブなので、
  // 縦線ライン（万円）=「課税所得（万円）」として、その点の税額を表示する。
  const fixedTaxTableRow = useMemo(() => {
    if (!staticReady) return null;
    if (!taxTableStatic || taxTableStatic.length === 0) return null;
    const taxableWan = Math.max(0, Math.round(Number(displaySalary) || 0));
    const r = nearestRow(taxTableStatic, "taxable", taxableWan);
    const taxIT = Number(r?.tax_it) || 0;
    const taxLT = Number(r?.tax_lt) || 0;

    const out = {};
    scenarios.forEach((s) => {
      out[`taxIT_${s.key}`] = taxIT;
      out[`taxLT_${s.key}`] = taxLT;
    });
    return out;
  }, [staticReady, taxTableStatic, displaySalary]);

  const labelEvery = 200; // ラベル表示間隔（tick自体は1万円刻みで全て描画）
  const xTicksBasic = useMemo(() => {
    const upper = Math.max(0, xMax || 0);
    const count = Math.floor(upper / labelEvery) + 1;
    return Array.from({ length: count }, (_, i) => i * labelEvery);
  }, [xMax]);
  // グラフ比較は横軸を常に 0..xMax で見せたいので、ticks を明示して 0 が消えるのを防ぐ
  const xTicksTotal = useMemo(() => {
    const upper = Math.max(0, Number(xMax) || 0);
    const step = 50; // 50万円刻み
    const count = Math.floor(upper / step) + 1;
    return Array.from({ length: count }, (_, i) => i * step);
  }, [xMax]);
  // 縦軸は見やすさ優先で10万円刻み＋105万円の終点のみ表示
  const yTicksBasic = useMemo(
    () => {
      const ticks = [];
      for (let v = 0; v <= 100; v += 10) ticks.push(v);
      ticks.push(105);
      return ticks;
    },
    []
  );

  const scenarioText = (row, keyPrefix) => {
    if (!row) return "-";
    return scenarios
      .map((s) => `${s.label}: ${row[`${keyPrefix}${s.key}`] ?? "-"} 万円`)
      .join(" / ");
  };

  const fmtWan1 = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return "-";
    return (Math.round(n * 10) / 10).toFixed(1);
  };

  const round1 = (v) => Math.round((Number(v) || 0) * 10) / 10;

  const fmtAge = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return "-";
    return String(Math.round(n));
  };

  const renderBreakdownTable = (rowSource) => {
    const netS1 = Number(rowSource?.net_s1);
    const netS2 = Number(rowSource?.net_s2);
    const netS3 = Number(rowSource?.net_s3);
    const diffS1S2 = Number.isFinite(netS1) && Number.isFinite(netS2) ? netS1 - netS2 : null;
    const diffS2S3 = Number.isFinite(netS2) && Number.isFinite(netS3) ? netS2 - netS3 : null;
    const diffS1S3 = Number.isFinite(netS1) && Number.isFinite(netS3) ? netS1 - netS3 : null;

    const rows = [
      { kind: "val", label: "年齢（歳）", key: "age_", unit: "age" },
      { kind: "sep" },
      { kind: "val", label: "給与（A／縦線ライン）", key: "salary_", unit: "wan" },
      { kind: "val", label: "給与所得控除", key: "emp_", unit: "wan" },
      { kind: "val", label: "給与所得（B）", key: "incomeB_", unit: "wan" },
      { kind: "sep" },
      { kind: "val", label: "給与以外の所得（C）", key: "otherC_", unit: "wan" },
      { kind: "sep" },
      { kind: "val", label: "所得合計（D=B+C）", key: "incomeD_", unit: "wan" },
      { kind: "sep" },
      { kind: "val", label: "基礎控除（所得税）", key: "basicIT_", unit: "wan" },
      { kind: "val", label: "基礎控除（住民税）", key: "basicLT_", unit: "wan" },
      { kind: "val", label: "配偶者控除", key: "spouseDed_", unit: "wan" },
      { kind: "val", label: "配偶者特別控除", key: "spouseSpec_", unit: "wan" },
      { kind: "val", label: "寡婦控除", key: "widow_", unit: "wan" },
      { kind: "val", label: "ひとり親控除", key: "singleParent_", unit: "wan" },
      { kind: "val", label: "勤労学生控除", key: "workingStudent_", unit: "wan" },
      { kind: "val", label: "その他の控除", key: "otherDed_", unit: "wan" },
      { kind: "val", label: "控除計（E1／所得税）", key: "dedIT_", unit: "wan" },
      { kind: "val", label: "控除計（E2／住民税）", key: "dedLT_", unit: "wan" },
      { kind: "sep" },
      { kind: "val", label: "課税所得（F1=D-E1-G／所得税）", key: "taxableIT_", unit: "wan" },
      { kind: "val", label: "課税所得（F2=D-E2-G／住民税）", key: "taxableLT_", unit: "wan" },
      { kind: "sep" },
      { kind: "val", label: "社会保険料（G）", key: "social_", unit: "wan" },
      { kind: "val", label: "所得税", key: "taxIT_", unit: "wan" },
      { kind: "val", label: "住民税", key: "taxLT_", unit: "wan" },
      { kind: "val", label: "支払税の合計（H）", key: "payTotal_", unit: "wan" },
      { kind: "sep" },
      { kind: "val", label: "手取り額（A+C−H）", key: "net_", unit: "wan" },
      { kind: "val", label: "手取り額（月額換算）", key: "netMonthly_", unit: "wan" },
      { kind: "sep" },
      { kind: "title", label: "差分" },
      { kind: "diff", label: "S1 - S2", value: diffS1S2, place: "s2" },
      { kind: "diff", label: "S2 - S3", value: diffS2S3, place: "s3" },
      { kind: "diff", label: "S1 - S3", value: diffS1S3, place: "s3" },
    ];

    return (
      <div className="table-wrapper" style={{ marginBottom: 6 }}>
        <table className="result-table tight">
          <colgroup>
            <col style={{ width: "30%" }} />
            <col style={{ width: "23.3333%" }} />
            <col style={{ width: "23.3333%" }} />
            <col style={{ width: "23.3333%" }} />
          </colgroup>
          <thead>
            <tr>
              <th style={{ width: "30%" }}>項目</th>
              {scenarios.map((s) => (
                <th key={`head-${s.key}`}>{s.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => {
              if (r.kind === "sep") {
                return (
                  <tr key={`sep-${idx}`}>
                    <td colSpan={1 + scenarios.length} style={{ padding: 0 }}>
                      <div className="hr" style={{ margin: "8px 0" }} />
                    </td>
                  </tr>
                );
              }
              if (r.kind === "title") {
                return (
                  <tr key={`title-${idx}`}>
                    <td colSpan={1 + scenarios.length} style={{ fontWeight: 700, paddingTop: 4 }}>
                      {r.label}
                    </td>
                  </tr>
                );
              }
              if (r.kind === "diff") {
                return (
                  <tr key={`diff-${idx}`}>
                    <td>{r.label}</td>
                    {scenarios.map((s) => {
                      const show = s.key === r.place;
                      const n = Number(r.value);
                      const isNeg = show && Number.isFinite(n) && n < 0;
                      return (
                        <td key={`diff-${idx}-${s.key}`}>
                          {show ? <span className={isNeg ? "neg" : ""}>{fmtWan1(r.value)}</span> : "-"}
                        </td>
                      );
                    })}
                  </tr>
                );
              }
              return (
                <tr key={r.key}>
                  <td>{r.label}</td>
                  {scenarios.map((s) => {
                    const v = rowSource?.[`${r.key}${s.key}`];
                    const n = Number(v);
                    const isNeg = r.unit !== "age" && Number.isFinite(n) && n < 0;
                    return (
                      <td key={`${r.key}-${s.key}`}>
                        <span className={isNeg ? "neg" : ""}>
                          {r.unit === "age" ? fmtAge(v) : fmtWan1(v)}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  const renderScenarioTable = (rows, rowSource = displayRow) => (
    <div className="table-wrapper" style={{ marginBottom: 6 }}>
      <table className="result-table tight">
        <colgroup>
          <col style={{ width: "30%" }} />
          <col style={{ width: "23.3333%" }} />
          <col style={{ width: "23.3333%" }} />
          <col style={{ width: "23.3333%" }} />
        </colgroup>
        <thead>
          <tr>
            <th style={{ width: "30%" }}>項目</th>
            {scenarios.map((s) => (
              <th key={`head-${s.key}`}>{s.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td>{r.label}</td>
              {scenarios.map((s) => (
                <td key={`${r.key}-${s.key}`}>
                  {rowSource?.[`${r.key}${s.key}`] == null ? "-" : `${fmtWan1(rowSource?.[`${r.key}${s.key}`])} 万円`}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const ChartSection = ({ rows, rowSource, legendItems, children }) => (
    <>
      {renderScenarioTable(rows, rowSource)}
      <ChartLegend items={legendItems} />
      <div style={CHART_BOX_STYLE}>{children}</div>
    </>
  );

  const TaxCurveSection = ({ title, yLabel, curveKey, curveColor, markers = [], rows, rowSource }) => (
    <div>
      <div style={{ marginBottom: 8, fontWeight: "bold" }}>{title}</div>
      <ChartSection rows={rows} rowSource={rowSource} legendItems={[]}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={taxTableDisplay} margin={BASE_MARGIN}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="taxable"
              type="number"
              domain={[0, taxXAxisMax]}
              tickCount={tickCountX}
              label={{ value: "課税所得（万円/年）", position: "insideBottom", offset: -5 }}
            />
            <YAxis domain={[0, "dataMax"]} label={{ value: yLabel, angle: -90, position: "insideLeft" }} />
            {markers.map((m) => (
              <MarkerLineX
                key={`${title}-marker-${m.key}`}
                x={m.x}
                stroke={m.color}
                strokeDasharray="4 2"
              />
            ))}
            <Line type="linear" dataKey={curveKey} stroke={curveColor} {...LINE_PROPS} />
          </LineChart>
        </ResponsiveContainer>
      </ChartSection>
    </div>
  );

  const netRange = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    data.forEach((row) => {
      scenarios.forEach((s) => {
        const v = Number(row[`net_${s.key}`]);
        if (!Number.isFinite(v)) return;
        min = Math.min(min, v);
        max = Math.max(max, v);
      });
    });
    if (min === Infinity || max === -Infinity) return { min: 0, max: 0 };
    return { min, max };
  }, [data]);

  const netDomain = useMemo(() => {
    // 50万円刻みで見やすく。負の値も表示するため min 側も確保。
    const step = 50;
    const lo = Math.min(0, Number(netRange.min) || 0);
    const hi = Math.max(0, Number(netRange.max) || 0);
    const min = Math.floor(lo / step) * step;
    const max = Math.ceil(hi / step) * step;
    return [min, max];
  }, [netRange]);

  // 「縦線ライン（数値表示）」に合わせた計算内訳（入力反映タブ用：ルール計算）
  const breakdownDynamic = useMemo(() => {
    if (!staticReady) return {};
    const out = {};
    const salaryWan = Number(displaySalary) || 0;
    const otherWan = Number(otherIncome) || 0;
    const ageVal = Number(age) || 0;

    const spouseDedWan = Number(spouseDedInput) || 0;
    const spouseSpecWan = Number(spouseSpecInput) || 0;
    const widowWan = Number(deductions.widow) || 0;
    const singleParentWan = Number(deductions.singleParent) || 0;
    const workingStudentWan = Number(deductions.workingStudent) || 0;
    const otherDedWan = Number(deductions.otherDed) || 0;

    const dedBaseCommonWan =
      spouseDedWan +
      spouseSpecWan +
      widowWan +
      singleParentWan +
      workingStudentWan +
      otherDedWan;

    const empRow = rowAtKeyInt(empStatic, "x", Math.round(salaryWan));
    const socialRow = rowAtKeyInt(socialStatic, "x", Math.round(salaryWan));

    scenarios.forEach((s) => {
      out[`age_${s.key}`] = ageVal;
      out[`salary_${s.key}`] = salaryWan;

      // 以降、単位はすべて「万円」。
      const empWan = Number(empRow?.[`emp_${s.key}`]) || 0;
      const incomeB = Math.max(0, salaryWan - empWan); // 給与所得（B）
      const incomeD = incomeB + otherWan; // 所得合計（D）

      const basicITRow = rowAtKeyInt(basicITStatic, "income_axis", Math.round(incomeD));
      const basicLTRow = rowAtKeyInt(basicLTStatic, "income_axis", Math.round(incomeD));
      const basicITWan = Number(basicITRow?.[`basicIT_${s.key}`]) || 0;
      const basicLTWan = Number(basicLTRow?.basicLT_common) || 0;

      const socialWan = Number(socialRow?.[`social_${s.key}`]) || 0;

      const dedITWan = dedBaseCommonWan + basicITWan; // E1
      const dedLTWan = dedBaseCommonWan + basicLTWan; // E2

      const taxableITWan = Math.max(0, incomeD - socialWan - dedITWan); // F1
      const taxableLTWan = Math.max(0, incomeD - socialWan - dedLTWan); // F2

      const taxITWan = interpTableValue(taxTableStatic, "taxable", taxableITWan, "tax_it");
      const taxLTWan = interpTableValue(taxTableStatic, "taxable", taxableLTWan, "tax_lt");

      const payTotal = socialWan + taxITWan + taxLTWan; // H（支払合計）
      const gross = salaryWan + otherWan;
      const net = gross - payTotal;

      out[`emp_${s.key}`] = empWan;
      out[`incomeB_${s.key}`] = incomeB;
      out[`otherC_${s.key}`] = otherWan;
      out[`incomeD_${s.key}`] = incomeD;

      out[`basicIT_${s.key}`] = basicITWan;
      out[`basicLT_${s.key}`] = basicLTWan;
      out[`spouseDed_${s.key}`] = spouseDedWan;
      out[`spouseSpec_${s.key}`] = spouseSpecWan;
      out[`widow_${s.key}`] = widowWan;
      out[`singleParent_${s.key}`] = singleParentWan;
      out[`workingStudent_${s.key}`] = workingStudentWan;
      out[`otherDed_${s.key}`] = otherDedWan;
      out[`dedIT_${s.key}`] = dedITWan;
      out[`dedLT_${s.key}`] = dedLTWan;

      out[`taxableIT_${s.key}`] = taxableITWan;
      out[`taxableLT_${s.key}`] = taxableLTWan;

      out[`social_${s.key}`] = socialWan;
      out[`taxIT_${s.key}`] = taxITWan;
      out[`taxLT_${s.key}`] = taxLTWan;
      out[`payTotal_${s.key}`] = payTotal;
      out[`net_${s.key}`] = net;
      out[`netMonthly_${s.key}`] = round1(net / 12);
    });

    return out;
  }, [staticReady, empStatic, basicITStatic, basicLTStatic, socialStatic, taxTableStatic, displaySalary, otherIncome, age, spouseDedInput, spouseSpecInput, deductions]);

  // 棒グラフ用: (給与+給与以外) を 100 としたときの内訳割合（%）
  const ratioBarData = useMemo(() => {
    const gross = (Number(displaySalary) || 0) + (Number(otherIncome) || 0); // 万円
    if (gross === 0) {
      return scenarios.map((s) => ({
        scenario: s.label,
        netPct: 0,
        socialPct: 0,
        taxITPct: 0,
        taxLTPct: 0,
      }));
    }

    return scenarios.map((s) => {
      const social = Number(breakdownDynamic?.[`social_${s.key}`]) || 0;
      const taxIT = Number(breakdownDynamic?.[`taxIT_${s.key}`]) || 0;
      const taxLT = Number(breakdownDynamic?.[`taxLT_${s.key}`]) || 0;

      // 端数誤差で 100 からズレないよう、net は残差で決める（表示は小数1桁）
      const socialPct = round1((social / gross) * 100);
      const taxITPct = round1((taxIT / gross) * 100);
      const taxLTPct = round1((taxLT / gross) * 100);
      const netPct = round1(100 - (socialPct + taxITPct + taxLTPct));

      return {
        scenario: s.label,
        netPct,
        socialPct,
        taxITPct,
        taxLTPct,
      };
    });
  }, [breakdownDynamic, displaySalary, otherIncome]);

  // 「所得の合計=100%」の内訳を、所得の合計（横軸）に対して面グラフで表示
  const ratioAreaData = useMemo(() => {
    if (!dataDisplay || dataDisplay.length === 0) return [];
    const sKey = ratioScenario;
    return dataDisplay.map((r) => {
      const gross = Number(r.total_income) || 0; // 万円
      if (gross <= 0) {
        return { total_income: r.total_income ?? 0, netPct: 0, socialPct: 0, taxITPct: 0, taxLTPct: 0 };
      }
      const net = Number(r[`net_${sKey}`]) || 0;
      const social = Number(r[`social_${sKey}`]) || 0;
      const taxIT = Number(r[`taxIT_${sKey}`]) || 0;
      const taxLT = Number(r[`taxLT_${sKey}`]) || 0;
      const toPct = (v) => (v / gross) * 100;
      return {
        total_income: Number(r.total_income) || 0,
        netPct: toPct(net),
        socialPct: toPct(social),
        taxITPct: toPct(taxIT),
        taxLTPct: toPct(taxLT),
      };
    });
  }, [dataDisplay, ratioScenario]);

  return (
    <div className="App page deduction-graph">
      <h1 className="App-title">手取額シミュレーター</h1>
      <div className="tab-bar">
        <button
          className={`tab-btn ${viewTab === "inputs" ? "active" : ""}`}
          onClick={() => setViewTab("inputs")}
        >
          前提・描画入力
        </button>
        <button
          className={`tab-btn ${viewTab === "fixed" ? "active" : ""}`}
          onClick={() => setViewTab("fixed")}
        >
          固定情報グラフ
        </button>
        <button
          className={`tab-btn ${viewTab === "dynamic" ? "active" : ""}`}
          onClick={() => setViewTab("dynamic")}
        >
          入力反映グラフ
        </button>
      </div>

      <div className="scenario-legend">
        {scenarios.map((s) => (
          <span key={s.key}>
            <strong>{s.label}</strong>: {s.desc}
          </span>
        ))}
      </div>

      {viewTab === "inputs" && (
        <div className="inputs-wrap">
          <div className="card mb" style={{ paddingBottom: 12 }}>
            <h2 className="mt0">前提設定</h2>
            <div className="grid3-compact" style={{ gap: 12, marginTop: 4 }}>
              <div className="row" style={{ margin: 0 }}>
                <label>年齢</label>
                <input
                  type="number"
                  min={0}
                  max={99}
                  step={1}
                  value={ageDraft}
                  onChange={nsetDraft(setAgeDraft)}
                />
              </div>

              <div className="row" style={{ margin: 0 }}>
                <label>給与以外の所得（万円）</label>
                <input
                  type="number"
                  step={1}
                  value={otherIncomeDraft}
                  onChange={nsetDraft(setOtherIncomeDraft)}
                  placeholder="万円/年"
                />
              </div>

              <div className="row" style={{ margin: 0 }}>
                <label>配偶者控除</label>
                <select value={spouseDedDraft} onChange={(e) => setSpouseDedDraft(Number(e.target.value))}>
                  {[0, 48, 38, 32, 26, 16, 13].map((v) => (
                    <option key={v} value={v}>{v} 万円</option>
                  ))}
                </select>
              </div>

              <div className="row" style={{ margin: 0 }}>
                <label>配偶者特別控除</label>
                <select value={spouseSpecDraft} onChange={(e) => setSpouseSpecDraft(Number(e.target.value))}>
                  {[0,38,36,31,26,24,21,18,16,14,13,12,11,9,8,7,6,4,3,2,1].map((v) => (
                    <option key={v} value={v}>{v} 万円</option>
                  ))}
                </select>
              </div>

              <div className="row">
                <label>寡婦控除</label>
                <select value={deductionsDraft.widow} onChange={nsetDedDraft("widow")}>
                  {[0, 27].map((v) => (
                    <option key={v} value={v}>{v} 万円</option>
                  ))}
                </select>
              </div>

              <div className="row">
                <label>ひとり親控除</label>
                <select value={deductionsDraft.singleParent} onChange={nsetDedDraft("singleParent")}>
                  {[0, 35].map((v) => (
                    <option key={v} value={v}>{v} 万円</option>
                  ))}
                </select>
              </div>

              <div className="row">
                <label>勤労学生控除</label>
                <select value={deductionsDraft.workingStudent} onChange={nsetDedDraft("workingStudent")}>
                  {[0, 27].map((v) => (
                    <option key={v} value={v}>{v} 万円</option>
                  ))}
                </select>
              </div>

              <div className="row">
                <label>その他の控除（万円）</label>
                <input type="number" step={1} value={deductionsDraft.otherDed} onChange={nsetDedDraft("otherDed")} />
              </div>
            </div>
          </div>

          <div className="card mb" style={{ paddingBottom: 12 }}>
            <h2 className="mt0">描画設定</h2>
            <div className="grid1-compact" style={{ gap: 12, marginTop: 4 }}>
              <div className="slider-field">
                <label>横軸の最大値（万円）</label>
                <div className="slider-line">
                  <input
                    type="range"
                    min={0}
                    max={3000}
                    step={1}
                    value={xMaxDraft}
                    onChange={nsetDraft(setXMaxDraft)}
                    style={{ width: "100%" }}
                  />
                </div>
                <div className="slider-value">{xMaxDraft} 万円</div>
              </div>

              <div className="slider-field">
                <label>数値表示の初期値（万円）</label>
                <div className="slider-line">
                  <input
                    type="range"
                    min={0}
                    max={Number(xMaxDraft) || 0}
                    step={1}
                    value={displaySalaryDraft ?? 0}
                    onChange={nsetDraft(setDisplaySalaryDraft)}
                    style={{ width: "100%" }}
                  />
                </div>
                <div className="slider-value">{displaySalaryDraft} 万円</div>
              </div>
            </div>
          </div>

          <div className="inputs-actions">
            <button className="primary-btn primary-btn-lg" onClick={applyDraft}>再描画</button>
          </div>
          {/* スマホで固定フッターと被らないよう、下側に余白を確保 */}
          <div className="footer-spacer" aria-hidden="true" />
        </div>
      )}

      <div className="footer-fixed">
        <div className="footer-inner">
          <div className="footer-row">
            <div className="footer-label">縦線ライン</div>
            <div className="footer-slider">
              <input
                type="range"
                min={0}
                max={xMax || 0}
                step={1}
                value={displaySalary ?? 0}
                onChange={(e) => setDisplaySalary(Number(e.target.value) || 0)}
                style={{ flex: 1 }}
              />
              <span style={{ minWidth: 60, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                {displaySalary} 万円
              </span>
            </div>
          </div>
        </div>
      </div>

      {viewTab === "fixed" && (
        <>
          {!staticReady && <div className="card mb">静的データを読み込み中...</div>}
          {staticReady && (
            <>
              <div className="card mb">
                <div className="grid2" style={{ gap: 12 }}>
                  <div>
                    <div style={{ marginBottom: 8, fontWeight: "bold" }}>給与所得控除</div>
                    <ChartSection
                      rows={[{ label: "給与所得控除", key: "emp_" }]}
                      rowSource={displayRowFixed}
                      legendItems={scenarios.map((s) => ({ label: s.label, color: s.color }))}
                    >
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={staticEmpIncomeDisplay} margin={BASE_MARGIN}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis
                            dataKey="x"
                            type="number"
                            domain={[0, xMax]}
                            tickCount={tickCountX}
                            label={{ value: "主の給与（万円/年）", position: "insideBottom", offset: -5 }}
                          />
                          <YAxis domain={[0, "dataMax"]} label={{ value: "給与所得控除（万円）", angle: -90, position: "insideLeft" }} />
                          <MarkerLineX x={displaySalary} />
                          {scenarios.map((s) => (
                            <Line key={`emp-${s.key}`} type="linear" dataKey={`emp_${s.key}`} name={s.label} stroke={s.color} {...LINE_PROPS} />
                          ))}
                        </LineChart>
                      </ResponsiveContainer>
                    </ChartSection>
                  </div>
                  <div>
                    <div style={{ marginBottom: 8, fontWeight: "bold" }}>給与所得 = 給与 − 給与所得控除</div>
                    <ChartSection
                      rows={[{ label: "給与所得", key: "income_" }]}
                      rowSource={displayRowFixed}
                      legendItems={[
                        ...scenarios.map((s) => ({ label: s.label, color: s.color })),
                        { label: "y=x（給与そのまま）", color: "#9e9e9e", dash: true },
                      ]}
                    >
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={staticEmpIncomeDisplay} margin={BASE_MARGIN}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis
                            dataKey="x"
                            type="number"
                            domain={[0, xMax]}
                            tickCount={tickCountX}
                            label={{ value: "主の給与（万円/年）", position: "insideBottom", offset: -5 }}
                          />
                          <YAxis domain={[0, "dataMax"]} label={{ value: "給与所得（万円）", angle: -90, position: "insideLeft" }} />
                          <Line {...DIAG_X_PROPS} />
                          <MarkerLineX x={displaySalary} />
                          {scenarios.map((s) => (
                            <Line key={`inc-${s.key}`} dataKey={`income_${s.key}`} name={s.label} stroke={s.color} {...LINE_PROPS} />
                          ))}
                        </LineChart>
                      </ResponsiveContainer>
                    </ChartSection>
                  </div>
                </div>
              </div>

              <div className="card">
                <div className="grid2" style={{ gap: 12 }}>
                  <div>
                    <div style={{ marginBottom: 8, fontWeight: "bold" }}>基礎控除（所得税）</div>
                    <ChartSection
                      rows={[{ label: "基礎控除(所得税)", key: "basicIT_" }]}
                      rowSource={displayRowFixed}
                      legendItems={scenarios.map((s) => ({ label: s.label, color: s.color }))}
                    >
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={staticBasicITDisplay} margin={BASE_MARGIN}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                          <XAxis
                            dataKey="income_axis"
                            type="number"
                            scale="linear"
                            domain={[0, xMax]}
                            ticks={xTicksBasic}
                            interval={0}
                            tickMargin={2}
                            tickFormatter={(v) => v}
                            label={{ value: "所得（万円/年）", position: "insideBottom", offset: -5 }}
                          />
                          <YAxis
                            domain={[0, 105]}
                            ticks={yTicksBasic}
                            tickCount={yTicksBasic.length}
                            label={{ value: "基礎控除（万円）", angle: -90, position: "insideLeft" }}
                          />
                          <MarkerLineX x={displaySalary} />
                          {scenarios.map((s) => (
                            <Line key={`basicIT-${s.key}`} type="linear" dataKey={`basicIT_${s.key}`} name={s.label} stroke={s.color} {...LINE_PROPS} />
                          ))}
                        </LineChart>
                      </ResponsiveContainer>
                    </ChartSection>
                  </div>
                  <div>
                    <div style={{ marginBottom: 8, fontWeight: "bold" }}>基礎控除（住民税）</div>
                    <ChartSection
                      rows={[{ label: "基礎控除(住民税)", key: "basicLT_" }]}
                      rowSource={displayRowFixed}
                      legendItems={[{ label: "共通", color: "#009688" }]}
                    >
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={staticBasicLTDisplay} margin={BASE_MARGIN}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                          <XAxis
                            dataKey="income_axis"
                            type="number"
                            scale="linear"
                            domain={[0, xMax]}
                            ticks={xTicksBasic}
                            interval={0}
                            tickMargin={2}
                            tickFormatter={(v) => v}
                            label={{ value: "所得（万円/年）", position: "insideBottom", offset: -5 }}
                          />
                          <YAxis
                            domain={[0, 105]}
                            ticks={yTicksBasic}
                            tickCount={yTicksBasic.length}
                            label={{ value: "基礎控除（万円）", angle: -90, position: "insideLeft" }}
                          />
                          <MarkerLineX x={displaySalary} />
                          <Line type="linear" dataKey="basicLT_common" name="住民税基礎控除（共通）" stroke="#009688" {...LINE_PROPS} />
                        </LineChart>
                      </ResponsiveContainer>
                    </ChartSection>
                  </div>
                </div>
              </div>

              <div className="card mb">
                <div className="grid2" style={{ gap: 12 }}>
                  <TaxCurveSection
                    title="所得税額"
                    yLabel="所得税額（万円）"
                    curveKey="tax_it"
                    curveColor="#6A74B8"
                    rows={[
                      { label: "所得税額", key: "taxIT_" },
                    ]}
                    rowSource={fixedTaxTableRow}
                    markers={[{ key: "x", x: displaySalary, color: MARKER_LINE_COLOR }]}
                  />
                  <TaxCurveSection
                    title="住民税額"
                    yLabel="住民税額（万円）"
                    curveKey="tax_lt"
                    curveColor="#D67A9A"
                    rows={[
                      { label: "住民税額", key: "taxLT_" },
                    ]}
                    rowSource={fixedTaxTableRow}
                    markers={[{ key: "x", x: displaySalary, color: MARKER_LINE_COLOR }]}
                  />
                </div>
              </div>

              <div className="card mb">
                <h2 className="mt0">社会保険料（本人負担の目安）</h2>
                <ChartSection
                  rows={[{ label: "社会保険料", key: "social_" }]}
                  rowSource={displayRowFixed}
                  legendItems={scenarios.map((s) => ({ label: s.label, color: s.color }))}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={staticSocialDisplay} margin={BASE_MARGIN}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="x"
                        type="number"
                        domain={[0, xMax]}
                        tickCount={tickCountX}
                        label={{ value: "主の給与（万円/年）", position: "insideBottom", offset: -5 }}
                      />
                      <YAxis domain={[0, "dataMax"]} label={{ value: "社会保険料（万円）", angle: -90, position: "insideLeft" }} />
                      <MarkerLineX x={displaySalary} />
                      {scenarios.map((s) => (
                        <Line key={`soc-${s.key}`} dataKey={`social_${s.key}`} name={s.label} stroke={s.color} {...LINE_PROPS} />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </ChartSection>
              </div>
            </>
          )}
        </>
      )}

      {viewTab === "dynamic" && (
        <>
          <div className="card mb">
            <h2 className="mt0">計算内訳（万円）</h2>
            {renderBreakdownTable(breakdownDynamic)}
          </div>

          <div className="card mb">
            <h2 className="mt0">グラフ比較</h2>
            <ChartLegend items={scenarios.map((s) => ({ label: s.label, color: s.color }))} />
            <div style={CHART_STYLE}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dataNetDisplay} margin={BASE_MARGIN}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="total_income"
                    type="number"
                    scale="linear"
                    domain={[0, Number(xMax) || 0]}
                    allowDataOverflow
                    ticks={xTicksTotal}
                    tickMargin={2}
                    label={{ value: "所得の合計（給与所得控除前）（万円/年）", position: "insideBottom", offset: -5 }}
                  />
                  <YAxis
                    domain={netDomain}
                    label={{ value: "手取り額（万円）", angle: -90, position: "insideLeft" }}
                  />
                  <ReferenceLine y={0} stroke="#9e9e9e" strokeDasharray="4 2" />
                  <MarkerLineX x={displaySalary} />
                  {scenarios.map((s) => (
                    <Line
                      key={`net-total-${s.key}`}
                      type="linear"
                      dataKey={`net_${s.key}`}
                      name={s.label}
                      stroke={s.color}
                      {...LINE_PROPS}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card mb">
            <h2 className="mt0">割合（所得の合計=100%）</h2>
            <div className="tab-bar" style={{ marginTop: 6 }}>
              {scenarios.map((s) => (
                <button
                  key={`ratio-${s.key}`}
                  className={`tab-btn ${ratioScenario === s.key ? "active" : ""}`}
                  onClick={() => setRatioScenario(s.key)}
                  type="button"
                >
                  {s.label}
                </button>
              ))}
            </div>
            <ChartLegend
              items={[
                { label: "手取り(net)", color: "#4F93C0" },     // 濃いめ水色（やや落ち着かせる）
                { label: "社会保険料", color: "#E3A6B8" },      // 優しいピンク
                { label: "所得税", color: "#D79A55" },          // 優しい濃オレンジ
                { label: "住民税", color: "#E8C59A" },          // 優しい薄オレンジ
              ]}
            />
            <div style={CHART_STYLE}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={ratioAreaData} margin={BASE_MARGIN}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="total_income"
                    type="number"
                    scale="linear"
                    domain={[0, Number(xMax) || 0]}
                    allowDataOverflow
                    ticks={xTicksTotal}
                    tickMargin={2}
                    label={{ value: "所得の合計（万円/年）", position: "insideBottom", offset: -5 }}
                  />
                  <YAxis
                    domain={[0, 100]}
                    allowDataOverflow
                    ticks={[0, 20, 40, 60, 80, 100]}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <ReferenceLine y={0} stroke="#9e9e9e" strokeDasharray="4 2" />
                  <MarkerLineX x={displaySalary} />
                  <Area
                    type="linear"
                    dataKey="netPct"
                    stackId="a"
                    stroke="#4F93C0"
                    fill="#4F93C0"
                    fillOpacity={0.25}
                    dot={false}
                    activeDot={false}
                    isAnimationActive={false}
                  />
                  <Area
                    type="linear"
                    dataKey="socialPct"
                    stackId="a"
                    stroke="#E3A6B8"
                    fill="#E3A6B8"
                    fillOpacity={0.25}
                    dot={false}
                    activeDot={false}
                    isAnimationActive={false}
                  />
                  <Area
                    type="linear"
                    dataKey="taxITPct"
                    stackId="a"
                    stroke="#D79A55"
                    fill="#D79A55"
                    fillOpacity={0.25}
                    dot={false}
                    activeDot={false}
                    isAnimationActive={false}
                  />
                  <Area
                    type="linear"
                    dataKey="taxLTPct"
                    stackId="a"
                    stroke="#E8C59A"
                    fill="#E8C59A"
                    fillOpacity={0.25}
                    dot={false}
                    activeDot={false}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}

    </div>
  );
}
