// 任意検証（書き込みなし）: node --experimental-default-type=module scripts/verify-revision-grid.mjs
import assert from "node:assert/strict";
import { createRevisionCalculator } from "../src/calc/revisionEngine.js";
import { paperComparisonInputs } from "../src/calc/paperComparison.js";
import { paperCases } from "../src/pages/revisionPaperCases.js";

const maxSalaryWan = 1500;
const serviceAmountYen = 37200;
const pointCount = (maxSalaryWan + 1) ** 2;
const expectedCases = ["P1", "P2", "P3"];
const protocol = process.argv.includes("--legacy-v2") ? "legacy-v2" : "paper-2029";

// N04の支出・給付をともに除外した本試算が対象。この恒等式・境界検証だけで法令適合を実証するものではない。
function checkPoint(point, id, head, spouse) {
  const b = point.breakdown;
  const sum = b.salaryWan - b.taxWan - b.socialWan + b.tccaWan + b.welfareWan + b.childAllowanceWan - b.serviceWan;
  if ("educationStatus" in point || "school" in point.details || "educationExpenseWan" in b || "educationAidWan" in b || Object.keys(b).some(k=>/medical/i.test(k)) ||
      !Number.isFinite(point.disposableWan) || point.studyDisposableWan !== point.disposableWan || !Number.isFinite(sum) ||
      Math.abs(point.disposableWan - sum) > 1e-7 || !(b.serviceWan >= 0 && b.serviceWan <= 44.64)) {
    throw new Error(`${id}：世帯主${head}万円・配偶者${spouse}万円で欠測、内訳または世帯上限に不整合。`);
  }
}

assert.deepEqual(paperCases.map(c => c.id), expectedCases, "対象は論文用3ケース");
console.log("両親45歳、給与のみ。各軸0～1,500万円を1万円刻み。");
console.log("通所利用児1人あたり上限前月37,200円、その他の合算対象負担0円、N04は費用と給付を対で除外。");
console.log(protocol+"：有限性・内訳合計・世帯上限・対象外費目の不在を検証。夫婦の役割を固定する新稿では給与交換対称性を仮定しない。");
let checked = 0;
for (const { id, title, children } of paperCases) {
  const model = createRevisionCalculator(paperComparisonInputs({children},serviceAmountYen,protocol));
  let caseCount = 0;
  // 三角領域で各ペアの両向きをその場で計算・照合し、巨大な行列を保持しない。対角点は1回のみ。
  for (let head = 0; head <= maxSalaryWan; head++) {
    for (let spouse = 0; spouse <= head; spouse++) {
      const p = model.evaluate(head, spouse);
      if (protocol==="paper-2029" && !head && !spouse) {
        assert.equal(p.status,"excluded"); assert.equal(p.studyDisposableWan,null); continue;
      }
      checkPoint(p, id, head, spouse);
      caseCount++;
      if (head !== spouse) {
        const reversed = model.evaluate(spouse, head);
        checkPoint(reversed, id, spouse, head);
        if (protocol==="legacy-v2" && p.studyDisposableWan !== reversed.studyDisposableWan) {
          throw new Error(`${id}：給与配分${head}万円・${spouse}万円の交換対称性に不整合。`);
        }
        caseCount++;
      }
    }
  }
  assert.equal(caseCount, pointCount-Number(protocol==="paper-2029"));
  checked += caseCount;
  console.log(`✓ ${id} ${title}：${caseCount.toLocaleString("ja-JP")}点`);
}
assert.equal(checked, expectedCases.length * (pointCount-Number(protocol==="paper-2029")));
console.log(`${protocol}：合計 ${checked.toLocaleString("ja-JP")} 給与点で合格。`);
