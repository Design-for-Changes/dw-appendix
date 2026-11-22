/* global globalThis */
import {buildPolicyOnlyMap} from "../calc/policyOnlyBoundaries.js";

globalThis.onmessage=({data})=>{
  const {inputs,options,jobId}=data;
  try{
    const result=buildPolicyOnlyMap(inputs,options,{maxSalaryWan:data.maxSalaryWan??1500,
      onProgress:percent=>globalThis.postMessage({type:"progress",percent,jobId})});
    globalThis.postMessage({type:"result",result,jobId});
  }catch(e){
    globalThis.postMessage({type:"error",message:e instanceof Error?e.message:String(e),jobId});
  }
};
