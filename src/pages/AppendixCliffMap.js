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
  },
  {
    id: "case2",
    label: "ケース2",
    shortLabel: "子2人・混合",
    description: "11歳1級特別＋7歳2級一般。福祉手当・重心医療費助成・就学奨励費は1人分",
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
  },
  {
    id: "case3",
    label: "ケース3",
    shortLabel: "子2人・重複",
    description: "11歳・7歳とも特児1級・特別障害。福祉手当・重心医療費助成・就学奨励費は2人分",
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

function tintWhite(hex, whiteRatio) {
  const h = String(hex || "").replace("#", "");
  if (h.length !== 6) return "#ffffff";
  const ch = (i) => parseInt(h.substring(i, i + 2), 16);
  const mix = (c) => Math.round(c + (255 - c) * whiteRatio);
  return `rgb(${mix(ch(0))}, ${mix(ch(2))}, ${mix(ch(4))})`;
}

function pointY(point) {
  return Number(point?.cliffDisposable ?? point?.disposable);
}

function findQ(series, cliffIndex, yAfter) {
  for (let i = cliffIndex - 1; i >= 0; i -= 1) {
    const point = series[i];
    if (pointY(point) <= yAfter) return point;
  }
  return null;
}

function findR(series, cliffIndex, yBefore) {
  for (let i = cliffIndex + 1; i < series.length; i += 1) {
    const point = series[i];
    if (pointY(point) >= yBefore) return point;
  }
  return null;
}

function detectCliffs(series, caseDef) {
  const rows = [];
  for (let i = 1; i < series.length; i += 1) {
    const prev = series[i - 1];
    const cur = series[i];
    if (cur.x < X_MIN || cur.x > X_MAX) continue;
    const delta = pointY(cur) - pointY(prev);
    if (delta > -Number(caseDef.minDropManyen || 3)) continue;

    const yBefore = pointY(prev);
    const yAfter = pointY(cur);
    const q = findQ(series, i, yAfter);
    const r = findR(series, i, yBefore);
    const yAtMax = pointY(series.find((p) => p.x === X_MAX) ?? series[series.length - 1]);
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
          className="appendix-line"
          stroke={d.color}
        />
      ))}

      <g className="appendix-inlegend">
        {data.map((d, i) => (
          <g key={d.id} transform={`translate(${pad.left + 14} ${pad.top + 16 + i * 22})`}>
            <circle cx="0" cy="-4" r="5" fill={d.color} />
            <text x="13" y="0" fill={d.color}>
              {d.label}
            </text>
          </g>
        ))}
      </g>

      {(selected?.cliffs || []).map((c) => (
        <g
          key={`cliff-${c.index}`}
          className="appendix-cliff-marker"
          transform={`translate(${xScale(c.x)} ${yScale(c.yAfter)})`}
        >
          <circle r="8" fill={selected?.color || "#1c2529"} stroke="#ffffff" strokeWidth="1.5" />
          <text textAnchor="middle" dy="3.2">
            P{c.index}
          </text>
        </g>
      ))}

      {selectedPoint ? (
        <g className="appendix-cursor">
          <line x1={xScale(selectedPoint.x)} x2={xScale(selectedPoint.x)} y1={pad.top} y2={height - pad.bottom} />
          <text x={xScale(selectedPoint.x) + 8} y={pad.top + 18}>
            S＝{fmt(selectedPoint.x)}万
          </text>
          <g className="appendix-s-marker" transform={`translate(${xScale(selectedPoint.x)} ${yScale(selectedPoint.disposable)})`}>
            <circle r="9" fill="#1c2529" stroke="#ffffff" strokeWidth="1.5" />
            <text textAnchor="middle" dy="3.4">
              S
            </text>
          </g>
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
            <th>P</th>
            <th>給与収入</th>
            <th>原因</th>
            <th>変化内容</th>
            <th>落差</th>
            <th>後退点</th>
            <th>復帰点</th>
          </tr>
        </thead>
        <tbody>
          {cliffs.map((c) => {
            return (
              <tr key={c.index}>
                <td className="appendix-mono appendix-pnum">P{c.index}</td>
                <td>
                  <span className="appendix-mono">{fmt(c.x)}万</span>
                </td>
                <td className="appendix-cause">
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
                <td className="appendix-mono">{c.q ? `${fmt(c.q.x)}万` : "—"}</td>
                <td className="appendix-mono">{c.r ? `${fmt(c.r.x)}万` : "回復せず"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CalculationTable({ title, subtitle, rows, note, wide }) {
  return (
    <section className={`formula-card${wide ? " wide" : ""}`}>
      <div className="formula-card-head">
        <h3>
          {title}
          {subtitle ? <small className="formula-subtitle"> {subtitle}</small> : null}
        </h3>
      </div>
      <div className="formula-table-wrap">
        <table className="formula-table">
          <thead>
            <tr>
              <th>ラベル</th>
              <th>値</th>
              <th>計算式</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key || row.label} className={row.tone || ""}>
                <th scope="row">{row.label}</th>
                <td className="formula-value">{row.value}</td>
                <td className="formula-expression">{row.formula}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {note ? <p className="formula-note">{note}</p> : null}
    </section>
  );
}

function itLt(itWan, ltWan) {
  return `所${fmtWan(itWan)}／住${fmtWan(ltWan)}`;
}

function incomeTaxBracket(taxableWan) {
  const yen = Math.max(0, Math.floor(((Number(taxableWan) || 0) * 10000) / 1000) * 1000);
  const bands = [
    [1950000, 0.05, 0],
    [3300000, 0.1, 97500],
    [6950000, 0.2, 427500],
    [9000000, 0.23, 636000],
    [18000000, 0.33, 1536000],
    [40000000, 0.4, 2796000],
    [Infinity, 0.45, 4796000],
  ];
  const b = bands.find((x) => yen <= x[0]) || bands[bands.length - 1];
  return { rate: b[1], dedYen: b[2] };
}

function childDisabilityLabel(c) {
  if (c?.specialDisabled) return "特別障害者";
  if (c?.disabled) return "一般障害者";
  return "障害なし";
}

function childTccaLabel(c) {
  const g = String(c?.tccaGrade || "not");
  return g === "not" ? "対象外" : `${g}級`;
}

function CaseConditions({ caseDef }) {
  const h = caseDef?.household || {};
  const children = Array.isArray(h.children) ? h.children : [];
  return (
    <div className="case-conditions">
      <p className="case-cond-summary">
        <b>世帯主</b>：{h.head?.age ?? "—"}歳{" ／ "}
        <b>配偶者</b>：{h.spouseEnabled ? `${h.spouse?.age ?? "—"}歳（給与収入なし）` : "なし"}{" ／ "}
        <b>子ども</b>：{children.length}人
      </p>

      <div className="formula-table-wrap">
        <table className="case-cond-table">
          <thead>
            <tr>
              <th>子</th>
              <th>年齢</th>
              <th>障害区分</th>
              <th>特別児童扶養手当</th>
              <th>同居</th>
              <th>障害児福祉手当</th>
            </tr>
          </thead>
          <tbody>
            {children.map((c, i) => (
              <tr key={`child-${i}`}>
                <th scope="row">子ども{i + 1}</th>
                <td>{fmt(c.age)}歳</td>
                <td>{childDisabilityLabel(c)}</td>
                <td>{childTccaLabel(c)}</td>
                <td>{c.cohabit !== false ? "同居" : "別居"}</td>
                <td>{c.childWelfareAllowance ? "あり" : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BreakdownPanel({ point }) {
  if (!point?.breakdown) return <div className="appendix-empty">計算内訳を読み込んでいます。</div>;
  const b = point.breakdown;
  const rows = b.rows || [];
  const ded = b.deductions || {};
  const tax = b.tax || { byWho: [] };
  const programs = b.programs || {};
  const tcca = programs.tcca || {};
  const welfare = programs.welfareAllowance || { recipients: [] };
  const service = programs.service || { details: [] };
  const m01 = programs.m01 || {};
  const n04 = programs.n04 || {};
  const allowance = b.allowance || {};
  const costBurden = b.costBurden || {};
  const disposable = b.disposable || {};

  const tccaHeadOk = Number(tcca.headAdjustedIncomeYen) <= Number(tcca.headLimitYen);
  const tccaFamilyOk = Number(tcca.familyMaxAdjustedIncomeYen) <= Number(tcca.familyLimitYen);
  const headRow = rows.find((r) => r.who === "世帯主") || rows[0] || {};
  const taxHead = (tax.byWho || []).find((t) => t.who === "世帯主") || {};
  const itbr = incomeTaxBracket(taxHead.incomeTax?.taxableWan);
  const dependent = ded.dependent || {};
  const specialKin = ded.specialKin || {};
  const widowSingleParent = ded.widowSingleParent || {};
  const otherPersonalITWan =
    Number(widowSingleParent.widow?.itWan || 0) +
    Number(widowSingleParent.singleParent?.itWan || 0) +
    Number(taxHead.deductions?.workingStudentITWan || 0);
  const otherPersonalLTWan =
    Number(widowSingleParent.widow?.ltWan || 0) +
    Number(widowSingleParent.singleParent?.ltWan || 0) +
    Number(taxHead.deductions?.workingStudentLTWan || 0);
  const tccaDeductions = tcca.head?.judgmentIncome?.deductions || [];
  const welfareObligorDetails = welfare.obligorJudgmentIncomeDetails || [];
  const welfareMaxObligor = welfareObligorDetails.reduce(
    (max, detail) => (!max || Number(detail.adjustedYen || 0) > Number(max.adjustedYen || 0) ? detail : max),
    null
  );
  const welfareObligorDeductions = welfareMaxObligor?.deductions || [];
  const judgmentDeductionLabel = (label) => {
    if (String(label).startsWith("基礎控除引き上げ相当額")) return "基礎控除引き上げ相当額";
    if (String(label).startsWith("社会保険料控除")) return "社会保険料控除（固定）";
    return label;
  };
  const judgmentDisabilityFormula = (totalWan) => {
    const specialCount = rows.filter((row) => row.disabled && row.disabilityKind === "special").length;
    const ordinaryCount = rows.filter((row) => row.disabled && row.disabilityKind === "disabled").length;
    const computedWan = specialCount * 40 + ordinaryCount * 27;
    if (Math.abs(computedWan - Number(totalWan || 0)) > 0.0001) return "区分別控除 × 対象人数";
    return [
      specialCount ? `40万 × ${specialCount}名` : "",
      ordinaryCount ? `27万 × ${ordinaryCount}名` : "",
    ]
      .filter(Boolean)
      .join(" ＋ ");
  };

  return (
    <div className="formula-grid">
      {/* ===== A. 金額の流れ ＋ B. 控除（税・社保の土台。世帯主のみ） ===== */}
      {/* A 金額の流れ（世帯主）。控除は B を参照 */}
      <CalculationTable
        title="A. 基礎計算"
        wide
        rows={[
          { key: "A1", label: "A1 給与収入", value: fmtWan(headRow.salaryWan, 0), formula: "縦ライン値（S）" },
          { key: "A2", label: "A2 給与所得", value: fmtWan(headRow.employmentIncomeWan), formula: "A1 − B1" },
          { key: "A3", label: "A3 所得税 課税所得", value: fmtWan(taxHead.incomeTax?.taxableWan), formula: "A2 −（B2〜B9：所得税側、千円未満切捨て）" },
          { key: "A4", label: "A4 住民税 課税所得", value: fmtWan(taxHead.residentTax?.taxableWan), formula: "A2 −（B2〜B9：住民税側、千円未満切捨て）" },
          { key: "A5", label: "A5 所得税", value: fmtWan(taxHead.incomeTax?.taxWan), formula: `A3 × ${Math.round(itbr.rate * 100)}% − ${fmtYen(itbr.dedYen)}` },
          {
            key: "A6",
            label: "A6 住民税",
            value: fmtWan(taxHead.residentTax?.computedTaxWan),
            formula: `所得割 ${fmtWan(Number(taxHead.residentTax?.computedTaxWan || 0) - Number(taxHead.residentTax?.perCapitaWan || 0))} ＋ 均等割 ${fmtWan(taxHead.residentTax?.perCapitaWan, 2)}`,
          },
          { key: "A7", label: "A7 基礎手取額", value: fmtWan(b.takeHome?.takeHomeWan), formula: "A1 − B2 − A5 − A6", tone: "strong" },
        ]}
      />

      {/* B 控除（所得税IT／住民税LT別）。給与所得控除B1はA2、社保B2ほかはA3/A4で使う */}
      <CalculationTable
        title="B. 計算に用いる控除（所得税／住民税）"
        wide
        rows={[
          {
            key: "B1a",
            label: "B1a 給与所得控除（基礎額）",
            value: fmtWan(headRow.employmentIncomeBaseDeductionWan),
            formula: "A1の給与帯別控除",
          },
          {
            key: "B1b",
            label: "B1b 所得金額調整控除",
            value: fmtWan(headRow.incomeAdjustmentDeductionWan),
            formula: "A1の所得金額調整",
          },
          {
            key: "B1",
            label: "B1 給与所得控除 合計",
            value: fmtWan(headRow.employmentIncomeDeductionWan),
            formula: "B1a ＋ B1b",
            tone: "strong",
          },
          {
            key: "B2a",
            label: "B2a 社会保険料率（近似）",
            value: `${fmt(Number(headRow.socialInsuranceBreakdown?.rate || 0) * 100, 3)}%`,
            formula: "選択給与帯・40歳以上の係数",
          },
          {
            key: "B2b",
            label: "B2b 固定加算額（近似式）",
            value: fmtWan(Number(headRow.socialInsuranceBreakdown?.interceptYen || 0) / 10000, 2),
            formula: "選択給与帯の年額調整分",
          },
          {
            key: "B2",
            label: "B2 社会保険料控除",
            value: fmtWan(headRow.socialInsuranceWan),
            formula: "A1 × B2a ＋ B2b",
            tone: "strong",
          },
          {
            key: "B3",
            label: "B3 基礎控除",
            value: itLt(taxHead.deductions?.basicITWan, taxHead.deductions?.basicLTWan),
            formula: "A2の所得帯別（所／住）",
          },
          {
            key: "B4",
            label: "B4 配偶者控除",
            value: itLt(ded.spouse?.itWan, ded.spouse?.ltWan),
            formula: "配偶者所得 × A2所得帯",
          },
          {
            key: "B5",
            label: "B5 配偶者特別控除",
            value: itLt(ded.spouseSpecial?.itWan, ded.spouseSpecial?.ltWan),
            formula: "B4＝0のとき所得帯別判定",
          },
          {
            key: "B6",
            label: "B6 扶養控除",
            value: itLt(dependent.itWan, dependent.ltWan),
            formula: "16歳以上の扶養親族を合計",
          },
          {
            key: "B7",
            label: "B7 特定親族特別控除",
            value: itLt(specialKin.itWan, specialKin.ltWan),
            formula: "19〜22歳の親族の所得帯別",
          },
          {
            key: "B8",
            label: "B8 障害者控除",
            value: itLt(taxHead.deductions?.disabilityITWan, taxHead.deductions?.disabilityLTWan),
            formula: "障害区分別控除 × 対象人数",
          },
          {
            key: "B9",
            label: "B9 その他の人的控除",
            value: itLt(otherPersonalITWan, otherPersonalLTWan),
            formula: "寡婦 ＋ ひとり親 ＋ 勤労学生",
          },
        ]}
        note="B2は年収帯別の社会保険料近似式。B2a・B2bは選択給与帯の係数。B3〜B9は所得税側・住民税側で金額が異なる場合があるため「所／住」で併記。16歳未満の年少扶養控除は適用しない。"
      />

      {/* ===== C. 現金給付の判定（可処分所得に ＋） ===== */}
      {/* C 特別児童扶養手当 */}
      <CalculationTable
        title="T. 現金給付：特別児童扶養手当（特児）"
        confidence="strict"
        rows={[
          {
            key: "T1",
            label: "T1 扶養人数",
            value: `${fmt(tcca.fuyoCount)}人`,
            formula: "扶養親族等の実人数",
          },
          ...tccaDeductions.map((item, index) => {
            const code = `T2${String.fromCharCode(97 + index)}`;
            const isFixed =
              String(item.label).startsWith("基礎控除引き上げ相当額") ||
              String(item.label).startsWith("社会保険料控除");
            return {
              key: code,
              label: `${code} ${judgmentDeductionLabel(item.label)}`,
              value: fmtWan(item.wan),
              formula: isFixed
                ? "固定値"
                : String(item.label).startsWith("障害者控除")
                  ? judgmentDisabilityFormula(item.wan)
                  : "特児の所得判定上の控除",
            };
          }),
          {
            key: "T2",
            label: "T2 控除額 合計",
            value: fmtWan(tcca.head?.judgmentIncome?.deductionSumWan),
            formula: tccaDeductions.length
              ? tccaDeductions.map((_, index) => `T2${String.fromCharCode(97 + index)}`).join(" ＋ ")
              : "0",
            tone: "strong",
          },
          { key: "T3", label: "T3 本人 判定所得", value: fmtYen(tcca.headAdjustedIncomeYen), formula: "A1 − B1a − T2" },
          { key: "T4", label: "T4 本人 限度額", value: fmtYen(tcca.headLimitYen), formula: "T1の基準額 ＋ 法定加算" },
          { key: "T5", label: "T5 本人判定", value: tccaHeadOk ? "通過" : "停止", formula: "T3 ≤ T4" },
          { key: "T6", label: "T6 扶養義務者 判定所得（最大）", value: fmtYen(tcca.familyMaxAdjustedIncomeYen), formula: "各扶養義務者の判定所得の最大" },
          { key: "T7", label: "T7 扶養義務者 限度額", value: fmtYen(tcca.familyLimitYen), formula: "T1の扶養義務者限度額" },
          { key: "T8", label: "T8 扶養義務者判定", value: tccaFamilyOk ? "通過" : "停止", formula: "T6 ≤ T7" },
          { key: "T9", label: "T9 支給判定", value: tcca.eligible ? "支給" : "不支給", formula: "T5 ∧ T8" },
          { key: "T10", label: "T10 支給月額", value: fmtYen(tcca.monthlyYen), formula: "T9が支給なら等級別月額合計" },
          { key: "T11", label: "T11 支給年額", value: fmtWan(tcca.annualWan), formula: "T10 × 12" },
        ]}
      />

      {/* C 障害児福祉手当／特別障害者手当 */}
      <CalculationTable
        title="W. 現金給付：障害児福祉手当"
        confidence="strict"
        rows={[
          { key: "W1", label: "W1 扶養人数", value: `${fmt(welfare.fuyoCount)}人`, formula: "扶養親族等の実人数" },
          ...welfareObligorDeductions.map((item, index) => {
            const code = `W2${String.fromCharCode(97 + index)}`;
            let formula = "手当の所得判定上の控除";
            if (
              String(item.label).startsWith("基礎控除引き上げ相当額") ||
              String(item.label).startsWith("社会保険料控除")
            ) {
              formula = "固定値";
            }
            if (String(item.label).startsWith("障害者控除")) formula = judgmentDisabilityFormula(item.wan);
            return {
              key: code,
              label: `${code} ${judgmentDeductionLabel(item.label)}`,
              value: fmtWan(item.wan),
              formula,
            };
          }),
          {
            key: "W2",
            label: "W2 控除額 合計",
            value: fmtWan(welfareMaxObligor?.deductionSumWan),
            formula: welfareObligorDeductions.length
              ? welfareObligorDeductions.map((_, index) => `W2${String.fromCharCode(97 + index)}`).join(" ＋ ")
              : "0",
            tone: "strong",
          },
          { key: "W3", label: "W3 扶養義務者 判定所得（最大）", value: fmtYen(welfare.obligorMaxAdjustedIncomeYen), formula: "A1 − B1a − W2" },
          { key: "W4", label: "W4 扶養義務者 限度額", value: fmtYen(welfare.obligorLimitYen), formula: "W1の限度額表" },
          { key: "W5", label: "W5 扶養義務者判定", value: welfare.obligorOk ? "通過" : "停止", formula: "W3 ≤ W4" },
          {
            key: "W6",
            label: "W6 支給判定",
            value: (welfare.recipients || []).length ? (welfare.monthlyYen > 0 ? "支給" : "不支給") : "対象なし",
            formula: "W5",
          },
          { key: "W7", label: "W7 支給月額 合計", value: fmtYen(welfare.monthlyYen), formula: "W6が支給なら対象児童分を合計" },
          { key: "W8", label: "W8 支給年額", value: fmtWan(welfare.annualWan), formula: "W7 × 12" },
        ]}
      />

      {/* ===== D. 費用軽減にともなう自己負担（可処分所得から −） ===== */}
      {/* D 重心医療費助成（M01） */}
      <CalculationTable
        title="M. 自己負担：重心医療費助成"
        confidence="representative"
        rows={[
          { key: "M0", label: "M0 制度分類", value: "医療費負担軽減", formula: "F7へ" },
          { key: "M1", label: "M1 世帯所得割", value: fmtYen(m01.judgment?.householdLevyYen), formula: "A6の市町村分合計" },
          { key: "M2", label: "M2 所得割上限", value: fmtYen(m01.judgment?.cutoffYen), formula: "制度上限" },
          { key: "M3", label: "M3 該当判定", value: m01.status, formula: "M1 < M2" },
          { key: "M4", label: "M4 軽減満額", value: fmtWan(m01.fullReliefWan), formula: "代表年額 × 対象人数" },
          { key: "M5", label: "M5 現在の軽減額", value: fmtWan(m01.annualWan), formula: "M3が該当ならM4、非該当なら0" },
          { key: "M6", label: "M6 医療費自己負担", value: fmtWan(costBurden.medicalCostBurdenWan), formula: "M4 − M5" },
          { key: "M7", label: "M7 感度レンジ", value: `${fmtWan(m01.sensitivityRangeWan?.min)}〜${fmtWan(m01.sensitivityRangeWan?.max)}`, formula: "代表値レンジ × 対象人数" },
          { key: "M8", label: "M8 最終指標への扱い", value: "可処分所得から減算", formula: "F7 ＝ M6", tone: "strong" },
        ]}
      />

      {/* D 就学奨励費（N04）＝教育費自己負担の軽減。基準＝第3区分（補助0）。コア確定378e692 */}
      <CalculationTable
        title="N. 費用軽減：就学奨励費"
        confidence="provisional"
        rows={[
          { key: "N0", label: "N0 制度分類", value: "教育費負担軽減", formula: "F10へ" },
          { key: "N1", label: "N1 給与収入", value: fmtWan(n04.judgment?.salaryManyen, 0), formula: "A1" },
          { key: "N2", label: "N2 区分境界", value: `${fmt(n04.judgment?.firstToSecondManyen)}万／${fmt(n04.judgment?.secondToThirdManyen)}万`, formula: "第1→2／第2→3" },
          { key: "N3", label: "N3 支弁区分", value: n04.supportClass, formula: "N1とN2を比較" },
          { key: "N4", label: "N4 区分別単価", value: fmtYen(n04.amountFormula?.annualYenPerRecipient), formula: "N3の小学部年額" },
          { key: "N5", label: "N5 対象人数", value: `${fmt(n04.amountFormula?.count)}人`, formula: "対象児童数" },
          { key: "N6", label: "N6 教育費負担軽減", value: fmtWan(n04.annualWan), formula: "N4 × N5 ÷ 10,000" },
          { key: "N7", label: "N7 最終指標への扱い", value: "可処分所得に反映", formula: "F10 ＝ N6", tone: "strong" },
        ]}
      />

      {/* ===== E. 利用者負担（可処分所得から −） ===== */}
      <CalculationTable
        title="E. 利用者負担：障害児通所支援（世帯上限）"
        wide
        confidence={service.confidence || "strict"}
        note="負担上限月額は世帯単位（複数児でも合算せず最も高い1つ。児福法施行令24条・27条の2）。一般2の実負担は上限37,200円ではなく、東京都R6調査の利用者負担平均10,406円を採用（上限は非拘束）。"
        rows={[
          { key: "E0", label: "E0 制度分類", value: "利用者負担", formula: "F8へ" },
          {
            key: "E1",
            label: "E1 世帯 所得割合計",
            value: fmtWan(service.householdLevySumWan, 2),
            formula: "A6の市町村分合計",
          },
          ...(service.details || []).map((d, index) => ({
              key: `svc-${d.who}`,
              label: `E2-${index + 1} ${d.who} 月額候補`,
              value: fmtYen(d.monthlyUpperYen),
              confidence: d.confidence,
              formula: `E1 → ${d.type} → min（代表値, 制度上限）`,
            })),
          {
            key: "E3",
            label: "E3 世帯月額負担",
            value: fmtYen(service.monthlyTotalYen),
            formula: `max（${(service.details || []).map((_, index) => `E2-${index + 1}`).join("，") || "0"}）`,
          },
          { key: "E4", label: "E4 年額負担", value: fmtWan(service.annualWan), formula: "E3 × 12 ÷ 10,000" },
          { key: "E5", label: "E5 最終指標への扱い", value: "可処分所得から減算", formula: "F8 ＝ E4", tone: "strong" },
        ]}
      />

      {/* ===== F. 最終集計（一本の可処分所得） ===== */}
      {/* F 現金給付合計（＋） */}
      <CalculationTable
        title="F. 現金給付合計（＋）"
        wide
        confidence="strict"
        note="M01・N04は現金給付ではなく費用軽減として負担側に分離。ここは実際に現金として受け取る給付だけを合計。"
        rows={[
          { key: "F1", label: "F1 基礎障害年金", value: fmtWan(allowance.basicDisabilityPensionWan), formula: "本人分 ＋ 配偶者分" },
          { key: "F2", label: "F2 特別児童扶養手当", value: fmtWan(allowance.tccaWan), formula: "T11" },
          { key: "F3", label: "F3 障害児福祉手当", value: fmtWan(allowance.welfareAllowanceWan), formula: "W7" },
          { key: "F4", label: "F4 児童扶養手当", value: fmtWan(allowance.childSupportWan), formula: "ひとり親判定年額" },
          { key: "F5", label: "F5 児童手当", value: fmtWan(allowance.childAllowanceWan), formula: "対象児の月額合計 × 12" },
          {
            key: "F6",
            label: "F6 現金給付合計",
            value: fmtWan(allowance.totalWan),
            formula: "F1 ＋ F2 ＋ F3 ＋ F4 ＋ F5",
            tone: "strong",
          },
        ]}
      />

      {/* F 費用（自己負担・軽減）: 医療・通所は自己負担、N04は教育費自己負担の軽減。給付側から分離 */}
      <CalculationTable
        title="F. 費用（自己負担・軽減）"
        wide
        confidence="strict"
        note="現金給付ではない費用側の束。医療費（M01非該当時）・通所は自己負担。就学奨励費(N04)は教育費自己負担の軽減（第3区分＝補助0を基準）で、費用を差し引く方向に効く。符号はコア確定（378e692）。表示名は仮置き。"
        rows={[
          { key: "F7", label: "F7 医療費自己負担", value: fmtWan(costBurden.medicalCostBurdenWan), formula: "M6", confidence: "representative" },
          { key: "F8", label: "F8 通所利用者負担", value: fmtWan(costBurden.serviceFeeWan), formula: "E4" },
          { key: "F9", label: "F9 自己負担 小計", value: fmtWan(costBurden.totalWan), formula: "F7 ＋ F8" },
          { key: "F10", label: "F10 教育費自己負担の軽減", value: fmtWan(disposable.educationCostReliefWan), formula: "N6", confidence: "provisional" },
          {
            key: "F11",
            label: "F11 純費用",
            value: fmtWan(Number(costBurden.totalWan) - Number(disposable.educationCostReliefWan)),
            formula: "F9 − F10",
            tone: "strong",
          },
        ]}
      />

      {/* F 可処分所得（結論・一本集計） */}
      <CalculationTable
        title="F. 可処分所得（結論・一本集計）"
        wide
        confidence="strict"
        note="最終指標は可処分所得の一本。「制度込み家計余力」という第二指標は作らない。"
        rows={[
          { key: "F12", label: "F12 手取り", value: fmtWan(disposable.takeHomeWan), formula: "A7" },
          { key: "F13", label: "F13 現金給付", value: fmtWan(disposable.allowanceWan), formula: "F6" },
          { key: "F14", label: "F14 医療費自己負担", value: fmtWan(disposable.medicalCostBurdenWan), formula: "F7", confidence: "representative" },
          { key: "F15", label: "F15 通所利用者負担", value: fmtWan(disposable.serviceFeeWan), formula: "F8" },
          { key: "F16", label: "F16 教育費負担軽減", value: fmtWan(disposable.educationCostReliefWan), formula: "F10", confidence: "provisional" },
          {
            key: "F17",
            label: "F17 可処分所得",
            value: fmtWan(disposable.disposableWan),
            formula: "F12 ＋ F13 − F14 − F15 ＋ F16",
            tone: "strong",
          },
        ]}
      />
    </div>
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
  const caseAccent = selected?.color || "#9aa7ad";
  const caseSectionStyle = {
    "--case-accent": caseAccent,
    "--case-bg": tintWhite(caseAccent, 0.86),
    "--case-card": tintWhite(caseAccent, 0.96),
  };

  return (
    <main className="App appendix-page">
      <section className="appendix-hero">
        <p className="appendix-kicker">WEB APPENDIX</p>
        <h1>モデル世帯による給付・負担構造</h1>
      </section>

      <section className="appendix-panel appendix-panel-open">
        {!ready ? (
          <div className="appendix-empty">計算テーブルを読み込んでいます。</div>
        ) : (
          <>
            <Graph data={data} selectedId={selected?.id} selectedSalary={selectedSalary} onSalaryChange={setSelectedSalary} />
          </>
        )}
      </section>

      <section className="appendix-controls" aria-label="表示ケース">
        {[...PRESENTATION_CASES, IDEAL_CASE].map((c) => {
          const caseColor = data.find((d) => d.id === c.id)?.color || "#9aa7ad";
          return (
            <button
              key={c.id}
              type="button"
              className={`appendix-case-button ${selectedId === c.id ? "active" : ""}`}
              style={{ "--case-color": caseColor }}
              aria-pressed={selectedId === c.id}
              onClick={() => {
                if (!c.pending) setSelectedId(c.id);
              }}
            >
              {c.label}
            </button>
          );
        })}
      </section>

      <section className="appendix-panel appendix-panel-case" style={caseSectionStyle}>
        <div className="appendix-section-head">
          <div>
            <h2>モデルケースの条件</h2>
          </div>
        </div>
        <CaseConditions caseDef={selected} />
      </section>

      <section className="appendix-panel appendix-panel-case" style={caseSectionStyle}>
        <div className="appendix-section-head">
          <div>
            <h2>可処分所得の変化点</h2>
          </div>
        </div>
        <CliffTable cliffs={selected?.cliffs || []} />
      </section>

      <section className="appendix-panel appendix-panel-case" style={caseSectionStyle}>
        <div className="appendix-section-head">
          <div>
            <h2>S値での計算過程</h2>
            <p>S値＝{fmt(selectedPoint?.x)}万円</p>
          </div>
        </div>
        <BreakdownPanel point={selectedPoint} />
      </section>

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
