import { fireEvent, render, screen, within } from "@testing-library/react";
import AppendixCliffMap from "./AppendixCliffMap";

let mockReferencePagesLoading = false;

jest.mock("../hooks/useAppendixData", () => ({
  useAppendixData: () => {throw new Error("現行ページから旧系列を取得してはならない");},
}));
jest.mock("./IncomeAssessmentAppendix", () => () => mockReferencePagesLoading
  ? <p role="status">所得判定資料を読み込んでいます。</p>
  : <section aria-label="所得判定詳細">表A1</section>);
jest.mock("./MunicipalSourcesAppendix", () => () => mockReferencePagesLoading
  ? <p role="status">参照資料を読み込んでいます。</p>
  : <section aria-label="参照資料">参照資料</section>);
jest.mock("./ResearchDataAppendix", () => () => mockReferencePagesLoading
  ? <p role="status">法令資料を読み込んでいます。</p>
  : <section aria-label="法令検索">表A2</section>);
jest.mock("./RevisionScenariosAppendix", () => ({graphView,onGraphViewChange}) => <section aria-label="モデル条件">{graphView}<button onClick={()=>onGraphViewChange("boundaries")}>2Dへ</button></section>);

const F = { letter: "F", title: "関数資料", hash: "#calculation-functions", region: "表A3　計算処理・関数一覧" };
const pages = [
  { letter: "A", title: "法令検索・採否", hash: "#law-screening", region: "法令検索" },
  { letter: "B", title: "調査対象・参照資料", hash: "#municipal-sources", region: "参照資料" },
  { letter: "C", title: "所得区分・判定方法（船橋市例）", hash: "#income-assessment", region: "所得判定詳細" },
  { letter: "D", title: "障害要件の組み合わせ", hash: "#child-eligibility-evidence", region: "障害要件の組み合わせ" },
  { letter: "E", title: "モデル世帯シミュレーター", hash: "#revision-scenarios", region: "モデル条件" },
  F,
  { letter: "G", title: "全パターン比較", hash: "#all-patterns", region: "全パターンの可処分所得差" },
];
const simulator=pages.find(p=>p.hash==="#revision-scenarios");

beforeEach(() => {
  mockReferencePagesLoading = false;
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/");
});
afterEach(() => { window.history.replaceState(null, "", "/"); });

test("Eの本文末尾に関数資料を重複表示せず、上部メニューからFを開く", () => {
  render(<AppendixCliffMap />);
  expectSelectedPage(simulator);
  expect(screen.queryByRole("link", { name: /関数資料/ })).not.toBeInTheDocument();
  fireEvent.click(pageButton(F));
  expect(window.location.hash).toBe(F.hash);
  expectSelectedPage(F);
  expect(screen.getByRole("heading", { name: "表A3　計算処理・関数一覧" })).toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "表示ケース" })).not.toBeInTheDocument();
  fireEvent.click(pageButton(simulator));
  expect(screen.queryByRole("heading", { name: "表A3　計算処理・関数一覧" })).not.toBeInTheDocument();
});

test.each(["#calculation-flow-medical", "#calculation-function-list", "#calculation-function-src%2Fcalc%2FoptimalModel.js%3AcomputeOptimalModel"])("%sの直接URLでもFを選択する", (hash) => {
  window.history.replaceState(null, "", "/" + hash);
  render(<AppendixCliffMap />);
  expectSelectedPage(F);
});

function pageButton(page) {
  return within(screen.getByRole("navigation", { name: "表示内容" }))
    .getByRole("button", { name: new RegExp("^" + page.letter + "\\s+" + page.title + "$") });
}

function expectSelectedPage(page) {
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("障害児世帯における給付・負担のモデル世帯による試算と制度上の課題");
  const navigation = screen.getByRole("navigation", { name: "表示内容" });
  const heading = screen.getByRole("heading", {
    level: 2,
    name: new RegExp("^Web Appendix " + page.letter + "\\s+" + page.title + "$"),
  });
  expect(heading.textContent.trim()).toBe("Web Appendix " + page.letter + "　" + page.title);
  expect(heading).toBeVisible();
  const pageHeader = navigation.nextElementSibling;
  expect(pageHeader.contains(heading)).toBe(true);
  expect(within(pageHeader).getByRole("link", { name: "このページへのリンク" })).toHaveAttribute("href", page.hash);
  expect(screen.getAllByRole("heading", { level: 2, name: /^Web Appendix / })).toHaveLength(1);
  pages.forEach((other) => {
    const button = pageButton(other);
    expect(button.textContent.trim()).toBe(other.letter + "　" + other.title);
    expect(button).toHaveAttribute("aria-pressed", other.letter === page.letter ? "true" : "false");
  });
}

test.each(pages)("$hashの直接リンクで$letterの見出し・番号・押下状態が一致する", (page) => {
  window.history.replaceState(null, "", "/" + page.hash);
  render(<AppendixCliffMap />);
  expectSelectedPage(page);
  expect(window.location.hash).toBe(page.hash);
  if (page.region) {
    expect(screen.getByRole("region", { name: page.region })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "表示ケース" })).not.toBeInTheDocument();
  } else {
    expect(screen.getByText("表示データを読み込んでいます。")).toBeInTheDocument();
  }
});

test.each(["","#current","#optimal"])("トップ・旧入口 %s は現行Eを開く", hash => {
  window.history.replaceState(null,"","/"+hash);
  render(<AppendixCliffMap />);
  expectSelectedPage(simulator);
  expect(window.location.hash).toBe(hash ? simulator.hash : "");
  expect(screen.queryByRole("region",{name:"表示ケース"})).toBeNull();
});

test("上部メニューはA〜Gの順で関数資料と全パターン比較が並ぶ", () => {
  render(<AppendixCliffMap />);
  const buttons = within(screen.getByRole("navigation", { name: "表示内容" })).getAllByRole("button");
  expect(buttons.map((button) => button.textContent.trim())).toEqual(
    pages.map((page) => page.letter + "　" + page.title)
  );
});

test.each([["#salary-decision-map","boundaries"],["#system-boundaries","systems"],["#disability-income-difference","difference"]])("直リンク%sをE内の同じ図で開き、別ページを経由しても復帰する",(hash,view)=>{
  window.history.replaceState(null,"","/"+hash);
  render(<AppendixCliffMap/>);
  expect(pageButton(simulator)).toHaveAttribute("aria-pressed","true");
  expect(screen.getByRole("region",{name:"モデル条件"})).toHaveTextContent(view);
  fireEvent.click(pageButton(pages[0]));
  fireEvent.click(pageButton(simulator));
  expect(screen.getByRole("region",{name:"モデル条件"})).toHaveTextContent(view);
  expect(window.location.hash).toBe(hash);
  fireEvent.click(screen.getByRole("button",{name:"2Dへ"}));
  expect(window.location.hash).toBe("#salary-decision-map");
});

test("タブ切替でURL・共通見出し・押下状態が同時に更新される", () => {
  render(<AppendixCliffMap />);
  pages.forEach((page) => {
    fireEvent.click(pageButton(page));
    expect(window.location.hash).toBe(page.hash);
    expectSelectedPage(page);
  });
  fireEvent.click(pageButton(simulator));
  expect(window.location.hash).toBe(simulator.hash);
  expectSelectedPage(simulator);
});

test.each(pages.slice(0, 3))("$letterの資料読込前でも共通見出しが表示される", (page) => {
  mockReferencePagesLoading = true;
  window.history.replaceState(null, "", "/" + page.hash);
  render(<AppendixCliffMap />);
  expect(screen.getByRole("status")).toHaveTextContent("読み込んでいます。");
  expectSelectedPage(page);
});

test("ページ番号C/Aに変わっても表A1・表A2の番号は維持する", () => {
  window.history.replaceState(null, "", "/#income-assessment");
  render(<AppendixCliffMap />);
  expectSelectedPage(pages[2]);
  expect(screen.getByRole("region", { name: "所得判定詳細" })).toHaveTextContent("表A1");
  fireEvent.click(pageButton(pages[0]));
  expectSelectedPage(pages[0]);
  expect(window.location.hash).toBe("#law-screening");
  expect(screen.getByRole("region", { name: "法令検索" })).toHaveTextContent("表A2");
  expect(screen.queryByRole("region", { name: "所得判定詳細" })).not.toBeInTheDocument();
});
