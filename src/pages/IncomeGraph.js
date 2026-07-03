// src/pages/IncomeGraph.js
import React, { useMemo, useState, useCallback } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { simulateHousehold } from "./IncomeCalc";
import "../App.css";

// 万円⇄円ヘルパ（小数1桁で丸め）
const WAN = 10000;
const toWan = (yen) =>
  isFinite(yen) ? Math.round(((yen || 0) / WAN) * 10) / 10 : 0;

// ─────────────────────────────────────────────
// 条件フォーム（条件1/2で同じUI）
// ─────────────────────────────────────────────
function ConditionForm({
  title,
  state,
  setState,
  onChildAdd,
  onChildDel,
  onChildUpdate,
}) {
  const nset = (key) => (e) =>
    setState((s) => ({
      ...s,
      [key]: e.target.value === "" ? "" : Number(e.target.value),
    }));
  const sset = (key) => (e) =>
    setState((s) => ({
      ...s,
      [key]: e.target.value,
    }));

  return (
    <div className="card mb">
      <h2 className="mt0">{title}</h2>

      <div className="grid2">
        <div>
          <h3 className="mt0">主／配偶者（年齢・配偶者の障害区分）</h3>
          <div className="row">
            <label>主の年齢</label>
            <input
              type="number"
              step={1}
              value={state.aAge}
              onChange={nset("aAge")}
            />
          </div>
          <div className="row">
            <label>配偶者の年齢</label>
            <input
              type="number"
              step={1}
              value={state.bAge}
              onChange={nset("bAge")}
            />
          </div>
          <div className="row">
            <label>配偶者の障害区分</label>
            <select value={state.bDisability} onChange={sset("bDisability")}>
              <option value="none">なし</option>
              <option value="general">一般</option>
              <option value="special">特別</option>
            </select>
          </div>
        </div>

        <div>
          <h3 className="mt0">配偶者の収入（X軸は主の給与を走査）</h3>
          <div className="row">
            <label>配偶者の給与（万円/年）</label>
            <input
              type="number"
              step={1}
              value={state.bSalaryWan}
              onChange={nset("bSalaryWan")}
            />
          </div>
        </div>
      </div>

      <div className="grid2">
        <div>
          <h4>主の賞与</h4>
          <div className="row">
            <label>賞与合計（万円/年）</label>
            <input
              type="number"
              step={0.1}
              value={state.bonusA}
              onChange={nset("bonusA")}
            />
          </div>
          <div className="row">
            <label>賞与回数（回/年）</label>
            <input
              type="number"
              min={1}
              max={6}
              step={1}
              value={state.bonusTimesA}
              onChange={nset("bonusTimesA")}
            />
          </div>
        </div>
        <div>
          <h4>配偶者の賞与</h4>
          <div className="row">
            <label>賞与合計（万円/年）</label>
            <input
              type="number"
              step={0.1}
              value={state.bonusB}
              onChange={nset("bonusB")}
            />
          </div>
          <div className="row">
            <label>賞与回数（回/年）</label>
            <input
              type="number"
              min={1}
              max={6}
              step={1}
              value={state.bonusTimesB}
              onChange={nset("bonusTimesB")}
            />
          </div>
        </div>
      </div>

      <h3>子ども</h3>
      <div className="mb flex" style={{ gap: 8, flexWrap: "wrap" }}>
        <button type="button" onClick={onChildAdd}>
          ＋ 子を追加
        </button>
        <button
          type="button"
          onClick={onChildDel}
          disabled={state.children.length === 0}
        >
          － 末尾を削除
        </button>
        <span className="muted">（最大5人）</span>
      </div>
      <div className="scroll-x">
        <table className="table">
          <thead>
            <tr>
              <th>#</th>
              <th>年齢</th>
              <th>年収（万円）</th>
              <th>障害区分</th>
              <th>同居</th>
            </tr>
          </thead>
          <tbody>
            {state.children.map((c, idx) => (
              <tr key={idx}>
                <td>{idx + 1}</td>
                <td>
                  <input
                    type="number"
                    step={1}
                    value={c.age}
                    onChange={(e) => onChildUpdate(idx, "age", e.target.value)}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    step={0.1}
                    value={c.incomeWan}
                    onChange={(e) =>
                      onChildUpdate(idx, "incomeWan", e.target.value)
                    }
                  />
                </td>
                <td>
                  <select
                    value={c.grade}
                    onChange={(e) =>
                      onChildUpdate(idx, "grade", e.target.value)
                    }
                  >
                    <option value="none">なし</option>
                    <option value="1">1級（=特別）</option>
                    <option value="2">2級（=一般）</option>
                  </select>
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={!!c.cohab}
                    onChange={(e) =>
                      onChildUpdate(idx, "cohab", e.target.checked)
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>判定所得に使う「認める控除」</h3>
      <div className="grid2">
        <div>
          <div className="row">
            <label>生命保険料（円）</label>
            <input
              type="number"
              step={1000}
              value={state.lifeInsPaid}
              onChange={nset("lifeInsPaid")}
            />
          </div>
          <div className="row">
            <label>地震保険料（円）</label>
            <input
              type="number"
              step={1000}
              value={state.quakeInsPaid}
              onChange={nset("quakeInsPaid")}
            />
          </div>
          <div className="row">
            <label>小規模企業共済（円）</label>
            <input
              type="number"
              step={1000}
              value={state.smallKPaid}
              onChange={nset("smallKPaid")}
            />
          </div>
        </div>
        <div>
          <div className="row">
            <label>医療費支出（円）</label>
            <input
              type="number"
              step={1000}
              value={state.medPaid}
              onChange={nset("medPaid")}
            />
          </div>
          <div className="row">
            <label>保険金等補填（円）</label>
            <input
              type="number"
              step={1000}
              value={state.medInsRec}
              onChange={nset("medInsRec")}
            />
          </div>
          <div className="row">
            <label>寄附金（円）</label>
            <input
              type="number"
              step={1000}
              value={state.donationPaid}
              onChange={nset("donationPaid")}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// 本体
// ─────────────────────────────────────────────
export default function IncomeGraph() {
  // X軸（世帯年収）
  const [xMax, setXMax] = useState(1500); // 0〜1500万円（主の給与を走査）
  const [step, setStep] = useState(10); // 10万円刻み

  // 条件1（完全独立）
  const [cond1, setCond1] = useState({
    bSalaryWan: 0,
    aAge: 35,
    bAge: 35,
    bDisability: "none", // none|general|special
    bonusA: 0,
    bonusTimesA: 2,
    bonusB: 0,
    bonusTimesB: 2,
    children: [],
    lifeInsPaid: 0,
    quakeInsPaid: 0,
    smallKPaid: 0,
    medPaid: 0,
    medInsRec: 0,
    donationPaid: 0,
  });

  // 条件2（完全独立）
  const [cond2, setCond2] = useState({
    bSalaryWan: 0,
    aAge: 35,
    bAge: 35,
    bDisability: "none",
    bonusA: 0,
    bonusTimesA: 2,
    bonusB: 0,
    bonusTimesB: 2,
    children: [],
    lifeInsPaid: 0,
    quakeInsPaid: 0,
    smallKPaid: 0,
    medPaid: 0,
    medInsRec: 0,
    donationPaid: 0,
  });

  // 入力ヘルパ
  const nsetTop = (fn) => (e) =>
    fn(e.target.value === "" ? "" : Number(e.target.value));

  // 1条件ぶんの系列を生成
  const buildRowsForCond = useCallback(
    (cond) => {
      const rows = [];
      for (let x = 0; x <= xMax; x += step) {
        const aWan = Math.max(0, x); // 主：X軸をそのまま
        const bWan = Math.max(0, cond.bSalaryWan || 0); // 配偶者：固定入力

        const sim = simulateHousehold({
          aSalaryWan: aWan,
          aBonusWan: cond.bonusA,
          aBonusTimes: cond.bonusTimesA,
          bSalaryWan: bWan,
          bBonusWan: cond.bonusB,
          bBonusTimes: cond.bonusTimesB,
          aAge: cond.aAge,
          bAge: cond.bAge,
          children: cond.children,
          bDisability: cond.bDisability,
          lifeInsPaid: cond.lifeInsPaid,
          quakeInsPaid: cond.quakeInsPaid,
          smallKPaid: cond.smallKPaid,
          medPaid: cond.medPaid,
          medInsRec: cond.medInsRec,
          donationPaid: cond.donationPaid,
        });

        const hh = sim.household;
        const allow = sim.allowanceYear || 0;
        const bd = sim.allowanceBreakdown || {};
        const pa = sim.personA || {};
        const pb = sim.personB || {};

        const detail = {
          a: {
            totalIncomeWan: toWan(pa.totalIncome),
            empDedWan: toWan(pa.empDed),
            socialWan: toWan(pa.socialTotal),
            childSupportWan: toWan(pa.childSupport),
            taxableITWan: toWan(pa.taxableIT),
            incomeTaxWan: toWan(pa.incomeTaxTotal),
            taxableLTWan: toWan(pa.taxableLT),
            localTaxAfterAdjWan: toWan(pa.localTaxAfterAdj),
            netWan: toWan(pa.net),
          },
          b: {
            totalIncomeWan: toWan(pb.totalIncome),
            empDedWan: toWan(pb.empDed),
            socialWan: toWan(pb.socialTotal),
            childSupportWan: toWan(pb.childSupport),
            taxableITWan: toWan(pb.taxableIT),
            incomeTaxWan: toWan(pb.incomeTaxTotal),
            taxableLTWan: toWan(pb.taxableLT),
            localTaxAfterAdjWan: toWan(pb.localTaxAfterAdj),
            netWan: toWan(pb.net),
          },
        };

        // 丸め前（円）を保持してから表示用に万円へ丸める
        const withYen = hh.net + allow;
        const withoutYen = hh.net;
        const allowYen = allow;
        const tkjYen = bd.tokujifuYearly || 0;
        const sjYen = bd.shojiYearly || 0;
        const tsYen = bd.tokushoYearly || 0;

        rows.push({
          x,
          withYen,
          withoutYen,
          allowYen,
          tkjYen,
          sjYen,
          tsYen,
          with: toWan(withYen),
          without: toWan(withoutYen),
          allow: toWan(allowYen),
          tkj: toWan(tkjYen),
          sj: toWan(sjYen),
          ts: toWan(tsYen),
          detail,
        });
      }
      return rows;
    },
    [xMax, step]
  );

  const data1 = useMemo(() => buildRowsForCond(cond1), [cond1, buildRowsForCond]);
  const data2 = useMemo(() => buildRowsForCond(cond2), [cond2, buildRowsForCond]);

  // 壁（>0 → 0 になる最初の x）
  // 丸め前（円）の値で壁検出することで早期ゼロ化による誤判定を防ぐ
  const findWall = (xs, key) => {
    for (let i = 1; i < xs.length; i++) {
      const prev = xs[i - 1][key] || 0;
      const cur = xs[i][key] || 0;
      if (prev > 0 && cur === 0) return xs[i].x;
    }
    return null;
  };
  const wall1 = {
    tkj: findWall(data1, "tkjYen"),
    sj: findWall(data1, "sjYen"),
    ts: findWall(data1, "tsYen"),
  };
  const wall2 = {
    tkj: findWall(data2, "tkjYen"),
    sj: findWall(data2, "sjYen"),
    ts: findWall(data2, "tsYen"),
  };

  // Recharts は単一 data 配列なので、cond1 をベースに cond2 を合成
  const mergedData = useMemo(() => {
    const byX2 = new Map(data2.map((r) => [r.x, r]));
    return data1.map((r1) => {
      const r2 = byX2.get(r1.x) || {};
      return {
        x: r1.x,
        y1_with: r1.with,
        y1_without: r1.without,
        y2_with: r2.with,
        y2_without: r2.without,
      };
    });
  }, [data1, data2]);

  // クリック/タップで詳細（スマホ対応）
  const [clickedX, setClickedX] = useState(null);
  const handleChartClick = (state) => {
    if (state && state.activeLabel != null) setClickedX(state.activeLabel);
  };
  const row1 = clickedX != null ? data1.find((r) => r.x === clickedX) : null;
  const row2 = clickedX != null ? data2.find((r) => r.x === clickedX) : null;
  const detail1 = row1?.detail;
  const detail2 = row2?.detail;

  // ── CSV出力（詳細＝cond1/cond2の手当内訳まで含む）
  const exportRows = useMemo(() => {
    const byX2 = new Map(data2.map((r) => [r.x, r]));
    return data1.map((r1) => {
      const r2 = byX2.get(r1.x) || {};
      return {
        x: r1.x,
        // 条件1
        y1_with: r1.with,
        y1_without: r1.without,
        y1_allow: r1.allow,
        y1_tkj: r1.tkj,
        y1_sj: r1.sj,
        y1_ts: r1.ts,
        // 条件2
        y2_with: r2.with,
        y2_without: r2.without,
        y2_allow: r2.allow,
        y2_tkj: r2.tkj,
        y2_sj: r2.sj,
        y2_ts: r2.ts,
      };
    });
  }, [data1, data2]);

  function toCSV(rows) {
    const headers = [
      "x",
      "y1_with", "y1_without", "y1_allow", "y1_tkj", "y1_sj", "y1_ts",
      "y2_with", "y2_without", "y2_allow", "y2_tkj", "y2_sj", "y2_ts",
    ];
    const lines = [headers.join(",")];
    for (const r of rows) {
      lines.push(headers.map((h) => (r[h] ?? "")).join(","));
    }
    return "\uFEFF" + lines.join("\n"); // BOM付き
  }

  function downloadCSV() {
    const csv = toCSV(exportRows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const pad = (n) => String(n).padStart(2, "0");
    const d = new Date();
    a.href = url;
    a.download = `income_graph_${d.getFullYear()}${pad(
      d.getMonth() + 1
    )}${pad(d.getDate())}_${pad(d.getHours())}${pad(
      d.getMinutes()
    )}${pad(d.getSeconds())}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="App page">
      <h1 className="App-title">所得グラフ（手取り計算統合版）</h1>
      <p className="App-text">
        条件1と条件2を<strong>別々に同じUI</strong>で設定して比較します。X軸は「主の給与（万円/年）」を走査し、配偶者は固定入力としました。上側に各手当の「所得制限の壁」を表示。グラフをクリック/タップすると下に詳細が出ます。
      </p>
      <p className="App-text">
        更新ログ：2026-02-11 10:00　基礎控除（所得税）62万円／給与所得控除 最低65万円に対応。子ども・子育て支援金（0.115%）を社会保険料に加算。
      </p>

      {/* 旧 手取り額計算シミュレーターの解説を統合 */}
      <div className="card mb" style={{ background: "rgba(0,0,0,.03)" }}>
        <h2 className="mt0">判定所得の計算式（共通）</h2>
        <div className="muted">
          判定所得 ＝（合計所得金額相当＝給与収入 − 給与所得控除）
          − <b>100,000</b>（給与/年金がある場合）
          − <b>認める控除合計</b>
          − <b>80,000</b>（社会保険料控除・本人/配偶者等ともに一律）
        </div>
      </div>

      <div className="card mb" style={{ background: "rgba(0,0,0,.03)" }}>
        <h2 className="mt0">判定所得に使う「認める控除」一覧</h2>
        <ul className="muted">
          <li>障害者控除（一般・特別）</li>
          <li>寡婦・ひとり親控除</li>
          <li>勤労学生控除</li>
          <li>配偶者特別控除</li>
          <li>社会保険料控除（本人・配偶者等ともに一律 80,000 円）</li>
          <li>小規模企業共済等掛金控除</li>
          <li>医療費控除</li>
          <li>生命保険料控除</li>
          <li>地震保険料控除</li>
          <li>寄附金控除</li>
          <li>雑損控除</li>
        </ul>
      </div>

      {/* X軸設定 */}
      <div className="card mb">
      <h2 className="mt0">X軸（主の給与 年額・万円）</h2>
      <div className="grid2">
        <div className="row">
          <label>主の給与 上限（万円）</label>
          <input
            type="number"
            step={10}
            value={xMax}
            onChange={nsetTop(setXMax)}
          />
        </div>
        <div className="row">
          <label>刻み（万円）</label>
          <input
            type="number"
            step={1}
            value={step}
            onChange={nsetTop(setStep)}
            />
          </div>
        </div>
      </div>

      {/* 条件1 */}
      <ConditionForm
        title="条件1"
        state={cond1}
        setState={setCond1}
        onChildAdd={() =>
          setCond1((s) =>
            s.children.length < 5
              ? {
                  ...s,
                  children: [
                    ...s.children,
                    { age: "", incomeWan: "", grade: "none", cohab: false },
                  ],
                }
              : s
          )
        }
        onChildDel={() =>
          setCond1((s) => ({ ...s, children: s.children.slice(0, -1) }))
        }
        onChildUpdate={(i, k, v) =>
          setCond1((s) => ({
            ...s,
            children: s.children.map((c, idx) =>
              idx === i ? { ...c, [k]: v } : c
            ),
          }))
        }
      />

      {/* 条件2 */}
      <ConditionForm
        title="条件2"
        state={cond2}
        setState={setCond2}
        onChildAdd={() =>
          setCond2((s) =>
            s.children.length < 5
              ? {
                  ...s,
                  children: [
                    ...s.children,
                    { age: "", incomeWan: "", grade: "none", cohab: false },
                  ],
                }
              : s
          )
        }
        onChildDel={() =>
          setCond2((s) => ({ ...s, children: s.children.slice(0, -1) }))
        }
        onChildUpdate={(i, k, v) =>
          setCond2((s) => ({
            ...s,
            children: s.children.map((c, idx) =>
              idx === i ? { ...c, [k]: v } : c
            ),
          }))
        }
      />

      {/* グラフ */}
      <div className="card mb">
        <div
          className="flex"
          style={{ justifyContent: "space-between", alignItems: "center", gap: 12 }}
        >
          <h2 className="mt0" style={{ marginBottom: 0 }}>
            手取り比較グラフ
          </h2>
          <button type="button" onClick={downloadCSV}>CSVダウンロード</button>
        </div>

        <div style={{ width: "100%", height: 460 }}>
          <ResponsiveContainer>
            <LineChart
              data={mergedData}
              margin={{ top: 24, right: 24, left: 10, bottom: 12 }}
              onClick={handleChartClick}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="x"
                type="number"
                domain={[0, xMax]}
                tickCount={Math.min(16, Math.floor(xMax / step) + 1)}
                label={{
                  value: "主の給与（万円/年）",
                  position: "insideBottom",
                  offset: -5,
                }}
              />
              <YAxis
                domain={[0, "dataMax"]}
                label={{ value: "手取り（万円）", angle: -90, position: "insideLeft" }}
              />
              <Tooltip labelFormatter={(label) => `主の給与：${label} 万円`} />
              <Legend />

              {/* 所得制限の壁（条件1：赤系） */}
              {wall1.tkj != null && (
                <ReferenceLine
                  x={wall1.tkj}
                  stroke="#d32f2f"
                  strokeDasharray="4 4"
                  label={{ value: "特児扶(1)", position: "top" }}
                />
              )}
              {wall1.sj != null && (
                <ReferenceLine
                  x={wall1.sj}
                  stroke="#f44336"
                  strokeDasharray="4 4"
                  label={{ value: "障児手(1)", position: "top" }}
                />
              )}
              {wall1.ts != null && (
                <ReferenceLine
                  x={wall1.ts}
                  stroke="#ef9a9a"
                  strokeDasharray="4 4"
                  label={{ value: "特障手(1)", position: "top" }}
                />
              )}

              {/* 所得制限の壁（条件2：青系） */}
              {wall2.tkj != null && (
                <ReferenceLine
                  x={wall2.tkj}
                  stroke="#1976d2"
                  strokeDasharray="4 4"
                  label={{ value: "特児扶(2)", position: "top" }}
                />
              )}
              {wall2.sj != null && (
                <ReferenceLine
                  x={wall2.sj}
                  stroke="#2196f3"
                  strokeDasharray="4 4"
                  label={{ value: "障児手(2)", position: "top" }}
                />
              )}
              {wall2.ts != null && (
                <ReferenceLine
                  x={wall2.ts}
                  stroke="#90caf9"
                  strokeDasharray="4 4"
                  label={{ value: "特障手(2)", position: "top" }}
                />
              )}

              {/* 条件1：色=マゼンタ系 */}
              <Line
                type="monotone"
                dataKey="y1_with"
                name="条件1：手当あり"
                dot={false}
                strokeWidth={2}
                stroke="#e91e63"
              />
              <Line
                type="monotone"
                dataKey="y1_without"
                name="条件1：手当なし"
                dot={false}
                strokeWidth={2}
                strokeDasharray="6 6"
                stroke="#e91e63"
              />

              {/* 条件2：色=ブルー系 */}
              <Line
                type="monotone"
                dataKey="y2_with"
                name="条件2：手当あり"
                dot={false}
                strokeWidth={2}
                stroke="#3f51b5"
              />
              <Line
                type="monotone"
                dataKey="y2_without"
                name="条件2：手当なし"
                dot={false}
                strokeWidth={2}
                strokeDasharray="6 6"
                stroke="#3f51b5"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="muted" style={{ marginTop: 8 }}>
          ※「壁」は簡易検出（手当額が正から0へ落ちる最初のX）。厳密な限度額ラインを常に表示したい場合は
          <code>simulateHousehold</code> の返り値に閾値（本人/配偶者等）を追加して参照してください。
        </div>
      </div>

      {/* クリック/タップの詳細（スマホ対応） */}
      <div className="card">
        <h2 className="mt0">クリック位置の詳細</h2>
        {clickedX == null && (
          <div className="muted">
            グラフをクリック / タップすると、この欄に条件1/2の詳細が表示されます。
          </div>
        )}
        {clickedX != null && (
          <>
            <div>
              主の給与：<b>{clickedX}</b> 万円
            </div>
            <div className="grid2">
              <div>
                <h4 className="mt0">条件1</h4>
                {row1 ? (
                  <ul className="muted">
                    <li>
                      手当あり：<b>{row1.with?.toLocaleString()} 万円</b>
                    </li>
                    <li>手当なし：{row1.without?.toLocaleString()} 万円</li>
                    <li>手当合計：{row1.allow?.toLocaleString()} 万円</li>
                    <li> ├ 特児扶：{row1.tkj?.toLocaleString()} 万円</li>
                    <li> ├ 障児手：{row1.sj?.toLocaleString()} 万円</li>
                    <li> └ 特障手：{row1.ts?.toLocaleString()} 万円</li>
                  </ul>
                ) : (
                  <div className="muted">データなし</div>
                )}
                {detail1 && (
                  <div className="card mt-half">
                    <h5 className="mt0">個別結果（主 / 配偶者）</h5>
                    <table className="table result-table">
                      <thead>
                        <tr><th></th><th className="text-right">主</th><th className="text-right">配偶者</th></tr>
                      </thead>
                      <tbody>
                        <tr><td>総収入</td><td className="text-right">{detail1.a.totalIncomeWan} 万円</td><td className="text-right">{detail1.b.totalIncomeWan} 万円</td></tr>
                        <tr><td>給与所得控除</td><td className="text-right">{detail1.a.empDedWan} 万円</td><td className="text-right">{detail1.b.empDedWan} 万円</td></tr>
                        <tr><td>社会保険 合計</td><td className="text-right">{detail1.a.socialWan} 万円</td><td className="text-right">{detail1.b.socialWan} 万円</td></tr>
                        <tr><td> └ 子育て支援金</td><td className="text-right">{detail1.a.childSupportWan} 万円</td><td className="text-right">{detail1.b.childSupportWan} 万円</td></tr>
                        <tr><td>課税所得（所得税）</td><td className="text-right">{detail1.a.taxableITWan} 万円</td><td className="text-right">{detail1.b.taxableITWan} 万円</td></tr>
                        <tr><td>所得税＋復興税</td><td className="text-right">{detail1.a.incomeTaxWan} 万円</td><td className="text-right">{detail1.b.incomeTaxWan} 万円</td></tr>
                        <tr><td>課税所得（住民税）</td><td className="text-right">{detail1.a.taxableLTWan} 万円</td><td className="text-right">{detail1.b.taxableLTWan} 万円</td></tr>
                        <tr><td>住民税（調整控除適用後）</td><td className="text-right">{detail1.a.localTaxAfterAdjWan} 万円</td><td className="text-right">{detail1.b.localTaxAfterAdjWan} 万円</td></tr>
                      </tbody>
                      <tfoot>
                        <tr><td><strong>手取り（年）</strong></td><td className="text-right"><strong>{detail1.a.netWan} 万円</strong></td><td className="text-right"><strong>{detail1.b.netWan} 万円</strong></td></tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
              <div>
                <h4 className="mt0">条件2</h4>
                {row2 ? (
                  <ul className="muted">
                    <li>
                      手当あり：<b>{row2.with?.toLocaleString()} 万円</b>
                    </li>
                    <li>手当なし：{row2.without?.toLocaleString()} 万円</li>
                    <li>手当合計：{row2.allow?.toLocaleString()} 万円</li>
                    <li> ├ 特児扶：{row2.tkj?.toLocaleString()} 万円</li>
                    <li> ├ 障児手：{row2.sj?.toLocaleString()} 万円</li>
                    <li> └ 特障手：{row2.ts?.toLocaleString()} 万円</li>
                  </ul>
                ) : (
                  <div className="muted">データなし</div>
                )}
                {detail2 && (
                  <div className="card mt-half">
                    <h5 className="mt0">個別結果（主 / 配偶者）</h5>
                    <table className="table result-table">
                      <thead>
                        <tr><th></th><th className="text-right">主</th><th className="text-right">配偶者</th></tr>
                      </thead>
                      <tbody>
                        <tr><td>総収入</td><td className="text-right">{detail2.a.totalIncomeWan} 万円</td><td className="text-right">{detail2.b.totalIncomeWan} 万円</td></tr>
                        <tr><td>給与所得控除</td><td className="text-right">{detail2.a.empDedWan} 万円</td><td className="text-right">{detail2.b.empDedWan} 万円</td></tr>
                        <tr><td>社会保険 合計</td><td className="text-right">{detail2.a.socialWan} 万円</td><td className="text-right">{detail2.b.socialWan} 万円</td></tr>
                        <tr><td> └ 子育て支援金</td><td className="text-right">{detail2.a.childSupportWan} 万円</td><td className="text-right">{detail2.b.childSupportWan} 万円</td></tr>
                        <tr><td>課税所得（所得税）</td><td className="text-right">{detail2.a.taxableITWan} 万円</td><td className="text-right">{detail2.b.taxableITWan} 万円</td></tr>
                        <tr><td>所得税＋復興税</td><td className="text-right">{detail2.a.incomeTaxWan} 万円</td><td className="text-right">{detail2.b.incomeTaxWan} 万円</td></tr>
                        <tr><td>課税所得（住民税）</td><td className="text-right">{detail2.a.taxableLTWan} 万円</td><td className="text-right">{detail2.b.taxableLTWan} 万円</td></tr>
                        <tr><td>住民税（調整控除適用後）</td><td className="text-right">{detail2.a.localTaxAfterAdjWan} 万円</td><td className="text-right">{detail2.b.localTaxAfterAdjWan} 万円</td></tr>
                      </tbody>
                      <tfoot>
                        <tr><td><strong>手取り（年）</strong></td><td className="text-right"><strong>{detail2.a.netWan} 万円</strong></td><td className="text-right"><strong>{detail2.b.netWan} 万円</strong></td></tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
