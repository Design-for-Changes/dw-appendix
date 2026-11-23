import React from "react";
import {fireEvent,render,screen,within} from "@testing-library/react";
import IncomeSectionChart from "./IncomeSectionChart";

const event={beforeWan:3,afterWan:4,beforeYen:130000,afterYen:75000,dropYen:55000,
  systems:["N01-1","N01-2"],retreatAtWan:1,retreatWan:3,recoveryAtWan:6,recoveryWan:2,interveningDrops:1};
const anotherDrop={beforeWan:4,afterWan:5,beforeYen:75000,afterYen:70000,dropYen:5000,systems:["N02/N03"],
  retreatAtWan:1,retreatWan:4,recoveryAtWan:6,recoveryWan:1,interveningDrops:0};
const nondrop={beforeWan:5,afterWan:6,beforeYen:70000,afterYen:131000,dropYen:0,systems:["N02/N03"],
  retreatAtWan:null,retreatWan:null,recoveryAtWan:null,recoveryWan:null,interveningDrops:0};
const section={axis:"head",fixedWan:600,maxSalaryWan:7,points:[null,70000,85000,130000,75000,70000,131000,145000],
  events:[event,anotherDrop,nondrop]};

test("断面の横軸は動かす親の給与、縦軸は可処分所得。表と図から同じ境界を選べる",()=>{
  const pick=jest.fn();
  const {container,rerender}=render(<IncomeSectionChart section={section} onSelectEvent={pick}/>);
  expect(screen.getByText("配偶者の年間給与：600万円（固定）")).toBeVisible();
  expect(screen.getByRole("img",{name:/横軸 世帯主の年間給与.*縦軸 世帯の可処分所得/})).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button",{name:"3 → 4"}));
  fireEvent.click(container.querySelector('[data-event-salary="4"]'));
  expect(pick.mock.calls).toEqual([[4],[4]]);
  rerender(<IncomeSectionChart section={section} selectedAfterWan={4} onSelectEvent={pick}/>);
  const row=screen.getByRole("button",{name:"3 → 4",pressed:true}).closest("tr");
  expect(within(row).getByText("特児")).toBeInTheDocument();
  expect(within(row).getByText("児福")).toBeInTheDocument();
  expect(within(row).getByText("55,000")).toBeInTheDocument();
  expect(screen.getByText("下落なし")).toBeVisible();
  const detail=screen.getByRole("img",{name:/選択した切替点の詳細/});
  const coordinates=id=>Array.from(detail.querySelector('[data-measure="'+id+'"] line').attributes).reduce((all,a)=>({...all,[a.name]:Number(a.value)}),{});
  const down=coordinates("drop"),left=coordinates("retreat"),right=coordinates("recovery");
  expect(down.y1).toBeLessThan(down.y2);expect(down.x1).toBe(down.x2);
  expect(left.x1).toBeGreaterThan(left.x2);expect(right.x1).toBeLessThan(right.x2);
  expect(left.x1).toBe(down.x2);expect(right.x1).toBe(down.x1);
  expect(left.y1).toBe(down.y2);expect(right.y1).toBe(down.y1);
  expect(screen.getByText(/回復前に、さらに1回/)).toBeVisible();
});

test("未到達は架空の座標や矢印にせず、欠測をまたいで線を結ばない",()=>{
  const s={...section,axis:"spouse",points:[20000,40000,null,130000,75000,90000,null,null],
    events:[{...event,retreatAtWan:null,retreatWan:null,recoveryAtWan:null,recoveryWan:null,interveningDrops:0}]};
  render(<IncomeSectionChart section={s} selectedAfterWan={4} onSelectEvent={()=>{}}/>);
  expect(screen.getByText("世帯主の年間給与：600万円（固定）")).toBeVisible();
  const overview=screen.getByRole("img",{name:/給与と可処分所得の断面：横軸 配偶者/});
  expect(overview.querySelector('[data-series="net"]').getAttribute("d").match(/M/g)).toHaveLength(2);
  expect(screen.getByRole("cell",{name:"未回復"})).toBeInTheDocument();
  expect(screen.getByRole("cell",{name:"該当点なし"})).toBeInTheDocument();
  const detail=screen.getByRole("img",{name:/選択した切替点の詳細/});
  expect(detail.querySelector('[data-measure="retreat"]')).toBeNull();
  expect(detail.querySelector('[data-measure="recovery"]')).toBeNull();
});

test("対象制度の切替えがない世帯の断面も描く",()=>{
  render(<IncomeSectionChart section={{...section,events:[]}} onSelectEvent={()=>{}}/>);
  expect(screen.getByRole("img")).toBeInTheDocument();
  expect(screen.getByText("この断面では対象制度の切替えはありません。")).toBeVisible();
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
});
