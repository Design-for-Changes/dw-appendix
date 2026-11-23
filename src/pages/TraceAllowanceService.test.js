import {render,screen,within} from "@testing-library/react";
import {createRevisionCalculator} from "../calc/revisionEngine";
import TraceAllowances, { TraceServiceBurden } from "./TraceAllowanceService";

const child=(age,extras={})=>({age,tccaGrade:"not",welfareEligible:false,taxStatus:"none",serviceUser:false,...extras});
const inputs={protocol:"paper-2029",serviceAmountYen:0,otherServiceMonthlyYen:2000,
  children:[child(4,{tccaGrade:"1",welfareEligible:true,taxStatus:"special",serviceUser:true,serviceAmountYen:9999}),
    child(17,{tccaGrade:"2",taxStatus:"ordinary",serviceUser:true,serviceAmountYen:2500}),
    child(2,{serviceUser:true,serviceAmountYen:1500})]};
const calc=createRevisionCalculator(inputs);
function cells(table,row) {
  return within(within(screen.getByRole("table",{name:table})).getByRole("rowheader",{name:row}).closest("tr")).getAllByRole("cell").map(c=>c.textContent);
}

test("親に扶養される無所得児の特児表では両親だけを所得判定し、児福表には児童本人の判定を残す",()=>{
  const point=calc.evaluate(600,400);
  render(<TraceAllowances point={point} inputs={inputs}/>);
  const t="特児", w="児福";
  expect(cells(t,"世帯主の扶養人数（限度額用）").slice(1)).toEqual(["子1（4歳）、子2（17歳）、子3（2歳）","3人"]);
  expect(cells(t,"世帯主の限度額").slice(1)).toEqual(["4,596,000 ＋ 380,000 × 3 ＋ 250,000 × 1","5,986,000円"]);
  expect(cells(t,"配偶者の限度額").slice(1)).toEqual(["扶養0人：6,287,000","6,287,000円"]);
  const tcca=within(screen.getByRole("table",{name:t}));
  expect(tcca.queryAllByRole("rowheader",{name:/^子\d.*(判定所得|限度額|停止判定)$/})).toHaveLength(0);
  expect(cells(t,"所得判定前の月額")[1]).toBe("子1（1級）58,450 ＋ 子2（2級）38,930 ＋ 子3（非該当）0");
  expect(cells(t,"世帯主の障害者控除（判定所得用）").slice(1)).toEqual(["270,000 × 1人 ＋ 400,000 × 1人","670,000円"]);
  expect(cells(t,"世帯主の判定所得")[1]).toBe("max(0, 4,360,000 − 100,000 − 80,000 − 0 − 670,000)");
  expect(cells(t,"特児の年額").slice(1)).toEqual(["97,380 × 12","1,168,560円"]);
  expect(cells(w,"子1（本人）の停止判定")[1]).toBe("0 > 3,758,000 か");
  const ward=within(screen.getByRole("table",{name:w}));
  expect(ward.queryByRole("rowheader",{name:/本人の配偶者|子\dの配偶者/})).not.toBeInTheDocument();
  point.details.benefits.welfareChildren.forEach((result,i)=>{
    expect(result.checks).toMatchObject([
      {role:"recipient",id:"child"+(i+1),incomeYen:0},
      {role:"maintainer",id:"head"},{role:"maintainer",id:"spouse"},
    ]);
  });
  // 3人の子がいても両親分は各1行ずつで、各人の扶養人数に基づく別々の限度額と比較する。
  for(const [parent,income,limit] of [["世帯主","3,510,000","6,962,000"],["配偶者","2,580,000","6,287,000"]]){
    const label="扶養義務者（"+parent+"）";
    expect(cells(w,label+"の判定所得")[2]).toBe(income+"円");
    expect(cells(w,label+"の限度額")[2]).toBe(limit+"円");
    expect(cells(w,label+"の停止判定").slice(1)).toEqual([income+" ≥ "+limit+" か","非該当（所得で停止せず）"]);
  }
  expect(cells(w,"児福の年額")[2]).toBe("198,720円");
  expect(cells(w,"子2の年額")[1]).toContain("障害要件：非該当、所得停止：なし");
});

test("出生順と3～5歳無償、複数利用児の同一上限、軽減と最終負担を実数で示す",()=>{
  const point=calc.evaluate(600,0);
  render(<><TraceAllowances point={point} inputs={inputs}/><TraceServiceBurden point={point} inputs={inputs}/></>);
  const a="児童手当", s="合算対象サービスの利用者負担";
  expect(cells(a,"子2の児童手当月額").slice(1)).toEqual(["第1子・17歳","10,000円"]);
  expect(cells(a,"子3の児童手当月額").slice(1)).toEqual(["第3子・2歳","30,000円"]);
  expect(cells(a,"児童手当の年額").slice(1)).toEqual(["(10,000 ＋ 10,000 ＋ 30,000) × 12","600,000円"]);
  expect(cells(s,"子1の通所負担（月額・世帯上限適用前）").slice(1)).toEqual(["4歳・無償対象","0円"]);
  expect(cells(s,"合算対象の月額（上限前）").slice(1)).toEqual(["2,500 ＋ 1,500 ＋ 2,000","6,000円"]);
  expect(cells(s,"上限適用による軽減相当額（月）").slice(1)).toEqual(["max(0, 6,000 − 4,600)","1,400円"]);
  expect(cells(s,"上限適用後の月額自己負担").slice(1)).toEqual(["min(6,000, 4,600)","4,600円"]);
  expect(cells(s,"合算対象サービスの利用者負担の年額")[2]).toBe("55,200円");
});

test("世帯主の配偶者が高給与のときも児福は両親の限度額を個別に照合し、原点は対象外",()=>{
  const {rerender}=render(<TraceAllowances point={calc.evaluate(200,1500)} inputs={inputs}/>);
  expect(cells("特児","配偶者（受給資格者）の停止判定")[2]).toBe("該当（所得で停止）");
  expect(cells("児福","扶養義務者（配偶者）の停止判定")[2]).toBe("該当（所得で停止）");
  expect(cells("児福","扶養義務者（世帯主）の停止判定")[2]).toBe("非該当（所得で停止せず）");
  expect(cells("児福","児福の年額")[2]).toBe("0円");
  rerender(<TraceAllowances point={calc.evaluate(0,0)} inputs={inputs}/>);
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
});

test("給与の低い親だけが限度額以上になる給与点でも児福は停止する",()=>{
  render(<TraceAllowances point={calc.evaluate(900,890)} inputs={inputs}/>);
  const w="児福";
  expect(cells(w,"扶養義務者（世帯主）の停止判定").slice(1)).toEqual(["6,200,000 ≥ 6,962,000 か","非該当（所得で停止せず）"]);
  expect(cells(w,"扶養義務者（配偶者）の停止判定").slice(1)).toEqual(["6,770,000 ≥ 6,287,000 か","該当（所得で停止）"]);
  expect(cells(w,"児福の年額")[2]).toBe("0円");
});

test.each([
  [600,400,"世帯主","配偶者",1,"4,976,000円"],
  [600,0,"世帯主","配偶者",2,"5,356,000円"],
  [400,600,"配偶者","世帯主",1,"4,976,000円"],
  [0,600,"配偶者","世帯主",2,"5,356,000円"],
])("特児の点P（給与 %i・%i 万円）：扶養人数の内訳と障害者控除額を別々に表示する",(head,spouse,claimant,partner,count,limit)=>{
  const {rerender}=render(null);
  const t="特児";
  for(const [taxStatus,deduction,income] of [["none","0円","4,180,000円"],["ordinary","270,000円","3,910,000円"],["special","400,000円","3,780,000円"]]){
    const modelInputs={protocol:"paper-2029",serviceAmountYen:0,children:[child(8,{tccaGrade:"1",taxStatus})]};
    const point=createRevisionCalculator(modelInputs).evaluate(head,spouse);
    rerender(<TraceAllowances point={point} inputs={modelInputs}/>);
    const persons="子1（8歳）"+(count===2?"、"+partner+"（同一生計配偶者）":"");
    expect(cells(t,claimant+"の扶養人数（限度額用）").slice(1)).toEqual([persons,count+"人"]);
    expect(cells(t,claimant+"の限度額")[2]).toBe(limit);
    expect(cells(t,claimant+"の障害者控除（判定所得用）")[2]).toBe(deduction);
    expect(cells(t,claimant+"の判定所得")[2]).toBe(income);
    expect(cells(t,partner+"の扶養人数（限度額用）").slice(1)).toEqual(["該当者なし","0人"]);
    expect(cells(t,partner+"の障害者控除（判定所得用）")[2]).toBe("0円");
  }
});
