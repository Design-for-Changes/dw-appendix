import {createRevisionCalculator} from "./revisionEngine";

// 本稿の二給与経路だけを呼ぶ外部期待値テスト。税・保険の実装関数、UIおよび生成済み数表を
// 期待値の計算に使わない。45歳・千葉支部・R8年度代理料率・2029年末の厚年上限・
// 給与以外の所得なし。2029年に実際に徴収される額の検証ではない。
// 給与所得・国税の基礎控除・子に係る所得金額調整控除（夫婦双方に適用可）：
// https://www.shugiin.go.jp/internet/itdb_housei.nsf/html/housei/22120260331012.htm
// https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1199.htm
// https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1411.htm
// 所得控除、累進税率、年調年税額の102.1%・百円未満切捨て（問8）：
// https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1160.htm
// https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1195.htm
// https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2260.htm
// https://www.nta.go.jp/publication/pamph/pdf/0026005-024_03.pdf
// 船橋市：控除額、人的控除差による調整控除、市6%県4%、均等割と森林環境税の非課税要件。
// https://www.city.funabashi.lg.jp/kurashi/zei/007/003/p000869.html
// https://www.city.funabashi.lg.jp/kurashi/zei/007/003/p028458.html
// https://www.city.funabashi.lg.jp/kurashi/zei/007/001/p000865.html
// 給与天引き（円未満50銭以下切捨て）、厚年75万円上限、一般事業の雇用本人5/1000。
// https://www.kyoukaikenpo.or.jp/assets/R8_12chiba.pdf
// https://www.mhlw.go.jp/content/12500000/001496971.pdf
// https://jsite.mhlw.go.jp/ehime-roudoukyoku/hourei_seido_tetsuzuki/roudou_hoken/hourei_seido/2030108.html
const model = (age, taxStatus, filer) => createRevisionCalculator({
  protocol:"paper-2029", roles:{spouseDeductionClaimant:filer}, serviceAmountYen:0,
  children:[{age, taxStatus, tccaGrade:taxStatus==="special"?"1":"not", welfareEligible:false, serviceUser:false}],
});
const yen = wan => Math.round(wan*10000);
// 個人行（年額円）：給与所得、所得金額調整控除、本人保険料、国税課税所得、年調年税額、
// 住民税課税所得、市所得割、県所得割、均等割＋森林環境税。各中間額も照合する。
const personal = p => [p.currentIncomeYen, p.salaryTaxInputs.incomeAdjustmentDeductionYen, p.socialYen,
  p.nationalTax.taxableYen, p.incomeTaxYen,p.residentTax.taxableYen,p.residentTax.municipalIncomeLevyYen,
  p.residentTax.prefecturalIncomeLevyYen,p.residentTax.perCapitaYen+p.forestTaxYen];
const r131 = [620000,0,203760,0,0,0,0,0,5000];
const r600 = [4360000,0,926400,2433000,148800,2673000,158800,105900,5000];
// [給与A・給与B(万円), 子の年齢・税区分, A・Bの各人行, 手取年額(円)]。
// 360/131：Aの標準報酬30万円。月17,025＋345＋27,450＋1,500=46,320円。
// Aの国税課税所得：(244万−555,840−62万−38万−75万)の千円未満切捨て。
// Bが131→132万になると普通から特別の配偶者控除へ。所得控除額は同額でも、
// 調整控除の人的控除差（A）だけが5万円減り、市1,500円＋県1,000円が増える。
// 子の扶養控除は16歳からだが障害者控除は15歳でも可。特児1級の年額は701,400円。
const households = [
  [360,131,15,"special",[2440000,0,555840,134000,6800,594000,26000,17300,5000],r131,4911700],
  [360,132,15,"special",[2440000,0,555840,134000,6800,594000,27500,18300,5000],
    [630000,0,203808,0,0,0,0,0,5000],4919152],
  [360,131,16,"special",[2440000,0,555840,0,0,264000,7900,5200,5000],r131,4948700],
  // ともに年収850万超。子の税扶養はBのみだが、所得金額調整控除はA5万、B15万。
  [900,1000,16,"ordinary",[7000000,50000,1389600,4990000,582400,5180000,309300,206200,5000],
    [7900000,150000,1450188,5179000,621000,5429000,324200,216100,5000],14011012],
  // 両者とも厚年上限、健保は別等級。Aは所得税33%帯、特児は所得制限により支給なし。
  [1500,1110,16,"special",[12900000,150000,1780896,9369000,1588400,9829000,588200,392100,5000],
    [9000000,150000,1525164,6854000,963100,7044000,421100,280700,5000],18670340],
  // Bに税扶養なし：給与114万円で給与所得45万円。1万円増で所得割はなお0、
  // 市3,000＋県1,000＋国の森林環境税1,000が課される。
  [600,114,15,"none",r600,[450000,0,181392,0,0,0,0,0,0],5733708],
  [600,115,15,"none",r600,[460000,0,181440,0,0,0,0,0,5000],5738660],
];
test.each(households)("原表からの二給与検算：%i万と%i万、%i歳、%s", (a,b,age,status,aRow,bRow,net) => {
  for (const reversed of [false,true]) {
    const result=model(age,status,reversed?"spouse":"head").evaluate(reversed?b:a,reversed?a:b);
    const A=result.details[reversed?"spouseTax":"headTax"], B=result.details[reversed?"headTax":"spouseTax"];
    expect(personal(A)).toEqual(aRow);
    expect(personal(B)).toEqual(bRow);
    for(const [p,row] of [[A,aRow],[B,bRow]]) {
      expect(p.forestTaxYen).toBe(row[8] ? 1000 : 0);
      expect(p.residentTaxYen).toBe(row[6]+row[7]+row[8]);
    }
    expect(yen(result.studyDisposableWan)).toBe(net);
  }
});

// 国税庁No.1195と船橋市「所得控除とは」の配偶者特別控除表を給与に換算して照合。
// 各配列の3列は控除申告者の所得900万以下/950万以下/1,000万以下。
// 令和10年分以後の低額給与では本則の給与所得控除69万。相手給与202万の所得は
// 133万ちょうど、203万の所得は別表第五の133.8万（上限外）。
const spouseTable = [
  [131,"ordinary",[38,26,13],[33,22,11]], [132,"special",[38,26,13],[33,22,11]],
  [164,"special",[38,26,13],[33,22,11]], [165,"special",[36,24,12],[33,22,11]],
  [169,"special",[36,24,12],[33,22,11]], [170,"special",[31,21,11],[31,21,11]],
  [174,"special",[31,21,11],[31,21,11]], [175,"special",[26,18,9],[26,18,9]],
  [179,"special",[26,18,9],[26,18,9]], [180,"special",[21,14,7],[21,14,7]],
  [184,"special",[21,14,7],[21,14,7]], [185,"special",[16,11,6],[16,11,6]],
  [189,"special",[16,11,6],[16,11,6]], [190,"special",[11,8,4],[11,8,4]],
  [194,"special",[11,8,4],[11,8,4]], [195,"special",[6,4,2],[6,4,2]],
  [199,"special",[6,4,2],[6,4,2]], [200,"special",[3,2,1],[3,2,1]],
  [202,"special",[3,2,1],[3,2,1]], [203,"none",[0,0,0],[0,0,0]],
];
test.each([[1110,0],[1111,1],[1160,1],[1161,2],[1210,2],[1211,-1]])(
  "申告者給与%i万：相手の全所得帯を論文用エンジンで左右入替えて照合", (own,tier) => {
    for(const filer of ["head","spouse"]) {
      const c=model(10,"none",filer);
      for(const [other,kind,it,lt] of spouseTable) {
        const p=filer==="head"?c.evaluate(own,other):c.evaluate(other,own);
        const sp=p.details[filer+"Tax"].spouseDeduction.current;
        expect([other,sp.kind,sp.it,sp.lt]).toEqual([other,tier<0?"none":kind,
          tier<0?0:it[tier]*10000,tier<0?0:lt[tier]*10000]);
      }
    }
  }
);
