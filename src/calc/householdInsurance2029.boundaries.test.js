import { calculateHouseholdInsurance2029 } from "./householdInsurance2029";

// Independent transcription of the reachable rows of the Chiba table (lower
// bound, standard amount; thousands of yen). Grades 49 and 50 are outside
// this simulator's domain: 15 million yen / 12 = 1.25 million yen/month.
// https://www.kyoukaikenpo.or.jp/assets/R8_12chiba.pdf
const HEALTH_ROWS = [
  [0,58], [63,68], [73,78], [83,88], [93,98], [101,104], [107,110], [114,118],
  [122,126], [130,134], [138,142], [146,150], [155,160], [165,170], [175,180], [185,190],
  [195,200], [210,220], [230,240], [250,260], [270,280], [290,300], [310,320], [330,340],
  [350,360], [370,380], [395,410], [425,440], [455,470], [485,500], [515,530], [545,560],
  [575,590], [605,620], [635,650], [665,680], [695,710], [730,750], [770,790], [810,830],
  [855,880], [905,930], [955,980], [1005,1030], [1055,1090], [1115,1150], [1175,1210], [1235,1270],
];
const calculate = (headAnnualYen, spouseAnnualYen) =>
  calculateHouseholdInsurance2029({ headAnnualYen, spouseAnnualYen });

describe("健保等級表：試算範囲にある47本すべての境界", () => {
  test.each(HEALTH_ROWS.slice(1).map(([lower, standard], i) => [lower, standard, i + 2]))(
    "月給下限 %i 千円（標準 %i 千円、第 %i 級）の年額換算±1円",
    (lower, standard, grade) => {
      const boundary = lower * 12000;
      const lowerRow = { healthGrade: grade - 1, healthStandardYen: 1000 * HEALTH_ROWS[grade - 2][1] };
      const upperRow = { healthGrade: grade, healthStandardYen: 1000 * standard };
      // The annual amount just below is monthly lower-bound minus 1/12 yen:
      // rounding monthly pay before checking the boundary would fail here.
      expect(calculate(boundary - 1, 0).head).toMatchObject(lowerRow);
      expect(calculate(boundary, 0).head).toMatchObject(upperRow);
      expect(calculate(boundary + 1, 0).head).toMatchObject(upperRow);
    }
  );
});

// R8 table note: pension grade 1 covers ALL monthly income below 93,000.
// R11-09+: pension grade 35 covers ALL monthly income from 730,000 onward.
// New grades and exact premiums: https://www.mhlw.go.jp/content/12500000/001496971.pdf
const PENSION_ROWS = [
  [0,88], ...HEALTH_ROWS.slice(4, 35), [665,680], [695,710], [730,750],
];
describe("厚生年金等級表：第1級から2029年9月施行の第35級まで", () => {
  test.each(PENSION_ROWS.slice(1).map(([lower, standard], i) => [lower, standard, i + 2]))(
    "月給下限 %i 千円（標準 %i 千円、第 %i 級）の年額換算±1円",
    (lower, standard, grade) => {
      const boundary = lower * 12000;
      const check = (annual, n, amount) => {
        expect(calculate(0, annual).spouse).toMatchObject({
          pensionGrade: n, pensionStandardYen: amount * 1000,
        });
      };
      check(boundary - 1, grade - 1, PENSION_ROWS[grade - 2][1]);
      check(boundary, grade, standard);
      check(boundary + 1, grade, standard);
    }
  );
  test("上限を超えると厚年は一定だが、健康保険まで頭打ちにしない", () => {
    expect(calculate(0, 15000000).spouse).toMatchObject({
      status: "employee", healthGrade: 48, healthStandardYen: 1270000,
      pensionGrade: 35, pensionStandardYen: 750000,
    });
  });
});

test("（0,0）だけは非算定。給与0円の軸と給与が正の内点は数値を返す", () => {
  expect(calculate(0, 0).totalYen).toBeNull();
  for (const annual of [1, 2400000, 15000000]) {
    for (const [a, b] of [[annual, 0], [0, annual], [annual, annual]]) {
      const r = calculate(a, b);
      expect(Number.isSafeInteger(r.totalYen)).toBe(true);
      expect(r.totalYen).toBe(r.head.annual.totalYen + r.spouse.annual.totalYen);
      for (const [person, salary] of [[r.head, a], [r.spouse, b]]) {
        expect(person.status).toBe(salary ? "employee" : "dependent");
        if (!salary) expect(person.annual.totalYen).toBe(0);
      }
    }
  }
});

test("非賃金要件は固定：旧所定内賃金・健康保険の扶養認定額を就業者の加入閾値にしない", () => {
  for (const boundary of [88000 * 12, 1300000]) {
    for (const delta of [-1, 0, 1]) {
      const result = calculate(4000000, boundary + delta);
      expect(result.spouse.status).toBe("employee");
      expect(result.spouse.annual.pensionYen).toBeGreaterThan(0);
    }
  }
});

test.each([[1, 0], [0, 3600000], [1299999, 1300000], [3400003, 8600000], [15000000, 15000000]])(
  "夫婦を入れ替えると本人負担も入れ替わり、世帯計は一致（%i・%i 円）", (a, b) => {
    const ab = calculate(a, b), ba = calculate(b, a);
    expect(ab.totalYen).toBe(ba.totalYen);
    for (const [person, swapped] of [[ab.head, ba.spouse], [ab.spouse, ba.head]]) {
      expect(person.status).toBe(swapped.status);
      expect(person.annual).toEqual(swapped.annual);
      const { healthCareSupportYen, pensionYen, employmentYen, totalYen } = person.annual;
      expect(totalYen).toBe(healthCareSupportYen + pensionYen + employmentYen);
    }
  }
);

test.each([-1, 0.5, "0", null, undefined, NaN, Infinity, 15000001])(
  "入力エラーを給与0円・論文の非算定点と混同しない（%p）", invalid => {
    expect(() => calculate(invalid, 0)).toThrow();
    expect(() => calculate(0, invalid)).toThrow();
  }
);
