import {buildSalaryPlaneRecovery,UNKNOWN_PLANE_NET_YEN as NA} from "./salaryPlaneRecovery";
import {createRevisionCalculator} from "./revisionEngine";

const grid=width=>({width,netYen:new Int32Array(width*width).fill(NA),
  changedX:new Uint8Array(width*width),changedY:new Uint8Array(width*width)});
function slice(g,axis,fixed,values,masks){
  values.forEach((v,k)=>{
    const i=axis==="head"?fixed*g.width+k:k*g.width+fixed;
    g.netYen[i]=v; g[axis==="head"?"changedX":"changedY"][i]=masks[k]||0;
  });
}

test("同一断面の下落を別々に追跡し、等値で初回回復、範囲外は線を出さない",()=>{
  const g=grid(7);
  slice(g,"head",1,[100,80,60,90,100,99,103],[0,1,4,0,0,2,0]);
  slice(g,"head",2,[100,50,40,41,42,43,44],[0,2,0,0,0,0,0]);
  const {head,spouse}=buildSalaryPlaneRecovery(g);
  expect(head.drop).toEqual([[.5,.5,.5,1.5],[1.5,.5,1.5,1.5],[4.5,.5,4.5,1.5],[.5,1.5,.5,2.5]]);
  expect(head.dropMasks).toEqual([1,4,2,2]);
  expect(head.recovery).toEqual([[3.5,.5,3.5,1.5],[2.5,.5,2.5,1.5],[5.5,.5,5.5,1.5]]);
  expect(head.recoveryDropIndex).toEqual([0,1,2]);
  expect(spouse.drop).toEqual([]);
});
test("配偶者方向・端の断面は半目盛。同一点で回復した下落2件の由来を保持",()=>{
  const g=grid(5);
  slice(g,"spouse",0,[NA,100,85,60,110],[0,0,3,4,0]);
  slice(g,"spouse",4,[-9,-20,-9,-10,0],[0,4,0,0,0]);
  const {spouse}=buildSalaryPlaneRecovery(g);
  expect(spouse.drop).toEqual([[0,1.5,.5,1.5],[0,2.5,.5,2.5],[3.5,.5,4,.5]]);
  expect(spouse.recovery).toEqual([[0,3.5,.5,3.5],[0,3.5,.5,3.5],[3.5,1.5,4,1.5]]);
  expect(spouse.recoveryDropIndex).toEqual([0,1,2]);
  expect(spouse.dropMasks).toEqual([3,4,4]);
});
test("欠測・原点をまたがない。制度のみの切替え、税・保険だけの下落を数えない",()=>{
  const g=grid(9);
  slice(g,"head",0,[NA,10,5,NA,20,21,21,19,23],[0,1,4,0,2,2,1,0,0]);
  const {head}=buildSalaryPlaneRecovery(g);
  expect(head.drop).toEqual([[1.5,0,1.5,.5]]);
  expect(head.recovery).toEqual([]);
});
test("単調スタックの回復を機械生成した両方向の格子で前方総当たりと突き合わせる",()=>{
  let state=314159;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state;};
  for(const n of [1,2,7,32]){
    const g=grid(n);
    for(let i=1;i<n*n;i++){
      const v=random();g.netYen[i]=v%9===0?NA:(v%11)-5;
      g.changedX[i]=(random()>>>16)%8; g.changedY[i]=(random()>>>16)%8;
    }
    const actual=buildSalaryPlaneRecovery(g);
    for(const [direction,mask] of [["head",g.changedX],["spouse",g.changedY]]){
      const expected={drop:[],recovery:[],dropMasks:[],recoveryDropIndex:[]};
      for(let c=0;c<n;c++){
        const idx=k=>direction==="head"?c*n+k:k*n+c;
        const span=k=>{
          const pair=[Math.max(0,c-.5),Math.min(n-1,c+.5)],at=k-.5;
          return direction==="head"?[at,pair[0],at,pair[1]]:[pair[0],at,pair[1],at];
        };
        for(let k=1;k<n;k++){
          const a=g.netYen[idx(k-1)],b=g.netYen[idx(k)],m=mask[idx(k)];
          if(!m||a===NA||b===NA||a<=b)continue;
          expected.drop.push(span(k));expected.dropMasks.push(m);
          for(let j=k+1;j<n;j++){
            const z=g.netYen[idx(j)];
            if(z===NA)break;
            if(z>=a){
              expected.recovery.push(span(j));expected.recoveryDropIndex.push(expected.drop.length-1);break;
            }
          }
        }
      }
      expect(actual[direction]).toEqual(expected);
    }
  }
});
test("点Gの実データ：世帯主600万固定、配偶者906→907万の児福停止は937万で回復",()=>{
  const c=createRevisionCalculator({protocol:"paper-2029",serviceAmountYen:20000,children:[
    {age:8,tccaGrade:"1",welfareEligible:true,taxStatus:"special",serviceUser:true,serviceAmountYen:20000},
  ]});
  const g=grid(938);
  for(let y=906;y<=937;y++)g.netYen[y*938+600]=Math.round(c.evaluate(600,y).studyDisposableWan*10000);
  expect([906,907,936,937].map(y=>g.netYen[y*938+600])).toEqual([11419020,11227552,11418008,11425160]);
  g.changedY[907*938+600]=2;
  const a=buildSalaryPlaneRecovery(g).spouse;
  expect(a.drop).toEqual([[599.5,906.5,600.5,906.5]]);
  expect(a.recovery).toEqual([[599.5,936.5,600.5,936.5]]);
});
test("不正なワーカー入力で、ゼロ円や架空の制度境界を描かない",()=>{
  const g=grid(3);
  expect(()=>buildSalaryPlaneRecovery({...g,netYen:new Float32Array(9)})).toThrow();
  expect(()=>buildSalaryPlaneRecovery({...g,changedX:new Uint8Array(4)})).toThrow();
  g.changedY[0]=255;
  expect(()=>buildSalaryPlaneRecovery(g)).toThrow();
});
