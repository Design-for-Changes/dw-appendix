import { computeIllustrativeAdjustment, summarizeAdjustmentImpact } from "./illustrativeAdjustment";

const point = (x, takeHome, handout = 90, current = takeHome + handout - 12) => ({ x, disposable: current, breakdown: { allowance: { tccaWan: handout * 0.8, welfareAllowanceWan: handout * 0.2, totalWan: handout + 12 }, takeHome: { takeHomeWan: takeHome } } });

test("既存満額をBに使い、他の現金給付は二重加算しない", () => {
  const model = computeIllustrativeAdjustment([point(200, 200)], { needAnnualWan: 300, eligibleExpenseAnnualWan: 12 });
  expect(model.fullSupportAnnualWan).toBe(90);
  expect(model.points[0].beforeSupportAnnualWan).toBe(212);
  expect(model.points[0].supportAnnualWan).toBe(90);
  expect(model.points[0].disposableAnnualWan).toBe(302);
  expect(model.kind).toBe("illustrative-not-optimal");
});

test("負担能力は支給後資源を使い、対象実支出を超えて徴収しない", () => {
  const model = computeIllustrativeAdjustment([point(1000, 1000, 0)], { needAnnualWan: 300, eligibleExpenseAnnualWan: 12 });
  expect(model.points[0].supportAnnualWan).toBe(0);
  expect(model.points[0].burdenCapAnnualWan).toBe(30);
  expect(model.points[0].finalBurdenAnnualWan).toBe(12);
  expect(model.points[0].refundAnnualWan).toBe(0);
});

test("同じ給与で不利になる区間を、滑らかさとは別に検出する", () => {
  const impact = summarizeAdjustmentImpact([{ x: 200, differenceAnnualWan: 1 }, { x: 201, differenceAnnualWan: -2 }, { x: 202, differenceAnnualWan: -5 }, { x: 203, differenceAnnualWan: 0 }, { x: 204, differenceAnnualWan: -1 }]);
  expect(impact.minimumDifferenceAnnualWan).toBe(-5);
  expect(impact.lowerIncomeIntervals).toEqual([{ fromSalaryWan: 201, toSalaryWan: 202, minimumDifferenceAnnualWan: -5 }, { fromSalaryWan: 204, toSalaryWan: 204, minimumDifferenceAnnualWan: -1 }]);
});

test("需要額が不明なまま計算しない", () => {
  expect(() => computeIllustrativeAdjustment([point(200, 200)], { needAnnualWan: null, eligibleExpenseAnnualWan: 0 })).toThrow(TypeError);
});

test.each([null, undefined, Infinity, NaN, "12"])("対象支出の欠損・非数値 %s を0円とみなさない", (value) => {
  expect(() => computeIllustrativeAdjustment([point(200, 200)], { needAnnualWan: 300, eligibleExpenseAnnualWan: value })).toThrow(TypeError);
});

test.each(["x", "disposable", "takeHome", "cash"])("系列の必須入力 %s が欠ければ停止する", (field) => {
  const p = point(200, 200);
  if (field === "takeHome") p.breakdown.takeHome.takeHomeWan = null;
  else if (field === "cash") p.breakdown.allowance.tccaWan = null;
  else p[field] = null;
  expect(() => computeIllustrativeAdjustment([p], { needAnnualWan: 300, eligibleExpenseAnnualWan: 12 })).toThrow(TypeError);
});

test("無限大の需要額を受け付けない", () => {
  expect(() => computeIllustrativeAdjustment([point(200, 200)], { needAnnualWan: Infinity, eligibleExpenseAnnualWan: 12 })).toThrow(TypeError);
});
