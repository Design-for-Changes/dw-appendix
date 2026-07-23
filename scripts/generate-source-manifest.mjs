import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const sources = [
  ["income-tax", "国税庁 給与所得者と税（令和8年分）", "https://www.nta.go.jp/publication/pamph/koho/kurashi/html/02_1.htm", "nta-r8-employment-income-tax.png", "2026-07-24"],
  ["resident-tax", "船橋市 所得割の税率と税額控除", "https://www.city.funabashi.lg.jp/kurashi/zei/007/003/p028458.html", "funabashi-resident-tax-calculation.png", "2026-07-24"],
  ["social-insurance", "協会けんぽ 令和8年度東京都保険料額表", "https://www.kyoukaikenpo.or.jp/assets/R8_13tokyo.pdf", "r8-tokyo-health-insurance-rates.pdf", "2026-07-24"],
  ["employment-insurance", "厚生労働省 令和8年度雇用保険料率", "https://www.mhlw.go.jp/content/001692566.pdf", "mhlw-r8-employment-insurance.pdf", "2026-07-24"],
  ["disability-allowances", "千葉県 障害のある人への手当（令和8年度）", "https://www.pref.chiba.lg.jp/shoufuku/service/teate.html", "chiba-r8-disability-allowances.png", "2026-07-24"],
  ["m01-income-limit", "東金市 重度心身障害者医療費の助成", "https://www.city.togane.chiba.jp/0000000878.html", "togane-severe-disability-medical-aid.png", "2026-07-23"],
  ["m01-representative", "伊勢原市議会 平成29年度決算に基づく1人当たり助成額", "https://www.city.isehara.kanagawa.jp/gikai/docs/2019071100012/file_contents/2018-09-10_kyouiku.pdf", "isehara-h29-medical-aid-record.pdf", "2026-07-24"],
  ["n04-method", "特別支援教育就学奨励費に係る収入額・需要額の測定要領", "https://www.dokyoi.pref.hokkaido.lg.jp/fs/9/7/1/2/4/0/4/_/R7%20%E5%8F%8E%E5%85%A5%E9%A1%8D%E3%83%BB%E9%9C%80%E8%A6%81%E9%A1%8D%E3%81%AE%E6%B8%AC%E5%AE%9A%E8%A6%81%E9%A0%98.pdf", "n04-income-and-need-measurement-guideline.pdf", "2026-07-23"],
  ["n04-standards", "千葉県 生活保護の基準（令和7年10月1日以降）", "https://www.pref.chiba.lg.jp/kenshidou/shien/book/seikatsuhogo.html", "chiba-r7-livelihood-standards.png", "2026-07-24"],
  ["n04-local", "船橋市 特別支援教育就学奨励制度（令和8年度）", "https://www.city.funabashi.lg.jp/kodomo/teate/005/p1008696.html", "funabashi-r8-special-education-aid.png", "2026-07-24"],
  ["service-statutory", "こども家庭庁 障害児支援の利用者負担", "https://www.cfa.go.jp/policies/shougaijishien/shisaku/futan", "cfa-child-disability-service-burden.png", "2026-07-24"],
  ["service-representative", "東京都 障害児通所支援事業所の利用状況等調査", "https://www.fukushi.metro.tokyo.lg.jp/documents/d/fukushi/2025-07-08-143208-132", "tokyo-r6-child-day-service-survey.pdf", "2026-07-24"],
];

const root = path.resolve("public/sources");
const entries = [];
for (const [id, title, originalUrl, filename, accessedOn] of sources) {
  const bytes = await readFile(path.join(root, filename));
  entries.push({
    id,
    title,
    originalUrl,
    archivePath: `./sources/${filename}`,
    accessedOn,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    bytes: bytes.length,
  });
}
await writeFile(path.join(root, "manifest.json"), `${JSON.stringify({ generatedAt: "2026-07-24", entries }, null, 2)}\n`);
