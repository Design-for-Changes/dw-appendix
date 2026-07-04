import { HashRouter as Router, Routes, Route, Link, NavLink, useLocation, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import Home from "./pages/Home";
import DeductionGraph from "./pages/DeductionGraph";
import DisabilityWelfareSimulator from "./pages/DisabilityWelfareSimulator";
import AppendixCliffMap from "./pages/AppendixCliffMap";
import "./App.css";

// Scroll to top when route (hash path) changes
function ScrollToTop() {
  const { pathname, hash, search } = useLocation();
  useEffect(() => {
    // For HashRouter, pathname changes with hash-routes as well
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname, hash, search]);
  return null;
}

// Simple navigation for quick page switching
function Nav() {
  const [open, setOpen] = useState(false);
  const { pathname, hash, search } = useLocation();
  useEffect(() => {
    // Close the menu on navigation
    setOpen(false);
  }, [pathname, hash, search]);

  return (
    <nav className="nav-bar">
      <button
        type="button"
        className="nav-hamburger"
        aria-label="メニュー"
        aria-expanded={open ? "true" : "false"}
        onClick={() => setOpen((v) => !v)}
      >
        ☰
      </button>
      <div className={`nav-links ${open ? "open" : ""}`}>
        <NavLink to="/" end className="nav-link">
          Home
        </NavLink>
        <NavLink to="/deduction-graph" className="nav-link">
          手取額シミュレーター
        </NavLink>
        <NavLink to="/disability-welfare" className="nav-link">
          障害福祉負担シミュレーター
        </NavLink>
        <NavLink to="/appendix" className="nav-link">
          Web Appendix
        </NavLink>
      </div>
    </nav>
  );
}

function NotFound() {
  return (
    <div className="notfound">
      <h2 className="notfound-title">Not Found</h2>
      <p>ページが見つかりませんでした。</p>
      <Link to="/" className="notfound-link">Homeへ戻る</Link>
    </div>
  );
}

function App() {
  return (
    <Router>
      <ScrollToTop />
      <Nav />
      <Routes>
        <Route path="/" element={<Home />} />
        {/* 所得グラフページは一旦削除。旧URLは控除グラフへ誘導する。 */}
        <Route path="/graph" element={<Navigate to="/deduction-graph" replace />} />
        <Route path="/income-calc" element={<Navigate to="/deduction-graph" replace />} />
        <Route path="/deduction-graph" element={<DeductionGraph />} />
        <Route path="/disability-welfare" element={<DisabilityWelfareSimulator />} />
        <Route path="/appendix" element={<AppendixCliffMap />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Router>
  );
}
export default App;
