import {useCallback,useMemo,useSyncExternalStore} from "react";

// IndexedDB holds completed numerical results, not React state or an image of a chart.
// Change this version when the model, grid or stored result schema changes.
const VERSION="paper-2029-grid-v3";
const PENDING=Object.freeze({type:"progress",percent:0});
const HOLD=2;
function canonical(v) {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v==="object") return Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])]));
  return v;
}
export function householdDatasetKey(inputs) {return VERSION+":"+JSON.stringify(canonical(inputs));}

let connection;
function openCache() {
  if(!connection) connection=new Promise((resolve,reject)=>{
    const req=window.indexedDB.open("dw-appendix-salary-grid",1);
    req.onupgradeneeded=()=>req.result.createObjectStore("households");
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
    req.onblocked=()=>reject(new Error("cache unavailable"));
  });
  return connection;
}
async function readCache(key) {
  const db=await openCache();
  return new Promise((resolve,reject)=>{
    const req=db.transaction("households").objectStore("households").get(key);
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
}
async function writeCache(key,data) {
  const db=await openCache();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction("households","readwrite"),store=tx.objectStore("households");
    // Only deserialize the short key list when pruning; never read unrelated large grids.
    const keys=store.get("@recent");
    keys.onsuccess=()=>{
      const recent=[key,...(keys.result||[]).filter(k=>k!==key)];
      recent.slice(HOLD).forEach(k=>store.delete(k));
      store.put(recent.slice(0,HOLD),"@recent");
      store.put(data,key);
    };
    tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(tx.error);
  });
}

// One job per household, independent of the lifetime of any tab/component.
export function createHouseholdGridStore({makeWorker,load=readCache,save=writeCache}) {
  const jobs=new Map();
  function prune(){
    let idle=0;
    for(const [key,job] of Array.from(jobs).reverse()){
      if(!job.listeners.size && job.value.type!=="progress" && ++idle>HOLD) jobs.delete(key);
    }
  }
  function publish(job,value){
    job.value=value;
    for(const fn of job.listeners) fn();
    prune();
  }
  async function run(job,inputs){
    let cached;
    try{cached=await load(job.key);}catch{/* Private mode/quota: the in-memory grid still works. */}
    if(cached?.type==="complete" && cached.grid && cached.income && cached.comparison && cached.map){
      publish(job,cached);return;
    }
    let worker,finished=false;
    const stop=()=>{finished=true;worker?.terminate();};
    function fail(error){
      if(finished)return;
      stop();
      publish(job,{type:"error",message:String(error?.message||error||"計算できませんでした。"),
        retry:()=>{if(job.value.type==="error"){publish(job,PENDING);run(job,inputs);}}});
    }
    try{
      worker=await makeWorker();
      worker.onmessage=({data})=>{
        if(finished)return;
        if(data.type==="progress")publish(job,{type:"progress",percent:data.percent});
        else if(data.type==="complete"){
          stop();publish(job,data);
          Promise.resolve().then(()=>save(job.key,data)).catch(()=>{});
        }else if(data.type==="error")fail(data.message);
      };
      worker.onerror=fail;
      worker.onmessageerror=()=>fail("計算結果を読み取れませんでした。");
      worker.postMessage({type:"household-dataset",inputs});
    }catch(e){fail(e);}
  }
  return {
    snapshot:key=>jobs.get(key)?.value||PENDING,
    subscribe(key,inputs,listener){
      let job=jobs.get(key);
      if(!job){
        job={key,value:PENDING,listeners:new Set([listener])};
        jobs.set(key,job);run(job,inputs);
      }else{
        jobs.delete(key);jobs.set(key,job);job.listeners.add(listener);
      }
      // Leaving the simulator unsubscribes the view, not the computation.
      return ()=>{job.listeners.delete(listener);prune();};
    },
  };
}
const store=createHouseholdGridStore({makeWorker:async()=>(await import("./createSalarySurfaceWorker")).default()});
const noop=()=>{};
export function useSalaryGraphDataset(inputs,enabled) {
  const key=useMemo(()=>enabled?householdDatasetKey(inputs):null,[inputs,enabled]);
  const subscribe=useCallback(fn=>key?store.subscribe(key,inputs,fn):noop,[inputs,key]);
  const snapshot=useCallback(()=>key?store.snapshot(key):null,[key]);
  return useSyncExternalStore(subscribe,snapshot,snapshot);
}
