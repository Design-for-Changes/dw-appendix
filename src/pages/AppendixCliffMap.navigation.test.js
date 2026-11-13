import { fireEvent, render, screen } from "@testing-library/react";
import AppendixCliffMap from "./AppendixCliffMap";

jest.mock("../hooks/useAppendixData", () => ({
  useAppendixData: () => ({ data: [], ready: false, selectedPoint: null }),
}));
jest.mock("./IncomeAssessmentAppendix", () => () => <section aria-label="所得判定詳細">表A1</section>);
jest.mock("./MunicipalSourcesAppendix", () => () => <section aria-label="参照資料">参照資料</section>);

afterEach(() => { window.history.replaceState(null, "", "/"); });

test("表A1の直接リンクはシミュレーションの読み込みに依存しない", () => {
  window.history.replaceState(null, "", "/#income-assessment");
  render(<AppendixCliffMap />);
  expect(screen.getByRole("button", { name: "所得判定・変動方法" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("region", { name: "所得判定詳細" })).toHaveTextContent("表A1");
  expect(screen.queryByRole("region", { name: "表示ケース" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "現行制度" }));
  expect(window.location.hash).toBe("");
  expect(screen.queryByRole("region", { name: "所得判定詳細" })).not.toBeInTheDocument();
});

test("参照資料から表A1へ移動すると共有可能なURLに変わる", () => {
  window.history.replaceState(null, "", "/#municipal-sources");
  render(<AppendixCliffMap />);
  expect(screen.getByRole("region", { name: "参照資料" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "所得判定・変動方法" }));
  expect(window.location.hash).toBe("#income-assessment");
  expect(screen.getByRole("region", { name: "所得判定詳細" })).toBeInTheDocument();
});
