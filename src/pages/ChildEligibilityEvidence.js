import React from "react";
import { CHILD_ELIGIBILITY_OPTIONS } from "../data/childEligibilityOptions";

const sources = {
  law: "https://www.mhlw.go.jp/web/t_doc?dataId=82090000&dataType=0",
  ordinance: "https://www.mhlw.go.jp/web/t_doc?dataId=82091000&dataType=0",
  tax: "https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1160.htm",
  pendingHandbook: "https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1186.htm",
  hokkaido: "https://www.pref.hokkaido.lg.jp/fs/1/0/4/9/7/4/0/8/_/H28%E7%AD%94%E7%94%B3%E7%AC%AC36%E5%8F%B7.pdf",
  specialChild: "https://www.mhlw.go.jp/web/t_doc?dataId=00ta9427&dataType=1",
  welfare: "https://www.mhlw.go.jp/web/t_doc?dataId=00tc7103&dataType=1&pageNo=1",
};

const taxLabels = { none: "非該当", ordinary: "障害者（特別障害者以外）", special: "特別障害者" };

export default function ChildEligibilityEvidence() {
  return <section id="child-eligibility-evidence" className="appendix-panel" aria-label="障害要件の組み合わせ">
    <div className="appendix-table-wrap">
      <table className="appendix-table">
        <caption>児童1人の障害要件：制度基準に照らした{CHILD_ELIGIBILITY_OPTIONS.length}通り（所得制限の適用前）</caption>
        <thead><tr><th scope="col">特別児童扶養手当の障害等級</th><th scope="col">障害児福祉手当の障害要件</th><th scope="col">所得税法上の障害者区分</th></tr></thead>
        <tbody>{CHILD_ELIGIBILITY_OPTIONS.map(({ id, tccaGrade, welfareEligible, taxStatus }) => <tr key={id}>
          <td data-label="特児の障害等級">{tccaGrade === "not" ? "非該当" : tccaGrade + "級"}</td>
          <td data-label="障害児福祉手当の障害要件">{welfareEligible ? "該当" : "非該当"}</td>
          <td data-label="所得税法上の障害者区分">{taxLabels[taxStatus]}</td>
        </tr>)}</tbody>
      </table>
    </div>
    <h3>根拠資料</h3>
    <ul>
      <li>手当の対象範囲：<a href={sources.law}>法第2条第1・2・5項（障害児・重度障害児の定義）</a>、<a href={sources.ordinance}>施行令別表第一（障害児福祉手当）・第三（特別児童扶養手当）</a>。</li>
      <li>手帳と手当の個別事例：<a href={sources.hokkaido}>北海道・平成28年度答申第36号、2頁（同一児童の身体障害者手帳1級・特別児童扶養手当の資格喪失）</a>。税区分の根拠：国税庁<a href={sources.tax}>No.1160（身体障害者手帳1・2級は特別障害者）</a>、<a href={sources.pendingHandbook}>No.1186（手帳申請中等）</a>。</li>
      <li>腎疾患の基準照合：<a href={sources.welfare}>障害児福祉手当「腎臓の機能障害」（慢性透析が必要な場合は透析前の状態で判定）</a>、<a href={sources.specialChild}>特別児童扶養手当「腎疾患による障害」（人工透析中は原則2級）</a>。</li>
    </ul>
  </section>;
}
