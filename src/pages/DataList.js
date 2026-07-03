import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";

export default function DataList() {
  const [list, setList] = useState([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    fetch(process.env.PUBLIC_URL + "/data/index.json")
      .then(r => {
        if (!r.ok) throw new Error("index.json not found");
        return r.json();
      })
      .then(setList)
      .catch(e => setErr(e.message));
  }, []);

  if (err) return <p className="Room-text">エラー: {err}</p>;
  if (!list.length) return <p className="Room-text">読み込み中…</p>;

  return (
    <div className="App">
      <h1 className="Room-title">データ一覧</h1>
      <ul className="Room-list">
        {list.map(d => (
          <li key={d.id}>
            <Link to={`/data/${d.id}`} className="BackLink">{d.name}</Link>
            <div className="Room-text">{d.description}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}