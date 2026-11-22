import { createRevisionCalculator } from "./revisionEngine.js";
import { buildSalarySurfaceGrid, describeSurfaceChanges, MAX_SURFACE_SALARY_WAN, SURFACE_SYSTEMS } from "./salarySurfaceGrid.js";
import { scanPaperChangePoints } from "./paperChangePoints.js";

test("行は配偶者給与、列は世帯主給与。0円の収支を欠測と区別し、原点と未算定はNaNにする", () => {
  const evaluate = jest.fn((head, spouse) => {
    if (head === 1 && spouse === 2) return {status:"insufficient", studyDisposableWan:null};
    return {status:"calculated", studyDisposableWan:10 * spouse - head - 9};
  });
  const onProgress = jest.fn();
  const grid = buildSalarySurfaceGrid({evaluate}, {maxSalaryWan:2, onProgress});
  expect(grid.width).toBe(3);
  expect(grid.heights).toBeInstanceOf(Float32Array);
  expect(Array.from(grid.heights)).toEqual([NaN, -10, -11, 1, 0, -1, 11, NaN, 9]);
  expect(grid).toMatchObject({min:-11, max:11, validCount:7});
  expect(evaluate).toHaveBeenCalledTimes(8);
  expect(evaluate).not.toHaveBeenCalledWith(0, 0);
  expect(onProgress.mock.calls).toEqual([[0,9], [3,9], [6,9], [9,9]]);
});

test("対象点がない格子には数値の極値を与えない。範囲外や小数の上限は拒否する", () => {
  const calculator = {evaluate:jest.fn()};
  expect(MAX_SURFACE_SALARY_WAN).toBe(1500);
  const {heights, validCount, min, max} = buildSalarySurfaceGrid(calculator, {maxSalaryWan:0});
  expect(Array.from(heights)).toEqual([NaN]);
  expect([validCount, min, max]).toEqual([0, null, null]);
  for (const maxSalaryWan of [-1, 1.5, 1501, NaN]) {
    expect(() => buildSalarySurfaceGrid(calculator, {maxSalaryWan})).toThrow(RangeError);
  }
});

test("紙面用の世帯条件で描画高を、独立に作成した一点計算の万円額と照合する", () => {
  const inputs = {protocol:"paper-2029", serviceAmountYen:0, children:[{
    age:8, tccaGrade:"2", welfareEligible:true, taxStatus:"ordinary", serviceUser:true, serviceAmountYen:3200,
  }]};
  const grid = buildSalarySurfaceGrid(createRevisionCalculator(inputs), {maxSalaryWan:10});
  const direct = createRevisionCalculator(inputs);
  expect(grid.validCount).toBe(120);
  for (const [head, spouse] of [[10,0], [0,10], [3,7], [7,3], [10,10]]) {
    const point = direct.evaluate(head, spouse);
    expect(point.status).toBe("calculated");
    expect(grid.heights[spouse * grid.width + head]).toBe(Math.fround(point.studyDisposableWan));
  }
});

test("線は各給与軸での実際の切替後の座標のみ。交点は一つ、欠測をまたがず、等間隔には引かない", () => {
  const evaluate=(x,y)=>x===2 && y===1 ? {status:"insufficient"} : {
    status:"calculated", studyDisposableWan: 500 + x + y - (x>=3 ? 20 : 0),
    details:{benefits:{tcca:x>=3?0:701400},service:{annual:12*(y>=3?37200:4600)}},
  };
  const g=buildSalarySurfaceGrid({evaluate},{maxSalaryWan:4});
  const coords=i=>[i%g.width,Math.floor(i/g.width)];
  expect(Array.from(g.changePoints,coords)).toEqual([[3,0],[3,2],[0,3],[1,3],[2,3],[3,3],[4,3],[3,4]]);
  const l=Array.from(g.changeLines,coords), pairs=[];
  for(let i=0;i<l.length;i+=2) pairs.push([l[i],l[i+1]]);
  expect(pairs).toContainEqual([[3,2],[3,3]]);
  expect(pairs).toContainEqual([[2,3],[3,3]]);
  expect(pairs).not.toContainEqual([[3,0],[3,2]]);
  expect([...g.changeBySystem["N01-1"].points].map(coords)).toEqual([[3,0],[3,2],[3,3],[3,4]]);
  expect([...g.changeBySystem["N02/N03"].points].map(coords)).toEqual([[0,3],[1,3],[2,3],[3,3],[4,3]]);
  expect([...g.changeBySystem["N01-1"].lines].map(coords)).toEqual([[3,2],[3,3],[3,3],[3,4]]);
  expect(Object.keys(g.changeBySystem)).toEqual(["N01-1","N01-2","N02/N03"]);
});

test("福祉判定が変わらなければ、片方の給与軸上で収支が減っても線や点をつけない", () => {
  const run=reverse=>buildSalarySurfaceGrid({evaluate:(x,y)=>({status:"calculated",
    studyDisposableWan:(30000000-Number((reverse?y:x)>=2))/10000})},{maxSalaryWan:3});
  const x=run(false), y=run(true);
  expect(x.heights[1]).toBe(x.heights[2]); // Float32には差が残らない
  expect([...x.changePoints,...y.changePoints,...x.changeLines,...y.changeLines]).toEqual([]);
  expect(Object.values(x.changeBySystem).every(layer=>!layer.points.length && !layer.lines.length)).toBe(true);
});

const household={protocol:"paper-2029",serviceAmountYen:37200,children:[
  {age:8,tccaGrade:"1",welfareEligible:true,taxStatus:"special",serviceUser:true}]};

test("同じ一歩で二つの手当の支給額とサービスの実負担が変われば、純収支下落がなくても3制度すべてを残す",()=>{
  const evaluate=(x,y)=>{
    const stopped=x>=2;
    return {status:"calculated",studyDisposableWan:x+y,details:{benefits:{tcca:stopped?0:701400,welfare:stopped?0:198720,
      specialChildAllowance:{checks:[
        {id:"head",role:"claimant",stopped:false},{id:"spouse",role:"spouse",stopped}]},
      welfareChildren:[{annualYen:stopped?0:198720,checks:[{id:"child1",role:"recipient",passes:true},
        {id:"spouse",role:"maintainer",passes:!stopped}]}]},
      service:{hasCapApplicableServiceUse:true,householdCapYen:stopped?37200:4600,monthly:stopped?32000:4600,annual:12*(stopped?32000:4600)}}};
  };
  const ids=["N01-1","N01-2","N02/N03"];
  const changes=describeSurfaceChanges(evaluate(1,0),evaluate(2,0));
  expect(changes.map(d=>d.id)).toEqual(ids);
  expect(changes[0].after).toContain("受給資格者の配偶者（配偶者）：所得制限に該当");
  expect(changes[0].before).toContain("世帯への年額支給701,400円");
  expect(changes[1].after).toContain("世帯への年額支給0円");
  expect(changes[1].after).toContain("子1・生計維持者（配偶者）：所得制限に該当");
  const g=buildSalarySurfaceGrid({evaluate},{maxSalaryWan:3});
  expect([...g.changePoints]).toEqual([2,6,10,14]);
  for(const id of ids) expect([...g.changeBySystem[id].points]).toEqual([...g.changePoints]);
});

test("実判定と表示内容：特児・児福・上限だけを抽出し、税や保険だけの実際の下落には印をつけない",()=>{
  const c=createRevisionCalculator(household);
  const changes=(h,s)=>describeSurfaceChanges(c.evaluate(h-1,s),c.evaluate(h,s));
  for(const h of [1,112,924,1111]) {
    expect(c.evaluate(h,17).studyDisposableWan).toBeLessThan(c.evaluate(h-1,17).studyDisposableWan);
    expect(changes(h,17)).toEqual([]);
  }
  expect(changes(782,17)[0]).toMatchObject({id:"N01-1",before:expect.stringContaining("年額支給701,400円"),
    after:expect.stringMatching(/年額支給0円.*受給資格者（世帯主）：所得制限に該当（/)});
  // 配偶者は高給与側の受給者としてすでに停止。他方の親もその限度を超えても、支給額の赤線は延びない。
  const prior=c.evaluate(840,900), next=c.evaluate(841,900);
  expect([prior,next].map(p=>p.details.benefits.specialChildAllowance.stoppedBy.map(q=>q.id))).toEqual([["spouse"],["spouse","head"]]);
  expect([prior,next].map(p=>p.details.benefits.tcca)).toEqual([0,0]);
  expect(changes(841,900).map(d=>d.id)).not.toContain("N01-1");
  const tail=buildSalarySurfaceGrid({evaluate:(x,y)=>c.evaluate(839+x,899+y)},{maxSalaryWan:3});
  expect(tail.changeBySystem["N01-1"].points).toHaveLength(0);
  expect(tail.changeBySystem["N01-1"].lines).toHaveLength(0);
  // 同額で親が交代しても、児童全員の税扶養もその親に移る。手当額が同じなら制度線はない。
  expect(changes(900,900)).toEqual([]);
  expect(changes(985,17)).toEqual([{id:"N02/N03",before:expect.stringMatching(/一般1.*4,600円.*279,600円/),
    after:expect.stringMatching(/一般2.*37,200円.*280,200円/)}]);
  expect(changes(207,17)).toEqual([]);
});

test("全制度について、各点の各軸で個別に再読した判定と格子上の制度印が一致し、欠測を越えない",()=>{
  const c=createRevisionCalculator(household);
  const empty={status:"insufficient"};
  const windows=[[0,17],[110,17],[781,17],[899,899],[983,17],[1109,17],[17,200],[840,900]];
  for(const [h,s] of windows) {
    const evaluate=(x,y)=>x===2 && y===1 ? empty:c.evaluate(h+x,s+y);
    const g=buildSalarySurfaceGrid({evaluate},{maxSalaryWan:4});
    const read=(x,y)=>x<0||y<0||(!x&&!y)?empty:evaluate(x,y);
    for (const sys of SURFACE_SYSTEMS) {
      const expected=[];
      const amount=p=>sys.id==="N01-1"?p.details.benefits.tcca:
        sys.id==="N01-2"?p.details.benefits.welfare:p.details.service.annual;
      for(let y=0;y<5;y++) for(let x=0;x<5;x++) {
        const p=read(x,y);
        const neighbors=[read(x-1,y),read(x,y-1)];
        for (const q of neighbors) {
          const changed=p.status==="calculated" && q.status==="calculated" && amount(p)!==amount(q);
          expect(describeSurfaceChanges(q,p).some(d=>d.id===sys.id)).toBe(changed);
        }
        if (p.status==="calculated" && neighbors.some(q=>q.status==="calculated" && amount(p)!==amount(q))) expected.push(5*y+x);
      }
      expect([...g.changeBySystem[sys.id].points]).toEqual(expected);
      const lines=g.changeBySystem[sys.id].lines;
      for(let i=0;i<lines.length;i+=2) {
        expect(expected).toContain(lines[i]);expect(expected).toContain(lines[i+1]);
      }
    }
  }
});

test("隣接する異なる制度の切替は一本の線にしない。児福は児童間で内訳が交代しても世帯総額が同じなら線なし",()=>{
  const evaluate=(x,y)=>({status:"calculated",studyDisposableWan:x+y,details:{benefits:{
    tcca:y===1 && x>=2?0:700000,welfare:198720,
    welfareChildren:[{annualYen:x<2?198720:0},{annualYen:x<2?0:198720}]},
    service:{annual:y===2 && x>=2?55000:0}}});
  const g=buildSalarySurfaceGrid({evaluate},{maxSalaryWan:3});
  const lines=[...g.changeLines];
  const joined=lines.some((i,k)=>k%2===0 && i===6 && lines[k+1]===10);
  expect(joined).toBe(false);
  expect(g.changeBySystem["N01-2"].points).toHaveLength(0);
});

test("サービスは上限でなく上限適用後の実負担。0→0・3,200→3,200は消え、4,600→4,601は残る",()=>{
  for(const fee of [0,3200,4601]) {
    const c=createRevisionCalculator({...household,children:[{...household.children[0],serviceAmountYen:fee}]});
    const a=c.evaluate(984,17), b=c.evaluate(985,17);
    expect([a,b].map(p=>p.details.service.householdCapYen)).toEqual([4600,37200]);
    expect([a,b].map(p=>p.details.service.monthly)).toEqual([Math.min(fee,4600),fee]);
    expect(b.studyDisposableWan).toBeGreaterThan(a.studyDisposableWan);
    expect(describeSurfaceChanges(a,b).map(d=>d.id)).toEqual(fee<=4600?[]:["N02/N03"]);
    const g=buildSalarySurfaceGrid({evaluate:(x,y)=>c.evaluate(983+x,16+y)},{maxSalaryWan:3});
    expect([...g.changeBySystem["N02/N03"].points].includes(1*4+2)).toBe(fee>4600);
  }
  const c=createRevisionCalculator(household);
  const low=c.evaluate(75,17), higher=c.evaluate(76,17);
  expect(low.details.insurance.head.healthGrade).toBe(1);
  expect(higher.details.insurance.head.healthGrade).toBe(2);
  expect(higher.studyDisposableWan).toBeGreaterThan(low.studyDisposableWan);
  expect(describeSurfaceChanges(low,higher)).toEqual([]);
  const zero=c.evaluate(0,0);
  expect(describeSurfaceChanges(zero,low)).toEqual([]);
});

test("実エンジン：特児の停止を両軸の独立した福祉制度断面走査の和集合と照合する", () => {
  const engine=createRevisionCalculator({protocol:"paper-2029",serviceAmountYen:37200,children:[
    {age:8,tccaGrade:"1",welfareEligible:true,taxStatus:"special",serviceUser:true}]});
  const fixed=17;
  const stop=scanPaperChangePoints(engine,"head",fixed).events.find(e=>e.system==="N01-1" && e.subject==="claimant:head" && e.after==="所得制限に該当");
  expect(stop).toBeDefined();
  for(const swap of [false,true]) {
    // 狭い矩形を切り出すだけで、給与と判定はすべて同じ実エンジンから得る。
    const evaluate=(x,y)=>engine.evaluate(stop.atWan-2+(swap?y:x),fixed-2+(swap?x:y));
    const rect={evaluate}, g=buildSalarySurfaceGrid(rect,{maxSalaryWan:4}), want=new Set();
    for(let k=0;k<=4;k++) for(const axis of ["head","spouse"]) {
      const idx=t=>axis==="head"?k*5+t:t*5+k;
      const events=scanPaperChangePoints(rect,axis,k,{minWan:0,maxWan:4}).events;
      events.forEach(e=>want.add(idx(e.atWan)));
    }
    expect(new Set(g.changePoints)).toEqual(want);
    expect(want.size).toBeGreaterThan(0);
  }
});
