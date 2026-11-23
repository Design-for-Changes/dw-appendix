import {buildSalaryGraphDataset} from "./salaryGraphDataset.js";
import * as revisionEngine from "./revisionEngine.js";
import {buildSalarySurfaceGrid} from "./salarySurfaceGrid.js";
import {buildSalaryDecisionMap,decisionCodes} from "./salaryDecisionMap.js";
import {buildDisabilityDifferenceSurface,createDisabilityIncomeComparison} from "./disabilityIncomeDifference.js";
import {UNKNOWN_PLANE_NET_YEN} from "./salaryPlaneRecovery.js";
import "../pages/salarySurface.worker.js";

const {createRevisionCalculator}=revisionEngine;
const normal={age:8,tccaGrade:"not",taxStatus:"none",welfareEligible:false,serviceUser:false,serviceAmountYen:0,
  taxDependentOf:"highest-salary",maintainedBy:null};
const inputs={protocol:"paper-2029",serviceAmountYen:0,roles:{allowanceRecipient:"highest-salary",welfareMaintainer:"both",
  spouseDeductionClaimant:"head"},children:[{...normal,tccaGrade:"1",taxStatus:"special",welfareEligible:true,serviceUser:true,serviceAmountYen:20000}]};

test.each([[inputs,2],[{...inputs,children:[normal]},1]])("各世帯の全評価点は重複せず、原点を評価しない", (h,count)=>{
  const spies=[];
  const createCalculator=config=>{
    const evaluate=jest.fn(createRevisionCalculator(config).evaluate);spies.push(evaluate);return {evaluate};
  };
  const progress=jest.fn(),r=buildSalaryGraphDataset(h,{maxSalaryWan:7,createCalculator,onProgress:progress});
  expect(spies).toHaveLength(count);
  for(const spy of spies){
    expect(spy).toHaveBeenCalledTimes(63);
    expect(new Set(spy.mock.calls.map(([x,y])=>x+","+y)).size).toBe(63);
    expect(spy).not.toHaveBeenCalledWith(0,0);
  }
  expect(r.grid.netYen[0]).toBe(UNKNOWN_PLANE_NET_YEN);
  expect(r.grid.differenceYen[0]).toBe(UNKNOWN_PLANE_NET_YEN);
  expect(r.grid.decisionCodes[0]).toBe(0);
  expect(progress).toHaveBeenLastCalledWith(64,64);
});

test.each([
  ["paper-2029",undefined,true],["paper-2029","none",true],
  ["paper-2029","head",false],["paper-2029","spouse",false],["legacy-v2","head",false],["v3","head",false],
])("%s 配偶者控除 %s: 支給・税・回復の境界を含む両軸で全点独立計算と同一",(protocol,filing,symmetric)=>{
  // 1点ずつ実在の給与へ写像し、大格子の主要な判定境界・片働き・同給点を小さな直積に収める。
  const wages=[0,123,360,600,781,782,904,906,907,937,1500],n=wages.length;
  const household={...inputs,protocol,roles:{spouseDeductionClaimant:filing},
    children:[{...inputs.children[0],taxDependentOf:"head"}, {...normal,age:16,taxDependentOf:"spouse"}]};
  const original=createRevisionCalculator,seen=[];
  const direct=config=>{
    const calc=original(config);
    return {evaluate:(x,y)=>calc.evaluate(wages[x],wages[y]),
      evaluateGraphPoint(){throw new Error("外部計算器にはモデル固有の省略を適用しない");}};
  };
  const range={maxSalaryWan:n-1},expectedProgress=[],actualProgress=[];
  const expected=buildSalaryGraphDataset(household,{...range,createCalculator:direct,
    onProgress:(...p)=>expectedProgress.push(p)});
  // 組込計算器でだけ、論文条件で対称な家族の上三角（対角は含み原点を除く）で評価が足りる。
  const instrumented=jest.spyOn(revisionEngine,"createRevisionCalculator").mockImplementation(config=>{
    const calc=original(config),calls=[];seen.push(calls);
    const wrap=fn=>(x,y)=>{calls.push([x,y]);return fn(wages[x],wages[y]);};
    return {evaluate:wrap(calc.evaluate),...(calc.evaluateGraphPoint?{evaluateGraphPoint:wrap(calc.evaluateGraphPoint)}:{})};
  });
  try {
    const actual=buildSalaryGraphDataset(household,{...range,onProgress:(...p)=>actualProgress.push(p)});
    expect(actual).toEqual(expected); // 円額、欠測、極値の代表点/件数、図の各線分と順序を含む。
    expect(actualProgress).toEqual(expectedProgress);
    expect(seen).toHaveLength(2);
    for(const calls of seen){
      expect(calls).toHaveLength(symmetric?n*(n+1)/2-1:n*n-1);
      expect(calls).not.toContainEqual([0,0]);
      if(symmetric)expect(calls.every(([x,y])=>x>=y)).toBe(true);
    }
    if(protocol==="paper-2029" && (filing==="head" || filing==="spouse")){
      expect(actual.grid.netYen.some((v,i)=>v!==actual.grid.netYen[(i%n)*n+Math.floor(i/n)])).toBe(true);
    }
  } finally {instrumented.mockRestore();}
});

test("将来同じ制度区分に複数の実額があっても、反対側の異なる年額・境界を取り違えない",()=>{
  const family={...inputs,roles:{}},range={maxSalaryWan:4},calls=[];
  const varied=config=>{
    const calc=createRevisionCalculator(config);
    return {evaluate(x,y){
      calls.push([x,y]);
      const p=calc.evaluate(x,y),extra=(x+y)%2;
      // 両親に対称で上限区分は不変だが、同一区分に0円・1円の負担差を生じさせる。
      return {...p,studyDisposableWan:(Math.round(p.studyDisposableWan*10000)-extra)/10000,
        details:{...p.details,service:{...p.details.service,annual:p.details.service.annual+extra}}};
    }};
  };
  const expected=buildSalaryGraphDataset(family,{...range,createCalculator:varied});calls.length=0;
  const instrumented=jest.spyOn(revisionEngine,"createRevisionCalculator").mockImplementation(varied);
  try {
    expect(buildSalaryGraphDataset(family,range)).toEqual(expected);
    expect(calls.some(([x,y])=>x<y)).toBe(true);
  } finally {instrumented.mockRestore();}
});

test("給与点を児福停止境界のまわりに置き、共有格子・独立計算の3表示・下落と初回回復を照合する",()=>{
  // 小格子の効率を保ちつつ、実在する906→907→937万円の境界を比較する。
  const range={maxSalaryWan:36},shift=calc=>({evaluate:(x,y)=>calc.evaluate(x+904,y+600)});
  const createCalculator=config=>shift(createRevisionCalculator(config));
  const r=buildSalaryGraphDataset(inputs,{...range,createCalculator}),calc=createCalculator(inputs);
  const cmp=shift(createDisabilityIncomeComparison(inputs)),map=buildSalaryDecisionMap(calc,range);
  expect(r.map.layers).toEqual(map.layers);
  expect(r.map.validCount).toBe(map.validCount);
  expect(r.income).toEqual(buildSalarySurfaceGrid(calc,range));
  expect(r.comparison).toEqual(buildDisabilityDifferenceSurface(cmp,range));
  for(const [x,y] of [[1,0],[2,0],[3,0],[33,0],[12,32]]){
    const idx=y*r.grid.width+x,p=calc.evaluate(x,y);
    expect(r.grid.netYen[idx]).toBe(Math.round(p.studyDisposableWan*10000));
    expect(r.grid.differenceYen[idx]).toBe(cmp.evaluate(x,y).differenceYen);
    expect(r.grid.decisionCodes[idx]).toBe(decisionCodes(p));
  }
  const head=r.map.outcomeLines.head,drop=head.drop.findIndex(s=>s.join(",")==="2.5,0,2.5,0.5");
  expect(drop).toBeGreaterThanOrEqual(0);expect(head.dropMasks[drop]).toBe(2);
  const recovery=head.recoveryDropIndex.indexOf(drop);
  expect(recovery).toBeGreaterThanOrEqual(0);
  expect(head.recovery[recovery]).toEqual([32.5,0,32.5,.5]);
});

test("実世帯だけ未算定なら全図で欠測、対照世帯だけ未算定なら実世帯の収支・判定を消さない",()=>{
  const createCalculator=config=>{
    const real=createRevisionCalculator(config),isBaseline=config.children[0].taxStatus==="none";
    return {evaluate(x,y){
      const absent=isBaseline?(x===1&&y===3):(x===2&&y===2);
      return absent?{status:"insufficient",reasons:["この条件の金額が得られない"]}:real.evaluate(x,y);
    }};
  };
  const {grid,income,comparison,map}=buildSalaryGraphDataset(inputs,{createCalculator,maxSalaryWan:4});
  expect([income.validCount,map.validCount,comparison.validCount]).toEqual([23,23,22]);
  const gap=2+2*grid.width,baselineGap=1+3*grid.width;
  expect([grid.netYen[gap],grid.differenceYen[gap],grid.differenceYen[baselineGap]]).toEqual(Array(3).fill(UNKNOWN_PLANE_NET_YEN));
  expect(grid.decisionCodes[gap]).toBe(0);expect(grid.decisionCodes[baselineGap]).toBeGreaterThan(0);
  expect(income.heights[gap]).toBeNaN();expect(Number.isFinite(income.heights[baselineGap])).toBe(true);
  expect(comparison.heights[baselineGap]).toBeNaN();
});

test("共通Workerは格子と各図に必要な描画配列を一度だけ転送し、差額に3D形状を作らない",()=>{
  const saved=globalThis.postMessage;
  try{
    globalThis.postMessage=jest.fn();
    globalThis.onmessage({data:{type:"household-dataset",inputs,maxSalaryWan:4}});
    const calls=globalThis.postMessage.mock.calls, [result,buffers]=calls[calls.length-1];
    expect(result.type).toBe("complete");
    const {income,comparison,grid}=result;
    expect(new Set(buffers).size).toBe(buffers.length);
    [income.heights,comparison.heights,grid.netYen,grid.differenceYen,grid.decisionCodes,comparison.heatmapPixels,
      income.meshIndices].forEach(a=>expect(buffers).toContain(a.buffer));
    expect(comparison.meshIndices).toBeUndefined();
    expect(comparison.barBins).toBeUndefined();
    expect(calls.filter(([msg])=>msg.type==="complete")).toHaveLength(1);
  } finally {globalThis.postMessage=saved;}
});
