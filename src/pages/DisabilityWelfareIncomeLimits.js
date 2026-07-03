import { Link } from "react-router-dom";

export default function DisabilityWelfareIncomeLimits() {
  return (
    <div className="App">
      <h1 className="Room-title">資料部屋</h1>
      <p className="Room-text">ここに資料一覧を置きます。</p>
      <div className="Room-back">
        <Link to="/" className="BackLink">← トップへ戻る</Link>
      </div>
    </div>
  );
}