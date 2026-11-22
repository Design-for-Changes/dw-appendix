import {salaryLevelChannel} from "./salaryLevelContourState";

const grid=()=>({width:2,netYen:new Int32Array([0,10,20,30])});
const tick=()=>new Promise(done=>setTimeout(done,0));
const fake=()=>({postMessage:jest.fn(),terminate:jest.fn()});

test("水平切断は1枚の格子を共有し、切断高ごとに結果を対応させる",async()=>{
  const w=fake(),g=grid(),make=jest.fn(async()=>w);
  const ch=salaryLevelChannel(g,make),a=ch.request(12),b=ch.request(13);
  expect(ch.request(12)).toBe(a);
  await tick();
  expect(w.postMessage.mock.calls.map(c=>c[0].type)).toEqual(["grid","level","level"]);
  expect(w.postMessage.mock.calls[0][0].grid.netYen).toBe(g.netYen);
  const segs=[[.5,0,.5,.5]];
  w.onmessage({data:{type:"result",levelYen:13,segments:segs}});
  w.onmessage({data:{type:"result",levelYen:12,segments:[]}});
  expect(await b).toEqual(segs);expect(await a).toEqual([]);
  ch.close();
  const again=salaryLevelChannel(g,make);
  expect(await again.request(13)).toEqual(segs);
  expect(make).toHaveBeenCalledTimes(1);
  again.close();
});

test("切断中に開く世帯を替えた場合、旧結果は新しい世帯に渡さない",async()=>{
  const w=fake(),ch=salaryLevelChannel(grid(),async()=>w);
  const outcome=expect(ch.request(47)).rejects.toThrow("closed");
  await tick();ch.close();await outcome;
  expect(w.terminate).toHaveBeenCalledTimes(1);
  const w2=fake(),ch2=salaryLevelChannel(grid(),async()=>w2);
  const v=ch2.request(47);await tick();
  w2.onmessage({data:{type:"result",levelYen:47,segments:[[0,.5,1,.5]]}});
  expect(await v).toEqual([[0,.5,1,.5]]);
  ch2.close();
});
