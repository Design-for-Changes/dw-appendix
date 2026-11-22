import { calculateHouseholdInsurance2029 } from "./householdInsurance2029";

// 独立検算：期待値には計算用の関数・等級表・設定ファイルを一切流用しない。
// 健保・介護・支援金：令和8年度千葉支部の本人折半額を合算し、給与天引き時の端数処理後に12倍。
// https://www.kyoukaikenpo.or.jp/assets/R8_12chiba.pdf（45歳・一般被保険者）
// 健康保険法156条1項1号・161条：一般保険料等額と介護保険料額の合算額を労使折半。
// https://www.mhlw.go.jp/web/t_doc?dataId=84024000&dataType=0&pageNo=3
// 厚年：同表と、厚労省の改正図表 p.5 に掲載の改正後「該当者の保険料」を使用。
// https://www.mhlw.go.jp/content/12500000/001496971.pdf
// 雇用：令和8年度一般事業の労働者負担額、給与から源泉控除する場合。
// https://www.mhlw.go.jp/new-info/kobetu/roudou/gyousei/hoken/kakikata/dl/keizoku-20.pdf
// 以下の期待年額は同じ報酬月額の12か月分。

const golden = [
  // 額面年収、健保標準、厚年標準、健保等年額、厚年年額、雇用年額、本人計（円）。
  // 標準月額15万円の健保等：8,512.5＋172.5＝8,685円。別々に丸めると誤差が出る。
  [1_800_000, 150_000, 150_000, 104_220, 164_700, 9_000, 277_920],
  [3_600_000, 300_000, 300_000, 208_440, 329_400, 18_000, 555_840],
  // 厚年の新設3等級：等分月給を円に丸めない。報酬月額の境界を12倍した額の1円手前も照合。
  [7_979_999, 650_000, 650_000, 451_620, 713_700, 39_900, 1_205_220],
  [7_980_000, 680_000, 680_000, 472_464, 746_640, 39_900, 1_259_004],
  [8_339_999, 680_000, 680_000, 472_464, 746_640, 41_700, 1_260_804],
  [8_340_000, 710_000, 710_000, 493_308, 779_580, 41_700, 1_314_588],
  [8_759_999, 710_000, 710_000, 493_308, 779_580, 43_800, 1_316_688],
  [8_760_000, 750_000, 750_000, 521_100, 823_500, 43_800, 1_388_400],
  // グラフ上限：健保は127万円、厚年は75万円のまま。
  [15_000_000, 1_270_000, 750_000, 882_396, 823_500, 75_000, 1_780_896],
];

test.each(golden)("片働き・年収%i円：本人内訳と世帯合計を原表と照合", (
  headAnnualYen, healthStandardYen, pensionStandardYen,
  healthCareSupportYen, pensionYen, employmentYen, totalYen,
) => {
  const result = calculateHouseholdInsurance2029({headAnnualYen, spouseAnnualYen:0});
  expect(result.head).toMatchObject({status:"employee", healthStandardYen, pensionStandardYen,
    annual:{healthCareSupportYen, pensionYen, employmentYen, totalYen}});
  expect(result.spouse).toMatchObject({status:"dependent", annual:{totalYen:0}});
  expect(result.totalYen).toBe(totalYen);
});

test.each([
  [3_600_000, 1_800_000, 555_840, 277_920],
  [1_800_000, 3_600_000, 277_920, 555_840],
])("共働き・年収%i円＋%i円：世帯給与を合算して一人分の等級にしない",
  (headAnnualYen, spouseAnnualYen, headTotal, spouseTotal) => {
    const result = calculateHouseholdInsurance2029({headAnnualYen, spouseAnnualYen});
    expect(result.head).toMatchObject({status:"employee", annual:{totalYen:headTotal}});
    expect(result.spouse).toMatchObject({status:"employee", annual:{totalYen:spouseTotal}});
    expect(result.totalYen).toBe(833_760);
  });

test.each([
  // 月給255,940円：厚労省掲載例1,279.7円→1,280円。
  [3_071_280, 15_360],
  // 月給256,100円でちょうど1,280.5円（切り捨て）、年収1円増で50銭超。
  [3_073_200, 15_360],
  [3_073_201, 15_372],
])("雇用保険・年収%i円：50銭以下切捨て／50銭超切上げを月ごとに適用", (annualPay, expected) => {
  const result = calculateHouseholdInsurance2029({headAnnualYen:0, spouseAnnualYen:annualPay});
  expect(result.head).toMatchObject({status:"dependent", annual:{totalYen:0}});
  expect(result.spouse.annual.employmentYen).toBe(expected);
});
