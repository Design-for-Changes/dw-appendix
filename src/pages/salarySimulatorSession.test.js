import { act, renderHook } from "@testing-library/react";
import { useSessionParameter } from "./salarySimulatorSession.js";

const prefix="dw-appendix:salary-surface:v1:";
beforeEach(()=>window.sessionStorage.clear());
afterEach(()=>jest.restoreAllMocks());

test("更新のたびに各キーを同じタブのsessionStorageに保存し、再マウントで復元する",()=>{
  const useFields=()=>({
    income:useSessionParameter("income",["200","0"]),
    lock:useSessionParameter("fixedTotal",null),
    drawn:useSessionParameter("lastDrawnKey",null),
  });
  const {result:first,unmount}=renderHook(useFields);
  act(()=>{
    first.current.income[1](["310","120"]);
    first.current.lock[1](()=>430);
    first.current.drawn[1]('{"age":8}');
  });
  expect(window.sessionStorage.getItem(prefix+"income")).toBe('["310","120"]');
  expect(window.localStorage.getItem(prefix+"income")).toBeNull();
  unmount();
  const {result:restored}=renderHook(useFields);
  expect(restored.current.income[0]).toEqual(["310","120"]);
  expect(restored.current.lock[0]).toBe(430);
  expect(restored.current.drawn[0]).toBe('{"age":8}');
  act(()=>restored.current.lock[1](null));
  expect(window.sessionStorage.getItem(prefix+"fixedTotal")).toBe("null");
});

test("関数初期値は再レンダーでは呼び直さず、関数更新と追加した児童の任意項目も保持する",()=>{
  const child={age:8,serviceAmountYen:0}, init=jest.fn(()=>[child]);
  const {result:first,unmount,rerender}=renderHook(()=>useSessionParameter("children",init));
  act(()=>{
    first.current[1](prev=>[...prev,{...child,age:12,taxDependentOf:"spouse"}]);
    first.current[1](prev=>prev.map((v,i)=>i===1 ? {...v,serviceAmountYen:10406} : v));
  });
  rerender();
  expect(init).toHaveBeenCalledTimes(1);
  unmount();
  const {result:restored}=renderHook(()=>useSessionParameter("children",init));
  expect(restored.current[0]).toEqual([child,{age:12,serviceAmountYen:10406,taxDependentOf:"spouse"}]);
});

test.each([
  ["income",'{"broken":',["200","0"]],
  ["income",'["12",null]',["200","0"]],
  ["income",'["12"]',["200","0"]],
  ["roles",'{"recipient":{"nested":true}}',{recipient:"head"}],
  ["fixedTotal",'{"bad":true}',null],
  ["fixedTotal","3001",null],
  ["children","[]",[{age:8}]],
  ["children",'[{"age":"8"}]',[{age:8}]],
  ["lastDrawnKey","false",null],
  ["view","[0,0,0,0,0,0,0,0,0]",[1,0,0,0,1,0,0,0,-1]],
  ["role",JSON.stringify("x".repeat(40000)),"head"],
  ["roles",'{"role":"head","__proto__":{}}',{role:"spouse"}],
])("%sの保存値が不正でも初期値で続ける",(key,raw,initial)=>{
  window.sessionStorage.setItem(prefix+key,raw);
  const {result}=renderHook(()=>useSessionParameter(key,initial));
  expect(result.current[0]).toEqual(initial);
});

test("キーが変わっても前の値で新しいキーを上書きしない",()=>{
  window.sessionStorage.setItem(prefix+"b","24");
  const {result,rerender}=renderHook(({id})=>useSessionParameter(id,0),{initialProps:{id:"a"}});
  act(()=>result.current[1](17));
  rerender({id:"b"});
  expect(result.current[0]).toBe(24);
  expect(window.sessionStorage.getItem(prefix+"a")).toBe("17");
});

test("保存を禁止されたブラウザでも、関数更新を含む通常の状態管理は続く",()=>{
  jest.spyOn(Storage.prototype,"getItem").mockImplementation(()=>{throw Error("SecurityError");});
  jest.spyOn(Storage.prototype,"setItem").mockImplementation(()=>{throw Error("QuotaExceededError");});
  const {result}=renderHook(()=>useSessionParameter("scale",1));
  act(()=>{result.current[1](n=>n+1);result.current[1](n=>n+1);});
  expect(result.current[0]).toBe(3);
});
