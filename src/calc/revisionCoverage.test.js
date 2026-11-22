import { calculateHouseholdCoverage } from "./revisionCoverage";

const person = (mode, employmentInsurance = false, more = {}) => ({mode,employmentInsurance,workRegion:"tokyo",...more});
const job = person("employee",true);
const outside = person("outside");
const calc = (head,spouse,x,y,extra={}) => calculateHouseholdCoverage({head,spouse,...extra},x,y);

test("同じ年収でも加入状態で両年の負担が異なる。税法上の配偶者控除は入力しない", () => {
  const withJob = calc(job,job,600,100);
  // 東京令和8年度・報酬月額50万円：健保＋介護28,675、子育て575、厚年45,750／月。雇用は年30,000円。
  expect(withJob).toMatchObject({known:true,head:{social:930000,prevSocial:927000},spouse:{status:"employee"}});
  // 年収100万円（月給83,333～83,334円）は健保・厚年とも月額88,000円の等級。
  expect(withJob.spouse.current.payroll).toMatchObject({healthStandardYen:88000,pensionStandardYen:88000});
  const out = calc(job,outside,600,100);
  expect(out).toMatchObject({known:true,spouse:{status:"dependent",social:0,prevSocial:0}});
  expect(out.head).toEqual(withJob.head);
  expect(calc(outside,job,100,600).head).toEqual(out.spouse);
});

test("雇用保険と医療保険・年金の加入は別。被扶養者にも雇用保険だけを計上できる", () => {
  const out = calc(job,person("outside",true),600,100);
  // 月給83,333/83,334円のいずれでも、給与天引き額は当年417円・前年458円。
  expect(out.spouse).toMatchObject({status:"dependent",social:417*12,prevSocial:458*12,current:{workplaceYen:0,employmentYen:417*12}});
  expect(calc(job,job,600,100).spouse.social-calc(job,person("employee"),600,100).spouse.social).toBe(417*12);
  expect(calc(job,{mode:"employee"},600,100)).toMatchObject({known:false,spouse:{social:null}});
});

test("配偶者の扶養原則の境界：130万円未満と被保険者の収入の半分未満。個別認定を勝手に決めない", () => {
  expect(calc(job,outside,600,129).spouse).toMatchObject({status:"dependent",social:0});
  expect(calc(job,outside,600,130)).toMatchObject({known:false,spouse:{status:"national",social:null}});
  expect(calc(job,outside,240,119).spouse.status).toBe("dependent");
  for (const s of [120,121]) expect(calc(job,outside,240,s)).toMatchObject({known:false,spouse:{status:"undetermined",social:null}});
});

test("一人国保。支払額は入力した給与点の当年・前年だけで使い、未入力年をゼロにしない", () => {
  const spouse = person("outside",true,{currentNationalYen:300000,previousNationalYen:280000});
  const at = {measuredAt:{headWan:600,spouseWan:130}};
  const known = calc(job,spouse,600,130,at);
  // 月給108,333/108,334円の天引き額：当年542円・前年596円。
  expect(known).toMatchObject({known:true,spouse:{status:"national",social:300000+542*12,prevSocial:280000+596*12}});
  expect(calc(job,spouse,600,131,at)).toMatchObject({known:false,spouse:{social:null,prevSocial:null}});
  expect(calc(job,{...spouse,previousNationalYen:null},600,130,at)).toMatchObject({known:false,currentKnown:true,previousKnown:false,spouse:{social:300000+542*12,prevSocial:null}});
  expect(calc(job,spouse,600,130)).toMatchObject({known:false});
});

test("二人が国保なら世帯額は一度だけ。支払者の所得から引き、両者に同額を配分しない", () => {
  const head = person("outside",false,{currentNationalYen:200000,previousNationalYen:190000});
  const spouse = person("outside",false,{currentNationalYen:210000,previousNationalYen:195000});
  const at = {measuredAt:{headWan:500,spouseWan:200}};
  expect(calc(head,spouse,500,200,at).known).toBe(false);
  for (const payer of ["head","spouse"]) {
    const r = calc(head,spouse,500,200,{...at,nationalHealth:{payer,currentYen:300000,previousYen:260000}});
    expect(r.known).toBe(true);
    expect(r.head.social+r.spouse.social).toBe(710000);
    expect(r.head.prevSocial+r.spouse.prevSocial).toBe(645000);
    expect(r[payer].current.householdHealthYen).toBe(300000);
  }
});

test("世帯主が職場保険でも配偶者の国保世帯分を支払い得る。国保支払者の控除額だけが増える",()=>{
  const spouse=person("outside",false,{currentNationalYen:180000,previousNationalYen:170000});
  const actual={measuredAt:{headWan:600,spouseWan:160},nationalHealth:{payer:"head",currentYen:80000,previousYen:77000}};
  const r=calc(job,spouse,600,160,actual);
  expect(r.known).toBe(true);
  expect(r.head.current.householdHealthYen).toBe(80000);
  expect(r.spouse.social).toBe(180000);
});

test("未確認・給与ゼロ・明示的ゼロを区別。給与ゼロのみでは世帯の保険料をゼロにしない",()=>{
  expect(calc(job,outside,600,0)).toMatchObject({known:true,spouse:{status:"dependent",social:0}});
  expect(calc(job,job,600,0)).toMatchObject({known:false,spouse:{status:"undetermined",social:null}});
  expect(calc(person("unknown"),outside,0,0)).toMatchObject({known:false,spouse:{status:"undetermined",social:null}});
  const p=person("outside",false,{currentNationalYen:0,previousNationalYen:0});
  const measuredAt={headWan:0,spouseWan:0};
  expect(calc(p,p,0,0,{measuredAt,nationalHealth:{payer:"head",currentYen:0,previousYen:0}})).toMatchObject({known:true,head:{social:0},spouse:{social:0}});
});

const contract = workPattern => ({mode:"contract",workPattern,workRegion:"tokyo"});
test("同じ勤務パターンで給与を動かすだけで、扶養原則の内外を判定する。手動の加入スイッチは使わない",()=>{
  const sponsor=contract("regular"), partner=contract("under20");
  const at129=calc(sponsor,partner,600,129), at130=calc(sponsor,partner,600,130);
  expect(at129).toMatchObject({known:true,head:{status:"employee"},spouse:{status:"dependent",previousStatus:"dependent",social:0,prevSocial:0}});
  expect(at130).toMatchObject({known:false,spouse:{status:"national",previousStatus:"national",social:null,prevSocial:null}});
  expect(calc(partner,sponsor,130,600).head).toEqual(at130.spouse);
  expect(calc(sponsor,partner,600,0)).toMatchObject({known:true,spouse:{status:"dependent",social:0}});
});

test("同じ給与でも特定適用事業所かどうかが分かれる。非適用勤務の雇用保険は残る",()=>{
  const sponsor=contract("regular");
  expect(calc(sponsor,contract("short-covered"),600,200)).toMatchObject({known:true,spouse:{status:"employee",previousStatus:"employee"}});
  const extra={measuredAt:{headWan:600,spouseWan:200}};
  const partner={...contract("short-outside"),currentNationalYen:300000,previousNationalYen:280000};
  const r=calc(sponsor,partner,600,200,extra);
  expect(r).toMatchObject({known:true,spouse:{status:"national",previousStatus:"national",current:{nationalYen:300000,workplaceYen:0}}});
  expect(r.spouse.current.employmentYen).toBeGreaterThan(0);
});

test("各年の勤務条件を別々に判定。前年を当年の未算定で上書きしない",()=>{
  const r=calc(contract("regular"),contract("short-covered"),600,130);
  // 週20時間×52週では、東京2025年11月の時給1,226円を満たすが
  // 2026年11月の1,280円は満たさない（減額特例なしの設定）。
  expect(r).toMatchObject({currentKnown:false,previousKnown:true,known:false,
    spouse:{status:"undetermined",previousStatus:"employee",social:null}});
  expect(r.spouse.prevSocial).toBeGreaterThan(0);
});

const funabashi={residence:"funabashi",nationalEstimate:{
  confirmed:true,payer:"head",children:[{age:10,national:false},{age:8,national:false}],
}};
test("船橋に居住し勤務先は東京：国保に切り替わる給与点だけ地域推計を計上。市の保険料は実際に払う親に一回付ける",()=>{
  const sponsor=contract("regular"),partner=contract("under20");
  const a=calc(sponsor,partner,600,129,funabashi),b=calc(sponsor,partner,600,130,funabashi);
  expect(a.known).toBe(true);
  expect(a.regionalEstimates.current).toBe(null);
  expect(b).toMatchObject({known:true,spouse:{status:"national",current:{nationalMethod:"funabashi-estimate"}}});
  // 第1号被保険者が自分で普通納付する令和8／7年度の月額17,920／17,510円。
  expect(b.spouse.social).toBe(17920*12);
  expect(b.spouse.prevSocial).toBe(17510*12);
  expect(b.head.current.householdHealthYen).toBe(b.regionalEstimates.current.healthYen);
  expect(b.head.social-a.head.social).toBe(b.regionalEstimates.current.healthYen);
  expect(b.spouse.current.householdHealthYen).toBe(0);
  expect(b.regionalEstimates.current.healthYen).toBeGreaterThan(0);
  expect(b.head.current.payroll.workRegion).toBe("tokyo");
});

test("国保は、他市や未確認条件に船橋の値を使わず、当該給与点の実支払額を優先する",()=>{
  const sponsor={...contract("regular"),workRegion:"chiba"},partner=contract("under20");
  expect(calc(sponsor,partner,600,130,{...funabashi,residence:"other"}).known).toBe(false);
  expect(calc(sponsor,partner,600,130,{residence:"funabashi"}).known).toBe(false);
  const missingWorkplace=calc({...sponsor,workRegion:undefined},partner,600,0,funabashi);
  expect(missingWorkplace.head).toMatchObject({status:"undetermined",social:null});
  const at=calc(sponsor,{...partner,currentNationalYen:300000,previousNationalYen:200000},
    600,130,{...funabashi,measuredAt:{headWan:600,spouseWan:130}});
  expect(at.known).toBe(true);
  expect(at.spouse).toMatchObject({social:300000,prevSocial:200000,current:{nationalMethod:"entered"}});
  expect(at.regionalEstimates.current).toBe(null);
  expect(at.head.current.payroll.workRegion).toBe("chiba");
  const away=calc(sponsor,{...partner,currentNationalYen:300000,previousNationalYen:200000},
    600,131,{...funabashi,measuredAt:{headWan:600,spouseWan:130}});
  expect(away.spouse.current.nationalMethod).toBe("funabashi-estimate");
});

test("国保加入児がどの親に伴うのか未確定な点は0円でつながない",()=>{
  const bad=calc(contract("under20"),contract("under20"),600,130,funabashi);
  expect(bad.known).toBe(false);
  expect(bad.regionalEstimates.current.reasons[0]).toMatch(/両親とも国保/);
  const kidsInNhi={...funabashi,nationalEstimate:{...funabashi.nationalEstimate,children:[{age:10,national:true}]}};
  const noNationalAdult=calc(contract("regular"),contract("regular"),600,600,kidsInNhi);
  expect(noNationalAdult.known).toBe(false);
  expect(noNationalAdult.regionalEstimates.current.reasons[0]).toMatch(/子どもだけ/);
});
