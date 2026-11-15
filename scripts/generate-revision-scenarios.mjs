import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { validateN04EducationProfile } from "../src/calc/educationAid.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = path.join(ROOT, "public/data/research/revision-scenarios.json");

export const REVISION_NEED_INPUTS = {
  annualYearEndAssistanceYenByHouseholdSize: { 3: null, 4: null, 5: null },
  monthlyTransitionalAdditionYenByHouseholdSize: { 3: null, 4: null, 5: null },
  monthlySpecialAdditionPerPersonYen: null,
  monthlyDisabilityAdditionByStatusYen: { A: null, B: null, C: null },
  monthlySingleParentAdditionYen: 0,
  annualSchoolMaterialsPerChildYen: null,
  annualSchoolLunchBudgetPerChildYen: null,
  previousAnnualCommutePerChildYen: 0,
  monthlyHousingYen: null,
  inputEvidence: {
    monthlySingleParentAdditionYen: "本比較は両親が同居する仮想世帯であり、母子加算の対象条件を置かない。",
    previousAnnualCommutePerChildYen: "全児童は前年度も徒歩通学し、通学交通費は発生しないと仮定。観測された平均0円ではない。",
  },
};

/**
 * 子どもを同年齢・同条件で交換可能とした31の人数構成を列挙する。
 * @returns {object[]} n=1～3、1≦d≦n、A/B/Cの非負人数構成。人口ウェイトは付けない。
 */
export function enumerateFamilyProfiles() {
  const profiles = [];
  for (let n = 1; n <= 3; n += 1) {
    for (let a = 0; a <= n; a += 1) {
      for (let b = 0; b <= n - a; b += 1) {
        for (let c = 0; c <= n - a - b; c += 1) {
          const d = a + b + c;
          if (d === 0) continue;
          profiles.push({
            id: `N${n}-A${a}B${b}C${c}`,
            total_children: n,
            disabled_children: d,
            qualification_counts: { A: a, B: b, C: c },
            independent_tax_disability_counts: { ordinary: a, cohabiting_special: b + c, none: n - d },
            nondisabled_children: n - d,
            label: `子ども${n}人・A${a}/B${b}/C${c}・非障害児${n - d}人`,
          });
        }
      }
    }
  }
  return profiles;
}

/**
 * 入力が有限の非負数の場合だけ人数倍し、未確定値を0円にしない。
 * @param {number|null} value 年額又は月額の円額。
 * @param {number} count 人数。
 * @returns {number|null} 合計円額、又は未確定を示すnull。
 */
export function multiplyKnown(value, count) {
  return Number.isFinite(value) && value >= 0 ? value * count : null;
}

/**
 * 給付資格と独立に明示した税法上の区分仮定を含む児童入力を作る。
 * @param {object} family A/B/Cの人数構成。
 * @returns {object[]} 全員7歳の児童入力。利用額と需要額は別に設定する。
 */
export function makeRevisionChildren(family) {
  const children = [];
  for (const state of ["A", "B", "C", "none"]) {
    const count = state === "none" ? family.nondisabled_children : family.qualification_counts[state];
    for (let i = 0; i < count; i += 1) {
      children.push({
        id: `${state}-${i + 1}`,
        age: 7,
        cohabit: true,
        disabled: state !== "none",
        specialDisabled: state === "B" || state === "C",
        tccaGrade: state === "none" ? "not" : state === "A" ? "2" : "1",
        childWelfareAllowance: state === "C",
        salaryWan: 0,
        otherIncomeWan: 0,
      });
    }
  }
  return children;
}

/**
 * 新研究の学校条件と、未確定を保持したN04需要測定入力を作る。
 * @param {object} family A/B/C人数構成。
 * @param {object} needInputs 原典値又は明示した仮定値。未確定はnull。
 * @returns {object} programs.n04EducationProfileへ渡す入力。
 */
export function makeRevisionEducationProfile(family, needInputs) {
  const householdSize = family.total_children + 2;
  const disabilityParts = ["A", "B", "C"].filter((state) => family.qualification_counts[state] > 0)
    .map((state) => multiplyKnown(needInputs.monthlyDisabilityAdditionByStatusYen?.[state], family.qualification_counts[state]));
  const disabilityAdditionYen = disabilityParts.every(Number.isFinite) ? disabilityParts.reduce((sum, value) => sum + value, 0) : null;
  return {
    schemaVersion: 1,
    fiscalYear: 2026,
    schoolType: "special-needs-school",
    department: "elementary",
    enrollment: "day",
    schoolYear: "通常年（新入学用品・修学旅行を計上しない）",
    expenses: [{ id: "school-supplies", annualExpenseYen: 11640, valueType: "補助上限に達する対象実費を仮定した条件値。実測平均ではない" }],
    needMeasurement: {
      basisDate: "2025-12-31",
      gradeArea: "1-2",
      winterRegion: "VI",
      educationChildrenCount: family.total_children,
      annualYearEndAssistanceYen: needInputs.annualYearEndAssistanceYenByHouseholdSize?.[householdSize] ?? null,
      monthlyTransitionalAdditionYen: needInputs.monthlyTransitionalAdditionYenByHouseholdSize?.[householdSize] ?? null,
      monthlySpecialAdditionYen: multiplyKnown(needInputs.monthlySpecialAdditionPerPersonYen, householdSize),
      monthlyDisabilityAdditionYen: disabilityAdditionYen,
      monthlySingleParentAdditionYen: needInputs.monthlySingleParentAdditionYen,
      annualSchoolMaterialsYen: multiplyKnown(needInputs.annualSchoolMaterialsPerChildYen, family.total_children),
      annualSchoolLunchBudgetYen: multiplyKnown(needInputs.annualSchoolLunchBudgetPerChildYen, family.total_children),
      previousAnnualCommuteYen: multiplyKnown(needInputs.previousAnnualCommutePerChildYen, family.total_children),
      monthlyHousingYen: needInputs.monthlyHousingYen,
      inputEvidence: needInputs.inputEvidence || {},
    },
  };
}

/**
 * 31構成×配偶者給与3条件×児童別利用額3条件を、結果未計算の279条件として生成する。
 * @param {object} options.needInputs 明示されたN04需要額入力。省略時は未確定を維持。
 * @returns {object} 旧3ケースと独立した条件データ。人口・財政影響・最適値を推定しない。
 */
export function generateRevisionScenarios({ needInputs = REVISION_NEED_INPUTS } = {}) {
  const familyProfiles = enumerateFamilyProfiles();
  const spouseSalaries = [0, 200, 400];
  const serviceAmounts = [4600, 10406, 37200];
  const conditions = [];
  for (const family of familyProfiles) {
    for (const spouseSalary of spouseSalaries) {
      for (const serviceAmount of serviceAmounts) {
        const children = makeRevisionChildren(family);
        const n04EducationProfile = makeRevisionEducationProfile(family, needInputs);
        const blockingIssues = validateN04EducationProfile(n04EducationProfile);
        conditions.push({
          id: `${family.id}-S${spouseSalary}-R${serviceAmount}`,
          family_profile_id: family.id,
          spouse_salary_wan: spouseSalary,
          service_use_yen_per_child_month: serviceAmount,
          calculation_status: blockingIssues.length ? "blocked" : "conditions-ready-results-pending",
          blocking_issues: blockingIssues,
          household: {
            head: { age: 45, salaryWan: 0 },
            spouseEnabled: true,
            spouse: { age: 45, salaryWan: spouseSalary },
            children,
            programs: {
              m01: false,
              n04: true,
              n04Count: family.disabled_children,
              n04EducationProfile,
              serviceUse: {
                schemaVersion: 1,
                monthlyBurdenBeforeCapByChildYen: children.map((child) => child.disabled ? serviceAmount : 0),
                months: 12,
              },
            },
          },
          result: null,
        });
      }
    }
  }
  assert.equal(familyProfiles.length, 31);
  assert.equal(conditions.length, 279);
  assert.equal(new Set(conditions.map((condition) => condition.id)).size, 279);
  assert.deepEqual([1, 2, 3].map((n) => familyProfiles.filter((family) => family.total_children === n).length), [3, 9, 19]);
  return {
    schema_version: "1.0.0",
    title: "改稿用・モデル世帯の条件設計（従来3ケースとは独立）",
    checked_on: "2026-11-15",
    scenario: "S4_R8_FINAL",
    status: conditions.some((condition) => condition.calculation_status === "blocked") ? "awaiting-n04-need-inputs" : "conditions-ready-results-pending",
    scope: {
      purpose: "制度重複によって何が起こりうるかを、条件を固定して比較する。",
      empirical_typicality: false,
      population_distribution_estimated: false,
      fiscal_impact_estimated: false,
      optimal_policy_claimed: false,
      medical_aid_included: false,
      legacy_three_cases_replaced: false,
      all_results_calculated: false,
    },
    factors: {
      total_children: [1, 2, 3],
      disabled_children: "1以上、子ども総数以下",
      qualification_states: {
        A: "特児2級・障害児福祉手当なし",
        B: "特児1級・障害児福祉手当なし",
        C: "特児1級と障害児福祉手当の双方の支給要件を満たすと仮定",
      },
      qualification_note: "医学的な重症度の3段階でも、全障害児を網羅する分類でもない。所得制限適用前の資格条件を置く。",
      child_exchangeability: "全児童7歳、障害児は同じ特別支援学校小学部・通学生・費目条件。非障害児は小学校に在籍。交換しても計算条件が変わらない人数構成として数える。",
      tax_disability_assumption: "本比較ではAを税法上の一般障害者、B/Cを同居特別障害者と別途仮定する。特児等級から当然に確定する関係を主張しない。",
      independent_assumptions: {
        tax_disability_class_by_state: { A: "ordinary", B: "cohabiting-special", C: "cohabiting-special" },
        n04_disability_monthly_yen_by_state: needInputs.monthlyDisabilityAdditionByStatusYen,
        n04_disability_note: "N04加算は手帳又は国民年金法上の障害程度相当等の認定要件を別途満たすモデル条件。手当の資格A/B/Cから法的に自動対応するとはしない。専用保護基準額等早見表の採用範囲が未確定ならnullを維持し、常時介護加算を勝手に追加しない。",
      },
      spouse_salary_wan: spouseSalaries,
      service_use_yen_per_child_month: serviceAmounts,
      service_amount_interpretation: "上限適用前の定率負担相当額R_i。サービス総費用ではない。構造比較の仮定的3条件で、平均・中央値・分位点ではない。10,406円は旧参照値との接続をみる入力で、観測R_iとはいわない。",
      service_aggregation: "同月の利用児全員のR_iを合計してから世帯上限を適用。毎月同額、年12か月。",
      salary_sweep: { variable: "世帯主給与収入", unit: "万円/年", min: 200, max: 1500, step: 1 },
      salary_comparison_note: "横軸は世帯主給与。配偶者給与が違えば世帯給与合計も違う。同一世帯給与合計の配分効果だけを比べるものではない。",
    },
    counts: { family_profiles: 31, spouse_conditions: 3, service_conditions: 3, household_conditions: 279, salary_points_per_condition: 1301, planned_salary_points: 362979 },
    n04_need_inputs: needInputs,
    family_profiles: familyProfiles,
    conditions,
    notes: [
      "条件定義のみ。result=nullは所得逆転がないことを意味せず、計算結果は未収録。",
      "N04需要測定の必須項目が未確定の条件はblockedとし、公表計算結果を生成しない。未確定額を0円とみなさない。",
      "障害児の給付資格・就学・税法区分・通所利用は別の条件であり、自動対応させない。",
      "医療費助成を除外しており、障害児世帯の全支援・全支出を網羅した家計実態ではない。",
    ],
    sources: [
      { title: "特別支援学校への就学奨励に関する法律施行令・第1/2条", url: "https://laws.e-gov.go.jp/law/329CO0000000157" },
      { title: "令和8年度特別支援教育就学奨励費支給限度額一覧（小学部学用品費）", url: "https://www.sankakuyama.hokkaido-c.ed.jp/wysiwyg/file/download/1/383" },
      { title: "収入額の算定及び需要額の測定要領・III～V", url: "https://www.dokyoi.pref.hokkaido.lg.jp/fs/9/7/1/2/4/0/4/_/R7%20%E5%8F%8E%E5%85%A5%E9%A1%8D%E3%83%BB%E9%9C%80%E8%A6%81%E9%A1%8D%E3%81%AE%E6%B8%AC%E5%AE%9A%E8%A6%81%E9%A0%98.pdf" },
      { title: "千葉県・生活保護基準（1級地2、人数別基準）", url: "https://www.pref.chiba.lg.jp/kenshidou/shien/book/seikatsuhogo.html" },
    ],
  };
}

/**
 * 条件データを生成して保存する。--need-inputsで、根拠を記した確定入力JSONを指定できる。
 * @returns {void} public/data/research/revision-scenarios.jsonを更新する。既存系列は変更しない。
 */
function main() {
  const optionIndex = process.argv.indexOf("--need-inputs");
  const needInputs = optionIndex >= 0 ? JSON.parse(fs.readFileSync(path.resolve(process.argv[optionIndex + 1]), "utf8")) : REVISION_NEED_INPUTS;
  const output = generateRevisionScenarios({ needInputs });
  fs.writeFileSync(OUTPUT, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`revision scenarios: ${output.counts.family_profiles} families / ${output.counts.household_conditions} conditions / ${output.status}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
