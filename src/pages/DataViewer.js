import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import CsvChart from "../components/CsvChart";

export default function DataViewer() {
  const { id } = useParams();
  const [meta, setMeta] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    fetch(process.env.PUBLIC_URL + "/data/index.json")
      .then(r => r.json())
      .then(list => list.find(x => x.id === id))
      .then(m => {
        if (!m) throw new Error(`dataset not found: ${id}`);
        setMeta(m);
      })
      .catch(e => setErr(e.message));
  }, [id]);

  if (err) return <div className="App"><p className="Room-text">エラー: {err}</p></div>;
  if (!meta) return <div className="App"><p className="Room-text">読み込み中…</p></div>;

  return (
    <div className="App">
      <h1 className="Room-title">{meta.name}</h1>
      {meta.description && <p className="Room-text">{meta.description}</p>}
      <CsvChart
        csvPath={`${process.env.PUBLIC_URL}/data/${meta.file}`}
        xKeyHint={meta.xKey}
      />
      <div className="Room-back" style={{ marginTop: "2vh" }}>
        <Link to="/data" className="BackLink">← データ一覧へ戻る</Link>
      </div>
    </div>
  );
}