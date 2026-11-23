import { Fragment, useMemo } from "react";
import {PAPER_TERM_KEY} from "../data/paperBenefitTerms.js";
import { compareAllPatterns } from "../calc/allPatternsComparison";
import { CHILD_ELIGIBILITY_OPTIONS } from "../data/childEligibilityOptions";
import { useSessionParameter } from "./salarySimulatorSession";
import ChildDayFeeSlider from "./ChildDayFeeSlider";
import "./AllPatternsAppendix.css";

const PAGE_SIZE = 45;
const CHILD_AGES = Array.from({length: 18}, (_, i) => i);
const format = new Intl.NumberFormat("ja-JP");
const signed = value => (value > 0 ? "＋" : value < 0 ? "−" : "") + format.format(Math.abs(value));
const taxLabel = {none: "非該当", ordinary: "障害者", special: "特別障害者"};
const profileLabel = Object.fromEntries(CHILD_ELIGIBILITY_OPTIONS.map(p => [p.id, [
  p.tccaGrade === "not" ? "非該当" : p.tccaGrade + "級", p.welfareEligible ? "該当" : "非該当", taxLabel[p.taxStatus]
].join("／")]));
const INITIAL = { count: 1, ages: [8, 8, 8], fees: [0, 0, 0], page: 0 };

function ExtremaCells({point}) {
  return <><td className="all-patterns-amount">{signed(point.differenceYen)}</td>
    <td>{format.format(point.headWan)}</td><td>{format.format(point.spouseWan)}</td></>;
}

export default function AllPatternsAppendix() {
  // Keep the three child slots when changing household size. G never overwrites E's selected profiles.
  const [settings, setSettings] = useSessionParameter("allPatterns", INITIAL);
  const count = [1, 2, 3].includes(settings.count) ? settings.count : INITIAL.count;
  const rows = useMemo(() => compareAllPatterns({
    ages: settings.ages.slice(0, count), fees: settings.fees.slice(0, count)
  }), [settings.ages, settings.fees, count]);
  const lastPage = Math.ceil(rows.length / PAGE_SIZE) - 1;
  const page = Math.max(0, Math.min(lastPage, settings.page));
  const start = page * PAGE_SIZE;
  const children = Array.from({length: count}, (_, i) => i);
  function setChild(key, i, value) {
    setSettings(old => ({...old, [key]: old[key].map((current, j) => j === i ? value : current)}));
  }
  const setPage = next => setSettings(old => ({...old, page: next}));
  return <section className="appendix-panel all-patterns" aria-label="全パターンの可処分所得差">
    <p><small>{PAPER_TERM_KEY}</small></p>
    <div className="all-patterns-count"><label>子どもの人数 <select value={count}
      onChange={e => {const next = Number(e.target.value); setSettings(old => ({...old, count: next, page: 0}));}}>
      {[1, 2, 3].map(n => <option key={n} value={n}>{n}人</option>)}
    </select></label></div>
    <div className="all-patterns-conditions">{children.map(i =>
      <fieldset key={i}><legend>子ども{i + 1}</legend>
        <label>年齢 <select value={settings.ages[i]} onChange={e => setChild("ages", i, Number(e.target.value))}>
          {CHILD_AGES.map(age => <option key={age} value={age}>{age}歳</option>)}
        </select></label>
        <ChildDayFeeSlider id={"all-patterns-fee-"+i} className="all-patterns-fee" age={settings.ages[i]}
          value={settings.fees[i]} onChange={v=>setChild("fees",i,v)}/>
      </fieldset>)}</div>
    <div className="all-patterns-summary">
      <h3>可処分所得差の最小点・最大点 <small>全{format.format(rows.length)}通り</small></h3>
      {lastPage > 0 && <nav className="all-patterns-pagination" aria-label="パターン表のページ切替">
        <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)}>前へ</button>
        <select aria-label="表示する行" value={page} onChange={e => setPage(Number(e.target.value))}>
          {Array.from({length: lastPage + 1}, (_, p) => <option key={p} value={p}>
            {format.format(p * PAGE_SIZE + 1)}–{format.format(Math.min(rows.length, (p + 1) * PAGE_SIZE))}行
          </option>)}
        </select>
        <button type="button" disabled={page === lastPage} onClick={() => setPage(page + 1)}>次へ</button>
      </nav>}
    </div>
    <div className="all-patterns-scroll">
      <table className="all-patterns-table">
        <caption>差額＝各パターンの可処分所得 − 子どもに障害がない世帯の可処分所得（給与・家族構成は共通）。同額の点が複数ある場合、給与はその一例。</caption>
        <colgroup span="1"/><colgroup span={count}/><colgroup span="3"/><colgroup span="3"/>
        <thead>
          <tr><th scope="col" rowSpan="2">番号</th>
            <th scope="colgroup" colSpan={count}>障害要件（特児／児福／税）</th>
            <th scope="colgroup" colSpan="3">最小点</th><th scope="colgroup" colSpan="3">最大点</th></tr>
          <tr>{children.map(i => <th key={i} scope="col">子ども{i + 1}</th>)}
            {["min", "max"].map(key => <Fragment key={key}><th scope="col">差額<br/>（円／年）</th>
              <th scope="col">世帯主の年間給与<br/>（万円）</th><th scope="col">配偶者の年間給与<br/>（万円）</th></Fragment>)}</tr>
        </thead>
        <tbody>{rows.slice(start, start + PAGE_SIZE).map((row, index) =>
          <tr key={row.profileIds.join("|")}><th scope="row">{format.format(start + index + 1)}</th>
            {row.profileIds.map((id, i) => <td className="all-patterns-profile" key={i}>{profileLabel[id]}</td>)}
            <ExtremaCells point={row.minimum}/><ExtremaCells point={row.maximum}/></tr>)}</tbody>
      </table>
    </div>
  </section>;
}
