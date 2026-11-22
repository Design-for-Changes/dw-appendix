import {useCallback, useSyncExternalStore} from "react";

const pending = Object.freeze({type:"progress",percent:0});
const jobs = new Map();
let sequence = 0;
function prune() {
  const idle = [...jobs].filter(([,job]) => !job.listeners.size && job.state.type !== "progress");
  for (const [key] of idle.slice(0,-2)) jobs.delete(key);
}
function subscribe(key, listener) {
  if (!key) return () => {};
  let job = jobs.get(key);
  if (!job) {
    job = {listeners:new Set(), state:pending};
    jobs.set(key,job);
    void run(key,job);
  }
  job.listeners.add(listener);
  return () => {job.listeners.delete(listener); prune();};
}
async function run(key,job) {
  let worker;
  function publish(state) {
    job.state = state;
    if (state.type !== "progress") worker?.terminate();
    for (const listener of job.listeners) listener();
    prune();
  }
  try {
    worker = (await import("./createPolicyOnlyWorker")).default();
    const jobId = ++sequence;
    worker.onmessage = ({data}) => {
      if (data.jobId !== jobId) return;
      if (data.type === "progress") publish({type:"progress",percent:data.percent});
      else if (data.type === "result") publish({type:"ready",result:data.result});
      else if (data.type === "error") publish({type:"error",message:String(data.message)});
    };
    worker.onerror = e => publish({type:"error",message:e.message || "制度境界の計算に失敗しました。"});
    worker.onmessageerror = () => publish({type:"error",message:"制度境界の計算結果を読み取れませんでした。"});
    worker.postMessage({...JSON.parse(key), jobId});
  } catch (error) { publish({type:"error",message:String(error.message || error)}); }
}

// Keep jobs alive when changing tabs. This scan has no disposable-income or recovery surface.
export function usePolicyBoundaryDataset(key) {
  const listen = useCallback(listener => subscribe(key,listener), [key]);
  const snapshot = useCallback(() => key ? jobs.get(key)?.state || pending : null, [key]);
  return useSyncExternalStore(listen,snapshot,snapshot);
}
export function retryPolicyBoundaryDataset(key) {
  const job=jobs.get(key);
  if(job?.state.type!=="error")return;
  job.state=pending;
  for(const listener of job.listeners)listener();
  void run(key,job);
}
