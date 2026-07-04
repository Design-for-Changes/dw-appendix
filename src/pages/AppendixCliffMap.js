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
import { useStaticTables } from "./disabilityWelfare/useStaticTables";

const X_MIN = 400;
const X_MAX = 1500;
const COLORS = ["#2358a6", "#8f3d67", "#2f6f5e", "#a2521d", "#5d4ca0"];

const CASES = [
  {
    id: "A",
    label: "A: 特児2級・子1人",
    minDropManyen: 3,
    household: {
      spouseEnabled: false,
      head: { age: 40 },
      children: [{ age: 10, disabled: true, specialDisabled: true, cohabit: true, tccaGrade: "2" }],
    },
    causes: [
      { x: 740, label: "特別児童扶養手当" },
      { x: 892, label: "障害児通所支援" },
    ],
  },
  {
    id: "F",
    label: "F: 特児1級＋障害児福祉手当",
    minDropManyen: 3,
    household: {
      spouseEnabled: false,
      head: { age: 40 },
      children: [
        {
          age: 10,
          disabled: true,
          specialDisabled: true,
          cohabit: true,
          tccaGrade: "1",
          childWelfareAllowance: true,
        },
      ],
    },
    causes: [
      { x: 740, label: "特別児童扶養手当" },
      { x: 892, label: "障害児通所支援" },
      { x: 907, label: "障害児福祉手当" },
    ],
  },
  {
    id: "G",
    label: "G: 特児1級＋福祉手当・子2人",
    minDropManyen: 3,
    household: {
      spouseEnabled: false,
      head: { age: 40 },
      children: [
        {
          age: 10,
          disabled: true,
          specialDisabled: true,
          cohabit: true,
          tccaGrade: "1",
          childWelfareAllowance: true,
        },
        {
          age: 10,
          disabled: true,
          specialDisabled: true,
          cohabit: true,
          tccaGrade: "1",
          childWelfareAllowance: true,
        },
      ],
    },
    causes: [
      { x: 827, label: "特別児童扶養手当" },
      { x: 956, label: "障害児通所支援" },
      { x: 968, label: "障害児福祉手当" },
    ],
  },
  {
    id: "M01",
    label: "M01: 医療費助成を含む",
    minDropManyen: 3,
    household: {
      spouseEnabled: false,
      head: { age: 40 },
      programs: { m01: true },
      children: [{ age: 10, disabled: true, specialDisabled: true, cohabit: true, tccaGrade: "2" }],
    },
    causes: [
      { x: 740, label: "特別児童扶養手当" },
      { x: 803, label: "重心医療費助成" },
      { x: 892, label: "障害児通所支援" },
    ],
  },
  {
    id: "N04",
    label: "N04: 就学奨励費を含む",
    minDropManyen: 2.5,
    household: {
      spouseEnabled: false,
      head: { age: 40 },
      programs: { n04: true },
      children: [{ age: 10, disabled: true, specialDisabled: true, cohabit: true, tccaGrade: "2" }],
    },
    causes: [
      { x: 740, label: "特別児童扶養手当" },
      { x: 747, label: "就学奨励費 第1→第2" },
      { x: 892, label: "障害児通所支援" },
      { x: 1055, label: "就学奨励費 第2→第3" },
    ],
  },
];

function makeTables(staticTables) {
  return {
    emp: staticTables.empStatic,
    basicIT: staticTables.basicITStatic,
    basicLT: staticTables.basicLTStatic,
    socialU40: staticTables.socialU40Static,
    socialO40: staticTables.socialO40Static,
    taxTable: staticTables.taxTableStatic,
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

function causeFor(caseDef, x) {
  const exact = caseDef.causes?.find((c) => Math.abs(Number(c.x) - Number(x)) <= 1);
  return exact?.label || "制度境界";
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
    rows.push({
      index: rows.length + 1,
      x: Number(cur.x),
      yBefore,
      yAfter,
      drop: delta,
      cause: causeFor(caseDef, cur.x),
      q,
      r,
      unrecoveredShortfall: r ? 0 : Math.max(0, yBefore - yAtMax),
    });
  }
  return rows;
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

function buildPath(points, xScale, yScale) {
  const visible = points.filter((p) => p.x >= X_MIN && p.x <= X_MAX);
  return visible.map((p, i) => `${i === 0 ? "M" : "L"} ${xScale(p.x).toFixed(2)} ${yScale(p.disposable).toFixed(2)}`).join(" ");
}

function Graph({ data, selectedId }) {
  const width = 980;
  const height = 520;
  const pad = { left: 64, right: 24, top: 24, bottom: 56 };
  const allVisible = data.flatMap((d) => d.series.filter((p) => p.x >= X_MIN && p.x <= X_MAX));
  const yMinRaw = Math.min(...allVisible.map((p) => Number(p.disposable)));
  const yMaxRaw = Math.max(...allVisible.map((p) => Number(p.disposable)));
  const yMin = Math.floor((yMinRaw - 20) / 50) * 50;
  const yMax = Math.ceil((yMaxRaw + 20) / 50) * 50;
  const xScale = (x) => pad.left + ((Number(x) - X_MIN) / (X_MAX - X_MIN)) * (width - pad.left - pad.right);
  const yScale = (y) => pad.top + ((yMax - Number(y)) / (yMax - yMin)) * (height - pad.top - pad.bottom);
  const selected = data.find((d) => d.id === selectedId);
  const xTicks = [400, 600, 800, 1000, 1200, 1400, 1500];
  const yTicks = Array.from({ length: 6 }, (_, i) => yMin + ((yMax - yMin) / 5) * i);

  return (
    <svg className="appendix-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="給与と可処分所得の関係">
      <rect className="appendix-chart-bg" x="0" y="0" width={width} height={height} rx="0" />
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

      {selected?.cliffs.map((cliff, i) => {
        const color = COLORS[i % COLORS.length];
        const points = [
          { key: "P", x: cliff.x, y: cliff.yAfter, label: `P${cliff.index}` },
          cliff.q ? { key: "Q", x: cliff.q.x, y: cliff.q.disposable, label: `Q${cliff.index}` } : null,
          cliff.r ? { key: "R", x: cliff.r.x, y: cliff.r.disposable, label: `R${cliff.index}` } : null,
        ].filter(Boolean);
        return points.map((p) => (
          <g key={`${cliff.index}-${p.key}`} className="appendix-marker-group">
            <circle className="appendix-marker" cx={xScale(p.x)} cy={yScale(p.y)} r="6" fill={color} />
            <text className="appendix-marker-label" x={xScale(p.x) + 9} y={yScale(p.y) - 9} fill={color}>
              {p.label}
            </text>
          </g>
        ));
      })}
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
            <th>崖</th>
            <th>制度</th>
            <th>P</th>
            <th>崖直前→直後</th>
            <th>落差</th>
            <th>Q</th>
            <th>P−Q</th>
            <th>R</th>
            <th>R−P</th>
          </tr>
        </thead>
        <tbody>
          {cliffs.map((c) => {
            const qWidth = c.q ? c.x - c.q.x : null;
            const rWidth = c.r ? c.r.x - c.x : null;
            return (
              <tr key={c.index}>
                <td className="appendix-mono">P{c.index}/Q{c.index}/R{c.index}</td>
                <td>{c.cause}</td>
                <td className="appendix-mono">{fmt(c.x)}万</td>
                <td className="appendix-mono">
                  {fmt(c.yBefore, 1)}→{fmt(c.yAfter, 1)}
                </td>
                <td className="appendix-mono">{fmt(Math.abs(c.drop), 1)}万</td>
                <td className="appendix-mono">{c.q ? `${fmt(c.q.x)}万` : "なし"}</td>
                <td className="appendix-mono">{qWidth == null ? "—" : `${fmt(qWidth)}万`}</td>
                <td className="appendix-mono">
                  {c.r ? `${fmt(c.r.x)}万` : `1500万でも回復せず（不足${fmt(c.unrecoveredShortfall, 1)}万）`}
                </td>
                <td className="appendix-mono">{rWidth == null ? "到達不能" : `${fmt(rWidth)}万`}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function AppendixCliffMap() {
  const [selectedId, setSelectedId] = useState("G");
  const staticTables = useStaticTables();
  const ready =
    staticTables.staticReady &&
    staticTables.empStatic?.length &&
    staticTables.basicITStatic?.length &&
    staticTables.basicLTStatic?.length &&
    staticTables.socialU40Static?.length &&
    staticTables.socialO40Static?.length &&
    staticTables.taxTableStatic?.length;

  const data = useMemo(() => {
    if (!ready) return [];
    const tables = makeTables(staticTables);
    return CASES.map((caseDef, i) => {
      const series = computeSeries({
        household: buildHousehold(caseDef.household),
        scenario: "S2_R7",
        tables,
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

  return (
    <main className="App appendix-page">
      <section className="appendix-header">
        <div>
          <p className="appendix-kicker">WEB APPENDIX</p>
          <h1 className="appendix-title">所得制限の崖と回復点</h1>
        </div>
        <div className="appendix-summary">
          <span>横軸上限 1500万円</span>
          <span>計算コア由来</span>
          <span>P/Q/R方式</span>
        </div>
      </section>

      <section className="appendix-controls" aria-label="表示ケース">
        {CASES.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`appendix-case-button ${selectedId === c.id ? "active" : ""}`}
            aria-pressed={selectedId === c.id}
            onClick={() => setSelectedId(c.id)}
          >
            {c.label}
          </button>
        ))}
      </section>

      <section className="appendix-panel">
        {!ready ? (
          <div className="appendix-empty">計算テーブルを読み込んでいます。</div>
        ) : (
          <>
            <Graph data={data} selectedId={selected?.id} />
            <div className="appendix-legend" aria-label="ケース凡例">
              {data.map((d) => (
                <span key={d.id} className={d.id === selected?.id ? "active" : ""}>
                  <i style={{ background: d.color }} aria-hidden="true" />
                  {d.label}
                </span>
              ))}
            </div>
          </>
        )}
      </section>

      <section className="appendix-panel appendix-table-panel">
        <div className="appendix-section-head">
          <h2>{selected?.label || "選択ケース"}</h2>
          <p>Pは崖点、Qは崖後の水準まで戻る左側の給与、Rは崖前の水準へ回復する右側の給与です。</p>
        </div>
        <CliffTable cliffs={selected?.cliffs || []} />
      </section>
    </main>
  );
}
