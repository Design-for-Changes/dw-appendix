import "../App.css";
import { useMemo, useState } from "react";
import spouseDeductionITCfg from "../config/spouse_deduction_it.json";
import spouseDeductionLTCfg from "../config/spouse_deduction_lt.json";
import spouseSpecialDeductionITCfg from "../config/spouse_special_deduction_it.json";
import spouseSpecialDeductionLTCfg from "../config/spouse_special_deduction_lt.json";
import dependentDeductionCfg from "../config/dependent_deduction.json";
import specialKinDeductionITCfg from "../config/special_kin_deduction_it.json";
import specialKinDeductionLTCfg from "../config/special_kin_deduction_lt.json";
import widowDeductionCfg from "../config/widow_deduction.json";
import singleParentDeductionCfg from "../config/single_parent_deduction.json";
import workingStudentDeductionCfg from "../config/working_student_deduction.json";
import disabilityDeductionCfg from "../config/disability_deduction.json";
import { computeSeries, buildHousehold } from "../calc/computePoint";
import { explainCliffCauses } from "../calc/cliffCauseAnalysis";
import { useStaticTables } from "../hooks/useStaticTables";

const X_MIN = 200;
const X_MAX = 1400;
const COLORS = ["#2358a6", "#8f3d67", "#2f6f5e"];

const CONFIDENCE = {
  strict: {
    label: "厳密",
    note: "独立計算またはコア系列で確定した制度境界。",
  },
  representative: {
    label: "代表値",
    note: "M01の高さは伊勢原市H29決算の代表値。感度レンジ 149,531〜167,929円/年。",
  },
  provisional: {
    label: "暫定",
    note: "N04は住宅扶助・生活扶助・需要額調書・控除扱いの未確定点を残す代表設定。",
  },
  scope: {
    label: "表示帯",
    note: "表示帯200万〜1400万は、社保近似の有効域（最低等級の床・加入閾値を上回る帯）に限定している。",
  },
};

const COMMON_HOUSEHOLD = {
  spouseEnabled: true,
  head: { age: 45 },
  spouse: { age: 45 },
};

const PRESENTATION_CASES = [
  {
    id: "case1",
    label: "ケース1",
    shortLabel: "子1人",
    description: "7歳・特児1級・特別障害・障害児福祉手当あり",
    minDropManyen: 2.5,
    household: {
      ...COMMON_HOUSEHOLD,
      programs: {
        m01: true,
        m01Count: 1,
        n04: true,
        n04Count: 1,
        n04Boundary12SalaryManyen: 749,
        n04Boundary23SalaryManyen: 1082,
      },
      children: [
        {
          age: 7,
          disabled: true,
          specialDisabled: true,
          cohabit: true,
          tccaGrade: "1",
          childWelfareAllowance: true,
        },
      ],
    },
    causes: [
      { x: 260, label: "障害児通所支援 非課税→一般1", confidence: "strict" },
      { x: 749, label: "N04 就学奨励費 第1→第2", confidence: "provisional" },
      { x: 782, label: "特別児童扶養手当", confidence: "strict" },
      { x: 842, label: "M01 重心医療費助成", confidence: "representative" },
      { x: 928, label: "障害児福祉手当", confidence: "strict" },
      { x: 932, label: "障害児通所支援", confidence: "strict" },
      { x: 1082, label: "N04 就学奨励費 第2→第3", confidence: "provisional" },
    ],
  },
  {
    id: "case2",
    label: "ケース2",
    shortLabel: "子2人・混合",
    description: "11歳1級特別＋7歳2級一般。福祉手当・M01・N04は1人分",
    minDropManyen: 2.5,
    household: {
      ...COMMON_HOUSEHOLD,
      programs: {
        m01: true,
        m01Count: 1,
        n04: true,
        n04Count: 1,
        n04Boundary12SalaryManyen: 749,
        n04Boundary23SalaryManyen: 1082,
      },
      children: [
        {
          age: 11,
          disabled: true,
          specialDisabled: true,
          cohabit: true,
          tccaGrade: "1",
          childWelfareAllowance: true,
        },
        {
          age: 7,
          disabled: true,
          specialDisabled: false,
          cohabit: true,
          tccaGrade: "2",
        },
      ],
    },
    causes: [
      { x: 307, label: "障害児通所支援 非課税→一般1", confidence: "strict" },
      { x: 749, label: "N04 就学奨励費 第1→第2", confidence: "provisional" },
      { x: 854, label: "特別児童扶養手当", confidence: "strict" },
      { x: 873, label: "M01 重心医療費助成", confidence: "representative" },
      { x: 950, label: "障害児福祉手当", confidence: "strict" },
      { x: 963, label: "障害児通所支援", confidence: "strict" },
      { x: 1082, label: "N04 就学奨励費 第2→第3", confidence: "provisional" },
    ],
  },
  {
    id: "case3",
    label: "ケース3",
    shortLabel: "子2人・重複",
    description: "11歳・7歳とも特児1級・特別障害。福祉手当・M01・N04は2人分",
    minDropManyen: 2.5,
    household: {
      ...COMMON_HOUSEHOLD,
      programs: {
        m01: true,
        m01Count: 2,
        n04: true,
        n04Count: 2,
        n04Boundary12SalaryManyen: 749,
        n04Boundary23SalaryManyen: 1082,
      },
      children: [
        {
          age: 11,
          disabled: true,
          specialDisabled: true,
          cohabit: true,
          tccaGrade: "1",
          childWelfareAllowance: true,
        },
        {
          age: 7,
          disabled: true,
          specialDisabled: true,
          cohabit: true,
          tccaGrade: "1",
          childWelfareAllowance: true,
        },
      ],
    },
    causes: [
      { x: 356, label: "障害児通所支援 非課税→一般1", confidence: "strict" },
      { x: 749, label: "N04 就学奨励費 第1→第2", confidence: "provisional" },
      { x: 867, label: "特別児童扶養手当", confidence: "strict" },
      { x: 906, label: "M01 重心医療費助成", confidence: "representative" },
      { x: 990, label: "障害児福祉手当", confidence: "strict" },
      { x: 995, label: "障害児通所支援", confidence: "strict" },
      { x: 1082, label: "N04 就学奨励費 第2→第3", confidence: "provisional" },
    ],
  },
];

const IDEAL_CASE = {
  id: "ideal",
  label: "第4ケース",
  shortLabel: "全体最適モデル",
  description: "崖なし、または大幅緩和した制度設計を後入れする枠。",
  pending: true,
};

function makeTables(staticTables) {
  return {
    emp: staticTables.empStatic,
    basicIT: staticTables.basicITStatic,
    basicLT: staticTables.basicLTStatic,
    socialU40: staticTables.socialU40Static,
    socialO40: staticTables.socialO40Static,
    configs: {
      spouseDeductionITCfg,
      spouseDeductionLTCfg,
      spouseSpecialDeductionITCfg,
      spouseSpecialDeductionLTCfg,
      dependentDeductionCfg,
      specialKinDeductionITCfg,
      specialKinDeductionLTCfg,
      widowDeductionCfg,
      singleParentDeductionCfg,
      workingStudentDeductionCfg,
      disabilityDeductionCfg,
    },
  };
}

function fmt(n, digits = 0) {
  if (!Number.isFinite(Number(n))) return "—";
  return Number(n).toLocaleString("ja-JP", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function fmtWan(n, digits = 1) {
  return `${fmt(n, digits)}万`;
}

function fmtYen(n) {
  if (!Number.isFinite(Number(n))) return "—";
  return `${Math.round(Number(n)).toLocaleString("ja-JP")}円`;
}

function confidenceBadge(kind) {
  return CONFIDENCE[kind] || CONFIDENCE.strict;
}

function findQ(series, cliffIndex, yAfter) {
  for (let i = cliffIndex - 1; i >= 0; i -= 1) {
    const point = series[i];
    if (Number(point.disposable) <= yAfter) return point;
  }
  return null;
}

function findR(series, cliffIndex, yBefore) {
  for (let i = cliffIndex + 1; i < series.length; i += 1) {
    const point = series[i];
    if (Number(point.disposable) >= yBefore) return point;
  }
  return null;
}

function detectCliffs(series, caseDef) {
  const rows = [];
  for (let i = 1; i < series.length; i += 1) {
    const prev = series[i - 1];
    const cur = series[i];
    if (cur.x < X_MIN || cur.x > X_MAX) continue;
    const delta = Number(cur.disposable) - Number(prev.disposable);
    if (delta > -Number(caseDef.minDropManyen || 3)) continue;

    const yBefore = Number(prev.disposable);
    const yAfter = Number(cur.disposable);
    const q = findQ(series, i, yAfter);
    const r = findR(series, i, yBefore);
    const yAtMax = Number(series.find((p) => p.x === X_MAX)?.disposable ?? series[series.length - 1]?.disposable);
    const causes = explainCliffCauses(prev, cur);
    rows.push({
      index: rows.length + 1,
      x: Number(cur.x),
      yBefore,
      yAfter,
      drop: delta,
      causes,
      q,
      r,
      unrecoveredShortfall: r ? 0 : Math.max(0, yBefore - yAtMax),
    });
  }
  return rows;
}

function buildPath(points, xScale, yScale) {
  const visible = points.filter((p) => p.x >= X_MIN && p.x <= X_MAX);
  return visible.map((p, i) => `${i === 0 ? "M" : "L"} ${xScale(p.x).toFixed(2)} ${yScale(p.disposable).toFixed(2)}`).join(" ");
}

function pointAt(series, salaryWan) {
  const x = Math.max(X_MIN, Math.min(X_MAX, Math.round(Number(salaryWan) || 0)));
  return series.find((p) => Number(p.x) === x) || series.reduce((best, p) => (Math.abs(p.x - x) < Math.abs(best.x - x) ? p : best), series[0]);
}

function Graph({ data, selectedId, selectedSalary, onSalaryChange }) {
  const width = 1040;
  const height = 560;
  const pad = { left: 66, right: 28, top: 26, bottom: 62 };
  const allVisible = data.flatMap((d) => d.series.filter((p) => p.x >= X_MIN && p.x <= X_MAX));
  const yMinRaw = Math.min(...allVisible.map((p) => Number(p.disposable)));
  const yMaxRaw = Math.max(...allVisible.map((p) => Number(p.disposable)));
  const yMin = Math.floor((yMinRaw - 20) / 50) * 50;
  const yMax = Math.ceil((yMaxRaw + 20) / 50) * 50;
  const xScale = (x) => pad.left + ((Number(x) - X_MIN) / (X_MAX - X_MIN)) * (width - pad.left - pad.right);
  const yScale = (y) => pad.top + ((yMax - Number(y)) / (yMax - yMin)) * (height - pad.top - pad.bottom);
  const salaryFromClientX = (clientX, svg) => {
    const rect = svg.getBoundingClientRect();
    const viewX = ((clientX - rect.left) / rect.width) * width;
    const t = (viewX - pad.left) / (width - pad.left - pad.right);
    return Math.max(X_MIN, Math.min(X_MAX, Math.round(X_MIN + t * (X_MAX - X_MIN))));
  };
  const selected = data.find((d) => d.id === selectedId);
  const selectedPoint = selected ? pointAt(selected.series, selectedSalary) : null;
  const xTicks = [200, 400, 600, 800, 1000, 1200, 1400];
  const yTicks = Array.from({ length: 6 }, (_, i) => yMin + ((yMax - yMin) / 5) * i);

  const moveLine = (event) => {
    if (!event.currentTarget) return;
    onSalaryChange(salaryFromClientX(event.clientX, event.currentTarget));
  };

  return (
    <svg
      className="appendix-chart"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="給与と可処分所得の関係。縦線は選択給与を示す。"
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        moveLine(event);
      }}
      onPointerMove={(event) => {
        if (event.buttons === 1) moveLine(event);
      }}
    >
      <rect className="appendix-chart-bg" x="0" y="0" width={width} height={height} />
      {yTicks.map((t) => (
        <g key={`y-${t}`}>
          <line className="appendix-grid" x1={pad.left} x2={width - pad.right} y1={yScale(t)} y2={yScale(t)} />
          <text className="appendix-axis-label" x={pad.left - 10} y={yScale(t) + 4} textAnchor="end">
            {fmt(t)}
          </text>
        </g>
      ))}
      {xTicks.map((t) => (
        <g key={`x-${t}`}>
          <line className="appendix-grid appendix-grid-x" x1={xScale(t)} x2={xScale(t)} y1={pad.top} y2={height - pad.bottom} />
          <text className="appendix-axis-label" x={xScale(t)} y={height - 24} textAnchor="middle">
            {t}
          </text>
        </g>
      ))}
      <text className="appendix-axis-title" x={width / 2} y={height - 8} textAnchor="middle">
        給与収入（万円）
      </text>
      <text className="appendix-axis-title" transform={`translate(18 ${height / 2}) rotate(-90)`} textAnchor="middle">
        可処分所得（万円）
      </text>

      {data.map((d) => (
        <path
          key={d.id}
          d={buildPath(d.series, xScale, yScale)}
          className={`appendix-line ${d.id === selectedId ? "selected" : ""}`}
          stroke={d.color}
        />
      ))}

      {selectedPoint ? (
        <g className="appendix-cursor">
          <line x1={xScale(selectedPoint.x)} x2={xScale(selectedPoint.x)} y1={pad.top} y2={height - pad.bottom} />
          <circle cx={xScale(selectedPoint.x)} cy={yScale(selectedPoint.disposable)} r="5" />
          <text x={xScale(selectedPoint.x) + 8} y={pad.top + 18}>
            {fmt(selectedPoint.x)}万
          </text>
        </g>
      ) : null}
    </svg>
  );
}

function CliffTable({ cliffs }) {
  if (!cliffs.length) {
    return <div className="appendix-empty">このケースでは表示範囲内の下向きの崖は検出されません。</div>;
  }
  return (
    <div className="appendix-table-wrap">
      <table className="appendix-table">
        <thead>
          <tr>
            <th>崖の給与</th>
            <th>原因</th>
            <th>何が起きたか</th>
            <th>落差</th>
            <th>実質無効幅</th>
            <th>要追加年収</th>
            <th>確度</th>
          </tr>
        </thead>
        <tbody>
          {cliffs.map((c) => {
            const qWidth = c.q ? c.x - c.q.x : null;
            const rWidth = c.r ? c.r.x - c.x : null;
            const confidences = [...new Set((c.causes || []).map((cause) => cause.confidence || "strict"))];
            return (
              <tr key={c.index}>
                <td>
                  <span className="appendix-mono">{fmt(c.x)}万</span>
                </td>
                <td>
                  {(c.causes || []).map((cause) => (
                    <div key={`${c.index}-${cause.cause}`}>{cause.cause}</div>
                  ))}
                </td>
                <td>
                  {(c.causes || []).map((cause) => (
                    <div key={`${c.index}-${cause.cause}-${cause.whatHappened}`}>{cause.whatHappened}</div>
                  ))}
                </td>
                <td className="appendix-mono">{fmt(Math.abs(c.drop), 1)}万</td>
                <td className="appendix-mono">{qWidth == null ? "—" : `${fmt(qWidth)}万`}</td>
                <td className="appendix-mono">
                  {rWidth == null ? `${X_MAX}万でも回復せず・不足${fmt(c.unrecoveredShortfall, 1)}万` : `${fmt(rWidth)}万`}
                </td>
                <td>
                  {confidences.map((confidence) => {
                    const cInfo = confidenceBadge(confidence);
                    return (
                      <span key={confidence} className={`confidence-pill ${confidence}`}>
                        {cInfo.label}
                      </span>
                    );
                  })}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CalculationTable({ title, confidence, rows }) {
  const c = confidenceBadge(confidence);
  return (
    <section className="formula-card">
      <div className="formula-card-head">
        <h3>{title}</h3>
        <span className={`confidence-pill ${confidence}`}>{c.label}</span>
      </div>
      <div className="formula-table-wrap">
        <table className="formula-table">
          <thead>
            <tr>
              <th>ラベル</th>
              <th>値</th>
              <th>計算式</th>
              <th>確度</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const rowConfidence = row.confidence || confidence;
              const rowBadge = confidenceBadge(rowConfidence);
              return (
                <tr key={row.label} className={row.tone || ""}>
                  <th scope="row">{row.label}</th>
                  <td className="formula-value">{row.value}</td>
                  <td className="formula-expression">{row.formula}</td>
                  <td>
                    <span className={`confidence-pill ${rowConfidence}`}>{rowBadge.label}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function BreakdownPanel({ point }) {
  if (!point?.breakdown) return <div className="appendix-empty">計算内訳を読み込んでいます。</div>;
  const b = point.breakdown;
  const tcca = b.programs.tcca;
  const welfare = b.programs.welfareAllowance;
  const service = b.programs.service;
  const m01 = b.programs.m01;
  const n04 = b.programs.n04;
  const mainService = service.details[0];
  const salaryRow = b.rows[0] || {};

  return (
    <div className="formula-grid">
      <CalculationTable
        title="手取り"
        confidence="strict"
        rows={[
          {
            label: "給与所得",
            value: fmtWan(salaryRow.employmentIncomeWan),
            formula: `${fmtWan(salaryRow.salaryWan, 0)} − 給与所得控除 ${fmtWan(salaryRow.employmentIncomeDeductionWan)} = ${fmtWan(salaryRow.employmentIncomeWan)}`,
          },
          {
            label: "手取り",
            value: fmtWan(b.takeHome.takeHomeWan),
            formula: `${fmtWan(b.takeHome.salaryWan, 0)} − 社会保険料 ${fmtWan(b.takeHome.socialWan)} − 税 ${fmtWan(b.takeHome.taxWan)} = ${fmtWan(b.takeHome.takeHomeWan)}`,
          },
          {
            label: "住民税所得割",
            value: fmtWan(b.tax.residentIncomeLevyWan, 2),
            formula: `${fmtWan(b.tax.residentIncomeLevyWan, 2)}（通所/M01判定に使用）`,
          },
        ]}
      />

      <CalculationTable
        title="特別児童扶養手当"
        confidence="strict"
        rows={[
          {
            label: "本人判定",
            value: tcca.eligible ? "支給" : "不支給",
            formula: `${fmtYen(tcca.headAdjustedIncomeYen)} vs 限度額 ${fmtYen(tcca.headLimitYen)} → ${tcca.eligible ? "支給" : "不支給"}`,
          },
          {
            label: "扶養義務者判定",
            value: tcca.eligible ? "通過" : "停止",
            formula: `${fmtYen(tcca.familyMaxAdjustedIncomeYen)} vs 限度額 ${fmtYen(tcca.familyLimitYen)} → ${tcca.eligible ? "通過" : "停止"}`,
          },
          {
            label: "支給額",
            value: fmtWan(tcca.annualWan),
            formula: `${fmtYen(tcca.monthlyYen)}/月、${fmtWan(tcca.annualWan)}/年`,
          },
        ]}
      />

      <CalculationTable
        title="障害児福祉手当"
        confidence="strict"
        rows={[
          {
            label: "扶養義務者",
            value: welfare.obligorOk ? "通過" : "停止",
            formula: `${fmtYen(welfare.obligorMaxAdjustedIncomeYen)} vs 限度額 ${fmtYen(welfare.obligorLimitYen)} → ${welfare.obligorOk ? "通過" : "停止"}`,
          },
          {
            label: "対象者",
            value: `${welfare.recipients.filter((r) => r.ok).length}/${welfare.recipients.length}人`,
            formula: `${welfare.recipients.filter((r) => r.ok).length}/${welfare.recipients.length}人 支給`,
          },
          {
            label: "支給額",
            value: fmtWan(welfare.annualWan),
            formula: `${fmtYen(welfare.monthlyYen)}/月、${fmtWan(welfare.annualWan)}/年`,
          },
        ]}
      />

      <CalculationTable
        title="障害児通所支援"
        confidence="strict"
        rows={[
          {
            label: "区分",
            value: mainService?.type || "対象外",
            formula: `所得割 ${fmtWan(mainService?.householdLevyWan, 2)} ${Number(mainService?.householdLevyWan || 0) >= 28 ? "≥" : "<"} 28万 → ${mainService?.type || "対象外"}`,
          },
          {
            label: "月額上限",
            value: fmtYen(service.monthlyTotalYen),
            formula: `${fmtYen(service.monthlyTotalYen)}（年額 ${fmtWan(service.annualWan)}）`,
          },
        ]}
      />

      <CalculationTable
        title="M01 重心医療費助成"
        confidence="representative"
        rows={[
          {
            label: "判定",
            value: m01.status,
            formula: `所得割 ${fmtWan(m01.householdLevyWan, 2)} ${m01.eligible ? "<" : "≥"} ${fmtWan(m01.cutoffWan, 1)} → ${m01.status}`,
          },
          {
            label: "助成額",
            value: fmtWan(m01.annualWan),
            formula: `${m01.count}人 × ${fmtYen(m01.annualYenPerRecipient || 0)} = ${fmtWan(m01.annualWan)}`,
          },
        ]}
      />

      <CalculationTable
        title="N04 就学奨励費"
        confidence="provisional"
        rows={[
          {
            label: "区分",
            value: n04.supportClass,
            formula: `給与 ${fmtWan(point.x, 0)}、境界 ${fmt(n04.boundaries?.firstToSecondManyen)}万 / ${fmt(n04.boundaries?.secondToThirdManyen)}万 → ${n04.supportClass}`,
          },
          {
            label: "補助額",
            value: fmtWan(n04.annualWan),
            formula: `${n04.count || 0}人 × ${fmtYen(n04.annualYenPerRecipient || 0)} = ${fmtWan(n04.annualWan)}`,
          },
        ]}
      />

      <CalculationTable
        title="可処分所得"
        confidence="strict"
        rows={[
          {
            label: "手当合計",
            value: fmtWan(b.allowance.totalWan),
            formula: `${fmtWan(b.allowance.totalWan)}（特児・福祉手当・M01・N04等）`,
          },
          {
            label: "可処分所得",
            value: fmtWan(b.disposable.disposableWan),
            formula: `${fmtWan(b.disposable.takeHomeWan)} + 手当 ${fmtWan(b.disposable.allowanceWan)} − 利用料 ${fmtWan(b.disposable.serviceFeeWan)} = ${fmtWan(b.disposable.disposableWan)}`,
            tone: "strong",
          },
        ]}
      />
    </div>
  );
}

function ConfidenceNotes() {
  return (
    <section className="appendix-notes" aria-label="確度ステータス">
      {Object.entries(CONFIDENCE).map(([key, item]) => (
        <div key={key}>
          <span className={`confidence-pill ${key}`}>{item.label}</span>
          <p>{item.note}</p>
        </div>
      ))}
    </section>
  );
}

export default function AppendixCliffMap() {
  const [selectedId, setSelectedId] = useState("case3");
  const [selectedSalary, setSelectedSalary] = useState(900);
  const staticTables = useStaticTables();
  const ready =
    staticTables.staticReady &&
    staticTables.empStatic?.length &&
    staticTables.basicITStatic?.length &&
    staticTables.basicLTStatic?.length &&
    staticTables.socialU40Static?.length &&
    staticTables.socialO40Static?.length;

  const data = useMemo(() => {
    if (!ready) return [];
    const tables = makeTables(staticTables);
    return PRESENTATION_CASES.map((caseDef, i) => {
      const series = computeSeries({
        household: buildHousehold(caseDef.household),
        scenario: "S2_R7",
        tables,
        sweep: { min: X_MIN, max: X_MAX, step: 1 },
      });
      return {
        ...caseDef,
        color: COLORS[i % COLORS.length],
        series,
        cliffs: detectCliffs(series, caseDef),
      };
    });
  }, [ready, staticTables]);

  const selected = data.find((d) => d.id === selectedId) || data[0];
  const selectedPoint = selected ? pointAt(selected.series, selectedSalary) : null;

  return (
    <main className="App appendix-page">
      <section className="appendix-hero">
        <p className="appendix-kicker">WEB APPENDIX</p>
        <h1>部分最適な所得制限が、束になると可処分所得を逆転させる</h1>
        <p>
          給与を1万円刻みで掃引し、計算コアが返す手取り・手当・利用料・制度判定をそのまま表示する。
          表示帯は200万〜1400万（1201点）に限定し、グラフは崖の位置関係を示し、縦ラインは選んだ給与での計算過程を展開する。
        </p>
      </section>

      <section className="appendix-controls" aria-label="表示ケース">
        {[...PRESENTATION_CASES, IDEAL_CASE].map((c) => (
          <button
            key={c.id}
            type="button"
            className={`appendix-case-button ${selectedId === c.id ? "active" : ""}`}
            aria-pressed={selectedId === c.id}
            onClick={() => {
              if (!c.pending) setSelectedId(c.id);
            }}
          >
            <span>{c.label}</span>
            <small>{c.shortLabel}</small>
          </button>
        ))}
      </section>

      <section className="appendix-panel">
        {!ready ? (
          <div className="appendix-empty">計算テーブルを読み込んでいます。</div>
        ) : (
          <>
            <div className="appendix-section-head">
              <div>
                <h2>{selected?.label}</h2>
                <p>{selected?.description}</p>
              </div>
              <div className="salary-control">
                <label htmlFor="salary-range">縦ライン: {fmt(selectedSalary)}万円</label>
                <input
                  id="salary-range"
                  type="range"
                  min={X_MIN}
                  max={X_MAX}
                  step="1"
                  value={selectedSalary}
                  onChange={(e) => setSelectedSalary(Number(e.target.value))}
                />
              </div>
            </div>
            <Graph data={data} selectedId={selected?.id} selectedSalary={selectedSalary} onSalaryChange={setSelectedSalary} />
            <div className="appendix-legend" aria-label="ケース凡例">
              {data.map((d) => (
                <span key={d.id} className={d.id === selected?.id ? "active" : ""}>
                  <i style={{ background: d.color }} aria-hidden="true" />
                  {d.label}：{d.shortLabel}
                </span>
              ))}
            </div>
          </>
        )}
      </section>

      <section className="appendix-panel">
        <div className="appendix-section-head">
          <div>
            <h2>選択給与での計算過程</h2>
            <p>フロントでは税・社保を再計算せず、computeSeriesの各点が持つ内訳を式として表示する。</p>
          </div>
          <div className="appendix-big-number">
            <span>{fmt(selectedPoint?.x)}万円</span>
            <strong>{fmtWan(selectedPoint?.disposable)}</strong>
          </div>
        </div>
        <BreakdownPanel point={selectedPoint} />
      </section>

      <section className="appendix-panel">
        <div className="appendix-section-head">
          <div>
            <h2>P/Q/R 表</h2>
            <p>Pは崖点、Qは崖後の水準まで戻る左側の給与、Rは崖前の水準へ回復する右側の給与。</p>
          </div>
        </div>
        <CliffTable cliffs={selected?.cliffs || []} />
      </section>

      <ConfidenceNotes />

      <section className="appendix-panel ideal-slot">
        <h2>第4ケース：全体最適モデル</h2>
        <p>
          後続設計で、崖なしまたは大幅緩和した制度モデルを同じP/Q/R表示器へ差し込む。
          現時点では比較枠だけを固定し、恣意的な数値を置かない。
        </p>
      </section>
    </main>
  );
}
