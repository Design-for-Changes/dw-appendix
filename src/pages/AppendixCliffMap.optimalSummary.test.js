import { fireEvent, render, screen, within } from "@testing-library/react";
import {ArchivedCliffCalculation} from "./AppendixCliffMap";
import { computeOptimalModel } from "../calc/optimalModel";

let mockCase;
jest.mock("../hooks/useAppendixData", () => ({
  useAppendixData: () => ({ data: [mockCase], ready: true, selectedPoint: null }),
}));

const formatWan = (value) => `${value.toLocaleString("ja-JP", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})}万`;

function sourcePoint(x, takeHomeWan, adjustedCashWan) {
  const otherCashWan = 12;
  const reliefWan = 3.6473;
  const medicalWan = 15;
  const serviceWan = 12;
  const disposableWan = takeHomeWan + adjustedCashWan + otherCashWan + reliefWan - medicalWan - serviceWan;
  return {
    x,
    disposable: disposableWan,
    breakdown: {
      programs: {
        n04: {
          need: { disabilityAdditionYen: 26810 },
          judgment: { monthlyNeedYen: 250000 },
          educationCostReliefWan: reliefWan,
        },
      },
      allowance: {
        tccaWan: adjustedCashWan,
        welfareAllowanceWan: 0,
        totalWan: adjustedCashWan + otherCashWan,
      },
      takeHome: { takeHomeWan },
      disposable: {
        medicalCostBurdenWan: medicalWan,
        serviceFeeWan: serviceWan,
        educationCostBurdenWan: 0,
        disposableWan,
      },
    },
  };
}

beforeEach(() => {
  // Numerical fixtures exercise both signs of the comparison; they are not empirical households.
  const household = {
    head: { age: 45 },
    spouseEnabled: false,
    children: [{ age: 7, disabled: true, specialDisabled: true, tccaGrade: "1", childWelfareAllowance: true }],
  };
  const series = [sourcePoint(900, 700, 89), sourcePoint(901, 701, 0)];
  mockCase = {
    id: "case1",
    label: "ケース1",
    household,
    series,
    optimalModel: computeOptimalModel(series, household),
  };
  window.history.replaceState(null, "", "/#optimal");
});

afterEach(() => window.history.replaceState(null, "", "/"));

function cardValue(label) {
  const card = screen.getByText(label, { selector: "span" }).closest("article");
  return card.querySelector("strong").textContent;
}

test("Eの3比較カードは選択給与の年額を表示し、差額の符号を保持する", () => {
  render(<ArchivedCliffCalculation viewMode="optimal" />);
  const first = mockCase.optimalModel.series[0];
  expect(cardValue("現行制度の可処分所得")).toBe(formatWan(first.currentDisposableWan));
  expect(cardValue("調整モデル後の可処分所得")).toBe(formatWan(first.optimalDisposableWan));
  expect(cardValue("現行との差（調整後 − 現行）")).toBe(formatWan(first.optimalDisposableWan - first.currentDisposableWan));
  expect(first.optimalDisposableWan - first.currentDisposableWan).toBeLessThan(0);

  const chart = screen.getByRole("img", { name: "ケース1の給与収入に対する現行制度と調整例の可処分所得比較" });
  chart.getBoundingClientRect = () => ({ left: 0, width: 1040 });
  chart.setPointerCapture = jest.fn();
  const clientX = Math.ceil(72 + (901 - 200) / (1500 - 200) * (1040 - 72 - 28));
  fireEvent(chart, new MouseEvent("pointerdown", { bubbles: true, clientX, buttons: 1 }));
  const next = mockCase.optimalModel.series[1];
  expect(cardValue("現行制度の可処分所得")).toBe(formatWan(next.currentDisposableWan));
  expect(cardValue("調整モデル後の可処分所得")).toBe(formatWan(next.optimalDisposableWan));
  expect(cardValue("現行との差（調整後 − 現行）")).toBe(formatWan(next.optimalDisposableWan - next.currentDisposableWan));
  expect(next.optimalDisposableWan - next.currentDisposableWan).toBeGreaterThan(0);
});

test("Eの仮定6項目は実装上の代理値・未実装項・固定支出を区別する", () => {
  render(<ArchivedCliffCalculation viewMode="optimal" />);
  const summary = screen.getByText("数値試算で実際に置いている仮定");
  const details = summary.closest("details");
  fireEvent.click(summary);
  expect(within(details).getAllByRole("listitem")).toHaveLength(6);
  expect(details).toHaveTextContent("月額16,100円×障害児福祉手当対象児数×12");
  expect(details).toHaveTextContent("観測した介護費用ではなく");
  expect(details).toHaveTextContent("医療的ケアに対応する追加需要は、独立した項として数値化していない");
  expect(details).toHaveTextContent("費用負担の最大値と就学奨励費による負担軽減の最大値の合計");
  expect(details).toHaveTextContent("Eextraは0");
  expect(details).toHaveTextContent("Gが満額の給与帯でもUが正になる場合");
  expect(details).toHaveTextContent("全所得帯で可処分所得を増やすことや、給付水準の最適性を示すものではない");
});
