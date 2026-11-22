import {render,screen} from "@testing-library/react";
import {createRevisionCalculator} from "../calc/revisionEngine";
import SalaryBoundaryDetail,{readSalaryBoundary} from "./SalaryBoundaryDetail";
const model=createRevisionCalculator({protocol:"paper-2029",serviceAmountYen:37200,children:[
  {age:8,tccaGrade:"not",welfareEligible:false,taxStatus:"none",serviceUser:true,serviceAmountYen:37200}
]});
test("配偶者400万円：所得割が28万円を再び下回る世帯主給与点を前後の数値付きで表示する",()=>{
  const events=readSalaryBoundary(model,654,400,"N02/N03");
  expect(events.some(e=>e.axis==="head")).toBe(true);
  const head=events.find(e=>e.axis==="head");
  expect(head.changes).toHaveLength(1);
  expect(head.changes[0].before).toMatch(/37,200円.*281,300円/);
  expect(head.changes[0].after).toMatch(/4,600円.*278,700円/);
  render(<SalaryBoundaryDetail events={[head]}/>);
  expect(screen.getByText("世帯主 653→654万円・配偶者 400万円")).toBeVisible();
});
test("同じ世帯給与であっても通所の判定用所得割額と負担上限は同一ではない",()=>{
  const at=(h,s)=>model.evaluate(h,s).details.service;
  expect(at(1000,0)).toMatchObject({assessmentLevyYen:320000,householdCapYen:37200});
  expect(at(500,500)).toMatchObject({assessmentLevyYen:261400,householdCapYen:4600});
});
