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

test("特児は本人・配偶者・扶養義務者を別判定し、児福は児童本人の超過と親の以上を区別する",()=>{
  const point=calc.evaluate(600,400);
  render(<TraceAllowances point={point} inputs={inputs}/>);
  const t="特別児童扶養手当", w="障害児福祉手当";
  expect(cells(t,"世帯主の限度額").slice(1)).toEqual(["4,596,000 ＋ 380,000 × (3 ＋ 0) ＋ 250,000 × 1","5,986,000円"]);
  expect(cells(t,"配偶者の限度額").slice(1)).toEqual(["扶養0人：6,287,000","6,287,000円"]);
  expect(cells(t,"子3（扶養義務者）の停止判定")[1]).toBe("0 ≥ 6,287,000 か");
  expect(cells(t,"世帯主の判定所得")[1]).toBe("max(0, 4,360,000 − 100,000 − 80,000 − 0 − 270,000 × 1 − 400,000 × 1)");
  expect(cells(t,"特別児童扶養手当の年額").slice(1)).toEqual(["97,380 × 12","1,168,560円"]);
  expect(cells(w,"子1の判定：子1（本人）")[1]).toBe("0 > 3,758,000 か");
  expect(cells(w,"子1の判定：世帯主（生計維持者）")[1]).toBe("3,510,000 ≥ 6,962,000 か");
  expect(cells(w,"障害児福祉手当の年額")[2]).toBe("198,720円");
  expect(cells(w,"子2の年額")[1]).toContain("障害要件：非該当、所得停止：なし");
});

test("出生順と3～5歳無償、複数利用児の同一上限、軽減と最終負担を実数で示す",()=>{
  const point=calc.evaluate(600,0);
  render(<><TraceAllowances point={point} inputs={inputs}/><TraceServiceBurden point={point} inputs={inputs}/></>);
  const a="児童手当", s="サービス利用者負担";
  expect(cells(a,"子2の児童手当月額").slice(1)).toEqual(["第1子・17歳","10,000円"]);
  expect(cells(a,"子3の児童手当月額").slice(1)).toEqual(["第3子・2歳","30,000円"]);
  expect(cells(a,"児童手当の年額").slice(1)).toEqual(["(10,000 ＋ 10,000 ＋ 30,000) × 12","600,000円"]);
  expect(cells(s,"子1の通所負担（月・上限前）").slice(1)).toEqual(["4歳・無償対象","0円"]);
  expect(cells(s,"合算対象の月額（上限前）").slice(1)).toEqual(["2,500 ＋ 1,500 ＋ 2,000","6,000円"]);
  expect(cells(s,"上限適用による軽減相当額（月）").slice(1)).toEqual(["max(0, 6,000 − 4,600)","1,400円"]);
  expect(cells(s,"上限適用後の月額自己負担").slice(1)).toEqual(["min(6,000, 4,600)","4,600円"]);
  expect(cells(s,"サービス利用者負担の年額")[2]).toBe("55,200円");
});

test("配偶者が主たる生計維持者になる高給与点と対象外の原点",()=>{
  const {rerender}=render(<TraceAllowances point={calc.evaluate(200,1500)} inputs={inputs}/>);
  expect(cells("特別児童扶養手当","配偶者（受給資格者）の停止判定")[2]).toBe("該当（所得で停止）");
  expect(cells("障害児福祉手当","子1の判定：配偶者（生計維持者）")[2]).toBe("該当（所得で停止）");
  expect(cells("障害児福祉手当","障害児福祉手当の年額")[2]).toBe("0円");
  rerender(<TraceAllowances point={calc.evaluate(0,0)} inputs={inputs}/>);
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
});
