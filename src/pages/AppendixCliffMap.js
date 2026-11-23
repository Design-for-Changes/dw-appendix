import "../App.css";
import { useEffect, useState } from "react";
import MunicipalSourcesAppendix from "./MunicipalSourcesAppendix";
import IncomeAssessmentAppendix from "./IncomeAssessmentAppendix";
import ResearchDataAppendix from "./ResearchDataAppendix";
import CalculationReferenceAppendix from "./CalculationReferenceAppendix";
import RevisionScenariosAppendix from "./RevisionScenariosAppendix";
import ChildEligibilityEvidence from "./ChildEligibilityEvidence";
import AllPatternsAppendix from "./AllPatternsAppendix";
import { useSessionParameter } from "./salarySimulatorSession";

const APPENDIX_PAGES = [
  { mode: "laws", letter: "A", label: "法令検索・採否", hash: "#law-screening" },
  { mode: "sources", letter: "B", label: "調査対象・参照資料", hash: "#municipal-sources" },
  { mode: "rules", letter: "C", label: "所得区分・判定方法（船橋市例）", hash: "#income-assessment" },
  { mode: "eligibility", letter: "D", label: "障害要件の組み合わせ", hash: "#child-eligibility-evidence" },
  { mode: "scenarios", letter: "E", label: "モデル世帯シミュレーター", hash: "#revision-scenarios" },
  { mode: "functions", letter: "F", label: "関数資料", hash: "#calculation-functions" },
  { mode: "patterns", letter: "G", label: "全パターン比較", hash: "#all-patterns" },
];

const GRAPH_HASH={income:"#revision-scenarios",boundaries:"#salary-decision-map",difference:"#disability-income-difference"};
// Published builds use the release commit date in Japan, not the reader's clock.
const updatedOn = process.env.REACT_APP_APPENDIX_UPDATED_ON || "2026-11-23";
const [year, month, day] = updatedOn.split("-").map(Number);
function graphForHash(hash){
  if(hash==="#salary-surface")return "income";
  return Object.keys(GRAPH_HASH).find(k=>GRAPH_HASH[k]===hash);
}
function viewModeForHash(hash) {
  if (graphForHash(hash)) return "scenarios";
  if (hash.startsWith("#calculation-function") || hash.startsWith("#calculation-flow")) return "functions";
  return APPENDIX_PAGES.find((page) => page.hash === hash)?.mode || "scenarios";
}

export default function AppendixCliffMap() {
  const [viewMode, setViewMode] = useState(() => viewModeForHash(window.location.hash));
  const [lastGraph,setLastGraph]=useSessionParameter("graphView","income");
  const graphView=(viewMode==="scenarios" && graphForHash(window.location.hash)) || (Object.hasOwn(GRAPH_HASH,lastGraph)?lastGraph:"income");
  useEffect(() => {
    const followHash = () => {
      if(["#current","#optimal","#system-boundaries"].includes(window.location.hash)) window.history.replaceState(null,"",GRAPH_HASH.income);
      setViewMode(viewModeForHash(window.location.hash));
      const graph=graphForHash(window.location.hash);
      if(graph)setLastGraph(graph);
    };
    followHash();
    window.addEventListener("hashchange", followHash);
    return () => window.removeEventListener("hashchange", followHash);
  }, [setLastGraph]);
  const activePage = APPENDIX_PAGES.find((page) => page.mode === viewMode);
  const selectViewMode = (mode) => {
    setViewMode(mode);
    const hash = mode==="scenarios" ? GRAPH_HASH[graphView] : APPENDIX_PAGES.find((page) => page.mode === mode).hash;
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${hash}`);
  };
  const selectGraph=graph=>{
    if(!Object.hasOwn(GRAPH_HASH,graph))return;
    window.history.replaceState(null,"",GRAPH_HASH[graph]);
    setLastGraph(graph);
  };
  return (
    <main className="App appendix-page">
      <section className="appendix-hero">
        <p className="appendix-kicker">社会保障研究　投稿論文補足資料</p>
        <h1>障害児世帯における給付・負担のモデル世帯による試算と制度上の課題</h1>
        <p className="appendix-hero-subtitle">Web Appendix</p>
        <small>最終更新日：<time dateTime={updatedOn}>{year}年{month}月{day}日</time></small>
      </section>

      <nav className="appendix-mode-tabs" aria-label="表示内容">
        {APPENDIX_PAGES.map((page) => (
          <button
            key={page.mode}
            type="button"
            className={viewMode === page.mode ? "active" : ""}
            aria-pressed={viewMode === page.mode}
            onClick={() => selectViewMode(page.mode)}
          >
            {page.letter}　{page.label}
          </button>
        ))}
      </nav>

      <header className="appendix-page-heading" aria-labelledby="appendix-page-title">
        <h2 id="appendix-page-title">Web Appendix {activePage.letter}　{activePage.label}</h2>
        <a href={viewMode==="scenarios"?GRAPH_HASH[graphView]:activePage.hash}>このページへのリンク</a>
      </header>

      {viewMode === "scenarios" ? <RevisionScenariosAppendix graphView={graphView} onGraphViewChange={selectGraph}/> :
       viewMode === "functions" ? <CalculationReferenceAppendix/> :
       viewMode === "patterns" ? <AllPatternsAppendix/> :
       viewMode === "eligibility" ? <ChildEligibilityEvidence/> :
       viewMode === "laws" ? <ResearchDataAppendix/> :
       viewMode === "rules" ? <IncomeAssessmentAppendix/> : <MunicipalSourcesAppendix/>}
    </main>
  );
}
