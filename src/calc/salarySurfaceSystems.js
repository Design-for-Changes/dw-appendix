// 線は給与1万円の隣接比較。世帯の手当支給額／上限適用後の利用者負担額が実際に変わった地点だけ。
export const SURFACE_SYSTEMS = [
  {id:"N01-1", label:"特別児童扶養手当", color:"#b22d51", bit:1},
  {id:"N01-2", label:"障害児福祉手当", color:"#005da8", bit:2},
  {id:"N02/N03", label:"障害福祉サービス・障害児通所支援の利用者負担", color:"#00765d", bit:4},
];
const [special,welfare,services]=SURFACE_SYSTEMS;
export const SURFACE_AMOUNT_COUNT=SURFACE_SYSTEMS.length;
export const UNKNOWN_SURFACE_AMOUNT=-1;
/** 円額を桁区切りにし、未記録の値と0円を区別する。 */
const yen=n=>Number.isFinite(n)?n.toLocaleString("ja-JP")+"円":"未記録";
/** 計算器の世帯員IDを判定対象者の表示名にする。 */
const person=id=>id==="head"?"世帯主":id==="spouse"?"配偶者":id?.replace(/^child(\d+)$/,"子$1") ?? "判定対象者";
const roles={claimant:"受給資格者",spouse:"配偶者",obligor:"扶養義務者",recipient:"受給児童",maintainer:"生計維持者"};

/** 算定された世帯合計の年額を整数円で格納する。欠測を支給・負担の0円と扱わない。 */
export function writeSurfaceAmounts(target,offset,point) {
  const {benefits,service}=point.details ?? {};
  const a=benefits?.tcca,b=benefits?.welfare,c=service?.annual;
  target[offset]=Number.isSafeInteger(a) && a>=0 ? a : UNKNOWN_SURFACE_AMOUNT;
  target[offset+1]=Number.isSafeInteger(b) && b>=0 ? b : UNKNOWN_SURFACE_AMOUNT;
  target[offset+2]=Number.isSafeInteger(c) && c>=0 ? c : UNKNOWN_SURFACE_AMOUNT;
}

/** 比較できる世帯合計の年額が1円でも変わった制度だけを返す。人別判定・上限・純収支はマスクに使わない。 */
export function surfaceChangeMask(amounts,offsetA,offsetB) {
  let mask=0;
  for(let i=0;i<SURFACE_AMOUNT_COUNT;i++) {
    const a=amounts[offsetA+i],b=amounts[offsetB+i];
    if (a!==b && a!==UNKNOWN_SURFACE_AMOUNT && b!==UNKNOWN_SURFACE_AMOUNT) mask|=SURFACE_SYSTEMS[i].bit;
  }
  return mask;
}

/** 手当の一人分の判定について役割、制限への該当、所得・限度額を表示する。 */
function allowanceState(c,child,stopped) {
  const amount=c.assessmentIncomeYen ?? c.incomeYen;
  const role=c.role==="spouse"?(child?"受給児童の配偶者":"受給資格者の配偶者"):(roles[c.role] ?? "所得判定");
  return (child?child+"・":"")+role+"（"+person(c.id)+"）："+
    (stopped?"所得制限に該当":"所得制限に該当しない")+
    (Number.isFinite(amount)&&Number.isFinite(c.limitYen)?"（判定所得"+yen(amount)+"／限度額"+yen(c.limitYen)+"）":"");
}
/** 世帯のサービス月額上限と、給与額とは異なる判定用所得割を表示する。 */
function capState(s) {
  const cat=({0:"非課税等",4600:"一般1",37200:"一般2"})[s.householdCapYen];
  return "年額負担"+yen(s.annual)+"（月額実負担"+yen(s.monthly)+"）。"+cat+"：月額上限"+yen(s.householdCapYen)+
    (Number.isFinite(s.assessmentLevyYen)?"（世帯の判定用市町村民税所得割 "+yen(s.assessmentLevyYen)+"）":"");
}
/** 二つの算定済み給与点で世帯の支給・負担年額が変わった制度を、金額と変化理由の両方で説明する。 */
export function describeSurfaceChanges(before,after) {
  if ([before,after].some(p=>p?.status!=="calculated" || !Number.isFinite(p.studyDisposableWan))) return [];
  const amounts=new Int32Array(2*SURFACE_AMOUNT_COUNT);
  writeSurfaceAmounts(amounts,0,before);
  writeSurfaceAmounts(amounts,SURFACE_AMOUNT_COUNT,after);
  const mask=surfaceChangeMask(amounts,0,SURFACE_AMOUNT_COUNT);
  if (!mask) return [];
  const rows=[], a=before.details,b=after.details;
  /** 世帯の支給額変更を説明するのに必要な、判定前後で結論の変わった人だけを列挙する。 */
  function compareReasons(prior,next,field,child,oldReasons,newReasons) {
    (next ?? []).forEach((c,i)=>{
      const p=prior?.[i];
      if (!p || typeof p[field]!=="boolean" || typeof c[field]!=="boolean" || p[field]===c[field]) return;
      oldReasons.push(allowanceState(p,child,field==="stopped"?p.stopped:!p.passes));
      newReasons.push(allowanceState(c,child,field==="stopped"?c.stopped:!c.passes));
    });
  }
  /** 複数人・複数児の判定に変化があっても、世帯の年額は各制度につき一度だけ示す。 */
  function addBenefit(sys,prior,next,oldReasons,newReasons) {
    rows.push({id:sys.id,before:["世帯への年額支給"+yen(prior),...oldReasons].join("。"),
      after:["世帯への年額支給"+yen(next),...newReasons].join("。")});
  }
  if (mask & special.bit) {
    const oldReasons=[],newReasons=[];
    compareReasons(a.benefits.specialChildAllowance?.checks,b.benefits.specialChildAllowance?.checks,"stopped","",oldReasons,newReasons);
    addBenefit(special,a.benefits.tcca,b.benefits.tcca,oldReasons,newReasons);
  }
  if (mask & welfare.bit) {
    const oldReasons=[],newReasons=[];
    (b.benefits.welfareChildren ?? []).forEach((c,i)=>{
      const prev=a.benefits.welfareChildren?.[i];
      if (!prev || prev.annualYen===c.annualYen) return;
      compareReasons(prev.checks,c.checks,"passes","子"+(i+1),oldReasons,newReasons);
    });
    addBenefit(welfare,a.benefits.welfare,b.benefits.welfare,oldReasons,newReasons);
  }
  if (mask & services.bit) rows.push({id:services.id,before:capState(a.service),after:capState(b.service)});
  return rows;
}
