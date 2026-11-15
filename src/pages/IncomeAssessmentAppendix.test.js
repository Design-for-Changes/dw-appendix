import { fireEvent, render, screen, within } from "@testing-library/react";
import IncomeAssessmentAppendix from "./IncomeAssessmentAppendix";

const columns = [
  { key: "id", label: "ID" },
  { key: "program", label: "制度・手当名" },
  { key: "income_condition", label: "所得による区分・制限の有無" },
  { key: "assessment_unit", label: "判定単位" },
  { key: "primary_target", label: "主たる判定対象" },
  { key: "other_targets", label: "その他の判定対象" },
  { key: "income_measure", label: "所得指標" },
  { key: "change_rule", label: "変動方法" },
];
const statuses = ["yes", "no", "pending", "pending"];
const sample = {
  schema_version: "2.0.0",
  table_label: "表A1",
  title: "給付・負担関連制度の所得区分・判定方法―船橋市をサンプルとした確認",
  checked_on: "2026-11-15",
  scope: {
    municipal_example: "船橋市",
    description: "国制度と船橋市をサンプルとした所得条件の確認。",
    coverage_note: "船橋市で未確認の類型は不実施を意味しない。",
    national_law_ids: ["N01", "N02", "N03", "N04", "N05", "N06", "N07", "N08", "N09"],
    municipal_categories: Array.from({ length: 19 }, (_, index) => ({ id: `M${String(index + 1).padStart(2, "0")}`, name: `類型${index + 1}` })),
  },
  columns,
  notes: ["この表の確認対象と試算への採用対象は同一ではない。"],
  rows: ["N01-1", "M10", "M04", "M16"].map((id, index) => ({
    rule_id: `rule-${index}`,
    id,
    scope_group: index === 0 ? "national" : "funabashi",
    income_status: statuses[index],
    presence_status: index === 3 ? "unconfirmed" : "confirmed",
    program: `確認制度${index + 1}`,
    income_condition: ["あり（所得制限）", "なし（公式明示）", "未確認（規則未照合）", "未確認"][index],
    assessment_unit: `判定単位${index + 1}`,
    primary_target: `主たる対象${index + 1}`,
    other_targets: `その他の対象${index + 1}`,
    income_measure: `所得指標${index + 1}`,
    change_rule: `変動方法${index + 1}。以上・超を区別する。`,
    child_application: `児童適用${index + 1}`,
    coordination: `併給調整${index + 1}`,
    verification_note: `原典確認範囲${index + 1}`,
    checked_on: "2026-11-15",
    sources: [
      { title: `公式案内${index + 1}`, url: `https://www.city.funabashi.lg.jp/program-${index + 1}.html`, section: `確認節${index + 1}` },
      ...(index === 0 ? [{ title: "関連法律", url: "https://laws.e-gov.go.jp/law/339AC0000000134", section: "第6条" }] : []),
    ],
  })),
};

function mockData(data = sample) {
  return jest.spyOn(global, "fetch").mockResolvedValue({ ok: true, json: async () => data });
}

afterEach(() => { jest.restoreAllMocks(); });

test("8列で全対象を表示し、確認情報・出典・児童適用を詳細欄に保持する", async () => {
  const fetchMock = mockData();
  render(<IncomeAssessmentAppendix />);
  const table = await screen.findByRole("table");
  const region = screen.getByRole("region", { name: sample.title });
  expect(region).toHaveAttribute("id", "income-assessment");
  expect(screen.getByRole("heading", { level: 2, name: sample.title })).toHaveAttribute("id", "income-assessment-title");
  expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/data/research/income-assessment-rules.json"), expect.objectContaining({ signal: expect.any(AbortSignal), cache: "no-store" }));
  expect(screen.getByText(sample.scope.description)).toBeInTheDocument();
  expect(screen.getByText(sample.scope.coverage_note)).toBeInTheDocument();
  expect(screen.getByText(/国の9法律と、自治体19類型/)).toBeInTheDocument();
  expect(table.querySelector("caption")).toHaveTextContent(`表A1 ${sample.title}（最終確認日：2026-11-15）`);
  expect(within(table).getAllByRole("columnheader").map(cell => cell.textContent)).toEqual(columns.map(column => column.label));
  const rows = within(table).getAllByRole("row").slice(1);
  expect(rows).toHaveLength(4);
  rows.forEach((row, index) => {
    const expected = sample.rows[index];
    const rowHeader = within(row).getByRole("rowheader");
    expect(row.firstElementChild).toBe(rowHeader);
    expect(rowHeader).toHaveAttribute("scope", "row");
    expect(rowHeader).toHaveTextContent(expected.id);
    const cells = within(row).getAllByRole("cell");
    expect(cells).toHaveLength(7);
    columns.slice(1).forEach((column, cellIndex) => {
      expect(cells[cellIndex]).toHaveAttribute("data-label", column.label);
      expect(cells[cellIndex]).toHaveTextContent(expected[column.key]);
    });
    expect(row.querySelector("details")).not.toHaveAttribute("open");
    expect(within(row).getByText(`児童への適用：${expected.child_application}`)).toBeInTheDocument();
    expect(within(row).getByText(`併給・代替等：${expected.coordination}`)).toBeInTheDocument();
    expect(within(row).getByText(`確認範囲：${expected.verification_note}`)).toBeInTheDocument();
    expect(within(row).getByText(`確認箇所：${expected.sources[0].section}`)).toBeInTheDocument();
    if (expected.presence_status === "confirmed") {
      expect(within(row).getByRole("link", { name: expected.program })).toHaveAttribute("href", expected.sources[0].url);
    } else {
      expect(within(row).queryByRole("link", { name: expected.program })).not.toBeInTheDocument();
      expect(within(row).getByText("船橋市の個別制度・所得要件は未確認。不実施を意味しない。")).toBeInTheDocument();
    }
  });
  expect(screen.getByRole("link", { name: "関連法律" })).toHaveAttribute("href", sample.rows[0].sources[1].url);
  const download = screen.getByRole("link", { name: "所得区分・判定方法JSON" });
  expect(download).toHaveAttribute("download");
  expect(download).toHaveAttribute("href", expect.stringContaining("/data/research/income-assessment-rules.json"));
  expect(screen.getByText(sample.notes[0])).toBeInTheDocument();
  expect(screen.getByText("4項目該当（全4項目）")).toBeInTheDocument();
});

test("国制度・船橋市・所得条件を別々に絞り込み、未確認をなしへ混ぜない", async () => {
  mockData();
  render(<IncomeAssessmentAppendix />);
  await screen.findByRole("table");
  fireEvent.change(screen.getByLabelText("制度の範囲"), { target: { value: "funabashi" } });
  expect(screen.getByText("3項目該当（全4項目）")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("所得による区分・制限"), { target: { value: "no" } });
  expect(screen.getByText("1項目該当（全4項目）")).toBeInTheDocument();
  expect(screen.getByRole("rowheader", { name: "M10" })).toBeInTheDocument();
  expect(screen.queryByRole("rowheader", { name: "M04" })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("所得による区分・制限"), { target: { value: "pending" } });
  expect(screen.getByText("2項目該当（全4項目）")).toBeInTheDocument();
  expect(screen.getByRole("rowheader", { name: "M16" })).toBeInTheDocument();
});

test("検索は確認範囲・出典・所得指標を含み、全角英数も正規化する", async () => {
  mockData();
  render(<IncomeAssessmentAppendix />);
  await screen.findByRole("table");
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Ｍ１０" } });
  expect(screen.getByText("1項目該当（全4項目）")).toBeInTheDocument();
  expect(screen.getByRole("rowheader", { name: "M10" })).toBeInTheDocument();
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "原典確認範囲3" } });
  expect(screen.getByRole("rowheader", { name: "M04" })).toBeInTheDocument();
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "該当しない語" } });
  expect(screen.getByText("0項目該当（全4項目）")).toBeInTheDocument();
  expect(screen.getByText("条件に一致する制度はありません。")).toHaveAttribute("role", "status");
});

test("読み込み中は未確認や空表に置き換えない", () => {
  jest.spyOn(global, "fetch").mockReturnValue(new Promise(() => {}));
  render(<IncomeAssessmentAppendix />);
  expect(screen.getByRole("status")).toHaveTextContent("所得判定の資料を読み込んでいます。");
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
});

test.each([
  ["HTTP失敗", { ok: false, status: 404 }],
  ["不正なスキーマ", { ok: true, json: async () => ({ ...sample, schema_version: "1.0.0" }) }],
  ["範囲情報の欠落", { ok: true, json: async () => ({ ...sample, scope: {} }) }],
])("%sを取得失敗として示す", async (_, response) => {
  jest.spyOn(global, "fetch").mockResolvedValue(response);
  render(<IncomeAssessmentAppendix />);
  expect(await screen.findByRole("alert")).toHaveTextContent("所得判定の資料を読み込めませんでした。");
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
});

test("通信失敗を明示する", async () => {
  jest.spyOn(global, "fetch").mockRejectedValue(new Error("network unavailable"));
  render(<IncomeAssessmentAppendix />);
  expect(await screen.findByRole("alert")).toHaveTextContent("所得判定の資料を読み込めませんでした。");
});

test("公開データは9法律と最新19類型の確認行を持ち、市別マトリクスを含まない", () => {
  const data = require("../../public/data/research/income-assessment-rules.json");
  expect(data.schema_version).toBe("2.0.0");
  expect(data.columns).toHaveLength(8);
  expect(new Set(data.rows.map(row => row.rule_id)).size).toBe(data.rows.length);
  data.scope.national_law_ids.forEach(id => expect(data.rows.some(row => row.scope_group === "national" && row.id.split("-")[0] === id)).toBe(true));
  data.scope.municipal_categories.forEach(type => expect(data.rows.some(row => row.scope_group === "funabashi" && row.id === type.id)).toBe(true));
  expect(data.scope.municipal_categories).toHaveLength(19);
  expect(data.rows.filter(row => row.presence_status === "unconfirmed").map(row => row.id)).toEqual(["M16", "M17", "M18", "M19"]);
  expect(data.rows.find(row => row.rule_id === "n02-prosthetic-costs").income_status).toBe("yes");
  expect(data.rows.find(row => row.rule_id === "m10-child-welfare-allowance").coordination).toContain("資格");
  expect(data.rows.find(row => row.rule_id === "m02-housing-renovation").child_application).toContain("障害児への適用は確認できない");
  expect(data.rows.find(row => row.rule_id === "n07-income-adjustment-deduction")).toBeDefined();
  expect(JSON.stringify(data)).not.toMatch(/"(?:city_code|category_id|records|raw_survey_batches|confirmed_city_count|evidence_summary)"\s*:/);
});
