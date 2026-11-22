const columns = ["項目", "計算式・判定基準", "選択点での代入", "結果"];

export function TraceTable({caption, rows}) {
  return <div className="revision-trace-wrap"><table className="revision-trace-table">
    <caption>{caption}</caption>
    <thead><tr>{columns.map(label=><th key={label} scope="col">{label}</th>)}</tr></thead>
    <tbody>{rows.map(([name,formula,substitution,result],i)=><tr key={i}>
      <th scope="row">{name}</th><td data-label={columns[1]}>{formula}</td><td data-label={columns[2]}>{substitution}</td><td data-label={columns[3]}>{result}</td>
    </tr>)}</tbody>
  </table></div>;
}
