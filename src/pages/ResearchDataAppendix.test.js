import { fireEvent, render, screen, within } from "@testing-library/react";
import ResearchDataAppendix from "./ResearchDataAppendix";

const sample = {
  schema_version: "2.0.0",
  research_as_of: "2026-11-13",
  source: { name: "e-Gov法令検索 法令API Version 2" },
  method: {
    keywords: ["障害者", "障害児", "特別支援学校"],
    combination: "各検索語による結果の法令ID単位の和集合",
    inclusion_criterion: "障害児世帯の可処分所得に直接作用する規定を含む。",
    exclusion_criterion: "対象の規定を含まない法律。",
  },
  counts: { total_laws: 6, current_laws: 5, candidate_laws: 3, excluded_laws: 1, scope_review_laws: 1, noncurrent_laws: 1 },
  laws: [
    {
      law_id: "LAW-A",
      law_title: "確認済みの候補法",
      law_num: "令和元年法律第一号",
      matched_keywords: ["障害児"],
      source_url: "https://example.org/laws/a",
      current_status: { is_current: true },
      screening: {
        status: "candidate", review_status: "verified", scope_review_required: false,
        reason: "世帯へ直接給付する規定がある。",
        evidence: [{ article: "第十条", text: "給付についての原文を省略せず記載する。", source_url: "https://example.org/laws/a#article10" }],
      },
    },
    {
      law_id: "LAW-B",
      law_title: "確認済みの除外法",
      law_num: "令和元年法律第二号",
      matched_keywords: ["障害者", "特別支援学校"],
      source_url: "https://example.org/laws/b",
      current_status: { is_current: false, repeal_status: "Repeal", repeal_date: "2025-01-17" },
      screening: {
        status: "excluded", review_status: "verified", scope_review_required: false,
        reason: "すでに廃止され、現行の対象制度ではない。",
        evidence: [{ article: "第三条", text: "廃止前の給付に関する条文。", source_url: "https://example.org/laws/b#article3" }],
      },
    },
    {
      law_id: "LAW-C",
      law_title: "原典が未確認の候補法",
      law_num: "令和元年法律第三号",
      matched_keywords: ["障害児"],
      source_url: "https://example.org/laws/c",
      current_status: { is_current: true },
      screening: { status: "candidate", review_status: "pending", reason: "世帯への作用について原典照合を要する。" },
    },
    {
      law_id: "LAW-D",
      law_title: "確認状態が未設定の法",
      law_num: "令和元年法律第四号",
      matched_keywords: ["障害者"],
      source_url: "https://example.org/laws/d",
      current_status: { is_current: true },
      screening: { status: "excluded", reason: "行政の組織に関する規定がある。" },
    },
    {
      law_id: "LAW-E",
      law_title: "障害原因を限定した給付法",
      law_num: "令和元年法律第五号",
      matched_keywords: ["障害児"],
      source_url: "https://example.org/laws/e",
      current_status: { is_current: true },
      screening: {
        status: "candidate", review_status: "verified", scope_review_required: true,
        reason: "予防接種による障害児への給付を定め、原因を限定した制度を含める範囲判断が必要。",
        evidence: [{ article: "第十六条", text: "障害児養育年金を支給する。", source_url: "https://example.org/laws/e#article16" }],
      },
    },
    {
      law_id: "LAW-F",
      law_title: "included形式の確認済み法",
      law_num: "令和元年法律第六号",
      matched_keywords: ["障害児"],
      source_url: "https://example.org/laws/f",
      current_status: { is_current: true },
      screening: { status: "included", review_status: "verified", reason: "障害児世帯の税負担を軽減する。" },
    },
  ],
};

afterEach(() => { jest.restoreAllMocks(); });

async function renderSample(data = sample) {
  jest.spyOn(global, "fetch").mockResolvedValue({ ok: true, json: async () => data });
  render(<ResearchDataAppendix />);
  return screen.findByRole("table");
}

test("法令JSONだけを取得し、IDを先頭に6列・理由・折り畳んだ原典を表示する", async () => {
  const table = await renderSample();
  expect(global.fetch).toHaveBeenCalledTimes(1);
  expect(global.fetch).toHaveBeenCalledWith(
    expect.stringContaining("/data/research/egov-law-screening.json"),
    expect.objectContaining({ signal: expect.any(AbortSignal) })
  );
  expect(global.fetch.mock.calls.some(([url]) => url.includes("municipal"))).toBe(false);
  expect(screen.getByRole("region")).toHaveAttribute("id", "law-screening");
  expect(screen.getByRole("table", { name: /表A2\s+e-Gov法令検索による抽出結果と採否/ })).toBe(table);
  expect(within(table).getAllByRole("columnheader")[0]).toHaveTextContent("法令ID");
  expect(within(table).getAllByRole("columnheader")).toHaveLength(6);
  const rows = within(table).getAllByRole("row").slice(1);
  expect(rows).toHaveLength(6);
  rows.forEach((row, index) => {
    expect(within(row).getByRole("rowheader")).toHaveTextContent(sample.laws[index].law_id);
    expect(within(row).getByRole("rowheader")).toHaveAttribute("scope", "row");
    expect(within(row).getAllByRole("cell")).toHaveLength(5);
    within(row).getAllByRole("cell").forEach((cell) => expect(cell).toHaveAttribute("data-label"));
    expect(within(row).getByRole("link", { name: "法令原文（e-Gov）" })).toHaveAttribute("href", sample.laws[index].source_url);
  });
  expect(screen.getByText("世帯へ直接給付する規定がある。")).toBeVisible();
  const evidence = screen.getByText("給付についての原文を省略せず記載する。");
  expect(evidence.closest("details")).not.toHaveAttribute("open");
  expect(within(rows[0]).getByText("根拠条文・原文（1件）")).toBeVisible();
  evidence.closest("details").setAttribute("open", "");
  expect(screen.getByRole("link", { name: "第十条の原文" })).toHaveAttribute("href", "https://example.org/laws/a#article10");
  expect(screen.getByText("6件表示（全6件）")).toBeInTheDocument();
  expect(screen.getByText(/モデル世帯への試算採用を意味しない/)).toBeInTheDocument();
  expect(screen.queryByText(/既存記録/)).not.toBeInTheDocument();
  const download = screen.getByRole("link", { name: "法令抽出・採否JSONをダウンロード" });
  expect(download).toHaveAttribute("href", expect.stringContaining("/data/research/egov-law-screening.json"));
  expect(download).toHaveAttribute("download");
});

test("原典確認済みの原因限定給付も候補に含め、適用条件の判断待ちと原典未確認を分ける", async () => {
  const table = await renderSample();
  const rows = within(table).getAllByRole("row").slice(1);
  expect(within(rows[4]).getByText("採用候補", { exact: true })).toBeInTheDocument();
  expect(within(rows[4]).getByText("原典確認済み", { exact: true })).toBeInTheDocument();
  expect(within(rows[4]).getByText("適用条件の確認が必要", { exact: true })).toBeInTheDocument();
  expect(within(rows[4]).queryByText("原典確認中", { exact: true })).not.toBeInTheDocument();
  expect(within(rows[5]).getByText("採用候補", { exact: true })).toBeInTheDocument();
  [rows[2], rows[3]].forEach((row) => {
    expect(within(row).getByText("原典確認中", { exact: true })).toBeInTheDocument();
    expect(within(row).queryByText("原典確認済み", { exact: true })).not.toBeInTheDocument();
    expect(within(row).getByText("原典との照合が完了していません。")).toBeInTheDocument();
  });
  expect(within(rows[2]).getByText(sample.laws[2].screening.reason)).toBeVisible();
  expect(within(rows[3]).getByText(sample.laws[3].screening.reason)).toBeVisible();
});

test("候補・除外・条件要確認・非現行を実データから集計する", async () => {
  await renderSample();
  const expected = [
    ["抽出法令数", "6件"], ["現行法令数", "5件"],
    ["採用候補", "3件"], ["除外", "1件"],
    ["候補のうち適用条件要確認", "1件"], ["非現行法令数", "1件"],
    ["原典確認中", "2件"],
  ];
  expected.forEach(([name, value]) => {
    expect(screen.getByRole("definition", { name })).toHaveTextContent(value);
  });
  expect(screen.getByText("非現行（e-Gov API記録日：2025-01-17）")).toBeInTheDocument();
  expect(screen.queryByText(/186件/)).not.toBeInTheDocument();
  expect(screen.queryByText(/採用8件/)).not.toBeInTheDocument();
});

test("候補・除外・原典確認中・適用条件要確認の絞り込みと検索を組み合わせる", async () => {
  await renderSample();
  const filter = screen.getByRole("combobox", { name: "採否の表示" });
  fireEvent.change(filter, { target: { value: "candidate" } });
  expect(screen.getByText("確認済みの候補法")).toBeInTheDocument();
  expect(screen.getByText("障害原因を限定した給付法")).toBeInTheDocument();
  expect(screen.getByText("included形式の確認済み法")).toBeInTheDocument();
  expect(screen.queryByText("原典が未確認の候補法")).not.toBeInTheDocument();
  expect(screen.getByText("3件表示（全6件）")).toBeInTheDocument();
  fireEvent.change(filter, { target: { value: "scope-review" } });
  expect(screen.getByText("障害原因を限定した給付法")).toBeInTheDocument();
  expect(screen.queryByText("確認済みの候補法")).not.toBeInTheDocument();
  expect(screen.getByText("1件表示（全6件）")).toBeInTheDocument();
  fireEvent.change(filter, { target: { value: "excluded" } });
  expect(screen.getByText("確認済みの除外法")).toBeInTheDocument();
  expect(screen.queryByText("確認状態が未設定の法")).not.toBeInTheDocument();
  fireEvent.change(filter, { target: { value: "pending" } });
  expect(screen.getByText("原典が未確認の候補法")).toBeInTheDocument();
  expect(screen.getByText("確認状態が未設定の法")).toBeInTheDocument();
  expect(screen.getByText("2件表示（全6件）")).toBeInTheDocument();
  fireEvent.change(filter, { target: { value: "all" } });
  const search = screen.getByRole("searchbox", { name: "法令・採否根拠を検索" });
  fireEvent.change(search, { target: { value: "第十条" } });
  expect(screen.getByText("確認済みの候補法")).toBeInTheDocument();
  expect(screen.getByText("1件表示（全6件）")).toBeInTheDocument();
  fireEvent.change(search, { target: { value: "予防接種" } });
  expect(screen.getByText("障害原因を限定した給付法")).toBeInTheDocument();
  fireEvent.change(search, { target: { value: "law-d" } });
  expect(screen.getByText("確認状態が未設定の法")).toBeInTheDocument();
  fireEvent.change(search, { target: { value: "該当しない検索語" } });
  expect(screen.getByText("該当する法令はありません。")).toBeInTheDocument();
  fireEvent.change(search, { target: { value: "" } });
  expect(screen.getByText("6件表示（全6件）")).toBeInTheDocument();
});

test("現行性の情報がない場合に現行と推測しない", async () => {
  const data = { ...sample, counts: { total_laws: 1 }, laws: [{ ...sample.laws[0], current_status: undefined }] };
  await renderSample(data);
  expect(screen.getByRole("definition", { name: "現行法令数" })).toHaveTextContent("未確認");
  expect(screen.getByRole("definition", { name: "非現行法令数" })).toHaveTextContent("未確認");
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
