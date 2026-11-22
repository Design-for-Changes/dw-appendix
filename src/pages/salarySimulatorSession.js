import { useCallback, useEffect, useLayoutEffect, useState } from "react";

const PREFIX="dw-appendix:salary-surface:v1:";
const MAX_JSON=32*1024;
const useCommitEffect=typeof window==="undefined" ? useEffect : useLayoutEffect;
const isKey=key=>typeof key==="string" && /^[a-zA-Z0-9_.:-]{1,80}$/.test(key);
const plain=v=>v!==null && typeof v==="object" && Object.getPrototypeOf(v)===Object.prototype;

// Accept only small JSON inputs, not calculator outputs, typed buffers or executable data.
function isSmallJSON(v,depth=0) {
  if (depth>8) return false;
  if (v===null || typeof v==="boolean") return true;
  if (typeof v==="number") return Number.isFinite(v);
  if (typeof v==="string") return v.length<=2048;
  if (Array.isArray(v)) return v.length<=128 && v.every(item=>isSmallJSON(item,depth+1));
  if (!plain(v)) return false;
  const keys=Object.keys(v);
  return keys.length<=40 && keys.every(k=>k.length<=80 && !["__proto__","prototype","constructor"].includes(k)
    && isSmallJSON(v[k],depth+1));
}

// Optional fields (e.g. the parent claiming a child's tax deduction) may be added.
// A one-item initial array supplies the schema for variable-length child lists.
function matches(v,initial) {
  if (initial===null) return true;
  if (Array.isArray(initial)) {
    if (!Array.isArray(v)) return false;
    if (!initial.length) return true;
    return initial.length===1 ? v.every(item=>matches(item,initial[0]))
      : v.length===initial.length && v.every((item,i)=>matches(item,initial[i]));
  }
  if (plain(initial)) return plain(v) && Object.keys(initial).every(k=>Object.hasOwn(v,k) && matches(v[k],initial[k]));
  return typeof v===typeof initial;
}
function valid(key,v,initial) {
  if (!isSmallJSON(v) || !matches(v,initial)) return false;
  if (key==="children") return v.length>=1 && v.length<=3;
  if (key==="fixedTotal") return v===null || (Number.isInteger(v) && v>=0 && v<=3000);
  if (key==="lastDrawnKey" || key==="focusSystem") return v===null || typeof v==="string";
  // A corrupt camera matrix of the correct length can collapse the whole plot.
  if (Array.isArray(initial) && initial.length===9 && initial.every(n=>typeof n==="number")) {
    for (let i=0;i<3;i++) for (let j=i;j<3;j++) {
      const a=i*3,b=j*3, dot=v[a]*v[b]+v[a+1]*v[b+1]+v[a+2]*v[b+2];
      if (Math.abs(dot-(i===j ? 1 : 0))>1e-4) return false;
    }
  }
  return true;
}

function load(key,initialValue) {
  const initial=typeof initialValue==="function" ? initialValue() : initialValue;
  try {
    if (isKey(key) && typeof window!=="undefined") {
      const raw=window.sessionStorage.getItem(PREFIX+key);
      if (raw!==null && raw.length<=MAX_JSON) {
        const v=JSON.parse(raw);
        if (valid(key,v,initial)) return {key,initial,value:v};
      }
    }
  } catch { /* Disabled storage or malformed JSON: normal, volatile state still works. */ }
  return {key,initial,value:initial};
}

/** useState for a JSON input; persists only in this tab's session and never to a server. */
export function useSessionParameter(key,initialValue) {
  const [slot,setSlot]=useState(()=>load(key,initialValue));
  if (slot.key!==key) setSlot(load(key,initialValue));
  const setValue=useCallback(next=>setSlot(prev=>{
    const value=typeof next==="function" ? next(prev.value) : next;
    return Object.is(value,prev.value) ? prev : {...prev,value};
  }),[]);
  useCommitEffect(()=>{
    try {
      if (!isKey(slot.key) || !valid(slot.key,slot.value,slot.initial) || typeof window==="undefined") return;
      const raw=JSON.stringify(slot.value);
      if (raw.length<=MAX_JSON) window.sessionStorage.setItem(PREFIX+slot.key,raw);
    } catch { /* Storage disabled/full: do not interrupt interaction or reset the form. */ }
  },[slot]);
  return [slot.value,setValue];
}
