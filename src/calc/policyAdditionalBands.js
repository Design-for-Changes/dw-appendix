// Reference classifications for excluded expenses. No amounts or decisions from
// this module feed the simulator's disposable income or establish eligibility.
const city="https://www.city.funabashi.lg.jp/";
export const ADDITIONAL_POLICY_LAYERS=[
  {id:"housing",label:"市営住宅の家賃・入居収入基準（M05）",
    classes:["第1区分","第2区分","第3区分","第4区分（一般の収入上限）","第5区分","第6区分（裁量の収入上限）","第7区分","第8区分"],
    source:city+"machi/juutaku/003/p004005.html"},
  {id:"hearing",label:"難聴児補聴器の所得制限（M03）",
    classes:["全員46万円未満","46万円以上の世帯員あり"],
    source:city+"shisei/jouhoukoukai/005/p043438_d/fil/hocyouki.pdf"},
  {id:"power",label:"難病患者非常用電源の補助率（M09）",
    classes:["基準額内10割","基準額内9割"],
    source:city+"shisei/jouhoukoukai/005/p043423_d/fil/hijouyoudengen.pdf"},
  {id:"medicalCare",label:"自立支援医療の所得帯（育成・精神通院、N02）",
    classes:["市民税非課税","課税・所得割3.3万円未満","所得割3.3万円以上23.5万円未満","所得割23.5万円以上"],
    source:"https://www.mhlw.go.jp/web/t_doc?dataId=00tb4803&dataType=1&pageNo=1"},
];

// 公営住宅法施行令1条3号、2条の表（https://laws.e-gov.go.jp/law/326CO0000000240）。
// 住戸係数を掛けた家賃・裁量階層に該当する認定・住宅困窮要件は推計しない。
const housingAnnualLimits=[104000,123000,139000,158000,186000,214000,259000].map(v=>v*12);
/** 公営住宅の控除後世帯所得（年額）を、法定の月収基準に対応する8区分に分ける。 */
function housingBand(annual) {
  for(let i=0;i<housingAnnualLimits.length;i++)if(annual<=housingAnnualLimits[i])return i+1;
  return 8;
}

/**
 * Eの給与・同居扶養条件（両親45歳・給与のみ、無所得の子1～3人）について、購入・診療・
 * 入居の事実を仮定せず所得軸だけを分類する。各区分は1始まり、未設定は0。
 * @param {object[]} children 子の年齢と税法上の障害者区分。
 * @param {object} options 医療を受ける子の保険被扶養先。税扶養先からは推測しない。
 * @returns {object} 各層の利用可否と、親2人分の個別判定値から区分を符号化する関数。
 */
export function createAdditionalPolicyClassifier(children,options={}) {
  // 同居親族人数は申込者を除く（配偶者＋全児童）。年少児にも38万円控除。
  // 住宅用の特別障害者控除は40万円。所得税の同居特別障害者控除75万円を流用しない。
  let housingDeductions=(1+children.length)*380000;
  for(const c of children){
    if(c.age>=16)housingDeductions+=250000;
    if(c.taxStatus==="special")housingDeductions+=400000;
    if(c.taxStatus==="ordinary")housingDeductions+=270000;
  }
  const choice=options.medical?.insuredParent;
  const medical=["head","spouse","higher"].includes(choice);
  return {statuses:["calculated","calculated","calculated",medical?"calculated":"needs-input"],
    classify(head,spouse){
      // 給与所得者ごとに10万円を上限に控除。年換算の境界と直接比較し、表示用月収は丸めない。
      const annual=Math.max(0,head.income-100000)+Math.max(0,spouse.income-100000)-housingDeductions;
      const housing=housingBand(annual);
      // 補聴器要綱2条2項：年少・特定扶養の復元後の市民税所得割を世帯員ごとに比較。合計ではない。
      const hearing=Math.max(head.serviceLevy,spouse.serviceLevy)>=460000?2:1;
      // 難病患者非常用電源要綱6条：未成年は生計を一にする保護者。生活保護・寄附等を想定しない
      // 給与世帯では、所得割ゼロ（均等割のみを含む）と所得割課税の間で購入時補助率が変わる。
      const power=head.municipalLevy>0||spouse.municipalLevy>0?2:1;
      let care=0;
      if(medical){
        // 被用者保険に加入する子の所得割判定：総合支援法施行規則38条の2・39条。
        // 給与0円の親は被扶養者。保険単位と税扶養が異なる場合も補正を付け替えない。
        const p=head.wageWan===0?spouse:spouse.wageWan===0?head:
          choice==="head"?head:choice==="spouse"?spouse:head.wageWan>=spouse.wageWan?head:spouse;
        care=!p.taxable?1:p.serviceLevy<33000?2:p.serviceLevy<235000?3:4;
      }
      // 非課税内部の収入区分、重度かつ継続等による取扱い・経過措置は示さない。
      return housing|(hearing<<4)|(power<<8)|(care<<12);
    },
  };
}
