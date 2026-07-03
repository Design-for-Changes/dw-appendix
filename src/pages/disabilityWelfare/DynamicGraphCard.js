import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";

const fmt1 = (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(1) : "-");

const CHART_BOX_STYLE = { width: "100%", height: "50vh", maxHeight: 420, minHeight: 260 };
const BASE_MARGIN = { top: 18, right: 18, left: 6, bottom: 28 };
const MARKER_LINE_COLOR = "#F3B08A";

function MarkerLineX({ x, stroke = MARKER_LINE_COLOR, strokeDasharray = "4 2" }) {
  const n = Number(x);
  if (!Number.isFinite(n)) return null;
  return <ReferenceLine x={n} stroke={stroke} strokeDasharray={strokeDasharray} />;
}

function tint(hex) {
  const bg = `color-mix(in oklab, ${hex} 14%, transparent)`;
  return {
    bar: { background: bg, borderLeft: `6px solid ${hex}` },
    bgOnly: { background: bg },
  };
}

export default function DynamicGraphCard({
  calcVersion,
  seriesReady,
  householdSeries,
  householdSeriesDisplay,
  displayHeadSalaryWan,
}) {
  const p = useMemo(() => {
    if (!householdSeries || householdSeries.length === 0) return {};
    const idx = Math.max(0, Math.min((Number(displayHeadSalaryWan) || 1) - 1, householdSeries.length - 1));
    return householdSeries[idx] || {};
  }, [householdSeries, displayHeadSalaryWan]);

  const disposable = Number(p.disposable) || 0;
  const disposableStyle = disposable < 0 ? { color: "#d32f2f", fontWeight: 700 } : { fontWeight: 700 };

  const rowTint = useMemo(
    () => ({
      takeHome: tint("#2C89B6"), // 手取り（青）
      allowance: tint("#5FAF8D"), // 手当
      service: tint("#D9C24A"), // サービス利用料（黄色っぽい）
      tax: tint("#D8875F"), // 税
      social: tint("#E0A24A"), // 社保（オレンジ寄り）
      disposable: tint("#D34B4B"), // 可処分所得（赤ライン）
    }),
    []
  );

  const disposableDecreaseStarts = useMemo(() => {
    // 可処分所得が減少し始める x（連続区間は1本にまとめる）
    if (!householdSeries || householdSeries.length < 2) return [];
    const starts = [];
    let inDec = false;
    for (let i = 1; i < householdSeries.length; i++) {
      const prev = Number(householdSeries[i - 1]?.disposable) || 0;
      const cur = Number(householdSeries[i]?.disposable) || 0;
      const dec = cur - prev < 0;
      if (dec && !inDec) {
        starts.push(Number(householdSeries[i]?.x) || 0);
        inDec = true;
      } else if (!dec && inDec) {
        inDec = false;
      }
    }
    return starts.filter((x) => Number.isFinite(Number(x)) && Number(x) > 0);
  }, [householdSeries]);

  const decreaseReasons = useMemo(() => {
    // 減少開始点ごとに差分を分解（1万円刻みの計算結果を使用）
    if (!householdSeries || householdSeries.length < 2) return [];
    const out = [];
    let inDec = false;
    for (let i = 1; i < householdSeries.length; i++) {
      const prev = householdSeries[i - 1] || {};
      const cur = householdSeries[i] || {};
      const dDisp = (Number(cur.disposable) || 0) - (Number(prev.disposable) || 0);
      const dec = dDisp < 0;
      if (dec && !inDec) {
        out.push({
          prevX: Number(prev.x) || i,
          x: Number(cur.x) || i + 1,
          dDisp,
          dTax: (Number(cur.tax) || 0) - (Number(prev.tax) || 0),
          dSocial: (Number(cur.social) || 0) - (Number(prev.social) || 0),
          dService: (Number(cur.service) || 0) - (Number(prev.service) || 0),
          dAllow: (Number(cur.allowance) || 0) - (Number(prev.allowance) || 0),
        });
        inDec = true;
      } else if (!dec && inDec) {
        inDec = false;
      }
    }
    return out;
  }, [householdSeries]);

  if (calcVersion <= 0) {
    return (
      <p style={{ margin: "5px 0 0", lineHeight: 1.6, opacity: 0.85 }}>
        まず「計算」を押して、グラフ用の系列を作成してください。
      </p>
    );
  }
  if (!seriesReady) return <p style={{ margin: "5px 0 0", lineHeight: 1.6, opacity: 0.85 }}>計算中...</p>;
  if (!householdSeries || householdSeries.length === 0) {
    return <p style={{ margin: "5px 0 0", lineHeight: 1.6, opacity: 0.85 }}>グラフ用データがありません。</p>;
  }

  return (
    <>
      <div style={CHART_BOX_STYLE}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={householdSeriesDisplay} margin={BASE_MARGIN}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="x"
              type="number"
              domain={[1, 1500]}
              tick={{ fontSize: "clamp(10px, 2.2vw, 15px)" }}
              tickLine={false}
              axisLine={{ stroke: "rgba(0,0,0,0.35)" }}
              label={{
                value: "世帯主の給与収入（万円/年）",
                position: "insideBottom",
                offset: -8,
                style: { fontSize: "clamp(10px, 2.2vw, 15px)" },
              }}
            />
            <YAxis
              type="number"
              domain={["dataMin", "dataMax"]}
              allowDataOverflow={true}
              tickFormatter={(v) => `${Math.trunc(Number(v) || 0)}`}
              tick={{ fontSize: "clamp(10px, 2.2vw, 15px)" }}
              tickLine={false}
              axisLine={{ stroke: "rgba(0,0,0,0.35)" }}
            />

            {/* 収入(+側) / 支出(-側) を別 stackId で積み上げ（ホバー無し） */}
            <Area
              type="linear"
              dataKey="gross"
              name="収入合計（給与+給与以外）"
              stackId="pos"
              stroke="#2C89B6"
              fill="#7BC6E3"
              fillOpacity={0.85}
              isAnimationActive={false}
              dot={false}
              activeDot={false}
            />
            <Area
              type="linear"
              dataKey="allowance"
              name="手当"
              stackId="pos"
              stroke="#5FAF8D"
              fill="#A9E1C9"
              fillOpacity={0.8}
              isAnimationActive={false}
              dot={false}
              activeDot={false}
            />
            <Area
              type="linear"
              dataKey="expService"
              name="障害福祉サービス利用料"
              stackId="neg"
              stroke="#D9C24A"
              fill="#F3E4A6"
              fillOpacity={0.85}
              isAnimationActive={false}
              dot={false}
              activeDot={false}
            />
            <Area
              type="linear"
              dataKey="expTax"
              name="支払い税"
              stackId="neg"
              stroke="#D8875F"
              fill="#F2C1A5"
              fillOpacity={0.75}
              isAnimationActive={false}
              dot={false}
              activeDot={false}
            />
            <Area
              type="linear"
              dataKey="expSocial"
              name="社会保険料"
              stackId="neg"
              stroke="#E0A24A"
              fill="#F5D7A6"
              fillOpacity={0.75}
              isAnimationActive={false}
              dot={false}
              activeDot={false}
            />

            {/* 可処分所得（ライン） */}
            <Line
              type="linear"
              dataKey="disposable"
              name="可処分所得（ライン）"
              stroke="#D34B4B"
              strokeWidth={3}
              dot={false}
              activeDot={false}
              isAnimationActive={false}
            />

            {/* reference lines should be on top of areas/lines */}
            <MarkerLineX x={displayHeadSalaryWan} />
            {disposableDecreaseStarts.map((x, i) => (
              <ReferenceLine
                key={`dec-${x}-${i}`}
                x={Number(x)}
                stroke="#D34B4B"
                strokeWidth={1}
                strokeDasharray="6 3"
              />
            ))}
            <ReferenceLine y={0} stroke="rgba(0,0,0,0.35)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="table-wrapper" style={{ marginTop: 10 }}>
        <table className="breakdown-table row-fill no-minwidth" style={{ width: "100%" }}>
          <thead>
            <tr>
              <th>項目（万円/年）</th>
              <th style={{ textAlign: "right" }}>値</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ fontWeight: 700, background: "transparent", borderLeft: "none" }}>
                縦線ライン：世帯主の給与収入
              </td>
              <td style={{ textAlign: "right", fontWeight: 700, background: "transparent" }}>
                {fmt1(displayHeadSalaryWan)}
              </td>
            </tr>
            <tr>
              <td style={{ fontWeight: 700, ...rowTint.takeHome.bar }}>手取り額</td>
              <td style={{ textAlign: "right", fontWeight: 700, ...rowTint.takeHome.bgOnly }}>{fmt1(p.takeHome)}</td>
            </tr>
            <tr>
              <td style={rowTint.allowance.bar}>手当合計額</td>
              <td style={{ textAlign: "right", ...rowTint.allowance.bgOnly }}>{fmt1(p.allowance)}</td>
            </tr>
            <tr>
              <td style={rowTint.service.bar}>障害福祉サービス利用料</td>
              <td style={{ textAlign: "right", ...rowTint.service.bgOnly }}>{fmt1(p.service)}</td>
            </tr>
            <tr>
              <td style={{ fontWeight: 700, ...rowTint.disposable.bar }}>可処分所得額（年額）</td>
              <td style={{ textAlign: "right", ...disposableStyle, ...rowTint.disposable.bgOnly }}>
                {fmt1(p.disposable)}
              </td>
            </tr>
            <tr>
              <td style={{ fontWeight: 700, ...rowTint.disposable.bar }}>可処分所得額（月額）</td>
              <td style={{ textAlign: "right", ...disposableStyle, ...rowTint.disposable.bgOnly }}>
                {fmt1((Number(p.disposable) || 0) / 12)}
              </td>
            </tr>
            <tr>
              <td style={rowTint.tax.bar}>支払い税合計額</td>
              <td style={{ textAlign: "right", ...rowTint.tax.bgOnly }}>{fmt1(p.tax)}</td>
            </tr>
            <tr>
              <td style={rowTint.social.bar}>社会保険料合計額</td>
              <td style={{ textAlign: "right", ...rowTint.social.bgOnly }}>{fmt1(p.social)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {decreaseReasons.length > 0 && (
        <div className="table-wrapper" style={{ marginTop: 10 }}>
          <table className="breakdown-table row-fill no-minwidth" style={{ width: "100%" }}>
            <thead>
              <tr>
                <th colSpan={6}>可処分所得減少ポイント（前の給与+1万円と比較）</th>
              </tr>
              <tr>
                <th style={{ width: 120 }}>給与</th>
                <th style={{ textAlign: "right" }}>Δ可処分</th>
                <th style={{ textAlign: "right" }}>Δ手当</th>
                <th style={{ textAlign: "right" }}>Δ利用料</th>
                <th style={{ textAlign: "right" }}>Δ税</th>
                <th style={{ textAlign: "right" }}>Δ社保</th>
              </tr>
            </thead>
            <tbody>
              {decreaseReasons.slice(0, 12).map((r) => (
                <tr key={`dec-row-${r.x}`}>
                  <td style={{ fontWeight: 700 }}>
                    {Math.trunc(Number(r.prevX) || 0)}→{Math.trunc(Number(r.x) || 0)}
                  </td>
                  <td style={{ textAlign: "right", color: "#D34B4B", fontWeight: 700 }}>{fmt1(r.dDisp)}</td>
                  <td style={{ textAlign: "right" }}>{fmt1(r.dAllow)}</td>
                  <td style={{ textAlign: "right" }}>{fmt1(r.dService)}</td>
                  <td style={{ textAlign: "right" }}>{fmt1(r.dTax)}</td>
                  <td style={{ textAlign: "right" }}>{fmt1(r.dSocial)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {decreaseReasons.length > 12 && (
            <div style={{ marginTop: 6, opacity: 0.7, fontSize: "clamp(11px, 2.4vw, 13px)" }}>
              ※表示は先頭12件のみ
            </div>
          )}
        </div>
      )}
    </>
  );
}

