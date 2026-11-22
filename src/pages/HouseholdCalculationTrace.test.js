import { render, screen } from "@testing-library/react";
import { createRevisionCalculator } from "../calc/revisionEngine";
import { healthGradeBandYen, employeeGradesFromAnnualPay } from "../calc/revisionPayroll";
import HouseholdCalculationTrace from "./HouseholdCalculationTrace";

const inputs={protocol:"paper-2029",serviceAmountYen:0,children:[
  {age:8,tccaGrade:"1",welfareEligible:true,taxStatus:"special",serviceUser:true,serviceAmountYen:10406}
]};
const calc=createRevisionCalculator(inputs);
const draw=(a,b)=><HouseholdCalculationTrace point={calc.evaluate(a,b)} inputs={inputs}/>;
const row=(caption,name)=>Array.from(screen.getByRole("table",{name:caption}).rows)
  .find(tr=>tr.cells[0].textContent===name);

test("社保の月額の端数処理、年換算、世帯合算までを円単位で追え、給与変更・対象外で前の式を残さない",()=>{
  const {rerender}=render(draw(360,120));
  const spouse="配偶者の社会保険料（本人負担）", total="世帯の可処分所得（円／年）";
  expect(row(spouse,"健康保険の標準報酬月額").cells[2]).toHaveTextContent("93,000 ≦ 1,200,000 ÷ 12 ＜ 101,000");
  expect(row(spouse,"健保・介護・子ども子育て支援金（月額）").cells[3]).toHaveTextContent("5,674円");
  expect(row(spouse,"厚生年金（月額）").cells[3]).toHaveTextContent("8,967円");
  expect(row(spouse,"雇用保険（月額）").cells[3]).toHaveTextContent("500円");
  expect(row(spouse,"本人保険料（年額）").cells[2]).toHaveTextContent("15,141 × 12");
  expect(row(total,"社会保険料").cells[2]).toHaveTextContent("555,840 ＋ 181,692");
  const finalRow=row(total,"世帯の可処分所得（試算対象分）");
  expect(finalRow.cells[2]).toHaveTextContent("4,800,000 − 60,100 − 737,532 ＋ (701,400 ＋ 198,720 ＋ 120,000) − 55,200");
  expect(finalRow.cells[3]).toHaveTextContent("4,967,288円");
  rerender(draw(200,0));
  expect(row(spouse,"加入判定").cells[3]).toHaveTextContent("被扶養者・第3号");
  expect(row(spouse,"本人保険料（年額）").cells[3]).toHaveTextContent("0円");
  expect(row(total,"世帯の可処分所得（試算対象分）").cells[3]).toHaveTextContent("2,705,348円");
  rerender(draw(0,0));
  expect(screen.queryByRole("region",{name:"計算式と内訳"})).toBeNull();
});

test("等級表の表示区間はすべての下限と上限直前で計算器の等級と一致する",()=>{
  for(let grade=1;grade<=50;grade++){
    const {lower,upper}=healthGradeBandYen(grade);
    expect(employeeGradesFromAnnualPay(Math.max(1,lower*12)).healthGrade).toBe(grade);
    if(upper!==null) expect(employeeGradesFromAnnualPay(upper*12-1).healthGrade).toBe(grade);
  }
});

test("収支合計を最初に示し、社保、税、各手当、サービス負担の順に全表を折りたたみなしで表示する",()=>{
  render(draw(360,120));
  const trace=screen.getByRole("region",{name:"計算式と内訳"});
  expect(trace.querySelector("details,summary")).toBeNull();
  expect(screen.getAllByRole("table").map(t=>t.caption.textContent)).toEqual([
    "世帯の可処分所得（円／年）","世帯主の社会保険料（本人負担）","配偶者の社会保険料（本人負担）",
    "世帯主の税額計算（円／年）","配偶者の税額計算（円／年）",
    "特別児童扶養手当","障害児福祉手当","児童手当","サービス利用者負担",
  ]);
  expect(trace.querySelector("tbody tr th")).toHaveTextContent("世帯の可処分所得（試算対象分）");
});

test("サービスの課税区分と月額負担：所得割0円でも均等割が課税なら上限0円にしない",()=>{
  const both={...inputs,children:[8,12].map(age=>({...inputs.children[0],age,serviceAmountYen:37200}))};
  const engine=createRevisionCalculator(both), renderAt=head=><HouseholdCalculationTrace point={engine.evaluate(head,0)} inputs={both}/>;
  const {rerender}=render(renderAt(255));
  const caption="サービス利用者負担";
  expect(row(caption,"世帯の判定用所得割").cells[3]).toHaveTextContent(/^0円$/);
  expect(row(caption,"世帯の月額上限").cells[2]).toHaveTextContent("世帯主：非課税、配偶者：非課税 → 非課税世帯");
  expect(row(caption,"合算対象の月額（上限前）").cells[2]).toHaveTextContent(/^37,200 ＋ 37,200$/);
  expect(row(caption,"上限適用後の月額自己負担").cells[3]).toHaveTextContent(/^0円$/);
  rerender(renderAt(256));
  expect(row(caption,"世帯の判定用所得割").cells[3]).toHaveTextContent(/^0円$/);
  expect(row(caption,"世帯の月額上限").cells[2]).toHaveTextContent("世帯主：課税（均等割のみ）、配偶者：非課税 → 課税世帯");
  expect(row(caption,"世帯の月額上限").cells[3]).toHaveTextContent(/^4,600円$/);
  expect(row(caption,"上限適用後の月額自己負担").cells[3]).toHaveTextContent(/^4,600円$/);
});
