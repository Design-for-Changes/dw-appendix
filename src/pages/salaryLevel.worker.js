/* global globalThis */
import {buildSalaryLevelContour} from "../calc/salaryLevelContour.js";

// The common grid is copied once, not transferred away from the other two charts.
let grid;
globalThis.onmessage=({data})=>{
  if(data.type==="grid"){grid=data.grid;return;}
  if(data.type!=="level")return;
  const {levelYen}=data;
  try{
    globalThis.postMessage({type:"result",...buildSalaryLevelContour(grid,levelYen)});
  }catch(e){
    globalThis.postMessage({type:"error",levelYen,message:String(e?.message||e)});
  }
};
