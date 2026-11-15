export const CALCULATION_SOURCES = {
  employmentIncomeR8Final: {
    title: "国税庁 No.1410 給与所得控除（令和8・9年分、年末調整表を含む）",
    url: "https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1410.htm",
    checkedOn: "2026-11-15",
    effectiveFrom: "2026-12-01",
    appliesToIncomeYear: 2026,
  },
  basicDeductionR8Final: {
    title: "国税庁 No.1199 基礎控除（令和8年分の年末確定税）",
    url: "https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1199.htm",
    checkedOn: "2026-11-15",
    effectiveFrom: "2026-12-01",
    appliesToIncomeYear: 2026,
  },
  reconstructionSpecialIncomeTax: {
    title: "国税庁 No.2260 所得税の税率・復興特別所得税2.1%（令和8年分）",
    url: "https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2260.htm",
    checkedOn: "2026-11-15",
    appliesToIncomeYear: 2026,
  },
  childSupportAllowanceR8: {
    title: "こども家庭庁 ひとり親家庭等の支援について（令和8年4月）児童扶養手当の計算式・82頁",
    url: "https://www.cfa.go.jp/assets/contents/node/basic_page/field_ref_resources/0a870592-1814-4b21-bf56-16f06080c594/0f69b7f8/20260424_policies_hitori-oya_112.pdf",
    checkedOn: "2026-11-15",
    fiscalYear: 2026,
  },
  basicDisabilityPensionR8: {
    title: "日本年金機構 障害年金（令和8年4月～令和9年3月の年額）",
    url: "https://www.nenkin.go.jp/international/simplejapanese/japanese-system/benefit/disability.html",
    checkedOn: "2026-11-15",
    fiscalYear: 2026,
  },
  welfareAllowanceIncomeLimitR8: {
    title: "船橋市 障害児福祉手当（令和8年7月17日更新・本人所得限度額）",
    url: "https://www.city.funabashi.lg.jp/kenkou/shougaisha/004/03/p042516.html",
    checkedOn: "2026-11-15",
    fiscalYear: 2026,
  },
  residentTaxR9: {
    title: "船橋市 令和9年度課税から適用される税制改正（令和8年所得）",
    url: "https://www.city.funabashi.lg.jp/kurashi/zei/001/03/p149800.html",
    checkedOn: "2026-11-15",
    appliesToIncomeYear: 2026,
    assessmentYear: 2027,
  },
  incomeTax: {
    title: "国税庁 給与所得者と税（令和8年分）",
    url: "https://www.nta.go.jp/publication/pamph/koho/kurashi/html/02_1.htm",
    archivePath: "./sources/nta-r8-employment-income-tax.png",
  },
  residentTax: {
    title: "船橋市 市民税・県民税の計算",
    url: "https://www.city.funabashi.lg.jp/kurashi/zei/007/003/p028458.html",
    archivePath: "./sources/funabashi-resident-tax-calculation.png",
  },
  residentTaxExemption: {
    title: "船橋市 個人市民税・県民税、森林環境税の納税義務者（非課税基準）",
    url: "https://www.city.funabashi.lg.jp/kurashi/zei/007/001/p000865.html",
    checkedOn: "2026-11-15",
  },
  forestEnvironmentTax: {
    title: "船橋市 令和6年度から森林環境税（国税）の賦課徴収が始まります",
    url: "https://www.city.funabashi.lg.jp/kurashi/zei/007/005/p118529.html",
    checkedOn: "2026-11-15",
  },
  socialHealth: {
    title: "協会けんぽ 令和8年度東京都保険料額表",
    url: "https://www.kyoukaikenpo.or.jp/assets/R8_13tokyo.pdf",
    archivePath: "./sources/r8-tokyo-health-insurance-rates.pdf",
  },
  employmentInsurance: {
    title: "厚生労働省 令和8年度雇用保険料率",
    url: "https://www.mhlw.go.jp/content/001692566.pdf",
    archivePath: "./sources/mhlw-r8-employment-insurance.pdf",
  },
  disabilityAllowances: {
    title: "千葉県 障害のある人への手当（令和8年度）",
    url: "https://www.pref.chiba.lg.jp/shoufuku/service/teate.html",
    archivePath: "./sources/chiba-r8-disability-allowances.png",
  },
  serviceBurden: {
    title: "こども家庭庁 障害児支援の利用者負担",
    url: "https://www.cfa.go.jp/policies/shougaijishien/shisaku/futan",
    archivePath: "./sources/cfa-child-disability-service-burden.png",
  },
  serviceRepresentative: {
    title: "東京都 障害児通所支援事業所の利用状況等調査（令和6年度）",
    url: "https://www.fukushi.metro.tokyo.lg.jp/documents/d/fukushi/2025-07-08-143208-132",
    archivePath: "./sources/tokyo-r6-child-day-service-survey.pdf",
  },
  serviceHouseholdAggregation: {
    title: "こども家庭庁 障害児通所給付決定事務処理要領（令和8年3月版）印刷53～57頁",
    url: "https://www.cfa.go.jp/assets/contents/node/basic_page/field_ref_resources/b27810b0-7802-444c-a95d-22841bdf3eca/46345264/20260402_policies_shougaijishien_shisaku_jimushori_yoryo_49.pdf",
    checkedOn: "2026-11-15",
  },
  serviceAssessmentLevy: {
    title: "児童福祉法施行規則第18条の3の2（年少扶養控除等の廃止影響遮断）",
    url: "https://laws.e-gov.go.jp/law/323M40000100011",
    noticeUrl: "https://www.mhlw.go.jp/web/t_doc?dataId=00tb9036&dataType=1&pageNo=1",
    amountExampleUrl: "https://www.city.koto.lg.jp/222010/fukushi/shogaisha/service/shogaisha/44737.html",
    checkedOn: "2026-11-15",
  },
  medicalRepresentative: {
    title: "伊勢原市議会 平成29年度決算に基づく1人当たり助成額",
    url: "https://www.city.isehara.kanagawa.jp/gikai/docs/2019071100012/file_contents/2018-09-10_kyouiku.pdf",
    archivePath: "./sources/isehara-h29-medical-aid-record.pdf",
  },
};
