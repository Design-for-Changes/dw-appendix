import React, { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid
} from "recharts";

export default function CsvChart({ csvPath, xKeyHint }) {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(csvPath)
      .then(r => {
        if (!r.ok) throw new Error(`CSV not found: ${csvPath}`);
        return r.text();
      })
      .then(text => {
        const parsed = Papa.parse(text, { header: true, dynamicTyping: true, skipEmptyLines: true });
        setRows(parsed.data);
      })
      .catch(e => setError(e.message));
  }, [csvPath]);

  const { xKey, yKeys } = useMemo(() => {
    if (!rows.length) return { xKey: xKeyHint || "", yKeys: [] };
    const cols = Object.keys(rows[0]);
    const x = xKeyHint && cols.includes(xKeyHint) ? xKeyHint : cols[0]; // 既定: 先頭列
    const ys = cols.filter(c => c !== x);
    return { xKey: x, yKeys: ys };
  }, [rows, xKeyHint]);

  if (error) return <p className="Room-text">エラー: {error}</p>;
  if (!rows.length) return <p className="Room-text">読み込み中…</p>;
  if (!yKeys.length) return <p className="Room-text">プロットできる列がありません。</p>;

  return (
    <div style={{ width: "100%", height: "60vh" }}>
      <ResponsiveContainer>
        <LineChart data={rows} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey={xKey} />
          <YAxis />
          <Tooltip />
          <Legend />
          {yKeys.map((k, i) => (
            <Line key={k} type="monotone" dataKey={k} dot={false} strokeWidth={2} />
          ))}
        </LineChart>
      </ResponsiveContainer>
      <p className="Room-text" style={{ marginTop: "1vh" }}>
        横軸: <code>{xKey}</code> ／ 縦軸: <code>{yKeys.join(", ")}</code>
      </p>
    </div>
  );
}