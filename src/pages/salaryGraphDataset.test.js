import {createHouseholdGridStore,householdDatasetKey} from "./salaryGraphDataset";

const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const household={protocol:"paper-2029",children:[{age:8,serviceAmountYen:20000}]};
const key=householdDatasetKey(household);
const data={type:"complete",grid:{netYen:new Int32Array([1923456])},income:{},comparison:{},map:{}};
function fixture(){
  const db=new Map(),makeWorker=jest.fn(()=>({postMessage:jest.fn(),terminate:jest.fn()}));
  const api={makeWorker,load:k=>db.get(k),save:(k,v)=>db.set(k,v)};
  return {db,api,makeWorker,store:createHouseholdGridStore(api)};
}

test("入力項目の順序ではなく、世帯の計算条件でキーを決める",()=>{
  expect(householdDatasetKey({children:[{serviceAmountYen:20000,age:8}],protocol:"paper-2029"})).toBe(key);
  expect(householdDatasetKey({...household,children:[]})).not.toBe(key);
});
test("3図が購読しても計算は1回。途中で全画面を離れても終了せず、結果を同じオブジェクトで返す",async()=>{
  const {store,makeWorker,api}=fixture();
  const unsub=Array.from({length:3},()=>store.subscribe(key,household,jest.fn()));
  await tick();
  const w=makeWorker.mock.results[0].value;
  expect(makeWorker).toHaveBeenCalledTimes(1);
  expect(w.postMessage).toHaveBeenCalledWith({type:"household-dataset",inputs:household});
  unsub.forEach(fn=>fn());
  expect(w.terminate).not.toHaveBeenCalled();
  w.onmessage({data:{type:"progress",percent:45}});
  expect(store.snapshot(key).percent).toBe(45);
  w.onmessage({data});await tick();
  const stop=store.subscribe(key,household,jest.fn());
  expect(store.snapshot(key)).toBe(data);
  expect(w.terminate).toHaveBeenCalledTimes(1);
  stop();
  const afterReload=createHouseholdGridStore(api);
  afterReload.subscribe(key,household,jest.fn());await tick();
  expect(afterReload.snapshot(key)).toBe(data);
  expect(makeWorker).toHaveBeenCalledTimes(1);
});
test("世帯条件を変えた別ジョブと混同せず、保存不可でもメモリの計算結果は残る",async()=>{
  const {makeWorker}=fixture();
  const store=createHouseholdGridStore({makeWorker,load:()=>Promise.reject(Error()),save:()=>Promise.reject(Error())});
  const other={...household,children:[]},k=householdDatasetKey(other);
  store.subscribe(key,household,jest.fn());store.subscribe(k,other,jest.fn());await tick();
  const [a,b]=makeWorker.mock.results.map(r=>r.value);
  b.onmessage({data:{type:"progress",percent:71}});a.onmessage({data});await tick();
  expect(store.snapshot(key)).toBe(data);expect(store.snapshot(k).percent).toBe(71);
  b.onmessage({data:{type:"error",message:"failed"}});
  store.snapshot(k).retry();await tick();
  expect(makeWorker).toHaveBeenCalledTimes(3);
  expect(store.snapshot(key)).toBe(data);
});
