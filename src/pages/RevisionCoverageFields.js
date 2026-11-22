const adults = [["head", "世帯主"], ["spouse", "配偶者"]];
const years = [["current", "当年"], ["previous", "前年"]];
const blankAmounts = {currentNationalYen: null, previousNationalYen: null};
export const initialInsurance = () => ({
  residence:"funabashi",
  head:{mode:"contract", workPattern:"regular", workRegion:"chiba", employmentInsurance:true, ...blankAmounts},
  spouse:{mode:"contract", workPattern:"under20", workRegion:"chiba", employmentInsurance:false, ...blankAmounts},
});
const patterns = {regular:"週30時間以上・所定労働日数も通常の4分の3以上", "short-covered":"4分の3基準を満たさず週20時間以上・短時間労働者の適用事業所", "short-outside":"4分の3基準を満たさず週20時間以上・短時間労働者の適用事業所でない", under20:"4分の3基準を満たさず週20時間未満"};
const statusLabel = {employee: "勤務先の健康保険・厚生年金", dependent: "健康保険の被扶養者・国民年金第3号", national: "国保・国民年金", undetermined: "未確定"};
const money = (v) => Number.isFinite(v) ? v.toLocaleString("ja-JP") + "円" : "未算定";

/** 実額は入力時点の世帯・給与ペアだけに結び付ける。空欄・別給与の既入力額を0円にしない。 */
export function clearCoverageAmounts(insurance) {
  const {head, spouse} = insurance;
  return {residence:insurance.residence, head:{...head, ...blankAmounts}, spouse:{...spouse, ...blankAmounts}};
}

export function CoverageFields({insurance, setInsurance, salary, valid, children}) {
  const possibleNational = adults.filter(([id]) => ["outside","contract"].includes(insurance[id].mode));
  const here = valid && insurance.measuredAt?.headWan === salary[0] && insurance.measuredAt?.spouseWan === salary[1];
  const parse = (text) => text === "" ? null : Number(text);
  function setConfig(id, patch) {
    const cleared = clearCoverageAmounts(insurance);
    setInsurance({...cleared, [id]: {...cleared[id], ...patch}});
  }
  function setAmount(id, patch) {
    if (!valid) return;
    const base = here ? insurance : {...clearCoverageAmounts(insurance), nationalEstimate:insurance.nationalEstimate};
    const nationalHealth=base.nationalHealth ?? {payer:"",currentYen:null,previousYen:null};
    setInsurance({...base, nationalHealth, measuredAt: {headWan:salary[0], spouseWan:salary[1]}, [id]:{...(id === "nationalHealth" ? nationalHealth : base[id]), ...patch}});
  }
  return <fieldset><legend>夫婦の社会保険</legend>
    <p>初期条件では夫婦・子どもは船橋市在住、就労する親の勤務先も船橋市とし、勤務先加入時は協会けんぽ千葉支部を用います。世帯主は週30時間以上かつ所定労働日数も通常の4分の3以上、配偶者は週20時間未満です（通常週40時間、年52週）。勤務条件による判定では給与0円を無職とします。</p>
    <label>世帯の住所地（国保の地域別試算）<select value={insurance.residence} onChange={e=>setInsurance({...clearCoverageAmounts(insurance),residence:e.target.value})}><option value="unspecified">地域別の試算をしない</option><option value="funabashi">千葉県船橋市</option></select></label>
    <details><summary>勤務条件・加入区分を変更</summary>
    {adults.map(([id,name]) => <div className="revision-fields" key={id}>
      <label>{name}の勤務地・協会けんぽ支部<select value={insurance[id].workRegion} onChange={e=>setConfig(id,{workRegion:e.target.value})}><option value="chiba">船橋市（千葉支部）</option><option value="tokyo">東京都内（東京支部）</option></select></label>
      <label>{name}の勤務先の健康保険・厚生年金<select value={insurance[id].mode} onChange={e=>setConfig(id,{mode:e.target.value})}>
        <option value="contract">勤務条件から判定</option><option value="employee">本人加入と指定</option><option value="outside">勤務先未加入と指定</option><option value="unknown">未確定</option></select></label>
      {insurance[id].mode === "contract" ? <label>{name}の勤務条件<select value={insurance[id].workPattern ?? "regular"} onChange={e=>setConfig(id,{workPattern:e.target.value})}>{Object.entries(patterns).map(([key,label])=><option value={key} key={key}>{label}</option>)}</select></label>
      : insurance[id].mode!=="unknown" && <label className="revision-check"><input type="checkbox" checked={insurance[id].employmentInsurance} onChange={e=>setConfig(id,{employmentInsurance:e.target.checked})}/>{name}は雇用保険に加入</label>}
    </div>)}
    <p>非学生・2か月を超える雇用見込みとし、各年11月の制度と各勤務地の最低賃金によって比較します。住所地と勤務地は別の条件です。勤務先未加入の親は、もう一方が勤務先加入で、本人の継続的な税込給与の見込額が年130万円未満かつ相手の年収の2分の1未満なら被扶養者と仮定します。税法上の給与所得額ではありません（両親45歳・同居、給与以外の認定対象収入なし）。個別認定が必要な場合は結論を出しません。</p>
    </details>
    {insurance.residence==="funabashi" && <NationalEstimateFields children={children} insurance={insurance} setInsurance={setInsurance}/>}
    {possibleNational.length>0 && <details><summary>国保・国民年金の支払額をこの給与点に入力</summary>
      <p>国保・国民年金に該当する年だけ入力します。年金は本人が払った本人分、国保は子どもの分も含めた世帯分を一度だけ記録し、実際に支払った親の控除に反映します。通知額等で確かめた金額を用い、未確認は空欄、確認済みの負担なしは0円とします。入力した金額を別の給与点には使い回しません。</p>
      {!valid && <p>先に有効な給与を入力してください。</p>}
      {insurance.measuredAt && !here && <p>登録済みの実額は世帯主{insurance.measuredAt.headWan}万円・配偶者{insurance.measuredAt.spouseWan}万円の点に限ります。別の点で入力を始めると置き換わります。</p>}
      {possibleNational.map(([id,name])=><div key={id} className="revision-fields">{years.map(([key,label])=>{
        const field=key+"NationalYen";
        return <label key={key}>{name}の{label}の国民年金支払額（円／年）<input type="number" min="0" step="1" disabled={!valid} value={(here && insurance[id][field] != null) ? insurance[id][field] : ""} onChange={e=>setAmount(id,{[field]:parse(e.target.value)})}/></label>;
      })}</div>)}
      <div className="revision-fields"><label>世帯の国保を支払う親<select disabled={!valid} value={(here && insurance.nationalHealth?.payer) || ""} onChange={e=>setAmount("nationalHealth",{payer:e.target.value})}><option value="">指定してください</option>{adults.map(([id,name])=><option value={id} key={id}>{name}</option>)}</select></label>
        {years.map(([key,label])=><label key={key}>世帯の{label}の国保支払額（円／年）<input type="number" min="0" step="1" disabled={!valid} value={here ? insurance.nationalHealth?.[key+"Yen"] ?? "" : ""} onChange={e=>setAmount("nationalHealth",{[key+"Yen"]:parse(e.target.value)})}/></label>)}</div>
    </details>}
    <p><a href="https://www.nenkin.go.jp/service/kounen/tekiyo/jigyosho/tanjikan.html">勤務先の加入要件（日本年金機構）</a> ・ <a href="https://www.nenkin.go.jp/oshirase/taisetu/jigyosho/2026/202605/0501.html">被扶養者の収入要件</a></p>
  </fieldset>;
}

function NationalEstimateFields({children,insurance,setInsurance}) {
  const profile=insurance.nationalEstimate ?? {confirmed:false,payer:"",children:children.map(c=>({age:c.age,national:false}))};
  const complete=["head","spouse"].includes(profile.payer) && profile.children.length===children.length && profile.children.every((c,i)=>c.age===children[i].age && typeof c.national==="boolean");
  const change=p=>setInsurance({...insurance,nationalEstimate:{...profile,confirmed:false,...p}});
  return <details><summary>船橋市の国保料を条件から推計する{profile.confirmed?"（使用中）":""}</summary>
    <p>実額の資料がない給与点で、市の保険料率に基づく推計値を使う選択肢です。住所は船橋市、前年から世帯・給与は同じ、各年度の4月1日年齢もモデル上固定し、通年加入・通常納付・給与以外の所得なしとします。保険料の特例免除・猶予等は設定しません。国民年金は該当する各親が本人分を払い、国保の世帯額は下で指定した親が払う想定です。</p>
    <div className="revision-fields"><label>推計する国保の支払者<select value={profile.payer} onChange={e=>change({payer:e.target.value})}><option value="">指定してください</option>{adults.map(([id,name])=><option value={id} key={id}>{name}</option>)}</select></label>
      {children.map((c,i)=><label key={i}>子ども{i+1}（{c.age}歳）の医療保険<select value={typeof profile.children[i]?.national==="boolean" ? profile.children[i].national ? "yes":"no" : ""} onChange={e=>change({children:children.map((v,j)=>({age:v.age,national:j===i ? e.target.value==="" ? null : e.target.value==="yes" : profile.children[j]?.national ?? null}))})}>
        <option value="">指定してください</option><option value="yes">船橋市国保に加入</option><option value="no">勤務先の健康保険の被扶養者</option></select></label>)}
    </div>
    <label className="revision-check"><input type="checkbox" disabled={!complete} checked={Boolean(profile.confirmed && complete)} onChange={e=>change({confirmed:e.target.checked})}/>上の条件を確認し、実額のない給与点では船橋市の推計を使う</label>
    <p>子どもは初期値では勤務先加入の親の被扶養者とし、加入先は自動で切り替えません。指定条件が成り立たない給与点は未算定です。届出・請求に使う金額ではありません。<a href="https://www.city.funabashi.lg.jp/kenkou/kokuho/002/p001880.html">船橋市の国民健康保険料</a></p>
  </details>;
}

/** 世帯合計だけでは税と社会保険上の扶養の違いが見えないので、入力給与点の個人別内訳も表示する。 */
export function AdultBreakdown({point}) {
  const kind = {ordinary:"配偶者控除",special:"配偶者特別控除",none:"適用なし"};
  const coverage = point.details?.coverage;
  if (!coverage) return null;
  return <div className="appendix-table-wrap"><table className="appendix-table"><caption>夫婦別の計算内訳（当年。通所負担の判定用所得割は前年所得による）</caption><thead><tr><th>項目</th><th>世帯主</th><th>配偶者</th></tr></thead><tbody>
  {[
    ["社会保険の区分",(p,c)=>statusLabel[c?.status] ?? "未確定"],
    ["前年条件での社会保険の区分",(p,c)=>statusLabel[c?.previousStatus] ?? "未確定"],
    ["本人の社会保険料",(p,c)=>money(c?.social)],
    ["国保・国民年金の算入方法（当年）",(p,c)=>c?.current?.nationalMethod==="funabashi-estimate" ? "船橋市の基準による推計" : c?.current?.nationalMethod==="entered" ? "入力額" : "―"],
    ["所得税の配偶者控除等（種類・控除額）",(p)=>p ? (kind[p.spouseDeduction?.current?.kind] ?? "―")+"・"+money(p.spouseDeductionITYen) : "未算定"],
    ["住民税の配偶者控除等（控除額）",(p)=>money(p?.spouseDeduction?.current?.lt)],
    ["所得税額",(p)=>money(p?.incomeTaxYen)],
    ["住民税額等（森林環境税込み）",(p)=>money(p?.residentTaxYen)],
    ["サービス判定用の市町村民税所得割額",(p)=>money(p?.serviceLevyYen)],
  ].map(([label,render])=><tr key={label}><th scope="row">{label}</th>{adults.map(([id,name])=><td data-label={name} key={id}>{render(point.details[id+"Tax"],coverage[id])}</td>)}</tr>)}
  </tbody></table></div>;
}
