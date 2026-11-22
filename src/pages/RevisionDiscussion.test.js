import {fireEvent,render,screen,within} from "@testing-library/react";
import RevisionDiscussion from "./RevisionDiscussion";
import {createRevisionCalculator} from "../calc/revisionEngine";
import {scanPaperChangePoints} from "../calc/paperChangePoints";
import {createPaperEducationAssessor} from "../calc/paperEducationAssessment";
import {paperComparisonInputs} from "../calc/paperComparison";
import {paperCases} from "./revisionPaperCases";

const c=createRevisionCalculator(paperComparisonInputs(paperCases[1],3100));
const scanned=(minWan,maxWan)=>scanPaperChangePoints(c,"head",400,{minWan,maxWan,assessors:[createPaperEducationAssessor()]});

test("本稿の給与を動かして得た変化の前後と判定主体を表示し、資料のないN04を同じ変化に数えない",()=>{
  const {rerender}=render(<RevisionDiscussion boundaries={scanned(781,782)}/>);
  const table=screen.getByRole("table",{name:"世帯主の給与と制度別の判定変化"});
  const row=within(table).getAllByRole("row")[1];
  expect(within(row).getByRole("rowheader")).toHaveTextContent(/N01-1.*受給資格者/);
  expect(within(row).getAllByRole("cell").map(c=>c.textContent)).toEqual(["781 → 782","所得制限に該当しない（世帯主）","所得制限に該当（世帯主）"]);
  const missing=screen.getByText("比較できなかった給与区間");
  fireEvent.click(missing);
  expect(screen.getByText("N04（世帯）の判定条件不足：781～782万円")).toBeVisible();
  rerender(<RevisionDiscussion boundaries={scanned(500,501)}/>);
  expect(screen.queryByRole("table",{name:"世帯主の給与と制度別の判定変化"})).not.toBeInTheDocument();
  expect(screen.getByText(/未判定の区間まで「変化なし」/)).toBeVisible();
});

test("公式の就学例と医療例は個別に開け、制度指標を給与額や世帯の年間収支として表示しない",()=>{
  render(<RevisionDiscussion boundaries={scanned(399,400)}/>);
  fireEvent.click(screen.getByText("就学奨励費：収入額と需要額による3例"));
  const school=screen.getByRole("table",{name:/埼玉県教育委員会.*229,089円/});
  expect(within(school).getAllByRole("row").slice(1).map(r=>r.textContent)).toEqual([
    "年間所得 4,000,000円900,000258,333第1区分","年間所得 6,000,000円1,200,000400,000第2区分","年間所得 9,000,000円1,400,000633,333第3区分",
  ]);
  expect(screen.getByRole("link",{name:"埼玉県教育委員会「支弁区分について」"})).toHaveAttribute("href","https://www.pref.saitama.lg.jp/documents/27010/sibenkubun.pdf");
  expect(screen.getByText(/資料に適用年度の記載なし/)).toBeVisible();
  fireEvent.click(screen.getByText("船橋市の医療費助成：所得割の基準をまたぐ2例"));
  const med=screen.getByRole("table",{name:"同一医療保険単位の所得割と2制度の適用"});
  expect(within(med).getAllByRole("row").slice(1).map(r=>r.textContent)).toEqual([
    "所得割 234,900円対象対象（一部負担区分）","所得割 235,000円対象外（所得制限）対象（一部負担区分）",
  ]);
  expect(screen.getByText(/実際の受診費用や世帯の自己負担額は推計しません/)).toBeVisible();
});
