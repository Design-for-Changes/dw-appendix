import { useNavigate } from "react-router-dom";

export default function Home() {
  const navigate = useNavigate();
  return (
    <div className="App home">
      <section className="home-hero">
        <h1 className="home-title">蘆澤くんの勉強部屋</h1>
        <p className="home-sub">制度・収入・負担の変化を「見える化」して、比較しやすくします。</p>
      </section>

      <section className="home-grid">
        <button className="home-card" type="button" onClick={() => navigate("/deduction-graph")}>
          <div className="home-card-kicker">SIMULATOR</div>
          <div className="home-card-title">手取額シミュレーター</div>
          <div className="home-card-desc">給与・控除・社会保険料・税をまとめて確認。</div>
          <div className="home-card-cta">開く</div>
        </button>

        <button className="home-card" type="button" onClick={() => navigate("/disability-welfare")}>
          <div className="home-card-kicker">SIMULATOR</div>
          <div className="home-card-title">障害福祉負担シミュレーター</div>
          <div className="home-card-desc">手当・所得制限・サービス利用料をまとめて確認。</div>
          <div className="home-card-cta">開く</div>
        </button>

        <button className="home-card" type="button" onClick={() => navigate("/appendix")}>
          <div className="home-card-kicker">APPENDIX</div>
          <div className="home-card-title">崖の可視化</div>
          <div className="home-card-desc">P/Q/R点で、所得制限後の後退幅と回復点を確認。</div>
          <div className="home-card-cta">開く</div>
        </button>
      </section>
    </div>
  );
}
