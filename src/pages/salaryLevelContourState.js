import {useEffect,useRef,useState} from "react";

const openWorker=async()=>(await import("./createSalaryLevelWorker")).default();
const idle={status:"idle",levelYen:null,segments:[]};
const prior=new WeakMap();

/** Keep a worker's copy of the yen grid across selections; reuse recent cuts after a tab change. */
export function salaryLevelChannel(grid,makeWorker=openWorker){
  let worker,opening,closed=false;
  const waiting=new Map(),cache=prior.get(grid)??new Map();
  prior.set(grid,cache);
  function fail(error){
    for(const next of waiting.values())next.reject(error);
    waiting.clear();worker?.terminate();worker=null;opening=null;
  }
  function request(levelYen){
    if(closed)return Promise.reject(new Error("closed"));
    if(cache.has(levelYen))return Promise.resolve(cache.get(levelYen));
    if(waiting.has(levelYen))return waiting.get(levelYen).promise;
    if(!opening)opening=Promise.resolve().then(makeWorker).then(w=>{
      if(closed){w.terminate();throw new Error("closed");}
      worker=w;
      w.onmessage=({data})=>{
        const pending=waiting.get(data.levelYen);if(!pending)return;
        waiting.delete(data.levelYen);
        if(data.type==="result"){
          cache.set(data.levelYen,data.segments);
          if(cache.size>8)cache.delete(cache.keys().next().value);
          pending.resolve(data.segments);
        }else pending.reject(new Error(data.message||"cut failed"));
      };
      w.onerror=w.onmessageerror=()=>fail(new Error("cut worker unavailable"));
      w.postMessage({type:"grid",grid:{width:grid.width,netYen:grid.netYen}});
      return w;
    });
    let resolve,reject;
    const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
    waiting.set(levelYen,{promise,resolve,reject});
    opening.then(w=>{if(!closed)w.postMessage({type:"level",levelYen});}).catch(fail);
    return promise;
  }
  return {request,close(){closed=true;fail(new Error("closed"));}};
}

export function useSalaryLevelContour(grid,levelYen){
  const channel=useRef(),[result,setResult]=useState(null);
  useEffect(()=>()=>{
    channel.current?.close();channel.current=null;
  },[grid]);
  useEffect(()=>{
    if(!grid||!Number.isSafeInteger(levelYen))return;
    let current=true;
    channel.current??=salaryLevelChannel(grid);
    channel.current.request(levelYen).then(
      segments=>{if(current)setResult({grid,levelYen,segments,status:"ready"});},
      ()=>{if(current)setResult({grid,levelYen,segments:[],status:"error"});},
    );
    return ()=>{current=false;};
  },[grid,levelYen]);
  if(!grid||!Number.isSafeInteger(levelYen))return idle;
  return result?.grid===grid&&result.levelYen===levelYen?result:{status:"computing",levelYen,segments:[]};
}
