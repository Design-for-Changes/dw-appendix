import {createRevisionCalculator} from './revisionEngine.js';
import {createDisabilityIncomeComparison} from './disabilityIncomeDifference.js';

const child=(age, fee=0, uses=fee>0)=>({age,serviceAmountYen:fee,serviceUser:uses,tccaGrade:'not',welfareEligible:false,taxStatus:'none'});
const model=children=>({protocol:'paper-2029',children,serviceAmountYen:0});

// https://www.cfa.go.jp/policies/kokoseido/jidouteate/annai/
// 年齢を固定した12か月換算。全員が0～17歳のため第3子は最年少者の1人。
// 一覧の並べ替えに依存せず、通常月額の総和から第3子だけを置き換えて照合する。
test('児童手当：1～3児の全年齢・全入力順（6,174通り）。出生順位と3歳の境界を区別',()=>{
  const monthly=age=>age<3?15000:10000;
  let checked=0;
  function check(ages){
    let total=ages.reduce((s,n)=>s+monthly(n),0);
    if(ages.length===3)total+=30000-monthly(Math.min(...ages));
    const c=createRevisionCalculator(model(ages.map(age=>child(age))));
    for(const xy of [[1,0],[1500,1500]]){
      const p=c.evaluate(...xy);
      if(p.details.benefits.childAllowance!==total*12)throw Error(`児童手当の不一致：年齢=${ages} 給与=${xy}`);
    }
    checked++;
    if(ages.length<3)for(let next=0;next<=17;next++)check([...ages,next]);
  }
  for(let n=0;n<=17;n++)check([n]);
  expect(checked).toBe(6174);
});

// https://www.cfa.go.jp/policies/shougaijishien/shisaku/futan/
// https://www.cfa.go.jp/policies/shougaijishien/shisaku/mushouka/
// 同じ保護者・同じ月、入力は多子軽減等適用後の対象負担。未利用・無償の児童には課さない。
test.each([[2,12000],[3,0],[4,0],[5,0],[6,12000],[15,12000],[16,12000],[17,12000]])(
  '通所：年度当初年齢%i歳。非課税／一般1／一般2の最終負担をGと対照世帯との差の双方で照合', (age,raw)=>{
    const hh=model([child(age,12000),child(4,37199),child(16,28900,false)]);
    const g=createRevisionCalculator(hh),j=createDisabilityIncomeComparison(hh);
    for(const [x,y,cap] of [[1,0,0],[400,400,4600],[1500,1500,37200]]){
      const expected=Math.min(raw,cap)*12;
      expect(g.evaluate(x,y).details.service).toMatchObject({dayMonthlyBeforeCapYen:raw,householdCapYen:cap,annual:expected});
      expect(j.evaluate(x,y)).toMatchObject({taxSavingYen:0,insuranceSavingYen:0,extraBenefitsYen:0,extraServiceYen:expected,differenceYen:-expected||0});
    }
  });

test.each([0,1,4599,4600,4601,37199,37200,37201,74400])('同月に2児で利用：合計%i円に世帯上限を一度だけ適用',raw=>{
  const first=Math.min(37200,raw),hh=model([child(8,first),child(9,raw-first)]);
  const g=createRevisionCalculator(hh),j=createDisabilityIncomeComparison(hh);
  for(const [x,y,cap] of [[1,0,0],[400,400,4600],[1500,1500,37200]]){
    const expected=Math.min(raw,cap)*12;
    expect(g.evaluate(x,y).details.service.annual).toBe(expected);
    expect(j.evaluate(x,y).differenceYen).toBe(0-expected);
  }
});
