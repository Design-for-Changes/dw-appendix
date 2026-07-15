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

function fmtWanAuto(n, maxDigits = 4) {
  if (!Number.isFinite(Number(n))) return "—";
  return `${Number(n).toLocaleString("ja-JP", {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDigits,
  })}万`;
}

function fmtRate(rate) {
  if (!Number.isFinite(Number(rate))) return "—";
  return `${fmt(Number(rate) * 100, 3).replace(/\.0+$/, "")}%`;
}

function deductionTerms(items) {
  const active = (items || []).filter((item) => Number(item?.wan || 0) !== 0 || item?.alwaysShow);
  if (!active.length) return "控除なし";
  return active.map((item) => `${item.label} ${fmtWanAuto(item.wan)}`).join(" ＋ ");
}

function judgmentFormula(detail) {
  if (!detail) return "判定所得の内訳なし";
  const total = detail.allowanceTotalWan ?? detail.totalWan;
  return `${fmtWanAuto(total)} −（${deductionTerms(detail.deductions)}）＝ ${fmtWanAuto(detail.adjustedWan)}`;
}

function limitFormula(limit, fallbackYen) {
  if (limit) {
    return `基準 ${fmtYen(limit.baseYen)} ＋ 法定加算 ${fmtYen(limit.statutoryAddYen)} ＝ ${fmtYen(limit.limitYen)}`;
  }
  return `扶養人数別限度額表 ＝ ${fmtYen(fallbackYen)}`;
}

function familyJudgmentFormula(items, limitYen, ok) {
  if (!(items || []).length) return `扶養義務者なし。限度 ${fmtYen(limitYen)}`;
  const formulas = items
    .map((item) => `${item.who}：${judgmentFormula(item.judgmentIncome)}`)
    .join("／");
  const maxYen = Math.max(...items.map((item) => Number(item?.judgmentIncome?.adjustedYen || item?.adjustedYen || 0)));
  return `${formulas} → 最大 ${fmtYen(maxYen)} ${ok ? "≤" : ">"} 限度 ${fmtYen(limitYen)}`;
}

function employmentDeductionFormula(detail, fallbackBaseWan, fallbackAdjustmentWan) {
  if (!detail) {
    return `基礎 ${fmtWanAuto(fallbackBaseWan)} ＋ 所得金額調整 ${fmtWanAuto(fallbackAdjustmentWan)}`;
  }
  const salary = fmtWanAuto(detail.salaryWan);
  const base = fmtWanAuto(detail.formulaValueWan ?? detail.tableValueWan);
  let calculation = detail.formula || "給与所得控除表";
  if (Number(detail.rate) > 0) {
    const raw = `${salary} × ${fmtRate(detail.rate)} ＋ ${fmtWanAuto(detail.interceptWan || 0)}`;
    calculation = detail.isCapped
      ? `min（${fmtWanAuto(detail.capWan)}, ${raw}）＝ ${base}`
      : `${raw} ＝ ${base}`;
  } else if (detail.bracketLabel) {
    calculation = `${salary}（${detail.bracketLabel}）→ ${base}`;
  }
  const adjustment = Number(detail.incomeAdjustmentDeductionWan || 0);
  return `${calculation} ＋ 所得金額調整 ${fmtWanAuto(adjustment)} ＝ ${fmtWanAuto(detail.totalDeductionWan)}`;
}

function socialInsuranceFormula(detail, fallbackWan) {
  if (!detail) return `年収ベース近似式 ＝ ${fmtWanAuto(fallbackWan)}`;
  if (detail.exemptUnder130) return `${detail.bracketLabel} → ${fmtWanAuto(detail.totalWan)}`;
  if (detail.fixedAnnualYen != null && Number.isFinite(Number(detail.fixedAnnualYen))) {
    return `${detail.bracketLabel}：固定年額 ${fmtYen(detail.fixedAnnualYen)} ＝ ${fmtWanAuto(detail.totalWan)}`;
  }
  if (Number.isFinite(Number(detail.rate))) {
    return `${fmtWanAuto(detail.salaryWan)} × ${fmtRate(detail.rate)} ＋ ${fmtYen(detail.interceptYen || 0)} ＝ ${fmtWanAuto(detail.totalWan)}`;
  }
  return `${detail.formula || "年収ベース近似式"} ＝ ${fmtWanAuto(detail.totalWan)}`;
}

function basicDeductionFormula(detail, label) {
  if (!detail) return `${label}の所得帯別控除`;
  return `総所得 ${fmtWanAuto(detail.totalIncomeWan)}（${detail.bracketLabel}）→ ${label} ${fmtWanAuto(detail.deductionWan)}`;
}

function disabilityDeductionFormula(rows, itWan, ltWan) {
  const targets = (rows || []).filter((row) => row?.disabilityKind && row.disabilityKind !== "none");
  const groups = [
    {
      label: "同居特別障害者",
      count: targets.filter((row) => row.who !== "世帯主" && row.disabilityKind === "special" && row.cohabit).length,
      it: disabilityDeductionCfg.it_wan?.cohab_special,
      lt: disabilityDeductionCfg.lt_wan?.cohab_special,
    },
    {
      label: "特別障害者",
      count: targets.filter((row) => !(row.who !== "世帯主" && row.disabilityKind === "special" && row.cohabit) && row.disabilityKind === "special").length,
      it: disabilityDeductionCfg.it_wan?.special,
      lt: disabilityDeductionCfg.lt_wan?.special,
    },
    {
      label: "一般障害者",
      count: targets.filter((row) => row.disabilityKind === "disabled").length,
      it: disabilityDeductionCfg.it_wan?.disabled,
      lt: disabilityDeductionCfg.lt_wan?.disabled,
    },
  ].filter((group) => group.count > 0);
  if (!groups.length) return "対象者なし → 所0万／住0万";
  const terms = groups
    .map((group) => `${group.label}${group.count}人（所${fmtWanAuto(group.it)}／住${fmtWanAuto(group.lt)}）`)
    .join(" ＋ ");
  return `${terms} ＝ 所${fmtWanAuto(itWan)}／住${fmtWanAuto(ltWan)}`;
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

function serviceCapYen(detail) {
  const type = String(detail?.type || "");
  const age = Number(detail?.age) || 0;
  if (type === "非課税" || type === "無償化") return 0;
  if (type === "一般2") return 37200;
  if (type === "一般1") return age >= 18 ? 9300 : 4600;
  return 0;
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
  const spouseRow = rows.find((r) => r.who === "配偶者") || {};
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
            formula: `所得割 ${fmtWan(Number(taxHead.residentTax?.computedTaxWan || 0) - Number(taxHead.residentTax?.perCapitaWan || 0))}（内 市町村分 ${fmtWan(taxHead.residentTax?.municipalIncomeLevyWan, 2)}は通所・重心判定用）＋ 均等割 ${fmtWan(taxHead.residentTax?.perCapitaWan, 2)}`,
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
            key: "B1",
            label: "B1 給与所得控除",
            value: fmtWan(headRow.employmentIncomeDeductionWan),
            formula: employmentDeductionFormula(
              headRow.employmentIncomeDeductionDetail,
              headRow.employmentIncomeBaseDeductionWan,
              headRow.incomeAdjustmentDeductionWan
            ),
          },
          {
            key: "B2",
            label: "B2 社会保険料控除",
            value: fmtWan(headRow.socialInsuranceWan),
            formula: `${socialInsuranceFormula(headRow.socialInsuranceBreakdown, headRow.socialInsuranceWan)}（所得税・住民税とも実額控除）`,
          },
          {
            key: "B3",
            label: "B3 基礎控除",
            value: itLt(taxHead.deductions?.basicITWan, taxHead.deductions?.basicLTWan),
            formula: `${basicDeductionFormula(taxHead.deductions?.basicITDetail, "所得税")}／${basicDeductionFormula(taxHead.deductions?.basicLTDetail, "住民税")}`,
          },
          {
            key: "B4",
            label: "B4 配偶者控除",
            value: itLt(ded.spouse?.itWan, ded.spouse?.ltWan),
            formula: `配偶者所得 ${fmtWanAuto(spouseRow.totalIncomeWan || 0)}・世帯主総所得 ${fmtWanAuto(headRow.totalIncomeWan)} → 所${fmtWanAuto(ded.spouse?.itWan)}／住${fmtWanAuto(ded.spouse?.ltWan)}`,
          },
          {
            key: "B5",
            label: "B5 配偶者特別控除",
            value: itLt(ded.spouseSpecial?.itWan, ded.spouseSpecial?.ltWan),
            formula: `配偶者控除の適用後に判定 → 所${fmtWanAuto(ded.spouseSpecial?.itWan)}／住${fmtWanAuto(ded.spouseSpecial?.ltWan)}`,
          },
          {
            key: "B6",
            label: "B6 扶養控除",
            value: itLt(dependent.itWan, dependent.ltWan),
            formula: `16歳以上の扶養親族を年齢区分別に合計 → 所${fmtWanAuto(dependent.itWan)}／住${fmtWanAuto(dependent.ltWan)}`,
          },
          {
            key: "B7",
            label: "B7 特定親族特別控除",
            value: itLt(specialKin.itWan, specialKin.ltWan),
            formula: `19〜22歳の親族の所得帯別控除 → 所${fmtWanAuto(specialKin.itWan)}／住${fmtWanAuto(specialKin.ltWan)}`,
          },
          {
            key: "B8",
            label: "B8 障害者控除",
            value: itLt(taxHead.deductions?.disabilityITWan, taxHead.deductions?.disabilityLTWan),
            formula: disabilityDeductionFormula(rows, taxHead.deductions?.disabilityITWan, taxHead.deductions?.disabilityLTWan),
          },
          {
            key: "B9",
            label: "B9 その他の人的控除",
            value: itLt(otherPersonalITWan, otherPersonalLTWan),
            formula: `寡婦・ひとり親・勤労学生控除の合計 → 所${fmtWanAuto(otherPersonalITWan)}／住${fmtWanAuto(otherPersonalLTWan)}`,
          },
        ]}
        note="16歳未満の子について、廃止された年少扶養控除を通所・M01判定で復活させる処理は行わない。"
      />

      {/* ===== C. 現金給付の判定（可処分所得に ＋） ===== */}
      {/* C 特別児童扶養手当 */}
      <CalculationTable
        title="C. 現金給付：特別児童扶養手当（特児）"
        confidence="strict"
        note="★特児の「判定所得」は通常の課税所得と異なる（社保控除が8万円固定等の制度固有控除）。B の課税所得と混同しない。"
        rows={[
          { key: "class", label: "制度分類", value: "現金給付", formula: "Fの現金給付合計へ加算" },
          {
            key: "fuyo",
            label: "扶養人数・限度額",
            value: `${fmt(tcca.fuyoCount)}人`,
            formula: limitFormula(tcca.headLimit, tcca.headLimitYen),
          },
          {
            key: "head",
            label: "本人判定",
            value: tccaHeadOk ? "通過" : "停止",
            formula: `${judgmentFormula(tcca.head?.judgmentIncome)} → ${fmtYen(tcca.headAdjustedIncomeYen)} ${tccaHeadOk ? "≤" : ">"} ${fmtYen(tcca.headLimitYen)}`,
          },
          {
            key: "family",
            label: "扶養義務者判定",
            value: tccaFamilyOk ? "通過" : "停止",
            formula: familyJudgmentFormula(tcca.family, tcca.familyLimitYen, tccaFamilyOk),
          },
          { key: "elig", label: "判定結果", value: tcca.eligible ? "支給" : "不支給", formula: "本人 ∧ 扶養義務者 の両方通過で支給" },
          { key: "amt", label: "支給額（月額・年額）", value: fmtWan(tcca.annualWan), formula: `${fmtYen(tcca.monthlyYen)} × 12か月 ÷ 10,000 ＝ ${fmtWanAuto(tcca.annualWan)}` },
          { key: "treat", label: "最終指標への扱い", value: "可処分所得に加算", formula: `F現金給付へ ＋${fmtWanAuto(tcca.annualWan)}`, tone: "strong" },
        ]}
      />

      {/* C 障害児福祉手当／特別障害者手当 */}
      <CalculationTable
        title="C. 現金給付：障害児福祉手当"
        confidence="strict"
        rows={[
          { key: "class", label: "制度分類", value: "現金給付", formula: "Fの現金給付合計へ加算" },
          { key: "fuyo", label: "扶養人数・限度額", value: `${fmt(welfare.fuyoCount)}人`, formula: `扶養義務者限度額表 ${fmt(welfare.fuyoCount)}人 → ${fmtYen(welfare.obligorLimitYen)}` },
          {
            key: "obligor",
            label: "扶養義務者判定",
            value: welfare.obligorOk ? "通過" : "停止",
            formula: familyJudgmentFormula(
              (welfare.obligorJudgmentIncomeDetails || []).map((item) => ({ ...item, judgmentIncome: item })),
              welfare.obligorLimitYen,
              welfare.obligorOk
            ),
          },
          ...((welfare.recipients || []).length
            ? welfare.recipients.map((rc) => ({
                key: `wf-${rc.who}`,
                label: `${rc.who}・本人判定`,
                value: rc.ok ? "支給" : "不支給",
                formula: `${judgmentFormula(rc.selfJudgmentIncome)} → ${fmtYen(rc.selfYen)} ${rc.selfOk ? "≤" : ">"} ${fmtYen(rc.selfLimitYen)}（本人${rc.selfOk ? "○" : "×"}・義務者${rc.obligorOk ? "○" : "×"}）`,
              }))
            : [{ key: "wf-none", label: "対象者", value: "なし", formula: "受給対象者が存在しない" }]),
          { key: "amt", label: "支給額（月額・年額）", value: fmtWan(welfare.annualWan), formula: `${fmtYen(welfare.monthlyYen)} × 12か月 ÷ 10,000 ＝ ${fmtWanAuto(welfare.annualWan)}` },
          { key: "treat", label: "最終指標への扱い", value: "可処分所得に加算", formula: `F現金給付へ ＋${fmtWanAuto(welfare.annualWan)}`, tone: "strong" },
        ]}
      />

      {/* ===== D. 費用軽減にともなう自己負担（可処分所得から −） ===== */}
      {/* D 重心医療費助成（M01） */}
      <CalculationTable
        title="D. 自己負担：重心医療費助成（M01）"
        confidence="representative"
        note="現金給付ではなく費用軽減。医療費自己負担の軽減効果を代表値で年額換算。該当時は自己負担0、非該当時に医療費自己負担が立つ。"
        rows={[
          { key: "class", label: "制度分類", value: "医療費負担軽減", formula: "現金給付には含めず、非該当時の自己負担をFで減算" },
          {
            key: "judge",
            label: "該当判定（区分）",
            value: m01.status,
            formula: `世帯所得割 ${fmtYen(m01.judgment?.householdLevyYen)} ${m01.eligible ? "<" : "≥"} ${fmtYen(m01.judgment?.cutoffYen)} → ${m01.status}`,
          },
          {
            key: "burden",
            label: "医療費自己負担",
            value: fmtWan(costBurden.medicalCostBurdenWan),
            formula: `軽減満額（${fmtYen(m01.amountFormula?.annualYenPerRecipient)} × ${fmt(m01.amountFormula?.count)}人 ÷ 10,000）${fmtWanAuto(m01.fullReliefWan)} − 現在の軽減 ${fmtWanAuto(m01.annualWan)} ＝ ${fmtWanAuto(costBurden.medicalCostBurdenWan)}`,
          },
          {
            key: "sens",
            label: "感度レンジ",
            value: `${fmtWan(m01.sensitivityRangeWan?.min)}〜${fmtWan(m01.sensitivityRangeWan?.max)}`,
            formula: `代表年額レンジ × ${fmt(m01.count)}人 ＝ ${fmtWanAuto(m01.sensitivityRangeWan?.min)}〜${fmtWanAuto(m01.sensitivityRangeWan?.max)}`,
          },
          { key: "treat", label: "最終指標への扱い", value: "可処分所得から減算", formula: `F可処分所得から −${fmtWanAuto(costBurden.medicalCostBurdenWan)}`, tone: "strong" },
        ]}
      />

      {/* D 就学奨励費（N04）＝教育費自己負担の軽減。基準＝第3区分（補助0）。コア確定378e692 */}
      <CalculationTable
        title="D. 費用軽減：就学奨励費（N04）"
        confidence="provisional"
        note="現金給付ではなく、教育費の自己負担を軽くする費用軽減。基準は第3区分（補助0＝自己負担フル）。所得が上がって支弁区分が上がるほど補助が縮小＝自己負担が増える。値・符号はコア確定（378e692）に一致。"
        rows={[
          { key: "class", label: "制度分類", value: "教育費負担軽減（自己負担側）", formula: "現金給付には含めず、第3区分（補助0）との差をFで負担軽減として反映" },
          {
            key: "region",
            label: "区分",
            value: n04.supportClass,
            formula: `給与 ${fmtWanAuto(n04.judgment?.salaryManyen)} を境界 ${fmtWanAuto(n04.judgment?.firstToSecondManyen)}・${fmtWanAuto(n04.judgment?.secondToThirdManyen)} と比較 → ${n04.supportClass}`,
          },
          {
            key: "relief",
            label: "教育費自己負担の軽減額（第3区分基準）",
            value: fmtWan(n04.annualWan),
            formula: `${fmtYen(n04.amountFormula?.annualYenPerRecipient)} × ${fmt(n04.amountFormula?.count)}人 ÷ 10,000 ＝ ${fmtWanAuto(n04.annualWan)}`,
          },
          {
            key: "treat",
            label: "最終指標への扱い",
            value: "費用軽減（教育費自己負担を軽くする）",
            formula: `F可処分所得へ負担軽減として ＋${fmtWanAuto(n04.annualWan)}（第3区分は0）`,
            tone: "strong",
          },
        ]}
      />

      {/* ===== E. 利用者負担（可処分所得から −） ===== */}
      <CalculationTable
        title="E. 利用者負担：障害児通所支援（世帯上限）"
        wide
        confidence={service.confidence || "strict"}
        note="負担上限月額は世帯単位（複数児でも合算せず最も高い1つ。児福法施行令24条・27条の2）。一般2の実負担は上限37,200円ではなく、東京都R6調査の利用者負担平均10,406円を採用（上限は非拘束）。"
        rows={[
          { key: "class", label: "制度分類", value: "利用者負担", formula: "現金給付には含めず、世帯年額をFで減算" },
          {
            key: "levySum",
            label: "世帯 所得割合計",
            value: fmtWan(service.householdLevySumWan, 2),
            formula: `各人の市町村民税所得割を合算 ＝ ${fmtYen(Number(service.householdLevySumWan || 0) * 10000)}`,
          },
          ...(service.details || []).map((d) => {
            const capYen = serviceCapYen(d);
            const candidate = d.rawMonthlyYen == null
              ? `制度上限 ${fmtYen(capYen)}`
              : `min（代表値 ${fmtYen(d.rawMonthlyYen)}, 制度上限 ${fmtYen(capYen)}）`;
            return {
              key: `svc-${d.who}`,
              label: `${d.who}（${fmt(d.age)}歳）`,
              value: d.type,
              confidence: d.confidence,
              formula: `所得割 ${fmtYen(d.householdLevyYen)} → ${d.type} → ${candidate} ＝ ${fmtYen(d.monthlyUpperYen)}/月`,
            };
          }),
          {
            key: "svc-adopt",
            label: "世帯月額負担",
            value: fmtYen(service.monthlyTotalYen),
            formula: `max（${(service.calculation?.monthlyCandidateYenByChild || []).map((item) => `${item.who} ${fmtYen(item.monthlyYen)}`).join("、") || "対象児なし"}）＝ ${fmtYen(service.monthlyTotalYen)}（人数倍なし）`,
          },
          { key: "svc-annual", label: "年額負担", value: fmtWan(service.annualWan), formula: `${fmtYen(service.monthlyTotalYen)} × 12か月 ÷ 10,000 ＝ ${fmtWanAuto(service.annualWan)}` },
          { key: "treat", label: "最終指標への扱い", value: "可処分所得から減算", formula: `F可処分所得から −${fmtWanAuto(service.annualWan)}`, tone: "strong" },
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
          { key: "pension", label: "基礎障害年金", value: fmtWan(allowance.basicDisabilityPensionWan), formula: `本人・配偶者分 ＝ ${fmtWanAuto(allowance.basicDisabilityPensionWan)}` },
          { key: "tcca", label: "特別児童扶養手当", value: fmtWan(allowance.tccaWan), formula: `C特児の年額 ＝ ${fmtWanAuto(allowance.tccaWan)}` },
          { key: "welfare", label: "障害児福祉手当", value: fmtWan(allowance.welfareAllowanceWan), formula: `C福祉手当の年額 ＝ ${fmtWanAuto(allowance.welfareAllowanceWan)}` },
          { key: "childSupport", label: "児童扶養手当", value: fmtWan(allowance.childSupportWan), formula: `ひとり親判定による年額 ＝ ${fmtWanAuto(allowance.childSupportWan)}` },
          { key: "childAllowance", label: "児童手当", value: fmtWan(allowance.childAllowanceWan), formula: `対象児童の月額合計 × 12 ＝ ${fmtWanAuto(allowance.childAllowanceWan)}` },
          {
            key: "allowance-total",
            label: "現金給付合計",
            value: fmtWan(allowance.totalWan),
            formula: `${fmtWanAuto(allowance.basicDisabilityPensionWan)} ＋ ${fmtWanAuto(allowance.tccaWan)} ＋ ${fmtWanAuto(allowance.welfareAllowanceWan)} ＋ ${fmtWanAuto(allowance.childSupportWan)} ＋ ${fmtWanAuto(allowance.childAllowanceWan)} ＝ ${fmtWanAuto(allowance.totalWan)}`,
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
          { key: "medical", label: "医療費自己負担", value: fmtWan(costBurden.medicalCostBurdenWan), formula: `D M01より ＝ ${fmtWanAuto(costBurden.medicalCostBurdenWan)}`, confidence: "representative" },
          { key: "serviceFee", label: "通所利用者負担", value: fmtWan(costBurden.serviceFeeWan), formula: `E 通所より ＝ ${fmtWanAuto(costBurden.serviceFeeWan)}` },
          { key: "burden-subtotal", label: "自己負担 小計", value: fmtWan(costBurden.totalWan), formula: `${fmtWanAuto(costBurden.medicalCostBurdenWan)} ＋ ${fmtWanAuto(costBurden.serviceFeeWan)} ＝ ${fmtWanAuto(costBurden.totalWan)}` },
          { key: "eduRelief", label: "教育費自己負担の軽減（第3区分基準）", value: fmtWan(disposable.educationCostReliefWan), formula: `D N04より ＝ ${fmtWanAuto(disposable.educationCostReliefWan)}`, confidence: "provisional" },
          {
            key: "net",
            label: "純費用（自己負担 − 教育費軽減）",
            value: fmtWan(Number(costBurden.totalWan) - Number(disposable.educationCostReliefWan)),
            formula: `${fmtWanAuto(costBurden.totalWan)} − ${fmtWanAuto(disposable.educationCostReliefWan)} ＝ ${fmtWanAuto(Number(costBurden.totalWan) - Number(disposable.educationCostReliefWan))}`,
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
          { key: "takeHome", label: "手取り", value: fmtWan(disposable.takeHomeWan), formula: `${fmtWanAuto(b.takeHome?.salaryWan)} − 社保 ${fmtWanAuto(b.takeHome?.socialWan)} − 税 ${fmtWanAuto(b.takeHome?.taxWan)} ＝ ${fmtWanAuto(disposable.takeHomeWan)}` },
          { key: "allowance", label: "＋ 現金給付", value: fmtWan(disposable.allowanceWan), formula: `F現金給付合計 ＝ ＋${fmtWanAuto(disposable.allowanceWan)}` },
          { key: "medical", label: "− 医療費自己負担", value: fmtWan(disposable.medicalCostBurdenWan), formula: `D M01 ＝ −${fmtWanAuto(disposable.medicalCostBurdenWan)}`, confidence: "representative" },
          { key: "serviceFee", label: "− 通所利用者負担", value: fmtWan(disposable.serviceFeeWan), formula: `E 通所 ＝ −${fmtWanAuto(disposable.serviceFeeWan)}` },
          { key: "eduRelief", label: "＋ 教育費自己負担の軽減（第3区分基準）", value: fmtWan(disposable.educationCostReliefWan), formula: `D N04 ＝ ＋${fmtWanAuto(disposable.educationCostReliefWan)}`, confidence: "provisional" },
          {
            key: "disposable",
            label: "可処分所得",
            value: fmtWan(disposable.disposableWan),
            formula: `${fmtWanAuto(disposable.takeHomeWan)} ＋ ${fmtWanAuto(disposable.allowanceWan)} − ${fmtWanAuto(disposable.medicalCostBurdenWan)} − ${fmtWanAuto(disposable.serviceFeeWan)} ＋ ${fmtWanAuto(disposable.educationCostReliefWan)} ＝ ${fmtWanAuto(disposable.disposableWan)}`,
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
