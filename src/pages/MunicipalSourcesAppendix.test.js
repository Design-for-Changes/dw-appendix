import { fireEvent, render, screen } from "@testing-library/react";
import MunicipalSourcesAppendix from "./MunicipalSourcesAppendix";

const sample = {
  checked_on: "2026-11-13",
  observation_note: "再調査の記録です。",
  scope: { rule: "政令指定都市と人口50万人以上の中核市", population_description: "人口基準を固定する。", references: [] },
  municipalities: [
    { code: "A", name: "対象市A", prefecture: "テスト県", classification: "政令指定都市", sources: [{ title: "福祉案内A", url: "https://example.org/a", edition: "令和8年度" }] },
    { code: "B", name: "対象市B", prefecture: "確認県", classification: "中核市", sources: [] },
  ],
};

afterEach(() => { jest.restoreAllMocks(); });

test("資料を独立して読み込み、市名で絞り込む", async () => {
  jest.spyOn(global, "fetch").mockResolvedValue({ ok: true, json: async () => sample });
  render(<MunicipalSourcesAppendix />);
  expect(await screen.findByText("福祉案内A")).toHaveAttribute("href", "https://example.org/a");
  expect(screen.getByText(/最終確認日：2026-11-13/)).toBeInTheDocument();
  expect(screen.getByText("自治体制度の調査")).toBeInTheDocument();
  expect(screen.getByText("資料確認中")).toBeInTheDocument();
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "対象市A" } });
  expect(screen.getByText("1市表示")).toBeInTheDocument();
  expect(screen.queryByText("対象市B")).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "存在しない市" } });
  expect(screen.getByText("該当する市はありません。")).toBeInTheDocument();
});

test("取得失敗を未実施の判定に置き換えない", async () => {
  jest.spyOn(global, "fetch").mockResolvedValue({ ok: false, status: 404 });
  render(<MunicipalSourcesAppendix />);
  expect(await screen.findByRole("alert")).toHaveTextContent("読み込めませんでした");
});
