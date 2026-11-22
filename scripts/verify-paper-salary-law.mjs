// 確定した2029年税表ではなく、R8年法律12号の本則別表第五を照合する。
// curl -fsSL https://www.shugiin.go.jp/internet/itdb_housei.nsf/html/housei/22120260331012.htm | node --experimental-default-type=module scripts/verify-paper-salary-law.mjs
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {JSDOM} from "jsdom";
import {calculatePaperSalaryTaxInputs2029} from "../src/calc/paperSalaryTaxInputs2029.js";

const doc=new JSDOM(readFileSync(0)).window.document;
const tables=Array.from(doc.querySelectorAll("table"));
const first=tables.findIndex(t=>t.rows[3]?.cells[0]?.textContent.trim()==="691,000"&&t.textContent.includes("2,026,000"));
assert(first>=0,"本則別表第五を特定できません");
const last=tables.findIndex((t,i)=>i>=first && t.textContent.includes("18,050,000円") && t.textContent.includes("20,000,000円"));
assert(last>=first,"別表第五の末尾を特定できません");
const byStart=new Map();
for(const table of tables.slice(first,last+1)) for(const row of table.rows) {
  // 見開きの左右に金額が印刷される。rowspanもあるため、税表の階級幅と所得の条件を検査。
  const cells=Array.from(row.cells,td=>{
    const s=td.textContent.trim().replace(/,/g,"");
    return /^\d+$/.test(s)?Number(s):NaN;
  });
  for(let i=0;i+2<cells.length;i++) {
    const [lo,hi,z]=cells.slice(i,i+3);
    if(!(lo>=2026000&&hi<=6600000&&[2000,4000].includes(hi-lo)&&z<lo))continue;
    if(byStart.has(lo))assert.deepEqual(byStart.get(lo),[lo,hi,z],"表間で重複する階級の値が一致しません");
    byStart.set(lo,[lo,hi,z]);
  }
}
const bands=Array.from(byStart.values()).sort((a,b)=>a[0]-b[0]);
const actual=gross=>calculatePaperSalaryTaxInputs2029({
  annualSalaryYen:gross,eligibleForIncomeAdjustment:false,
}).salaryIncomeYen;
let end=2026000;
for(const [lo,hi,expected] of bands) {
  assert.equal(lo,end,"階級の取りこぼしまたは重複");
  for(const gross of [lo,hi-1])assert.equal(actual(gross),expected,"原表の両端・給与円："+gross);
  end=hi;
}
assert.equal(end,6600000);
for(let gross=0;gross<=15000000;gross+=10000) {
  const row=bands.find(([lo,hi])=>lo<=gross && gross<hi);
  // 表中に定額でなく算式・ゼロと明記された両端の区間。
  const want=gross<691000?0:gross<2026000?gross-690000:row?row[2]:
    gross<8500000?gross*9/10-1100000:gross-1950000;
  assert.equal(actual(gross),want,"給与軸（円）："+gross);
}
console.log(JSON.stringify({enactedTableBands:bands.length,officialEndPoints:bands.length*2,grid:1501,mismatches:0}));
