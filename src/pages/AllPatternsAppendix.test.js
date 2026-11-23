import { fireEvent, render, screen, within } from "@testing-library/react";
import AllPatternsAppendix from "./AllPatternsAppendix";
import { compareAllPatterns } from "../calc/allPatternsComparison";
import { CHILD_ELIGIBILITY_OPTIONS } from "../data/childEligibilityOptions";

jest.mock("../calc/allPatternsComparison", () => ({compareAllPatterns: jest.fn()}));

const fee = () => screen.getAllByRole("slider");
const age = () => screen.getAllByRole("combobox", {name: "年齢"});
const page = () => screen.getByRole("combobox", {name: "表示する行"});
const tbody = () => within(screen.getByRole("table").tBodies[0]);

beforeEach(() => {
  window.sessionStorage.clear();
  compareAllPatterns.mockReset();
  compareAllPatterns.mockImplementation(({ages, fees}) => {
    const ids = CHILD_ELIGIBILITY_OPTIONS.map(p => p.id);
    return Array.from({length: ids.length ** ages.length}, (_, i) => ({
      profileIds: ages.map((_, j) => ids[Math.floor(i / ids.length ** (ages.length - 1 - j)) % ids.length]),
      minimum: {differenceYen: -fees[0] * 12, headWan: 700, spouseWan: 123},
      maximum: {differenceYen: 1200000, headWan: 800, spouseWan: 234},
    }));
  });
});

test("差額は年額・符号付きで、最小点と最大点それぞれに夫婦の給与を表示", () => {
  render(<AllPatternsAppendix/>);
  expect(screen.getByText("全15通り")).toBeVisible();
  expect(screen.getByText("特別児童扶養手当（特児）、障害児福祉手当（児福）、障害児通所支援の利用者負担（通所負担）")).toBeVisible();
  for (const parent of ["世帯主","配偶者"]) {
    expect(screen.getAllByRole("columnheader",{name:new RegExp(parent+"の年間給与\\s*（万円）")})).toHaveLength(2);
  }
  const slider = fee()[0];
  expect(slider).toHaveAttribute("min","0");
  expect(slider).toHaveAttribute("max","37200");
  expect(slider).toHaveAttribute("step","1");
  fireEvent.change(slider, {target: {value: "10001"}});
  expect(compareAllPatterns).toHaveBeenLastCalledWith({ages: [8], fees: [10001]});
  expect(within(tbody().getAllByRole("row")[0]).getAllByRole("cell").map(c=>c.textContent))
    .toEqual(["非該当／非該当／非該当","−120,012","700","123","＋1,200,000","800","234"]);
  expect(screen.queryByRole("navigation", {name:"パターン表のページ切替"})).not.toBeInTheDocument();
});

test("3人の順序を区別した3,375行すべてに移動でき、ページ変更は再計算しない", () => {
  render(<AllPatternsAppendix/>);
  const count = screen.getByRole("combobox", {name: "子どもの人数"});
  fireEvent.change(count, {target: {value: "2"}});
  expect(screen.getByText("全225通り")).toBeVisible();
  fireEvent.change(count, {target: {value: "3"}});
  expect(screen.getByText("全3,375通り")).toBeVisible();
  const before = compareAllPatterns.mock.calls.length;
  const select = page();
  fireEvent.change(select, {target: {value: select.options[select.options.length - 1].value}});
  expect(tbody().getAllByRole("rowheader").at(-1)).toHaveTextContent("3,375");
  expect(within(tbody().getAllByRole("row").at(-1)).getAllByText("1級／該当／特別障害者")).toHaveLength(3);
  expect(screen.getByRole("button", {name: "次へ"})).toBeDisabled();
  expect(compareAllPatterns.mock.calls.length).toBe(before);
});

test("児童別年齢・通所負担を渡し、ページを離れて戻っても同じ条件を維持", () => {
  const {unmount} = render(<AllPatternsAppendix/>);
  fireEvent.change(screen.getByRole("combobox", {name: "子どもの人数"}), {target: {value: "2"}});
  fireEvent.change(age()[1], {target: {value: "4"}});
  fireEvent.change(fee()[1], {target: {value: "3000"}});
  expect(compareAllPatterns).toHaveBeenLastCalledWith({ages: [8,4], fees: [0,3000]});
  expect(screen.getByText(/3,000円.*無償/)).toBeVisible();
  fireEvent.click(screen.getByRole("button", {name: "次へ"}));
  unmount();
  render(<AllPatternsAppendix/>);
  expect(age()[1]).toHaveValue("4");
  expect(fee()[1]).toHaveValue("3000");
  expect(tbody().getAllByRole("rowheader")[0]).toHaveTextContent("46");
});
