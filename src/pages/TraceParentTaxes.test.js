import { fireEvent, render, screen, within } from "@testing-library/react";
import { createRevisionCalculator } from "../calc/revisionEngine";
import TraceParentTaxes from "./TraceParentTaxes";

const inputs = {protocol:"paper-2029", serviceAmountYen:0, children:[
  {age:17, tccaGrade:"2", welfareEligible:true, taxStatus:"special", serviceUser:false, taxDependentOf:"head"},
  {age:8, tccaGrade:"not", welfareEligible:false, taxStatus:"ordinary", serviceUser:false, taxDependentOf:"spouse"},
]};
function select(head, spouse, settings=inputs) {
  const point = createRevisionCalculator(settings).evaluate(head,spouse);
  render(<TraceParentTaxes point={point} inputs={settings}/>);
  for (const name of ["世帯主","配偶者"]) {
    fireEvent.click(screen.getByText(name+"の給与所得・所得税・住民税の計算式"));
  }
  return point;
}
function cells(parent, item) {
  const table = screen.getByRole("table", {name:parent+"の税額計算（円／年）"});
  return within(within(table).getByRole("row", {name:name=>name.startsWith(item+" ")})).getAllByRole("cell");
}
const yen = a => a.toLocaleString("ja-JP")+"円";

test("法定の減額は人的調整控除とは別に表示し、市・県の按分は減額後に行う",()=>{
  select(222,0,{...inputs,children:[{...inputs.children[0],age:10,tccaGrade:"not",welfareEligible:false,taxStatus:"none"}]});
  expect(cells("世帯主","所得割（市・県計、減額前）")[2]).toHaveTextContent("31,200円");
  expect(cells("世帯主","所得割（非課税限度額による減額後）")[1]).toHaveTextContent("min(31,200, 1,474,000 − 1,470,000)");
  expect(cells("世帯主","市民税所得割")[2]).toHaveTextContent("2,400円");
  expect(cells("世帯主","県民税所得割")[2]).toHaveTextContent("1,600円");
  expect(cells("世帯主","住民税等（森林環境税込み）")[2]).toHaveTextContent("9,000円");
});

test("高給与・配偶者特別控除：控除の代入、国税端数、市県別の課税額を各人の実額と照合", () => {
  const p = select(900,190);
  const h = p.details.headTax;
  expect(cells("世帯主","給与所得（所得金額調整控除前）")[1]).toHaveTextContent("9,000,000 − 1,950,000");
  expect(cells("世帯主","所得金額調整控除")[2]).toHaveTextContent("50,000円");
  expect(cells("世帯主","給与所得（調整後）")[2]).toHaveTextContent("7,000,000円");
  expect(cells("世帯主","扶養控除・障害者控除")[2]).toHaveTextContent("所得税 1,130,000円／住民税 860,000円");
  expect(cells("配偶者","扶養控除・障害者控除")[2]).toHaveTextContent("所得税 270,000円／住民税 260,000円");
  expect(cells("世帯主","配偶者控除・配偶者特別控除")[1]).toHaveTextContent("1,210,000（120万円超125万円以下）：配偶者特別控除");
  expect(cells("世帯主","配偶者控除・配偶者特別控除")[2]).toHaveTextContent("所得税 110,000円／住民税 110,000円");
  expect(cells("世帯主","所得税の課税所得")[1]).toHaveTextContent("7,000,000 − 1,389,600 − 1,130,000 − 110,000 − 620,000");
  expect(cells("世帯主","基準所得税額")[1]).toHaveTextContent("3,750,000 × 20% − 427,500");
  expect(cells("世帯主","所得税等（年調年税額）")[1]).toHaveTextContent("100 × ⌊322,500 × 1.021 ÷ 100⌋");
  expect(cells("世帯主","所得税等（年調年税額）")[2]).toHaveTextContent("329,200円");
  expect(cells("世帯主","住民税の調整控除")[2]).toHaveTextContent("2,500円");
  expect(cells("世帯主","市民税所得割")[2]).toHaveTextContent("251,100円");
  expect(cells("世帯主","県民税所得割")[2]).toHaveTextContent("167,400円");
  expect(cells("世帯主","住民税等（森林環境税込み）")[1]).toHaveTextContent("251,100 + 167,400 + 4,000 + 1,000");
  expect(cells("世帯主","この親の税負担")[2]).toHaveTextContent(yen(h.totalTaxYen));
  expect(cells("配偶者","この親の税負担")[2]).toHaveTextContent(yen(p.details.spouseTax.totalTaxYen));
});

test("法定表の定額帯を使い、税額ゼロでも控除・非課税根拠を表示する", () => {
  const point = select(203,100);
  expect(cells("世帯主","給与所得（所得金額調整控除前）")[1]).toHaveTextContent("2,030,000 → 1,338,000");
  expect(cells("配偶者","基礎控除")[2]).toHaveTextContent("所得税 990,000円／住民税 430,000円");
  expect(cells("世帯主","配偶者控除・配偶者特別控除")[1]).toHaveTextContent("62万円以下）：配偶者控除");
  expect(cells("世帯主","住民税の非課税判定人数")[2]).toHaveTextContent("2人");
  expect(cells("世帯主","均等割等の非課税判定")[1]).toHaveTextContent("350,000 × (2 + 1) + 310,000 = 1,360,000；所得 1,338,000");
  expect(cells("世帯主","所得割の非課税判定")[2]).toHaveTextContent("非課税");
  expect(cells("世帯主","住民税の調整控除")[1]).toHaveTextContent("所得割非課税 → 0");
  expect(cells("世帯主","この親の税負担")[2]).toHaveTextContent(yen(point.details.headTax.totalTaxYen));
});

test("4千円刻みの給与表と給与控除額を混同せず、所得割の200万円超の調整控除にも数値を代入", () => {
  const point = select(601,600);
  expect(cells("世帯主","給与所得（所得金額調整控除前）")[1]).toHaveTextContent("⌊6,010,000 ÷ 4,000⌋ × 3,200 − 440,000");
  expect(cells("世帯主","給与所得控除相当額")[2]).toHaveTextContent("1,643,600円");
  expect(cells("世帯主","住民税の調整控除")[1]).toHaveTextContent("max(2,500, [320,000 − (2,149,000 − 2,000,000)] × 5%)");
  expect(cells("世帯主","住民税の調整控除")[2]).toHaveTextContent("8,550円");
  expect(cells("世帯主","この親の税負担")[2]).toHaveTextContent(yen(point.details.headTax.totalTaxYen));
});

test("原点を0円の課税明細として表示しない", () => {
  const point = createRevisionCalculator(inputs).evaluate(0,0);
  render(<TraceParentTaxes point={point} inputs={inputs}/>);
  expect(screen.getByText(/明細がありません/)).toBeVisible();
  expect(screen.queryByRole("table", {hidden:true})).not.toBeInTheDocument();
});

test.each([
  [164, "62万円超95万円以下", 380000], [165, "95万円超100万円以下", 360000],
  [169, "95万円超100万円以下", 360000], [170, "100万円超105万円以下", 310000],
])("配偶者給与%i万円で95万・100万所得境界に対応する税表の行を使う", (salary,band,amount) => {
  const point = select(650,salary);
  const row = cells("世帯主","配偶者控除・配偶者特別控除");
  expect(row[1]).toHaveTextContent(band);
  expect(point.details.headTax.spouseDeduction.current.it).toBe(amount);
  expect(row[2]).toHaveTextContent("所得税 "+yen(amount));
});
