import AppendixCliffMap from "./pages/AppendixCliffMap";
import TwoSalaryPreview from "./pages/TwoSalaryPreview";
import "./App.css";

function App() {
  const legacy = new URLSearchParams(window.location.search).get("model") !== "v4";
  return <><nav className="model-switch" aria-label="計算モデルの選択"><a href="?model=v4" aria-current={!legacy ? "page" : undefined}>新版：二給与モデル・検証版</a><a href="?model=legacy" aria-current={legacy ? "page" : undefined}>旧版：比較用</a><span>年次・採用費目・条件が異なります</span></nav>{legacy ? <AppendixCliffMap /> : <TwoSalaryPreview />}</>;
}

export default App;
