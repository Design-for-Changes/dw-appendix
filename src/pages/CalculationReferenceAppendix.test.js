import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import CalculationReferenceAppendix from "./CalculationReferenceAppendix";
import catalog from "../data/calculation-function-catalog.json";

const entryId = (entry) => `calculation-function-${entry.id}`;
const targetFor = (link) => document.getElementById(decodeURIComponent(link.getAttribute("href").slice(1)));
const listTable = () => screen.getByRole("table", { name: "ソースコードの注記と関数の対応" });
const flowTable = () => screen.getByRole("table", { name: "入力から計算・集計・表示用データ生成まで" });

beforeEach(() => window.history.replaceState(null, "", "/#calculation-functions"));
afterEach(() => window.history.replaceState(null, "", "/"));

test("独立資料は関数の定義箇所とJSONを残し、コードへのリンクと実装の展開欄を出さない", () => {
  render(<CalculationReferenceAppendix />);
  expect(screen.getByRole("heading", { name: "表A3　計算処理・関数一覧" })).toBeVisible();
  const table = listTable();
  expect(within(table).getAllByRole("rowheader")).toHaveLength(catalog.functions.length);
  expect(within(table).getAllByRole("columnheader")).toHaveLength(6);
  const entry = catalog.functions.find((f) => f.name === "computeOptimalModel");
  expect(within(table).getByText(`${entry.file}:${entry.line}`,{exact:true})).toBeInTheDocument();
  expect(document.querySelector('a[href*="github.com/"][href*="/blob/"]')).toBeNull();
  expect(screen.queryByText("この版の実装を読む")).toBeNull();
  const download = screen.getByRole("link", { name: "関数一覧JSON" });
  expect(download).toHaveAttribute("download", "calculation-function-catalog.json");
  expect(JSON.parse(decodeURIComponent(download.getAttribute("href").split(",").slice(1).join(",")))).toEqual(catalog);
});

test("計算処理からページ内説明へ移動し、対応する全処理へ戻れる", () => {
  render(<CalculationReferenceAppendix />);
  const flow = flowTable();
  expect(within(flow).getAllByRole("rowheader")).toHaveLength(12);
  for (const link of within(flow).getAllByRole("link")) {
    const target = targetFor(link);
    expect(target).toBeInTheDocument();
    expect(listTable().contains(target)).toBe(true);
    const flowRow = link.closest("tr");
    const backlink = within(target).getByRole("link", { name: `↩ ${flowRow.querySelector("th").textContent}` });
    expect(targetFor(backlink)).toBe(flowRow);
  }
  const computePoint = document.getElementById(entryId(catalog.functions.find((f) => f.id === "src/calc/computePoint.js:computePoint")));
  expect(within(computePoint).getByRole("link", { name: "↩ 現金給付" })).toBeInTheDocument();
  expect(within(computePoint).getByRole("link", { name: "↩ 可処分所得の集計" })).toBeInTheDocument();
});

test("全関数の完全IDが一意で、親・逆リンクの宛先が存在する", () => {
  render(<CalculationReferenceAppendix />);
  const ids = catalog.functions.map((entry) => entryId(entry));
  expect(new Set(ids).size).toBe(catalog.functions.length);
  for (const id of ids) expect(document.getElementById(id)).toBeInTheDocument();
  for (const link of within(listTable()).getAllByRole("link").filter((a) => a.getAttribute("href").startsWith("#"))) {
    expect(targetFor(link)).toBeInTheDocument();
  }
  const helpers = catalog.functions.filter((f) => f.qualifiedName === "toNumber");
  expect(helpers.length).toBeGreaterThan(1);
  expect(new Set(helpers.map(entryId)).size).toBe(helpers.length);
});

test("新稿計算表と受け渡し図から適切な関数と実引数に到達できる", () => {
  render(<CalculationReferenceAppendix />);
  const current=screen.getByRole("table",{name:"入力から年額への計算表（現行制度のみ）"});
  expect(current).not.toHaveTextContent(/就学奨励費|教育実費|医療費助成/);
  expect(flowTable()).toHaveTextContent("就学奨励費");
  expect(flowTable()).toHaveTextContent("医療費助成");
  const discussion=screen.getByRole("table",{name:"収支の下落幅とは別に調べる制度上の変化点"});
  expect(discussion).toHaveTextContent("収支が下がったか否かを問わず");
  for(const label of ["scanPaperChangePoints","assessPaperEducationClass","assessFunabashiMedicalCoverage","createPolicyOnlyClassifier","createAdditionalPolicyClassifier","buildPolicyOnlyMap"]){
    const target=targetFor(within(discussion).getByRole("link",{name:label}));
    expect(target).toBeInTheDocument();
    expect(targetFor(within(target).getByRole("link",{name:"↩ 考察：制度の変化点"}))).toBe(document.getElementById("calculation-flow-discussion"));
  }
  const extrema=within(current).getByRole("row",{name:/G：Eの給与点別/});
  for(const name of ["groupCells","compareAllPatterns","comparePatternEnvelopes"]){
    const target=targetFor(within(extrema).getByRole("link",{name}));
    expect(targetFor(within(target).getByRole("link",{name:"↩ 新稿の計算式"}))).toBe(document.getElementById("calculation-flow-current"));
  }
  for(const link of within(current).getAllByRole("link")) expect(targetFor(link)).toBeInTheDocument();
  for(const link of within(screen.getByRole("list",{name:"通所支援の計算順"})).getAllByRole("link")) expect(targetFor(link)).toBeInTheDocument();
  expect(screen.getByRole("combobox",{name:"調べる関数"})).toHaveValue("src/calc/revisionEngine.js:createRevisionCalculator.evaluate");
  const next=screen.getByRole("button",{name:"revisionServiceBurden"});
  expect(next.closest("li")).toHaveTextContent("service に格納");
  fireEvent.click(next);
  expect(screen.getByRole("combobox",{name:"調べる関数"})).toHaveValue("src/calc/revisionEngine.js:revisionServiceBurden");
});

test("検索・区分で隠れた関数も対応表のリンクで表示しフォーカスする", async () => {
  render(<CalculationReferenceAppendix />);
  const search = screen.getByRole("searchbox", { name: "関数名・計算内容で検索" });
  const category = screen.getByRole("combobox", { name: "計算処理の区分" });
  fireEvent.change(search, { target: { value: "not-an-existing-function" } });
  fireEvent.change(category, { target: { value: "医療費助成" } });
  expect(screen.getByText("該当する関数はありません。")).toHaveAttribute("role", "status");
  const link = within(flowTable()).getByRole("link", { name: "computeOptimalModel" });
  fireEvent.click(link);
  await waitFor(() => expect(targetFor(link)).toHaveFocus());
  expect(search).toHaveValue("");
  expect(category).toHaveValue("");
  expect(within(listTable()).getAllByRole("rowheader")).toHaveLength(catalog.functions.length);
});

test("関数名と計算区分で検索できる", () => {
  render(<CalculationReferenceAppendix />);
  const search = screen.getByRole("searchbox", { name: "関数名・計算内容で検索" });
  fireEvent.change(search, { target: { value: "calcM01Detail" } });
  expect(within(listTable()).getAllByRole("rowheader")).toHaveLength(1);
  fireEvent.change(search, { target: { value: "" } });
  fireEvent.change(screen.getByRole("combobox", { name: "計算処理の区分" }), { target: { value: "探索的調整モデル" } });
  expect(within(listTable()).getAllByRole("rowheader")).toHaveLength(catalog.functions.filter((f) => f.category === "探索的調整モデル").length);
});

test("関数への直接URLとhash変更で宛先を表示する", async () => {
  const entry = catalog.functions.find((f) => f.name === "computeOptimalModel");
  const id = entryId(entry);
  window.history.replaceState(null, "", `/#${encodeURIComponent(id)}`);
  render(<CalculationReferenceAppendix />);
  await waitFor(() => expect(document.getElementById(id)).toHaveFocus());
  const search = screen.getByRole("searchbox", { name: "関数名・計算内容で検索" });
  fireEvent.change(search, { target: { value: "calcM01Detail" } });
  expect(document.getElementById(id)).not.toBeInTheDocument();
  fireEvent(window, new HashChangeEvent("hashchange"));
  await waitFor(() => expect(document.getElementById(id)).toHaveFocus());
  expect(search).toHaveValue("");
});
