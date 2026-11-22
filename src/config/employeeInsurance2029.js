// 改稿用の静学比較。2029年の実徴収額ではない。率の単位は1/10,000。
// 支部・介護・支援金は労使計、雇用保険だけは最初から労働者負担率。
export const employeeInsurance2029 = Object.freeze({
  id: "funabashi-2029-12-with-2026-rate-proxies",
  rulesAsOf: "2029-12",
  proxyRateFiscalYear: 2026,
  healthBps: 973, careBps: 162, childSupportBps: 23, employeeEmploymentBps: 50,
  // 厚生年金は法定の労使計18.3%。上限は2029年9月施行の35級。
  pensionBps: 1830,
  sources: Object.freeze({
    healthGradesAndProxyRates: "https://www.kyoukaikenpo.or.jp/assets/R8_12chiba.pdf",
    pensionGrades: "https://www.shugiin.go.jp/internet/itdb_housei.nsf/html/housei/21720250620074.htm",
    pensionAmounts: "https://www.mhlw.go.jp/content/12500000/001496971.pdf",
    pensionRate: "https://www.nenkin.go.jp/service/kounen/hokenryo/hoshu/20150515-01.html",
    employmentAndRounding: "https://jsite.mhlw.go.jp/ehime-roudoukyoku/hourei_seido_tetsuzuki/roudou_hoken/hourei_seido/2030108.html",
    wageRequirement: "https://www.nenkin.go.jp/oshirase/taisetu/jigyosho/2026/202610/100104.html",
  }),
});
