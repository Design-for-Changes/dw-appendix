import { render, screen, within } from "@testing-library/react";
import IncomeAssessmentAppendix from "./IncomeAssessmentAppendix";

const columns = [
  { key: "id", label: "ID" },
  { key: "program", label: "制度・手当名" },
  { key: "assessment_unit", label: "判定単位" },
  { key: "primary_target", label: "主たる判定対象" },
  { key: "other_targets", label: "その他の判定対象" },
  { key: "income_measure", label: "所得指標" },
  { key: "change_rule", label: "変動方法" },
];

const sample = {
  schema_version: "1.0.0",
  table_label: "表A1",
  title: "主な制度の所得判定・変動方法（自治体制度は船橋市を例示）",
  checked_on: "2026-11-13",
  scope: {
    municipal_example: "船橋市",
    description: "全国制度と自治体制度の所得判定を、判定単位・対象、所得指標及び変動方法に分けて整理する。",
  },
  columns,
  notes: [
    "同じ法律に基づく複数の制度には、同じ法律IDを付す場合がある。",
    "自治体制度は船橋市の例であり、他の自治体にも同じ基準が適用されることを意味しない。",
  ],
  rows: ["N01-1", "N01-2", "N02", "N02", "N03", "N04", "N06-2", "M01", "M02", "M03"].map((id, index) => ({
    id,
    program: `制度・手当名${index + 1}（省略しない補足文）`,
    assessment_unit: `判定単位${index + 1}`,
    primary_target: `主たる判定対象${index + 1}（世帯の範囲も記載）`,
    other_targets: `その他の判定対象${index + 1}`,
    income_measure: `所得指標${index + 1}（制度所定の計算）`,
    change_rule: `変動方法${index + 1}。限度額以上と超の場合を省略せず記載する。`,
    sources: [
      { title: `公式案内${index + 1}`, url: `https://example.org/programs/${index + 1}` },
      ...(index === 0 ? [{ title: "関連する法律の原典", url: "https://example.org/law" }] : []),
    ],
  })),
};

afterEach(() => { jest.restoreAllMocks(); });

test("7列・10行の全項目と出典を省略せず表示する", async () => {
  const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue({ ok: true, json: async () => sample });
  render(<IncomeAssessmentAppendix />);

  const table = await screen.findByRole("table");
  const region = screen.getByRole("region", { name: "所得判定の対象・指標・変動方法" });
  expect(region).toHaveAttribute("id", "income-assessment");
  expect(screen.getByRole("heading", { level: 2 })).toHaveAttribute("id", "income-assessment-title");
  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringContaining("/data/research/income-assessment-rules.json"),
    expect.objectContaining({ signal: expect.any(AbortSignal) })
  );
  expect(screen.getByText(sample.scope.description)).toBeInTheDocument();
  expect(screen.getByText("自治体制度の例示：船橋市")).toBeInTheDocument();
  expect(table.querySelector("caption").textContent).toContain(`表A1　${sample.title}`);
  expect(table.querySelector("caption")).toHaveTextContent("最終確認日：2026-11-13");
  expect(within(table).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(columns.map((column) => column.label));

  const rows = within(table).getAllByRole("row").slice(1);
  expect(rows).toHaveLength(10);
  rows.forEach((row, index) => {
    const expected = sample.rows[index];
    const rowHeader = within(row).getByRole("rowheader");
    expect(row.firstElementChild).toBe(rowHeader);
    expect(rowHeader).toHaveAttribute("scope", "row");
    expect(rowHeader).toHaveTextContent(expected.id);
    const cells = within(row).getAllByRole("cell");
    expect(cells).toHaveLength(6);
    columns.slice(1).forEach((column, cellIndex) => {
      expect(cells[cellIndex]).toHaveAttribute("data-label", column.label);
      expect(cells[cellIndex]).toHaveTextContent(expected[column.key]);
    });
    expect(within(row).getByRole("link", { name: expected.program })).toHaveAttribute("href", expected.sources[0].url);
    expect(within(row).getByRole("link", { name: expected.program })).toHaveAttribute("title", expected.sources[0].title);
  });

  const additionalSource = screen.getByRole("link", { name: "関連する法律の原典" });
  expect(additionalSource).toHaveAttribute("href", "https://example.org/law");
  expect(additionalSource.closest("small")).not.toBeNull();
  expect(additionalSource.closest("td")).toHaveAttribute("data-label", "制度・手当名");
  const download = screen.getByRole("link", { name: "所得判定・変動方法JSON" });
  expect(download).toHaveAttribute("href", expect.stringContaining("/data/research/income-assessment-rules.json"));
  expect(download).toHaveAttribute("download");
  sample.notes.forEach((note) => expect(screen.getByText(note).tagName).toBe("P"));
});

test("読み込みが終わるまでは読み込み中と表示する", () => {
  jest.spyOn(global, "fetch").mockReturnValue(new Promise(() => {}));
  render(<IncomeAssessmentAppendix />);
  expect(screen.getByRole("status")).toHaveTextContent("所得判定の資料を読み込んでいます。");
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
});

test("HTTP取得失敗を明示し、表の値に置き換えない", async () => {
  jest.spyOn(global, "fetch").mockResolvedValue({ ok: false, status: 404 });
  render(<IncomeAssessmentAppendix />);
  expect(await screen.findByRole("alert")).toHaveTextContent("所得判定の資料を読み込めませんでした。");
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
});

test("通信失敗を明示する", async () => {
  jest.spyOn(global, "fetch").mockRejectedValue(new Error("network unavailable"));
  render(<IncomeAssessmentAppendix />);
  expect(await screen.findByRole("alert")).toHaveTextContent("所得判定の資料を読み込めませんでした。");
});
