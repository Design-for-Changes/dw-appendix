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
    note: "重心医療費助成の高さは伊勢原市H29決算の代表値。感度レンジ 149,531〜167,929円/年。",
  },
  provisional: {
    label: "暫定",
    note: "就学奨励費は住宅扶助・生活扶助・需要額調書・控除扱いの未確定点を残す代表設定。",
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

function confidenceBadge(kind) {
  return CONFIDENCE[kind] || CONFIDENCE.strict;
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

      {selectedPoint ? (
        <g className="appendix-cursor">
          <line x1={xScale(selectedPoint.x)} x2={xScale(selectedPoint.x)} y1={pad.top} y2={height - pad.bottom} />
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
            <th>給与収入</th>
            <th>原因</th>
            <th>変化内容</th>
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

function CalculationTable({ title, subtitle, confidence, rows, note, wide }) {
  const c = confidenceBadge(confidence);
  return (
    <section className={`formula-card${wide ? " wide" : ""}`}>
      <div className="formula-card-head">
        <h3>
          {title}
          {subtitle ? <small className="formula-subtitle"> {subtitle}</small> : null}
        </h3>
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
                <tr key={row.key || row.label} className={row.tone || ""}>
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
      {note ? <p className="formula-note">{note}</p> : null}
    </section>
  );
}

function itLt(itWan, ltWan) {
  return `所${fmtWan(itWan)}／住${fmtWan(ltWan)}`;
}

function incomeRowsFor(r) {
  return [
    {
      key: "salary",
      label: "給与収入",
      value: fmtWan(r.salaryWan, 0),
      formula: r.otherIncomeWan ? `＋その他所得 ${fmtWan(r.otherIncomeWan)}` : "掃引給与（世帯主は縦ラインの値）",
    },
    {
      key: "empBase",
      label: "給与所得控除（基礎）",
      value: fmtWan(r.employmentIncomeBaseDeductionWan),
      formula: "給与収入テーブルから引く基礎額",
    },
    {
      key: "incomeAdj",
      label: "所得金額調整控除",
      value: fmtWan(r.incomeAdjustmentDeductionWan),
      formula: "給与850万超・対象者のみ（最大15万）",
    },
    {
      key: "empDed",
      label: "給与所得控除（計）",
      value: fmtWan(r.employmentIncomeDeductionWan),
      formula: `基礎 ${fmtWan(r.employmentIncomeBaseDeductionWan)} ＋ 調整 ${fmtWan(r.incomeAdjustmentDeductionWan)}`,
    },
    {
      key: "empIncome",
      label: "給与所得",
      value: fmtWan(r.employmentIncomeWan),
      formula: `${fmtWan(r.salaryWan, 0)} − 給与所得控除 ${fmtWan(r.employmentIncomeDeductionWan)}`,
    },
    {
      key: "total",
      label: "総所得",
      value: fmtWan(r.totalIncomeWan),
      formula: `給与所得 ${fmtWan(r.employmentIncomeWan)} ＋ その他所得 ${fmtWan(r.otherIncomeWan)}`,
    },
    {
      key: "social",
      label: "社会保険料",
      value: fmtWan(r.socialInsuranceWan),
      formula: "年収ベース近似式（総額のみ・内訳なし）",
    },
  ];
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
      <ul className="case-cond-list">
        <li>
          <b>世帯主</b>：{h.head?.age ?? "—"}歳
        </li>
        {h.spouseEnabled ? (
          <li>
            <b>配偶者</b>：{h.spouse?.age ?? "—"}歳（給与収入なし）
          </li>
        ) : (
          <li>
            <b>配偶者</b>：なし
          </li>
        )}
        <li>
          <b>子ども</b>：{children.length}人
        </li>
      </ul>

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
  const ws = ded.widowSingleParent || { widow: {}, singleParent: {} };
  const si = b.socialInsurance || { byWho: [] };
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

  return (
    <div className="formula-grid">
      {/* ① 収入・控除（各人） */}
      {rows.map((r) => (
        <CalculationTable
          key={`income-${r.who}`}
          title={`① 収入・控除：${r.who}`}
          subtitle={`${fmt(r.age)}歳${r.disabled ? `・障害(${r.disabilityKind})` : ""}`}
          confidence="strict"
          rows={incomeRowsFor(r)}
        />
      ))}

      {/* ② 所得控除（所得税IT・住民税LT別） */}
      <CalculationTable
        title="② 所得控除（所得税IT／住民税LT別）"
        confidence="strict"
        note="所得税と住民税で額が異なる控除は両方を併記（所＝所得税、住＝住民税）。"
        rows={[
          { key: "dependent", label: "扶養控除", value: itLt(ded.dependent?.itWan, ded.dependent?.ltWan), formula: "子の年齢・所得帯で判定" },
          { key: "specialKin", label: "特定扶養（19–22歳）", value: itLt(ded.specialKin?.itWan, ded.specialKin?.ltWan), formula: "19〜22歳・扶養上限超の所得帯" },
          { key: "spouse", label: "配偶者控除", value: itLt(ded.spouse?.itWan, ded.spouse?.ltWan), formula: "配偶者所得×世帯主所得帯" },
          { key: "spouseSpecial", label: "配偶者特別控除", value: itLt(ded.spouseSpecial?.itWan, ded.spouseSpecial?.ltWan), formula: "配偶者控除が0のとき適用" },
          { key: "widow", label: "寡婦控除", value: itLt(ws.widow?.itWan, ws.widow?.ltWan), formula: "世帯主所得500万以下・条件付き" },
          { key: "singleParent", label: "ひとり親控除", value: itLt(ws.singleParent?.itWan, ws.singleParent?.ltWan), formula: "世帯主所得500万以下・条件付き" },
        ]}
      />

      {/* ③ 社会保険（総額・近似式） */}
      <CalculationTable
        title="③ 社会保険料（総額・近似式）"
        confidence="strict"
        note="★内訳（健保／介護／年金／雇用／子育て拠出）はコアが算定せず null。年収ベースの近似式で総額のみを求めており、標準報酬等級表による内訳割りは行っていない。"
        rows={[
          ...(si.byWho || []).map((s) => ({
            key: `si-${s.who}`,
            label: s.who,
            value: fmtWan(s.totalWan),
            formula: "健保/介護/年金/雇用/子育拠出＝内訳なし（null）",
          })),
          { key: "si-total", label: "社保 総額", value: fmtWan(si.totalWan), formula: "各人の合計", tone: "strong" },
        ]}
      />

      {/* ④ 税（人別内訳） */}
      <CalculationTable
        title="④ 税：人別内訳"
        wide
        confidence="strict"
        rows={(tax.byWho || []).flatMap((t) => [
          {
            key: `it-${t.who}`,
            label: `${t.who}・所得税`,
            value: fmtWan(t.incomeTax?.taxWan),
            formula: `課税所得 ${fmtWan(t.incomeTax?.taxableWan)} → 所得税 ${fmtWan(t.incomeTax?.taxWan)}`,
          },
          {
            key: `lt-${t.who}`,
            label: `${t.who}・住民税`,
            value: fmtWan(t.residentTax?.computedTaxWan),
            formula: `課税 ${fmtWan(t.residentTax?.taxableWan)} → 所得割 ${fmtWan(t.residentTax?.incomeLevyWan, 2)}（内 市町村分 ${fmtWan(t.residentTax?.municipalIncomeLevyWan, 2)}）＋ 均等割 ${fmtWan(t.residentTax?.perCapitaWan, 2)}`,
          },
        ])}
      />

      {/* ④ 税（集計） */}
      <CalculationTable
        title="④ 税：集計"
        confidence="strict"
        rows={[
          { key: "incomeTax", label: "所得税 合計", value: fmtWan(tax.incomeTaxWan), formula: "各人の所得税を合算" },
          { key: "residentTax", label: "住民税 合計", value: fmtWan(tax.residentTaxWan), formula: "各人の住民税（所得割＋均等割）を合算" },
          { key: "levy", label: "住民税所得割（市町村分）", value: fmtWan(tax.residentIncomeLevyWan, 2), formula: "★通所・重心医療費助成の該当判定に使う値" },
          { key: "tax-total", label: "税 合計", value: fmtWan(tax.totalWan), formula: "所得税 ＋ 住民税", tone: "strong" },
        ]}
      />

      {/* ⑤ 特別児童扶養手当（特児） */}
      <CalculationTable
        title="⑤ 特別児童扶養手当（特児）"
        confidence="strict"
        rows={[
          { key: "fuyo", label: "扶養人数", value: `${fmt(tcca.fuyoCount)}人`, formula: `限度額の法定加算 ${fmtYen(tcca.statutoryAddYen)}` },
          {
            key: "head",
            label: "本人判定",
            value: tccaHeadOk ? "通過" : "停止",
            formula: `判定所得 ${fmtYen(tcca.headAdjustedIncomeYen)} ${tccaHeadOk ? "≤" : ">"} 限度 ${fmtYen(tcca.headLimitYen)}`,
          },
          {
            key: "family",
            label: "扶養義務者判定",
            value: tccaFamilyOk ? "通過" : "停止",
            formula: `家族最大 ${fmtYen(tcca.familyMaxAdjustedIncomeYen)} ${tccaFamilyOk ? "≤" : ">"} 限度 ${fmtYen(tcca.familyLimitYen)}`,
          },
          { key: "elig", label: "支給判定", value: tcca.eligible ? "支給" : "不支給", formula: "本人 ∧ 扶養義務者 の両方通過で支給" },
          { key: "amt", label: "支給額", value: fmtWan(tcca.annualWan), formula: `${fmtYen(tcca.monthlyYen)}/月 × 12` },
        ]}
      />

      {/* ⑤ 障害児福祉手当 */}
      <CalculationTable
        title="⑤ 障害児福祉手当"
        confidence="strict"
        rows={[
          { key: "fuyo", label: "扶養人数", value: `${fmt(welfare.fuyoCount)}人`, formula: "扶養義務者限度額の算定基礎" },
          {
            key: "obligor",
            label: "扶養義務者判定",
            value: welfare.obligorOk ? "通過" : "停止",
            formula: `判定所得(最大) ${fmtYen(welfare.obligorMaxAdjustedIncomeYen)} ${welfare.obligorOk ? "≤" : ">"} 限度 ${fmtYen(welfare.obligorLimitYen)}`,
          },
          ...((welfare.recipients || []).length
            ? welfare.recipients.map((rc) => ({
                key: `wf-${rc.who}`,
                label: `${rc.who}・本人判定`,
                value: rc.ok ? "支給" : "不支給",
                formula: `本人所得 ${fmtYen(rc.selfYen)} vs 限度 ${fmtYen(rc.selfLimitYen)}（本人${rc.selfOk ? "○" : "×"}・義務者${rc.obligorOk ? "○" : "×"}）`,
              }))
            : [{ key: "wf-none", label: "対象者", value: "なし", formula: "受給対象者が存在しない" }]),
          { key: "amt", label: "支給額", value: fmtWan(welfare.annualWan), formula: `${fmtYen(welfare.monthlyYen)}/月 × 12` },
        ]}
      />

      {/* ⑤ 障害児通所支援（世帯上限） */}
      <CalculationTable
        title="⑤ 障害児通所支援（世帯上限）"
        wide
        confidence={service.confidence || "strict"}
        note="負担上限月額は世帯単位（複数児でも合算せず最も高い1つ。児福法施行令24条・27条の2）。一般2の実負担は上限37,200円ではなく、東京都R6調査の利用者負担平均10,406円を採用（上限は非拘束）。"
        rows={[
          {
            key: "levySum",
            label: "世帯 所得割合計",
            value: fmtWan(service.householdLevySumWan, 2),
            formula: "各人の住民税所得割（市町村分）を合算 → 区分判定に使用",
          },
          ...(service.details || []).map((d) => {
            const capYen = serviceCapYen(d);
            const usesRep = d.rawMonthlyYen != null && d.rawMonthlyYen < capYen;
            return {
              key: `svc-${d.who}`,
              label: `${d.who}（${fmt(d.age)}歳）`,
              value: d.type,
              confidence: d.confidence,
              formula: `所得割 ${fmtYen(d.householdLevyYen)} → 区分 ${d.type} → 上限 ${fmtYen(capYen)}/月${usesRep ? `（使用する代表値 ${fmtYen(d.rawMonthlyYen)}）` : ""}`,
            };
          }),
          {
            key: "svc-adopt",
            label: "世帯月額負担",
            value: fmtYen(service.monthlyTotalYen),
            formula: "各児の月額負担の最大を1つ採用（人数倍なし）",
            tone: "strong",
          },
          { key: "svc-annual", label: "年額負担", value: fmtWan(service.annualWan), formula: `${fmtYen(service.monthlyTotalYen)}/月 × 12` },
        ]}
      />

      {/* ⑤ 重心医療費助成 */}
      <CalculationTable
        title="⑤ 重心医療費助成"
        confidence="representative"
        rows={[
          {
            key: "judge",
            label: "判定",
            value: m01.status,
            formula: `所得割 ${fmtWan(m01.householdLevyWan, 2)} ${m01.eligible ? "<" : "≥"} 上限 ${fmtWan(m01.cutoffWan, 2)}`,
          },
          {
            key: "amt",
            label: "軽減効果",
            value: fmtWan(m01.annualWan),
            formula: `1人あたり ${fmtYen(m01.annualYenPerRecipient || 0)} × ${fmt(m01.count)}人（該当時は自己負担を軽減）`,
          },
          {
            key: "sens",
            label: "感度レンジ",
            value: `${fmtWan(m01.sensitivityRangeWan?.min)}〜${fmtWan(m01.sensitivityRangeWan?.max)}`,
            formula: "伊勢原市H29決算の代表値レンジ",
          },
        ]}
      />

      {/* ⑤ 就学奨励費 */}
      <CalculationTable
        title="⑤ 就学奨励費"
        confidence="provisional"
        rows={[
          {
            key: "class",
            label: "区分",
            value: n04.supportClass,
            formula: `給与 ${fmt(n04.salaryManyen)}万、境界 ${fmt(n04.boundaries?.firstToSecondManyen)} / ${fmt(n04.boundaries?.secondToThirdManyen)}万`,
          },
          {
            key: "amt",
            label: "崖分析上の補助効果",
            value: fmtWan(n04.annualWan),
            formula: `1人あたり ${fmtYen(n04.annualYenPerRecipient || 0)} × ${fmt(n04.count || 0)}人（可処分所得水準には加算せず、区分低下時の減少分だけを崖として扱う）`,
          },
        ]}
      />

      {/* ⑥ 現金給付合計 */}
      <CalculationTable
        title="⑥ 現金給付合計"
        wide
        confidence="strict"
        note="M01・N04は現金給付ではなく費用軽減として負担側に分離。ここでは実際に現金として受け取る給付だけを合計する。"
        rows={[
          { key: "pension", label: "基礎障害年金", value: fmtWan(allowance.basicDisabilityPensionWan), formula: "本人・配偶者の基礎年金" },
          { key: "tcca", label: "特別児童扶養手当", value: fmtWan(allowance.tccaWan), formula: "⑤特児より" },
          { key: "welfare", label: "障害児福祉手当", value: fmtWan(allowance.welfareAllowanceWan), formula: "⑤福祉手当より" },
          { key: "childSupport", label: "児童扶養手当", value: fmtWan(allowance.childSupportWan), formula: "ひとり親世帯のみ" },
          { key: "childAllowance", label: "児童手当", value: fmtWan(allowance.childAllowanceWan), formula: "18歳未満・出生順で加算" },
          { key: "allowance-total", label: "現金給付合計", value: fmtWan(allowance.totalWan), formula: "上記5内訳の合計", tone: "strong" },
        ]}
      />

      {/* ⑦ 自己負担合計 */}
      <CalculationTable
        title="⑦ 自己負担合計"
        wide
        confidence="strict"
        note="M01は代表値に基づく実費負担として計上。N04は実費総額を置かず、区分低下時の補助減少分だけを崖分析に使う。表示名は仮置き。"
        rows={[
          { key: "medical", label: "医療費自己負担", value: fmtWan(costBurden.medicalCostBurdenWan), formula: `M01軽減満額 ${fmtWan(m01.fullReliefWan)} − 現在の軽減効果 ${fmtWan(m01.annualWan)}`, confidence: "representative" },
          { key: "n04Cliff", label: "N04崖効果", value: fmtWan(costBurden.n04CliffEffectWan), formula: "可処分所得水準には入れず、崖表・回帰検証でだけ補助減少分として扱う", confidence: "provisional" },
          { key: "serviceFee", label: "通所利用料", value: fmtWan(costBurden.serviceFeeWan), formula: "⑤通所の年額負担より" },
          { key: "burden-total", label: "自己負担合計", value: fmtWan(costBurden.totalWan), formula: "医療費自己負担 ＋ 通所利用料（N04崖効果は含めない）", tone: "strong" },
        ]}
      />

      {/* ⑧ 可処分所得 */}
      <CalculationTable
        title="⑧ 可処分所得"
        confidence="strict"
        rows={[
          { key: "takeHome", label: "手取り", value: fmtWan(disposable.takeHomeWan), formula: `給与総額 − 社保 ${fmtWan(b.takeHome?.socialWan)} − 税 ${fmtWan(b.takeHome?.taxWan)}` },
          { key: "allowance", label: "現金給付", value: fmtWan(disposable.allowanceWan), formula: "⑥現金給付合計より（＋）" },
          { key: "medical", label: "医療費自己負担", value: fmtWan(disposable.medicalCostBurdenWan), formula: "⑦自己負担合計より（−）", confidence: "representative" },
          { key: "serviceFee", label: "通所利用料", value: fmtWan(disposable.serviceFeeWan), formula: "⑤通所の年額負担より（−）" },
          {
            key: "disposable",
            label: "可処分所得",
            value: fmtWan(disposable.disposableWan),
            formula: `${fmtWan(disposable.takeHomeWan)} ＋ 現金給付 ${fmtWan(disposable.allowanceWan)} − 医療 ${fmtWan(disposable.medicalCostBurdenWan)} − 通所 ${fmtWan(disposable.serviceFeeWan)}（N04は水準に含めない）`,
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
            <p>Pは変化点、Qは変化後の水準まで戻る左側の給与、Rは変化前の水準へ回復する右側の給与。</p>
          </div>
        </div>
        <CliffTable cliffs={selected?.cliffs || []} />
      </section>

      <section className="appendix-panel appendix-panel-case" style={caseSectionStyle}>
        <div className="appendix-section-head">
          <div>
            <h2>選択給与での計算過程</h2>
            <p>
              {selected?.label}：{selected?.description}
            </p>
          </div>
          <div className="appendix-big-number">
            <span>{fmt(selectedPoint?.x)}万円</span>
            <strong>{fmtWan(selectedPoint?.disposable)}</strong>
          </div>
        </div>
        <BreakdownPanel point={selectedPoint} />
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
