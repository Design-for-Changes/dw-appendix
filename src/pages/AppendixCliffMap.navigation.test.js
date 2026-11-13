import { fireEvent, render, screen } from "@testing-library/react";
import AppendixCliffMap from "./AppendixCliffMap";

jest.mock("../hooks/useAppendixData", () => ({
  useAppendixData: () => ({ data: [], ready: false, selectedPoint: null }),
}));
jest.mock("./IncomeAssessmentAppendix", () => () => <section aria-label="所得判定詳細">表A1</section>);
jest.mock("./MunicipalSourcesAppendix", () => () => <section aria-label="参照資料">参照資料</section>);
jest.mock("./ResearchDataAppendix", () => () => <section aria-label="法令検索">表A2</section>);

afterEach(() => { window.history.replaceState(null, "", "/"); });

test("法令検索の直接リンクとタブ切替は計算データに依存しない", () => {
  window.history.replaceState(null, "", "/#law-screening");
  render(<AppendixCliffMap />);
  expect(screen.getByRole("button", { name: "法令検索・採否候補" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("region", { name: "法令検索" })).toHaveTextContent("表A2");
  fireEvent.click(screen.getByRole("button", { name: "調査対象・参照資料" }));
  expect(window.location.hash).toBe("#municipal-sources");
  expect(screen.queryByRole("region", { name: "法令検索" })).not.toBeInTheDocument();
});

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
