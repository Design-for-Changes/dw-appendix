// Generate public/data/basic.json (1万円刻み, 0..3000万円)
// This file is used for the "固定情報グラフ" tab to avoid heavy runtime computation.
//
// NOTE: All thresholds are in JPY (yen). Output values are in "万円" (10,000 yen).
const fs = require("fs");
const path = require("path");

const WAN = 10000;
const OUT_PATH = path.join(__dirname, "..", "public", "data", "basic.json");

// Resident tax (住民税) basic deduction: scenario-independent
const basicLT = (agiYen) => {
  if (agiYen <= 24000000) return 430000;
  if (agiYen <= 24500000) return 290000;
  if (agiYen <= 25000000) return 150000; // 5万ではなく15万
  return 0;
};

// Income tax (所得税) basic deduction per scenario
const basicIT = {
  // S1: 令和2〜6（〜R6）
  s1: (agiYen) => {
    if (agiYen <= 24000000) return 480000;
    if (agiYen <= 24500000) return 320000;
    if (agiYen <= 25000000) return 160000;
    return 0;
  },
  // S2: 令和7〜8（R7〜8）
  s2: (agiYen) => {
    if (agiYen <= 1320000) return 950000;
    if (agiYen <= 3360000) return 880000;
    if (agiYen <= 4890000) return 680000;
    if (agiYen <= 6550000) return 630000;
    if (agiYen <= 23500000) return 580000;
    if (agiYen <= 24000000) return 480000;
    if (agiYen <= 24500000) return 320000;
    if (agiYen <= 25000000) return 160000;
    return 0;
  },
  // S3: 令和9〜（R9〜）※最新合意
  s3: (agiYen) => {
    if (agiYen <= 4890000) return 1040000;
    if (agiYen <= 6550000) return 670000;
    if (agiYen <= 23500000) return 620000;
    if (agiYen <= 24000000) return 480000;
    if (agiYen <= 24500000) return 320000;
    if (agiYen <= 25000000) return 160000;
    return 0;
  },
};

const yenToWan = (yen) => Math.round((yen || 0) / WAN);

const rows = [];
for (let incomeWan = 0; incomeWan <= 3000; incomeWan += 1) {
  const agiYen = incomeWan * WAN;
  rows.push({
    income_axis: incomeWan,
    basicLT_common: yenToWan(basicLT(agiYen)),
    basicIT_s1: yenToWan(basicIT.s1(agiYen)),
    basicIT_s2: yenToWan(basicIT.s2(agiYen)),
    basicIT_s3: yenToWan(basicIT.s3(agiYen)),
  });
}

fs.writeFileSync(OUT_PATH, JSON.stringify(rows));
console.log(`wrote: ${OUT_PATH} (len=${rows.length})`);

