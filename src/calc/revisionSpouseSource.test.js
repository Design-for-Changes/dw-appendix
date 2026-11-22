import { createRevisionCalculator } from "./revisionEngine.js";

// 令和8年分の年末確定所得税のみ。所得は所得金額調整控除後、控除額は税額ではなく所得控除額。
// 給与所得の原表：https://www.nta.go.jp/publication/pamph/gensen/nencho2026/pdf/114.pdf
// 控除区分・額面給与欄・本人給与への15万円加算注記：https://www.nta.go.jp/taxes/shiraberu/taxanswer/gensen/2672.htm
// [申告者給与(万円), 相手給与(万円), 申告者所得(円), 相手所得(円), 区分, 申告者の控除額(円)]。
// 期待値は実装関数から生成しない。非障害の子11歳がいるため高給与側は所得金額調整控除の対象。
const examples = [
  [600, 136, 4_360_000, 620_000, "ordinary", 380_000],
  [600, 137, 4_360_000, 630_000, "special", 380_000],
  [600, 169, 4_360_000, 950_000, "special", 380_000],
  [600, 170, 4_360_000, 960_000, "special", 360_000],
  [600, 207, 4_360_000, 1_330_000, "special", 30_000],
  [600, 208, 4_360_000, 1_340_000, "none", 0],
  [1110, 169, 9_000_000, 950_000, "special", 380_000],
  [1111, 169, 9_010_000, 950_000, "special", 260_000],
  [1160, 169, 9_500_000, 950_000, "special", 260_000],
  [1161, 169, 9_510_000, 950_000, "special", 130_000],
  [1210, 169, 10_000_000, 950_000, "special", 130_000],
  [1211, 169, 10_010_000, 950_000, "none", 0],
];

describe.each(["head", "spouse"])("令和8年分・配偶者控除の申告者=%s", (claimant) => {
  // 保険加入は統合計算器を動かすための明示入力。このテストで保険料・住民税・可処分所得は検証しない。
  const employee = { mode: "employee", workRegion: "chiba", employmentInsurance: true };
  const calculator = createRevisionCalculator({
    protocol: "v3",
    insurance: { head: employee, spouse: employee },
    education: { mode: "excluded" },
    roles: { spouseDeductionClaimant: claimant },
    children: [{
      age: 11, taxDependentOf: claimant, tccaGrade: "not", taxStatus: "none",
      welfareEligible: false, serviceUser: false,
    }],
    serviceAmountYen: 0,
  });

  test.each(examples)("給与 %i万円・%i万円", (ownPay, otherPay, ownIncome, otherIncome, kind, amount) => {
    const headFiles = claimant === "head";
    const point = headFiles ? calculator.evaluate(ownPay, otherPay) : calculator.evaluate(otherPay, ownPay);
    expect(point.status).toBe("calculated");
    const { headTax, spouseTax } = point.details;
    const [own, other] = headFiles ? [headTax, spouseTax] : [spouseTax, headTax];
    expect(own).toMatchObject({
      currentIncomeYen: ownIncome, spouseDeduction: { current: { kind, it: amount } },
    });
    expect(other).toMatchObject({
      currentIncomeYen: otherIncome, spouseDeduction: { current: { kind: "none", it: 0 } },
    });
  });
});
