import { fireEvent, render, screen, within } from "@testing-library/react";
import { TextEncoder } from "util";
import ResearchDataAppendix, { DATA_REVISION } from "./ResearchDataAppendix";

const exclusionCategories = [
  { id: "C1", label: "障害児世帯の家計に直接作用する給付・負担等を定めていない" },
  { id: "C5", label: "障害を要件としない" },
  { id: "C2", label: "就労・職域・災害・特定の障害原因等を前提とする" },
  { id: "C4", label: "障害固有の給付・負担要件が本則に定められていない" },
];

function makeLaw(id, title, screening) {
  return {
    law_id: `LAW-${id}`,
    law_title: title,
    law_num: `テスト法令番号${id}`,
    matched_keywords: ["障害児"],
    source_url: `https://example.org/laws/${id.toLowerCase()}`,
    screening,
  };
}

const sample = {
  schema_version: "2.1.0",
  research_as_of: "2026-11-13",
  source: { name: "e-Gov法令検索 法令API Version 2" },
  method: {
    keywords: ["障害者", "障害児", "特別支援学校"],
    combination: "各検索語による結果の法令ID単位の和集合",
    inclusion_criterion: "障害児世帯の可処分所得に作用する規定を含む。",
    exclusion_categories: exclusionCategories,
    review_status_note: "原典確認済みは採用確定を意味しない。",
    candidate_note: "選定候補への収録はモデル世帯の試算への採用を意味しない。",
    current_law_rule: "表示しない内部の取得手順。",
  },
  counts: { total_laws: 999, candidate_laws: 999, excluded_laws: 999 },
  laws: [
    makeLaw("A", "世帯給付の候補法", {
      status: "candidate", review_status: "verified", scope_review_required: false,
      reason: "障害児世帯へ給付する規定がある。",
      discussion_point: "給付対象となる年齢を本稿の条件と照合する。",
      evidence: [{ article: "第十条", text: "給付についての原文を省略せず記載する。", source_url: "https://example.org/laws/a#article10" }],
    }),
    makeLaw("B", "組織を定める除外法", {
      status: "excluded", review_status: "verified", exclusion_category_id: "C1",
      reason: "行政の組織を定めており、世帯への給付を定めていない。",
      evidence: [{ article: "第三条", text: "行政組織の設置に関する条文。", source_url: "https://example.org/laws/b#article3" }],
    }),
    makeLaw("C", "普遍的な制度の除外法", {
      status: "excluded", review_status: "verified", exclusion_category_id: "C5",
      reason: "障害の有無を条件としない普遍的な制度である。",
    }),
    makeLaw("D", "職域制度の除外法", {
      status: "excluded", review_status: "pending", exclusion_category_id: "C2",
      reason: "職域に基づく給付を定めている。",
    }),
    makeLaw("E", "本則要件による除外法", {
      status: "excluded", review_status: "verified", exclusion_category_id: "C4",
      reason: "障害固有の要件は別の規定に委ねられている。",
    }),
    makeLaw("F", "原典照合中の候補法", {
      status: "candidate", review_status: "pending", scope_review_required: true,
      reason: "給付の適用条件について原典照合を要する。",
      discussion_point: "所得の判定対象を検討する。",
    }),
    makeLaw("G", "included形式の候補法", {
      status: "included", review_status: "verified",
      reason: "障害児世帯の税負担を軽減する。",
      discussion_point: "個別輸入の場合の家計への作用を検討する。",
    }),
  ],
};

beforeEach(() => {
  global.TextEncoder = TextEncoder;
  Object.defineProperty(global, "crypto", { configurable: true, value: { subtle: {
    digest: jest.fn().mockResolvedValue(Uint8Array.from(DATA_REVISION.match(/../g), (byte) => parseInt(byte, 16)).buffer),
  } } });
});
afterEach(() => { jest.restoreAllMocks(); });

const dataResponse = (data) => ({ ok: true, text: async () => JSON.stringify(data) });

async function renderSample(data = sample) {
  jest.spyOn(global, "fetch").mockResolvedValue(dataResponse(data));
  render(<ResearchDataAppendix />);
  await screen.findByRole("heading", { level: 2, name: /表A2\s+e-Gov法令検索による抽出結果と採否/ });
}

test("除外理由をデータの順序で示し、最後に候補法令の表を置く", async () => {
  await renderSample();
  const tables = screen.getAllByRole("table");
  expect(global.fetch).toHaveBeenCalledTimes(1);
  expect(global.fetch).toHaveBeenCalledWith(
    expect.stringContaining("/data/research/egov-law-screening.json"),
    expect.objectContaining({ signal: expect.any(AbortSignal), cache: "no-store" })
  );
  expect(global.fetch.mock.calls[0][0]).toMatch(/egov-law-screening\.json\?v=[a-f0-9]{64}$/);
  expect(global.fetch.mock.calls.some(([url]) => url.includes("municipal"))).toBe(false);
  expect(tables).toHaveLength(5);
  const headings = screen.getAllByRole("heading", { level: 3 });
  expect(headings.map((heading) => heading.textContent)).toEqual([
    ...exclusionCategories.map((category, index) => `除外理由${index + 1}：${category.label}（1件）`),
    "残った候補の個別検討（3件）",
  ]);
  ["LAW-B", "LAW-C", "LAW-D", "LAW-E"].forEach((id, index) => {
    const table = screen.getByRole("table", { name: `除外理由${index + 1}に該当する法令` });
    expect(within(table).getByRole("rowheader", { name: id })).toBeInTheDocument();
  });
  const candidateTable = screen.getByRole("table", { name: "候補法令の個別検討" });
  expect(tables[tables.length - 1]).toBe(candidateTable);
  expect(within(candidateTable).getAllByRole("rowheader").map((header) => header.textContent)).toEqual(["LAW-A", "LAW-F", "LAW-G"]);
  expect(screen.getByText("抽出7件、除外4件、候補3件。")).toBeInTheDocument();
  expect(screen.getByText("7件表示（全7件）")).toBeInTheDocument();
  expect(screen.queryByRole("definition")).not.toBeInTheDocument();
  expect(screen.queryByText(/999件|現行法令数|非現行|原典確認中0|表示しない内部の取得手順/)).not.toBeInTheDocument();
});

test("全表にID先頭の6列、個別理由、条文と原文リンクを保持する", async () => {
  await renderSample();
  const tables = screen.getAllByRole("table");
  tables.forEach((table) => {
    expect(within(table).getAllByRole("columnheader")).toHaveLength(6);
    expect(within(table).getAllByRole("columnheader")[0]).toHaveTextContent("法令ID");
  });
  sample.laws.forEach((law) => {
    const row = screen.getByRole("row", { name: new RegExp(law.law_id) });
    expect(within(row).getByRole("rowheader")).toHaveTextContent(law.law_id);
    expect(within(row).getByRole("rowheader")).toHaveAttribute("scope", "row");
    expect(within(row).getAllByRole("cell")).toHaveLength(5);
    within(row).getAllByRole("cell").forEach((cell) => expect(cell).toHaveAttribute("data-label"));
    expect(within(row).getByText(law.screening.reason)).toBeVisible();
    expect(within(row).getByRole("link", { name: "法令原文（e-Gov）" })).toHaveAttribute("href", law.source_url);
  });
  const rowA = screen.getByRole("row", { name: /LAW-A/ });
  fireEvent.click(within(rowA).getByText("根拠条文・原文（1件）"));
  expect(within(rowA).getByText("給付についての原文を省略せず記載する。")).toBeVisible();
  expect(within(rowA).getByRole("link", { name: "第十条の原文" })).toHaveAttribute("href", "https://example.org/laws/a#article10");
  const cells = within(rowA).getAllByRole("cell");
  expect(within(cells[3]).getByText("検討事項：")).toBeVisible();
  expect(within(cells[3]).getByText(sample.laws[0].screening.discussion_point)).toBeVisible();
  expect(within(cells[4]).queryByText(sample.laws[0].screening.discussion_point)).not.toBeInTheDocument();
  const download = screen.getByRole("link", { name: "法令抽出・採否JSONをダウンロード" });
  expect(download).toHaveAttribute("href", expect.stringContaining("/data/research/egov-law-screening.json"));
  expect(download).toHaveAttribute("download");
});

test("採否の区分と原典の確認状況を混同しない", async () => {
  await renderSample();
  const candidateRow = screen.getByRole("row", { name: /LAW-F/ });
  expect(within(candidateRow).getByText("採用候補", { exact: true })).toBeVisible();
  expect(within(candidateRow).getByText("原典確認中", { exact: true })).toBeVisible();
  expect(within(candidateRow).getByText("適用条件の確認が必要", { exact: true })).toBeVisible();
  expect(within(candidateRow).queryByText("原典確認済み", { exact: true })).not.toBeInTheDocument();
  const excludedRow = screen.getByRole("row", { name: /LAW-D/ });
  expect(within(excludedRow).getByText("除外", { exact: true })).toBeVisible();
  expect(within(excludedRow).getByText("原典確認中", { exact: true })).toBeVisible();
  expect(screen.getByText("原典確認済みは採用確定を意味しない。")).toBeInTheDocument();
  expect(screen.getByText(/モデル世帯の試算への採用を意味しない/)).toBeInTheDocument();
});

test("候補・除外・原典確認中・適用条件の絞り込みと検索を保持する", async () => {
  await renderSample();
  const filter = screen.getByRole("combobox", { name: "採否の表示" });
  fireEvent.change(filter, { target: { value: "candidate" } });
  expect(screen.getAllByRole("table")).toHaveLength(1);
  expect(screen.getByText("原典照合中の候補法")).toBeInTheDocument();
  expect(screen.getByText("3件表示（全7件）")).toBeInTheDocument();
  fireEvent.change(filter, { target: { value: "excluded" } });
  expect(screen.getAllByRole("table")).toHaveLength(4);
  expect(screen.queryByRole("table", { name: "候補法令の個別検討" })).not.toBeInTheDocument();
  expect(screen.getByText("4件表示（全7件）")).toBeInTheDocument();
  fireEvent.change(filter, { target: { value: "pending" } });
  expect(screen.getByText("職域制度の除外法")).toBeInTheDocument();
  expect(screen.getByText("原典照合中の候補法")).toBeInTheDocument();
  expect(screen.getByText("2件表示（全7件）")).toBeInTheDocument();
  fireEvent.change(filter, { target: { value: "scope-review" } });
  expect(screen.getByText("原典照合中の候補法")).toBeInTheDocument();
  expect(screen.getByText("1件表示（全7件）")).toBeInTheDocument();
  fireEvent.change(filter, { target: { value: "all" } });
  const search = screen.getByRole("searchbox", { name: "法令・採否根拠を検索" });
  fireEvent.change(search, { target: { value: "個別輸入" } });
  expect(screen.getByText("included形式の候補法")).toBeInTheDocument();
  expect(screen.getByText("1件表示（全7件）")).toBeInTheDocument();
  fireEvent.change(search, { target: { value: "第十条" } });
  expect(screen.getByText("世帯給付の候補法")).toBeInTheDocument();
  fireEvent.change(search, { target: { value: "障害を要件としない" } });
  expect(screen.getByText("普遍的な制度の除外法")).toBeInTheDocument();
  fireEvent.change(search, { target: { value: "該当しない検索語" } });
  expect(screen.getByText("該当する法令はありません。")).toBeInTheDocument();
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
  fireEvent.change(search, { target: { value: "" } });
  expect(screen.getByText("7件表示（全7件）")).toBeInTheDocument();
});

test.each([
  ["分類IDの欠落", makeLaw("X", "除外理由未分類の法", { status: "excluded", review_status: "verified" })],
  ["未知の分類ID", makeLaw("X", "除外理由未分類の法", { status: "excluded", review_status: "verified", exclusion_category_id: "UNKNOWN" })],
  ["判定の欠落", makeLaw("Y", "判定が未設定の法")],
])("%sの法令を正常な表として表示しない", async (_label, law) => {
  const data = { ...sample, laws: [law] };
  jest.spyOn(global, "fetch").mockResolvedValue(dataResponse(data));
  render(<ResearchDataAppendix />);
  expect(await screen.findByRole("alert")).toHaveTextContent("法令抽出資料を読み込めませんでした。");
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
  expect(screen.queryByText(/分類が未記録/)).not.toBeInTheDocument();
});

test("旧版186法のデータを現行の分類表として表示しない", async () => {
  const data = { ...sample, schema_version: "2.0.0", counts: { total_laws: 186, excluded_laws: 137, candidate_laws: 49 }, method: { ...sample.method, exclusion_categories: undefined } };
  jest.spyOn(global, "fetch").mockResolvedValue(dataResponse(data));
  render(<ResearchDataAppendix />);
  expect(await screen.findByRole("alert")).toBeInTheDocument();
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
  expect(screen.queryByText(/抽出186件|除外137件|候補49件|分類が未記録/)).not.toBeInTheDocument();
});

test("同じスキーマでも内容が異なる旧データを表示しない", async () => {
  global.crypto.subtle.digest.mockResolvedValue(new Uint8Array(32).buffer);
  jest.spyOn(global, "fetch").mockResolvedValue(dataResponse(sample));
  render(<ResearchDataAppendix />);
  expect(await screen.findByRole("alert")).toBeInTheDocument();
  const [algorithm, bytes] = global.crypto.subtle.digest.mock.calls[0];
  expect(algorithm).toBe("SHA-256");
  expect(Array.from(bytes)).toEqual(Array.from(new TextEncoder().encode(JSON.stringify(sample))));
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
});

test("法令資料の読み込み中と表示する", () => {
  jest.spyOn(global, "fetch").mockReturnValue(new Promise(() => {}));
  render(<ResearchDataAppendix />);
  expect(screen.getByRole("status")).toHaveTextContent("法令抽出資料を読み込んでいます。");
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
});

test("取得失敗を明示する", async () => {
  jest.spyOn(global, "fetch").mockResolvedValue({ ok: false, status: 404 });
  render(<ResearchDataAppendix />);
  expect(await screen.findByRole("alert")).toHaveTextContent("法令抽出資料を読み込めませんでした。");
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
});

test("通信失敗を明示する", async () => {
  jest.spyOn(global, "fetch").mockRejectedValue(new Error("network unavailable"));
  render(<ResearchDataAppendix />);
  expect(await screen.findByRole("alert")).toHaveTextContent("法令抽出資料を読み込めませんでした。");
});
