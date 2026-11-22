import {buildSalaryIncomeSection} from "./salaryIncomeSection.js";
import {createRevisionCalculator} from "./revisionEngine.js";

const p=(net,tcca,welfare=0,cap=4600,used=true)=>({status:"calculated",studyDisposableWan:net/10000,
  details:{benefits:{tcca,welfare},service:{hasCapApplicableServiceUse:used,householdCapYen:cap}}});

test("切替えのない税等の下落を曲線に残し、同時切替・途中の再下落・同率の後退／回復を分ける",()=>{
  const net=[90,100,100,130,100,110,95,105,130,125,130];
  const evaluate=jest.fn(x=>p(net[x],x<4||x===10?100:0,x<6?100:0,x<1?0:x<6?4600:37200));
  const s=buildSalaryIncomeSection({evaluate},{fixedWan:3,maxSalaryWan:10});
  expect(evaluate.mock.calls).toEqual(net.map((_,x)=>[x,3]));
  expect(s.points).toEqual(net);
  expect(s.events.map(e=>e.afterWan)).toEqual([1,4,6,10]);
  expect(s.events[0]).toMatchObject({systems:["N02/N03"],dropYen:0,recoveryWan:null,retreatWan:null});
  expect(s.events[1]).toEqual({beforeWan:3,afterWan:4,beforeYen:130,afterYen:100,dropYen:30,systems:["N01-1"],
    retreatAtWan:2,retreatWan:2,recoveryAtWan:8,recoveryWan:4,interveningDrops:1});
  expect(s.events[2]).toMatchObject({dropYen:15,systems:["N01-2","N02/N03"],retreatAtWan:0,retreatWan:6,
    recoveryAtWan:8,recoveryWan:2,interveningDrops:0});
  expect(s.events[3]).toMatchObject({dropYen:0,systems:["N01-1"]});
});

test("原点は計算しない。未算定を越えて境界・後退・回復を結ばず、給与点間を補間しない",()=>{
  const rows=[null,p(90,100),p(110,100),null,p(130,100),p(95,0),null,p(150,100)];
  const evaluate=jest.fn((x,y)=>rows[y]??{status:"insufficient"});
  const s=buildSalaryIncomeSection({evaluate},{axis:"spouse",fixedWan:0,maxSalaryWan:7});
  expect(evaluate.mock.calls).toEqual([[0,1],[0,2],[0,3],[0,4],[0,5],[0,6],[0,7]]);
  expect(s.points).toEqual([null,90,110,null,130,95,null,150]);
  expect(s.events).toEqual([{beforeWan:4,afterWan:5,beforeYen:130,afterYen:95,dropYen:35,systems:["N01-1"],
    retreatAtWan:null,retreatWan:null,recoveryAtWan:null,recoveryWan:null,interveningDrops:0}]);
});

test("範囲末まで未回復のときも、同じ区間内でさらに生じた制度境界の下落は数える",()=>{
  const rows=[p(110,10,20),p(95,0,20),p(90,0,0),p(99,0,0),p(101,0,0),p(100,0,0)];
  const s=buildSalaryIncomeSection({evaluate:x=>rows[x]},{fixedWan:1,maxSalaryWan:rows.length-1});
  expect(s.events[0]).toMatchObject({retreatWan:null,recoveryWan:null,interveningDrops:1});
  expect(s.events[1]).toMatchObject({retreatWan:null,recoveryAtWan:3,interveningDrops:0});
});

test("手当の正額同士の差・利用なしの上限変化は、制度境界図と同じく境界に数えない",()=>{
  const s=buildSalaryIncomeSection({evaluate:x=>p(1000-10*x,800-50*x,0,x===0?4600:37200,false)},
    {fixedWan:100,maxSalaryWan:4});
  expect(s.events).toEqual([]);expect(s.points).toEqual([1000,990,980,970,960]);
});

test("直前から直後の実額・後退点・回復点を本計算で照合：世帯主600万円、配偶者906→907万円",()=>{
  const calculator=createRevisionCalculator({protocol:"paper-2029",serviceAmountYen:0,children:[
    {age:8,tccaGrade:"1",welfareEligible:true,taxStatus:"special",serviceUser:true,serviceAmountYen:20000}]});
  const s=buildSalaryIncomeSection(calculator,{axis:"spouse",fixedWan:600});
  const e=s.events.find(row=>row.afterWan===907);
  expect(e).toEqual({beforeWan:906,afterWan:907,beforeYen:11419020,afterYen:11227552,systems:["N01-2"],dropYen:191468,
    retreatAtWan:879,retreatWan:28,recoveryAtWan:937,recoveryWan:30,interveningDrops:0});
  expect([s.points[879],s.points[880],s.points[936],s.points[937]]).toEqual([11223976,11231216,11418008,11425160]);
});

test("給与軸と範囲を検証し、算定済みが欠測金額を返した場合は0円扱いしない",()=>{
  const calc={evaluate:()=>({status:"calculated",studyDisposableWan:null})};
  for(const v of [-1,1501,0.4,undefined])expect(()=>buildSalaryIncomeSection(calc,{fixedWan:v})).toThrow(RangeError);
  for(const v of [-1,1501,0.4])expect(()=>buildSalaryIncomeSection(calc,{fixedWan:0,maxSalaryWan:v})).toThrow(RangeError);
  expect(()=>buildSalaryIncomeSection(calc,{fixedWan:0,axis:"both"})).toThrow(RangeError);
  expect(()=>buildSalaryIncomeSection(calc,{fixedWan:1,maxSalaryWan:0})).toThrow(TypeError);
  expect(buildSalaryIncomeSection(calc,{fixedWan:0,maxSalaryWan:0}).points).toEqual([null]);
});
