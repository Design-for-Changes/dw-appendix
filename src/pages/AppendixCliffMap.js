import "../App.css";
import { useEffect, useRef, useState } from "react";
import { CALCULATION_SOURCES } from "../calc/calculationSources";
import { useAppendixData } from "../hooks/useAppendixData";

const X_MIN = 200;
const X_MAX = 1400;

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

function buildPath(points, xScale, yScale) {
  const visible = points.filter((p) => p.x >= X_MIN && p.x <= X_MAX);
  return visible.map((p, i) => `${i === 0 ? "M" : "L"} ${xScale(p.x).toFixed(2)} ${yScale(p.disposable).toFixed(2)}`).join(" ");
}

function buildMetricPath(points, key, xScale, yScale, sign = 1) {
  const visible = points.filter((p) => p.x >= X_MIN && p.x <= X_MAX);
  return visible
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xScale(p.x).toFixed(2)} ${yScale(Number(p[key]) * sign).toFixed(2)}`)
    .join(" ");
}

function pointAt(series, salaryWan) {
  const x = Math.max(X_MIN, Math.min(X_MAX, Math.round(Number(salaryWan) || 0)));
  return series.find((p) => Number(p.x) === x) || series.reduce((best, p) => (Math.abs(p.x - x) < Math.abs(best.x - x) ? p : best), series[0]);
}

function Graph({ data, selectedId, selectedSalary, onSalaryChange }) {
  const scrollRef = useRef(null);
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

  useEffect(() => {
    const viewport = scrollRef.current;
    if (!viewport || viewport.scrollWidth <= viewport.clientWidth) return;
    const ratio = (selectedSalary - X_MIN) / (X_MAX - X_MIN);
    const target = ratio * viewport.scrollWidth - viewport.clientWidth / 2;
    viewport.scrollLeft = Math.max(0, Math.min(viewport.scrollWidth - viewport.clientWidth, target));
  }, [selectedSalary]);

  return (
    <div className="appendix-chart-control">
      <div className="appendix-chart-scroll" ref={scrollRef}>
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
          className={`appendix-line${d.id === selectedId ? " selected" : ""}`}
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
      </div>
      <label className="appendix-salary-control">
        <span>選択給与</span>
        <input
          type="range"
          min={X_MIN}
          max={X_MAX}
          step="1"
          value={selectedSalary}
          onChange={(event) => onSalaryChange(Number(event.currentTarget.value))}
          onInput={(event) => onSalaryChange(Number(event.currentTarget.value))}
        />
        <output>{fmt(selectedSalary)}万円</output>
      </label>
    </div>
  );
}

function OptimalModelGraph({ caseDef, selectedSalary, onSalaryChange }) {
  const scrollRef = useRef(null);
  const width = 1040;
  const height = 560;
  const pad = { left: 72, right: 28, top: 34, bottom: 62 };
  const series = caseDef?.optimalModel?.series || [];
  const selectedPoint = series.length ? pointAt(series, selectedSalary) : null;
  const values = series.flatMap((point) => [
    Number(point.balanceWan),
    Number(point.directSupportWan),
    -Number(point.burdenCapWan),
    Number(point.currentBalanceWan),
  ]);
  const maxAbs = Math.max(50, ...values.map((value) => Math.abs(value)));
  const yStep = maxAbs > 150 ? 50 : maxAbs > 80 ? 25 : 20;
  const yMin = -Math.ceil((maxAbs + yStep) / yStep) * yStep;
  const yMax = Math.ceil((maxAbs + yStep) / yStep) * yStep;
  const xScale = (x) => pad.left + ((Number(x) - X_MIN) / (X_MAX - X_MIN)) * (width - pad.left - pad.right);
  const yScale = (y) => pad.top + ((yMax - Number(y)) / (yMax - yMin)) * (height - pad.top - pad.bottom);
  const xTicks = [200, 400, 600, 800, 1000, 1200, 1400];
  const yTicks = Array.from({ length: Math.round((yMax - yMin) / yStep) + 1 }, (_, i) => yMin + yStep * i);
  const salaryFromClientX = (clientX, svg) => {
    const rect = svg.getBoundingClientRect();
    const viewX = ((clientX - rect.left) / rect.width) * width;
    const t = (viewX - pad.left) / (width - pad.left - pad.right);
    return Math.max(X_MIN, Math.min(X_MAX, Math.round(X_MIN + t * (X_MAX - X_MIN))));
  };
  const moveLine = (event) => {
    if (!event.currentTarget) return;
    onSalaryChange(salaryFromClientX(event.clientX, event.currentTarget));
  };

  useEffect(() => {
    const viewport = scrollRef.current;
    if (!viewport || viewport.scrollWidth <= viewport.clientWidth) return;
    const ratio = (selectedSalary - X_MIN) / (X_MAX - X_MIN);
    const target = ratio * viewport.scrollWidth - viewport.clientWidth / 2;
    viewport.scrollLeft = Math.max(0, Math.min(viewport.scrollWidth - viewport.clientWidth, target));
  }, [selectedSalary]);

  if (!series.length) {
    return <div className="appendix-empty">全体最適モデルの表示データがありません。</div>;
  }

  const lines = [
    { key: "currentBalanceWan", label: "現行制度の収支", color: "#7b878d", className: "optimal-line current" },
    { key: "balanceWan", label: "総合収支差額 G−U", color: caseDef.color, className: "optimal-line balance" },
    { key: "directSupportWan", label: "式による支給額 G", color: "#23805f", className: "optimal-line support" },
    { key: "burdenCapWan", label: "負担上限 −U", color: "#b34d39", className: "optimal-line burden", sign: -1 },
  ];

  return (
    <div className="appendix-chart-control">
      <div className="appendix-chart-scroll" ref={scrollRef}>
        <svg
          className="appendix-chart optimal-chart"
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`${caseDef.label}の現行制度と全体最適モデルの総合収支比較`}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            moveLine(event);
          }}
          onPointerMove={(event) => {
            if (event.buttons === 1) moveLine(event);
          }}
        >
          <rect className="appendix-chart-bg" x="0" y="0" width={width} height={height} />
          {yTicks.map((tick) => (
            <g key={`optimal-y-${tick}`}>
              <line
                className={`appendix-grid${tick === 0 ? " optimal-zero-line" : ""}`}
                x1={pad.left}
                x2={width - pad.right}
                y1={yScale(tick)}
                y2={yScale(tick)}
              />
              <text className="appendix-axis-label" x={pad.left - 10} y={yScale(tick) + 4} textAnchor="end">
                {fmt(tick)}
              </text>
            </g>
          ))}
          {xTicks.map((tick) => (
            <g key={`optimal-x-${tick}`}>
              <line className="appendix-grid appendix-grid-x" x1={xScale(tick)} x2={xScale(tick)} y1={pad.top} y2={height - pad.bottom} />
              <text className="appendix-axis-label" x={xScale(tick)} y={height - 24} textAnchor="middle">
                {tick}
              </text>
            </g>
          ))}
          <text className="appendix-axis-title" x={width / 2} y={height - 8} textAnchor="middle">
            給与収入（万円）
          </text>
          <text className="appendix-axis-title" transform={`translate(18 ${height / 2}) rotate(-90)`} textAnchor="middle">
            年間収支（万円）
          </text>

          {lines.map((line) => (
            <path
              key={line.key}
              d={buildMetricPath(series, line.key, xScale, yScale, line.sign || 1)}
              className={line.className}
              stroke={line.color}
            />
          ))}

          <g className="appendix-inlegend optimal-legend">
            {lines.map((line, index) => (
              <g key={line.key} transform={`translate(${pad.left + 14} ${pad.top + 16 + index * 22})`}>
                <line x1="-5" x2="7" y1="-4" y2="-4" stroke={line.color} strokeWidth="4" />
                <text x="15" y="0" fill={line.color}>
                  {line.label}
                </text>
              </g>
            ))}
          </g>

          {selectedPoint ? (
            <g className="appendix-cursor">
              <line x1={xScale(selectedPoint.x)} x2={xScale(selectedPoint.x)} y1={pad.top} y2={height - pad.bottom} />
              <text x={xScale(selectedPoint.x) + 8} y={pad.top + 18}>
                S＝{fmt(selectedPoint.x)}万
              </text>
              <circle
                cx={xScale(selectedPoint.x)}
                cy={yScale(selectedPoint.balanceWan)}
                r="7"
                fill={caseDef.color}
                stroke="#ffffff"
                strokeWidth="2"
              />
            </g>
          ) : null}
        </svg>
      </div>
      <label className="appendix-salary-control">
        <span>選択給与</span>
        <input
          type="range"
          min={X_MIN}
          max={X_MAX}
          step="1"
          value={selectedSalary}
          onChange={(event) => onSalaryChange(Number(event.currentTarget.value))}
          onInput={(event) => onSalaryChange(Number(event.currentTarget.value))}
        />
        <output>{fmt(selectedSalary)}万円</output>
      </label>
    </div>
  );
}

function OptimalModelSummary({ caseDef, selectedSalary }) {
  const model = caseDef?.optimalModel;
  const point = model?.series?.length ? pointAt(model.series, selectedSalary) : null;
  if (!model || !point) return <div className="appendix-empty">選択給与のモデル値を算出できません。</div>;
  const refundFormula = "R ＝ max｛0,（E − A）− U｝";
  return (
    <div className="optimal-model-content">
      <div className="optimal-metric-grid">
        <article>
          <span>負担能力指数 q</span>
          <strong>{fmt(point.ratio, 3)}</strong>
          <small>I ÷ D</small>
        </article>
        <article>
          <span>式による年間支給額 G</span>
          <strong>{fmtWan(point.directSupportWan)}</strong>
          <small>月額換算 {fmtYen(point.directSupportWan * 10000 / 12)}</small>
        </article>
        <article>
          <span>年間総合負担上限 U</span>
          <strong>{fmtWan(point.burdenCapWan)}</strong>
          <small>月額換算 {fmtYen(point.burdenCapWan * 10000 / 12)}</small>
        </article>
        <article className={point.balanceWan >= 0 ? "positive" : "negative"}>
          <span>総合収支差額 G−U</span>
          <strong>{point.balanceWan >= 0 ? "＋" : "▲"}{fmtWan(Math.abs(point.balanceWan))}</strong>
          <small>{point.balanceWan >= 0 ? "支給超過" : "世帯負担"}</small>
        </article>
      </div>
      <div className="optimal-formula-grid">
        <div>
          <h3>共通算定</h3>
          <p>q ＝ I ÷ D</p>
          <p>r ＝ clip（q − 1.5, 0, 1）</p>
          <p>年間需要額 D ＝ {fmtWan(point.needAnnualWan)}</p>
        </div>
        <div>
          <h3>支給・負担</h3>
          <p>G ＝ B（1 − r）</p>
          <p>U ＝ 0.10Dr</p>
          <p>基準支給額 B ＝ {fmtWan(model.baseSupportWan)}</p>
        </div>
        <div>
          <h3>実費補填後の還付</h3>
          <p>{refundFormula}</p>
          <p>E：対象支出　A：就学奨励費等の既補填額</p>
          <p>奨励費Aは支給として表示し、還付額から控除する。</p>
        </div>
      </div>
      <p className="optimal-model-note">
        現行制度の収支は、特児・障害児福祉手当・就学奨励費から、モデル上の医療費自己負担と通所利用者負担を差し引いた値。
        提案モデルの総合収支差額は、対象支出が総合負担上限に達した場合の G−U を表示する。
      </p>
    </div>
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
                <td className="appendix-mono appendix-pnum" data-label="崖">P{c.index}</td>
                <td data-label="給与収入">
                  <span className="appendix-mono">{fmt(c.x)}万</span>
                </td>
                <td className="appendix-cause" data-label="原因">
                  {(c.causes || []).map((cause) => (
                    <div key={`${c.index}-${cause.cause}`}>{cause.cause}</div>
                  ))}
                </td>
                <td data-label="変化内容">
                  {(c.causes || []).map((cause) => (
                    <div key={`${c.index}-${cause.cause}-${cause.whatHappened}`}>{cause.whatHappened}</div>
                  ))}
                </td>
                <td className="appendix-mono" data-label="落差">{fmt(Math.abs(c.drop), 1)}万</td>
                <td className="appendix-mono" data-label="後退点">{c.q ? `${fmt(c.q.x)}万` : "—"}</td>
                <td className="appendix-mono" data-label="復帰点">{c.r ? `${fmt(c.r.x)}万` : "回復せず"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SourceLink({ href, children }) {
  if (!href) return <span className="formula-source-missing">根拠未設定</span>;
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}

function CalculationTable({ title, subtitle, rows, note, wide, source, showSources = true }) {
  return (
    <section className={`formula-card${wide ? " wide" : ""}`}>
      <div className="formula-card-head">
        <h3>
          {title}
          {subtitle ? <small className="formula-subtitle"> {subtitle}</small> : null}
        </h3>
      </div>
      <div className="formula-table-wrap">
        <table className={`formula-table${showSources ? "" : " no-sources"}`}>
          <thead>
            <tr>
              <th>ラベル</th>
              <th>値</th>
              <th>計算式</th>
              {showSources ? <th>根拠資料</th> : null}
              {showSources ? <th>収録資料</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key || row.label} className={row.tone || ""}>
                <th scope="row">{row.label}</th>
                <td className="formula-value" data-label="値">{row.value}</td>
                <td className="formula-expression" data-label="計算式">{row.formula}</td>
                {showSources ? (
                  <td className="formula-source" data-label="根拠資料">
                    <SourceLink href={row.sourceUrl || source?.url}>{row.sourceLabel || source?.title || "原典"}</SourceLink>
                  </td>
                ) : null}
                {showSources ? (
                  <td className="formula-source" data-label="収録資料">
                    <SourceLink href={row.archivePath || source?.archivePath}>{row.archiveLabel || "GitHub収録版"}</SourceLink>
                  </td>
                ) : null}
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
                <td data-label="年齢">{fmt(c.age)}歳</td>
                <td data-label="障害区分">{childDisabilityLabel(c)}</td>
                <td data-label="特別児童扶養手当">{childTccaLabel(c)}</td>
                <td data-label="同居">{c.cohabit !== false ? "同居" : "別居"}</td>
                <td data-label="障害児福祉手当">{c.childWelfareAllowance ? "あり" : "—"}</td>
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
    if (String(label).startsWith("社会保険料控除")) return "社会保険料控除";
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
  const social = headRow.socialInsuranceBreakdown || {};
  const socialComponents = social.components || {};
  const socialFormulas = socialComponents.formulas || {};
  const taxSource = taxHead.incomeTax?.source || CALCULATION_SOURCES.incomeTax;
  const residentTaxSource = taxHead.residentTax?.source || CALCULATION_SOURCES.residentTax;
  const n04NeedSource = {
    sourceUrl: n04.need?.livelihoodSource?.url,
    sourceLabel: n04.need?.livelihoodSource?.title,
    archivePath: n04.need?.livelihoodSource?.archivePath,
  };

  return (
    <div className="formula-grid">
      {/* ===== A. 金額の流れ ＋ B. 控除（税・社保の土台。世帯主のみ） ===== */}
      {/* A 金額の流れ（世帯主）。控除は B を参照 */}
      <CalculationTable
        title="A. 基礎計算"
        wide
        source={taxSource}
        rows={[
          { key: "A1", label: "A1 給与収入", value: fmtWan(headRow.salaryWan, 0), formula: "縦ライン値（S）" },
          { key: "A2", label: "A2 給与所得", value: fmtWan(headRow.employmentIncomeWan), formula: "A1 − B1" },
          { key: "A3", label: "A3 所得税 課税所得", value: fmtWan(taxHead.incomeTax?.taxableWan), formula: "A2 −（B2〜B9：所得税側、千円未満切捨て）" },
          { key: "A4", label: "A4 住民税 課税所得", value: fmtWan(taxHead.residentTax?.taxableWan), formula: "A2 −（B2〜B9：住民税側、千円未満切捨て）", sourceUrl: residentTaxSource.url, sourceLabel: residentTaxSource.title, archivePath: residentTaxSource.archivePath },
          { key: "A5", label: "A5 所得税", value: fmtWan(taxHead.incomeTax?.taxWan), formula: taxHead.incomeTax?.formula },
          {
            key: "A6",
            label: "A6 住民税",
            value: fmtWan(taxHead.residentTax?.computedTaxWan),
            formula: taxHead.residentTax?.formula,
            sourceUrl: residentTaxSource.url,
            sourceLabel: residentTaxSource.title,
            archivePath: residentTaxSource.archivePath,
          },
          { key: "A7", label: "A7 基礎手取額", value: fmtWan(b.takeHome?.takeHomeWan), formula: "A1 − B2 − A5 − A6", tone: "strong" },
        ]}
      />

      {/* B 控除（所得税IT／住民税LT別）。給与所得控除B1はA2、社保B2ほかはA3/A4で使う */}
      <CalculationTable
        title="B. 計算に用いる控除（所得税／住民税）"
        wide
        source={taxSource}
        rows={[
          {
            key: "B1a",
            label: "B1a 給与所得控除",
            value: fmtWan(headRow.employmentIncomeBaseDeductionWan),
            formula: headRow.employmentIncomeDeductionDetail?.formula,
          },
          {
            key: "B1b",
            label: "B1b 所得金額調整控除",
            value: fmtWan(headRow.incomeAdjustmentDeductionWan),
            formula: headRow.employmentIncomeDeductionDetail?.incomeAdjustmentFormula,
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
            label: "B2a 健康保険料",
            value: fmtWan(social.healthWan),
            formula: socialFormulas.health,
            sourceUrl: social.sources?.healthCarePensionSupport?.url,
            sourceLabel: social.sources?.healthCarePensionSupport?.title,
            archivePath: social.sources?.healthCarePensionSupport?.archivePath,
          },
          {
            key: "B2b",
            label: "B2b 介護保険料",
            value: fmtWan(social.careWan),
            formula: socialFormulas.care,
            sourceUrl: social.sources?.healthCarePensionSupport?.url,
            sourceLabel: social.sources?.healthCarePensionSupport?.title,
            archivePath: social.sources?.healthCarePensionSupport?.archivePath,
          },
          {
            key: "B2c",
            label: "B2c 子ども・子育て支援金",
            value: fmtWan(social.childSupportContributionWan),
            formula: socialFormulas.support,
            sourceUrl: social.sources?.healthCarePensionSupport?.url,
            sourceLabel: social.sources?.healthCarePensionSupport?.title,
            archivePath: social.sources?.healthCarePensionSupport?.archivePath,
          },
          {
            key: "B2d",
            label: "B2d 厚生年金保険料",
            value: fmtWan(social.pensionWan),
            formula: socialFormulas.pension,
            sourceUrl: social.sources?.healthCarePensionSupport?.url,
            sourceLabel: social.sources?.healthCarePensionSupport?.title,
            archivePath: social.sources?.healthCarePensionSupport?.archivePath,
          },
          {
            key: "B2e",
            label: "B2e 雇用保険料",
            value: fmtWan(social.employmentWan),
            formula: socialFormulas.employment,
            sourceUrl: social.sources?.employment?.url,
            sourceLabel: social.sources?.employment?.title,
            archivePath: social.sources?.employment?.archivePath,
          },
          {
            key: "B2",
            label: "B2 社会保険料控除",
            value: fmtWan(headRow.socialInsuranceWan),
            formula: socialFormulas.total,
            tone: "strong",
          },
          {
            key: "B3",
            label: "B3 基礎控除",
            value: itLt(taxHead.deductions?.basicITWan, taxHead.deductions?.basicLTWan),
            formula: `${taxHead.deductions?.basicITDetail?.formula}／${taxHead.deductions?.basicLTDetail?.formula}`,
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
        note="B2はR8・東京都・賞与なし・年収を算定基礎とする率ベース近似。健保・介護・子ども・子育て支援金・厚生年金は本人負担分（保険料率の2分の1）、雇用保険は労働者負担率を用いる。B3〜B9は所得税側・住民税側を「所／住」で併記。"
      />

      {/* ===== C. 現金給付の判定（可処分所得に ＋） ===== */}
      {/* C 特別児童扶養手当 */}
      <CalculationTable
        title="T. 現金給付：特別児童扶養手当"
        wide
        confidence="strict"
        source={tcca.source}
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
          { key: "T3", label: "T3 本人 判定所得", value: fmtYen(tcca.headAdjustedIncomeYen), formula: tcca.formulas?.headJudgmentIncome },
          { key: "T4", label: "T4 本人 限度額", value: fmtYen(tcca.headLimitYen), formula: tcca.formulas?.headLimit },
          { key: "T5", label: "T5 本人判定", value: tccaHeadOk ? "通過" : "停止", formula: "T3 ≤ T4" },
          { key: "T6", label: "T6 扶養義務者 判定所得（最大）", value: fmtYen(tcca.familyMaxAdjustedIncomeYen), formula: "各扶養義務者の判定所得の最大" },
          { key: "T7", label: "T7 扶養義務者 限度額", value: fmtYen(tcca.familyLimitYen), formula: tcca.formulas?.familyLimit },
          { key: "T8", label: "T8 扶養義務者判定", value: tccaFamilyOk ? "通過" : "停止", formula: "T6 ≤ T7" },
          { key: "T9", label: "T9 支給判定", value: tcca.eligible ? "支給" : "不支給", formula: "T5 ∧ T8" },
          { key: "T10", label: "T10 支給月額", value: fmtYen(tcca.monthlyYen), formula: "T9が支給なら等級別月額合計" },
          { key: "T11", label: "T11 支給年額", value: fmtWan(tcca.annualWan), formula: tcca.formulas?.annual },
        ]}
      />

      {/* C 障害児福祉手当／特別障害者手当 */}
      <CalculationTable
        title="W. 現金給付：障害児福祉手当"
        wide
        confidence="strict"
        source={welfare.source}
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
          { key: "W3", label: "W3 扶養義務者 判定所得（最大）", value: fmtYen(welfare.obligorMaxAdjustedIncomeYen), formula: welfare.formulas?.obligorJudgmentIncome },
          { key: "W4", label: "W4 扶養義務者 限度額", value: fmtYen(welfare.obligorLimitYen), formula: welfare.formulas?.obligorLimit },
          { key: "W5", label: "W5 扶養義務者判定", value: welfare.obligorOk ? "通過" : "停止", formula: "W3 ≤ W4" },
          {
            key: "W6",
            label: "W6 支給判定",
            value: (welfare.recipients || []).length ? (welfare.monthlyYen > 0 ? "支給" : "不支給") : "対象なし",
            formula: "W5",
          },
          { key: "W7", label: "W7 支給月額 合計", value: fmtYen(welfare.monthlyYen), formula: "W6が支給なら対象児童分を合計" },
          { key: "W8", label: "W8 支給年額", value: fmtWan(welfare.annualWan), formula: welfare.formulas?.annual },
        ]}
      />

      {/* ===== D. 費用軽減にともなう自己負担（可処分所得から −） ===== */}
      {/* D 重心医療費助成（M01） */}
      <CalculationTable
        title="M. 自己負担：重心医療費助成"
        wide
        confidence="representative"
        source={m01.judgment?.source}
        rows={[
          { key: "M1", label: "M1 世帯所得割", value: fmtYen(m01.judgment?.householdLevyYen), formula: m01.judgment?.levyFormula },
          {
            key: "M2",
            label: "M2 所得割上限",
            value: fmtYen(m01.judgment?.cutoffYen),
            formula: m01.judgment?.cutoffFormula,
            sourceUrl: m01.judgment?.source?.url,
            sourceLabel: `${m01.judgment?.source?.title || "千葉県事務取扱要領"} ${m01.judgment?.source?.section || ""}`,
            archivePath: m01.judgment?.source?.archivePath,
          },
          { key: "M3", label: "M3 該当判定", value: m01.status, formula: m01.judgment?.formula },
          {
            key: "M4",
            label: "M4 助成対象医療費（代表値）",
            value: fmtYen(Number(m01.fullReliefWan || 0) * 10000),
            formula: m01.amountFormula?.formula,
            sourceUrl: m01.amountFormula?.source?.url,
            sourceLabel: m01.amountFormula?.source?.title,
            archivePath: m01.amountFormula?.source?.archivePath,
          },
          {
            key: "M5",
            label: "M5 医療費自己負担",
            value: fmtYen(Number(costBurden.medicalCostBurdenWan || 0) * 10000),
            formula: "M3が該当なら0、非該当ならM4",
            tone: "strong",
          },
        ]}
      />

      {/* D 就学奨励費（N04）＝教育費自己負担の軽減。基準＝第3区分（補助0）。コア確定378e692 */}
      <CalculationTable
        title="N. 費用軽減：就学奨励費"
        wide
        confidence="provisional"
        source={n04.judgment?.source}
        rows={[
          { key: "N1", label: "N1 世帯総所得", value: fmtWan(n04.judgment?.totalIncomeWan), formula: "世帯員の総所得を合計" },
          { key: "N2", label: "N2 控除額", value: fmtWan(n04.judgment?.deductionSumWan), formula: "N2a" },
          { key: "N2a", label: "N2a 社会保険料控除", value: fmtWan(n04.judgment?.deductions?.[0]?.wan), formula: "B2" },
          { key: "N3", label: "N3 月額収入額", value: fmtYen(n04.judgment?.monthlyMeasuredIncomeYen), formula: "（N1 − N2）÷ 12" },
          { key: "N4a", label: "N4a 生活扶助 第1類", value: fmtYen(n04.need?.firstClassAdjustedYen), formula: n04.need?.formulas?.firstClass, ...n04NeedSource },
          { key: "N4b", label: "N4b 生活扶助 第2類", value: fmtYen(n04.need?.secondClassYen), formula: n04.need?.formulas?.secondClass, ...n04NeedSource },
          { key: "N4c", label: "N4c 臨時加算", value: fmtYen(n04.need?.temporaryAdditionYen), formula: n04.need?.formulas?.temporary, ...n04NeedSource },
          { key: "N4d", label: "N4d 冬季加算（月平均）", value: fmtYen(n04.need?.winterAnnualizedYen), formula: n04.need?.formulas?.winter, ...n04NeedSource },
          { key: "N4e", label: "N4e 期末一時扶助（月平均）", value: fmtYen(n04.need?.yearEndAnnualizedYen), formula: n04.need?.formulas?.yearEnd, ...n04NeedSource },
          { key: "N4f", label: "N4f 障害者加算", value: fmtYen(n04.need?.disabilityAdditionYen), formula: n04.need?.formulas?.disability, ...n04NeedSource },
          { key: "N4g", label: "N4g 児童養育加算", value: fmtYen(n04.need?.childUpbringingAdditionYen), formula: n04.need?.formulas?.childUpbringing, ...n04NeedSource },
          { key: "N4h", label: "N4h 教育扶助", value: fmtYen(n04.need?.educationAssistanceYen), formula: n04.need?.formulas?.education, ...n04NeedSource },
          { key: "N4i", label: "N4i 住宅扶助", value: fmtYen(n04.need?.housingAssistanceYen), formula: n04.need?.formulas?.housing, ...n04NeedSource },
          {
            key: "N4",
            label: "N4 月額需要額",
            value: fmtYen(n04.need?.monthlyNeedYen),
            formula: n04.need?.formulas?.total,
            sourceUrl: n04.need?.livelihoodSource?.url,
            sourceLabel: n04.need?.livelihoodSource?.title,
            archivePath: n04.need?.livelihoodSource?.archivePath,
          },
          { key: "N5", label: "N5 収入額／需要額", value: fmt(n04.judgment?.ratio, 3), formula: "N3 ÷ N4" },
          { key: "N6", label: "N6 支弁区分", value: n04.supportClass, formula: n04.judgment?.formula },
          {
            key: "N7",
            label: "N7 区分別軽減単価",
            value: fmtYen(n04.amountFormula?.annualYenPerRecipient),
            formula: "N6の小学部モデル年額",
            sourceUrl: n04.need?.localSource?.url,
            sourceLabel: n04.need?.localSource?.title,
            archivePath: n04.need?.localSource?.archivePath,
          },
          { key: "N8", label: "N8 対象人数", value: `${fmt(n04.amountFormula?.count)}人`, formula: "対象児童数" },
          { key: "N9", label: "N9 教育費負担軽減", value: fmtWan(n04.annualWan), formula: n04.amountFormula?.formula, tone: "strong" },
        ]}
      />

      {/* ===== E. 利用者負担（可処分所得から −） ===== */}
      <CalculationTable
        title="E. 利用者負担：障害児通所支援（世帯上限）"
        wide
        confidence={service.confidence || "strict"}
        source={CALCULATION_SOURCES.serviceBurden}
        note="負担上限月額は世帯単位（複数児でも合算せず最も高い1つ。児福法施行令24条・27条の2）。一般2の実負担は上限37,200円ではなく、東京都R6調査の利用者負担平均10,406円を採用（上限は非拘束）。"
        rows={[
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
              formula: d.formula,
              sourceUrl: d.confidence === "representative" ? d.sources?.representative?.url : d.sources?.statutory?.url,
              sourceLabel: d.confidence === "representative" ? d.sources?.representative?.title : d.sources?.statutory?.title,
              archivePath: d.confidence === "representative" ? d.sources?.representative?.archivePath : d.sources?.statutory?.archivePath,
            })),
          {
            key: "E3",
            label: "E3 世帯月額負担",
            value: fmtYen(service.monthlyTotalYen),
            formula: service.calculation?.formula,
          },
          { key: "E4", label: "E4 年額負担", value: fmtWan(service.annualWan), formula: service.calculation?.annualFormula },
          { key: "E5", label: "E5 最終指標への扱い", value: "可処分所得から減算", formula: "G2 ＝ E4", tone: "strong" },
        ]}
      />

      {/* ===== F. 最終集計（一本の可処分所得） ===== */}
      {/* F 現金給付合計（＋） */}
      <CalculationTable
        title="F. 現金給付合計（＋）"
        wide
        showSources={false}
        note="M01・N04は現金給付ではなく費用軽減として負担側に分離。ここは実際に現金として受け取る給付だけを合計。"
        rows={[
          { key: "F1", label: "F1 基礎障害年金", value: fmtWan(allowance.basicDisabilityPensionWan), formula: "本人分 ＋ 配偶者分" },
          { key: "F2", label: "F2 特別児童扶養手当", value: fmtWan(allowance.tccaWan), formula: "T11" },
          { key: "F3", label: "F3 障害児福祉手当", value: fmtWan(allowance.welfareAllowanceWan), formula: "W8" },
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

      {/* G 費用（自己負担・軽減）: 医療・通所は自己負担、N04は教育費自己負担の軽減。給付側から分離 */}
      <CalculationTable
        title="G. 費用（自己負担・軽減）"
        wide
        showSources={false}
        note="現金給付ではない費用側の束。医療費（M01非該当時）・通所は自己負担。就学奨励費(N04)は第3区分（補助0）を基準とする教育費負担の軽減。"
        rows={[
          { key: "G1", label: "G1 医療費自己負担", value: fmtWan(costBurden.medicalCostBurdenWan), formula: "M5", confidence: "representative" },
          { key: "G2", label: "G2 通所利用者負担", value: fmtWan(costBurden.serviceFeeWan), formula: "E4" },
          { key: "G3", label: "G3 自己負担 小計", value: fmtWan(costBurden.totalWan), formula: "G1 ＋ G2" },
          { key: "G4", label: "G4 教育費自己負担の軽減", value: fmtWan(disposable.educationCostReliefWan), formula: "N9", confidence: "provisional" },
          {
            key: "G5",
            label: "G5 純費用",
            value: fmtWan(Number(costBurden.totalWan) - Number(disposable.educationCostReliefWan)),
            formula: "G3 − G4",
            tone: "strong",
          },
        ]}
      />

      {/* H 可処分所得（結論・一本集計） */}
      <CalculationTable
        title="H. 可処分所得（結論・一本集計）"
        wide
        showSources={false}
        note="最終指標は可処分所得の一本。「制度込み家計余力」という第二指標は作らない。"
        rows={[
          { key: "H1", label: "H1 手取り", value: fmtWan(disposable.takeHomeWan), formula: "A7" },
          { key: "H2", label: "H2 現金給付", value: fmtWan(disposable.allowanceWan), formula: "F6" },
          { key: "H3", label: "H3 医療費自己負担", value: fmtWan(disposable.medicalCostBurdenWan), formula: "G1", confidence: "representative" },
          { key: "H4", label: "H4 通所利用者負担", value: fmtWan(disposable.serviceFeeWan), formula: "G2" },
          { key: "H5", label: "H5 教育費負担軽減", value: fmtWan(disposable.educationCostReliefWan), formula: "G4", confidence: "provisional" },
          {
            key: "H6",
            label: "H6 可処分所得",
            value: fmtWan(disposable.disposableWan),
            formula: "H1 ＋ H2 − H3 − H4 ＋ H5",
            tone: "strong",
          },
        ]}
      />
    </div>
  );
}

export default function AppendixCliffMap() {
  const [viewMode, setViewMode] = useState("current");
  const [selectedId, setSelectedId] = useState("case3");
  const [selectedSalary, setSelectedSalary] = useState(900);
  const appendixData = useAppendixData(selectedId, selectedSalary);
  const { data, ready, selectedPoint } = appendixData;

  const selected = data.find((d) => d.id === selectedId) || data[0];
  const caseAccent = selected?.color || "#9aa7ad";
  const caseSectionStyle = {
    "--case-accent": caseAccent,
    "--case-bg": tintWhite(caseAccent, 0.86),
    "--case-card": tintWhite(caseAccent, 0.96),
  };

  return (
    <main className="App appendix-page">
      <section className="appendix-hero">
        <p className="appendix-kicker">モデル世帯による給付・負担構造</p>
        <h1>Web Appendix</h1>
      </section>

      <nav className="appendix-mode-tabs" aria-label="分析モード">
        <button
          type="button"
          className={viewMode === "current" ? "active" : ""}
          aria-pressed={viewMode === "current"}
          onClick={() => setViewMode("current")}
        >
          現行制度
        </button>
        <button
          type="button"
          className={viewMode === "optimal" ? "active" : ""}
          aria-pressed={viewMode === "optimal"}
          onClick={() => setViewMode("optimal")}
        >
          全体最適モデル
        </button>
      </nav>

      <section className="appendix-controls" aria-label="表示ケース">
        {data.map((c) => {
          const caseColor = c.color || "#9aa7ad";
          return (
            <button
              key={c.id}
              type="button"
              className={`appendix-case-button ${selectedId === c.id ? "active" : ""}`}
              style={{ "--case-color": caseColor }}
              aria-pressed={selectedId === c.id}
              onClick={() => setSelectedId(c.id)}
            >
              {c.label}
            </button>
          );
        })}
      </section>

      {!ready ? (
        <section className="appendix-panel">
          <div className="appendix-empty">
            {appendixData.error ? "表示データを読み込めませんでした。" : "表示データを読み込んでいます。"}
          </div>
        </section>
      ) : viewMode === "current" ? (
        <>
          <section className="appendix-panel appendix-panel-open">
            <Graph data={data} selectedId={selected?.id} selectedSalary={selectedSalary} onSalaryChange={setSelectedSalary} />
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
            {appendixData.detailReady ? (
              <BreakdownPanel point={selectedPoint} />
            ) : (
              <div className="appendix-empty">選択給与の計算内訳を読み込んでいます。</div>
            )}
          </section>
        </>
      ) : (
        <>
          <section className="appendix-panel optimal-intro" style={caseSectionStyle}>
            <div className="appendix-section-head">
              <div>
                <p className="appendix-kicker">制度横断の連続算定</p>
                <h2>全体最適モデル：{selected?.label}</h2>
                <p>
                  就学奨励費の収入額／需要額の考え方を連続式として用い、支給額と総合負担上限を同じ負担能力指数から算出する。
                </p>
              </div>
            </div>
          </section>
          <section className="appendix-panel appendix-panel-open">
            <OptimalModelGraph
              caseDef={selected}
              selectedSalary={selectedSalary}
              onSalaryChange={setSelectedSalary}
            />
          </section>
          <section className="appendix-panel appendix-panel-case" style={caseSectionStyle}>
            <div className="appendix-section-head">
              <div>
                <h2>選択給与でのモデル値</h2>
                <p>S値＝{fmt(selectedSalary)}万円</p>
              </div>
            </div>
            <OptimalModelSummary caseDef={selected} selectedSalary={selectedSalary} />
          </section>
          <section className="appendix-panel appendix-panel-case" style={caseSectionStyle}>
            <div className="appendix-section-head">
              <div>
                <h2>モデルケースの条件</h2>
              </div>
            </div>
            <CaseConditions caseDef={selected} />
          </section>
        </>
      )}
    </main>
  );
}
