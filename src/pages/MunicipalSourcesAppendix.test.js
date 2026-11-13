import { fireEvent, render, screen, within } from "@testing-library/react";
import MunicipalSourcesAppendix from "./MunicipalSourcesAppendix";

const sample = {
  checked_on: "2026-11-13",
  private_notes: "PRIVATE_TOP_LEVEL_NOTE",
  scope: { rule: "政令指定都市と人口50万人以上の中核市", population_description: "人口基準を固定する。", references: [] },
  municipalities: [
    {
      code: "A", name: "対象市A", prefecture: "テスト県", classification: "政令指定都市",
      category_id: "PRIVATE_M99", status: "PRIVATE_STATUS", official_name: "PRIVATE_PROGRAM_NAME", child_application: "PRIVATE_CHILD_APPLICATION",
      sources: [
        { title: "福祉案内A", url: "https://example.org/a", edition: "令和8年度", checked_on: "2026-11-13", kind: "guide" },
        { title: "福祉案内AのPDF本体", url: "https://example.org/a.pdf", edition: null, checked_on: null, kind: "pdf" },
        { title: "個別制度の公式要綱", url: "https://example.org/rules", edition: "令和7年改正", checked_on: null, kind: "supplement", evidence_summary: "PRIVATE_EVIDENCE", private_notes: "PRIVATE_SOURCE_NOTE" },
      ],
    },
    { code: "B", name: "対象市B", prefecture: "確認県", classification: "中核市", sources: [
      { title: "福祉案内B", url: "https://example.org/b", edition: "令和8年度", checked_on: "2026-11-13", kind: "guide" },
      { title: "個別制度の公式要綱", url: "https://example.org/rules", edition: "令和7年改正", checked_on: null, kind: "supplement" },
    ] },
    { code: "C", name: "対象市C", prefecture: "確認県", classification: "中核市", sources: [] },
  ],
};

afterEach(() => { jest.restoreAllMocks(); });

test("基本資料を常に表示し、資料数と追加資料を動的に表示する", async () => {
  const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue({ ok: true, json: async () => sample });
  render(<MunicipalSourcesAppendix />);
  expect(await screen.findByText("福祉案内A")).toHaveAttribute("href", "https://example.org/a");
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/data/research/municipal-source-list.json"), expect.objectContaining({ signal: expect.any(AbortSignal) }));
  expect(screen.getByText(/一覧の基準日：2026-11-13/)).toBeInTheDocument();
  expect(screen.getByText("自治体制度の調査")).toBeInTheDocument();
  expect(screen.getByText(/資料：4件（市別掲載5件）/)).toBeInTheDocument();
  expect(screen.getByText(/対象：3市/)).toBeInTheDocument();
  expect(screen.getByText("3市表示")).toBeInTheDocument();
  expect(screen.getByText("資料確認中")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "福祉案内A" })).toBeVisible();
  expect(screen.getByRole("link", { name: "福祉案内B" })).toBeVisible();
  expect(screen.getByRole("link", { name: "福祉案内AのPDF本体" })).not.toBeVisible();
  fireEvent.click(screen.getByText("追加確認資料（2件）"));
  expect(screen.getByRole("link", { name: "福祉案内AのPDF本体" })).toHaveAttribute("href", "https://example.org/a.pdf");
  expect(screen.getByRole("link", { name: "福祉案内AのPDF本体" })).toBeVisible();
  screen.getAllByRole("link", { name: "個別制度の公式要綱" }).forEach((link) => expect(link).toHaveAttribute("href", "https://example.org/rules"));
  expect(screen.getByText("版・資料の基準時点：未記録")).toBeInTheDocument();
  expect(screen.getAllByText("最終確認日：未記録").length).toBeGreaterThan(0);
  const table = screen.getByRole("table");
  expect(within(table).getAllByRole("columnheader").map((header) => header.textContent)).toEqual(["市", "区分", "基本資料", "追加確認資料"]);
});

test("市名・追加資料名・版で検索し、該当市の基本資料と追加資料を読める", async () => {
  jest.spyOn(global, "fetch").mockResolvedValue({ ok: true, json: async () => sample });
  render(<MunicipalSourcesAppendix />);
  await screen.findByText("福祉案内A");
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "対象市A" } });
  expect(screen.getByText("1市表示")).toBeInTheDocument();
  expect(screen.queryByText("対象市B")).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "PDF本体" } });
  expect(screen.getByText("1市表示")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "福祉案内AのPDF本体" })).toBeVisible();
  expect(screen.getByRole("link", { name: "福祉案内A" })).toBeVisible();
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "令和7年改正" } });
  expect(screen.getByText("2市表示")).toBeInTheDocument();
  expect(screen.getAllByRole("link", { name: "個別制度の公式要綱" })).toHaveLength(2);
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "存在しない市" } });
  expect(screen.getByText("該当する市はありません。")).toBeInTheDocument();
});

test("非公開の判定・制度対応・根拠本文を表示や検索に含めない", async () => {
  jest.spyOn(global, "fetch").mockResolvedValue({ ok: true, json: async () => sample });
  render(<MunicipalSourcesAppendix />);
  await screen.findByText("福祉案内A");
  fireEvent.click(screen.getByText("追加確認資料（2件）"));
  ["PRIVATE_TOP_LEVEL_NOTE", "PRIVATE_M99", "PRIVATE_STATUS", "PRIVATE_PROGRAM_NAME", "PRIVATE_CHILD_APPLICATION", "PRIVATE_EVIDENCE", "PRIVATE_SOURCE_NOTE"].forEach((value) => {
    expect(screen.queryByText(value)).not.toBeInTheDocument();
  });
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "PRIVATE" } });
  expect(screen.getByText("0市表示")).toBeInTheDocument();
  expect(screen.getByText("該当する市はありません。")).toBeInTheDocument();
});

test("旧形式でも先頭の資料を基本資料として表示する", async () => {
  const legacy = { ...sample, municipalities: [{ ...sample.municipalities[0], sources: [{ title: "旧形式の基本ガイド", url: "https://example.org/legacy", edition: "令和8年度" }] }] };
  jest.spyOn(global, "fetch").mockResolvedValue({ ok: true, json: async () => legacy });
  render(<MunicipalSourcesAppendix />);
  expect(await screen.findByRole("link", { name: "旧形式の基本ガイド" })).toBeVisible();
  expect(screen.getByText("追加資料の記録なし")).toBeInTheDocument();
});

test("読み込み中を表示する", () => {
  jest.spyOn(global, "fetch").mockReturnValue(new Promise(() => {}));
  render(<MunicipalSourcesAppendix />);
  expect(screen.getByRole("status")).toHaveTextContent("参照資料を読み込んでいます。");
});

test("取得失敗を未実施の判定に置き換えない", async () => {
  jest.spyOn(global, "fetch").mockResolvedValue({ ok: false, status: 404 });
  render(<MunicipalSourcesAppendix />);
  expect(await screen.findByRole("alert")).toHaveTextContent("読み込めませんでした");
});
