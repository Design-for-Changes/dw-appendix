/** @jest-environment node */
/* global globalThis */
import { buildSalarySurfaceGrid } from "../calc/salarySurfaceGrid.js";
import "./salarySurface.worker.js";

jest.mock("../calc/salarySurfaceGrid.js", () => ({buildSalarySurfaceGrid:jest.fn()}));
beforeEach(() => {
  const {buildSalarySurfaceGrid: build} = jest.requireActual("../calc/salarySurfaceGrid.js");
  buildSalarySurfaceGrid.mockImplementation((calculator, options) => build(calculator, {...options, maxSalaryWan:2}));
});

const originalPost = globalThis.postMessage;
afterEach(() => {
  if (originalPost === undefined) delete globalThis.postMessage;
  else globalThis.postMessage = originalPost;
  jest.clearAllMocks();
});

test("startに進捗と完成格子を返し、Float32バッファの所有権を渡す", () => {
  const send = jest.fn();
  globalThis.postMessage = send;
  globalThis.onmessage({data:{type:"start", inputs:{protocol:"paper-2029", serviceAmountYen:0, children:[{
    age:8, tccaGrade:"not", welfareEligible:false, taxStatus:"none", serviceUser:false,
  }]}}});
  expect(buildSalarySurfaceGrid).toHaveBeenCalledTimes(1);
  const messages = send.mock.calls;
  expect(messages.slice(0,-1).map(([message]) => message)).toEqual(
    [0,3,6,9].map(done => ({type:"progress", done, total:9})));
  const [result, transfers] = messages[messages.length - 1];
  expect(result).toMatchObject({type:"complete", width:3, validCount:8, min:expect.any(Number), max:expect.any(Number)});
  expect(result.heights).toBeInstanceOf(Float32Array);
  expect(result.heights[0]).toBeNaN();
  const buffers=[result.heights.buffer,result.changePoints.buffer,result.changeLines.buffer];
  for(const geometry of Object.values(result.changeBySystem)) {
    expect(geometry.points).toBeInstanceOf(Uint32Array);
    expect(geometry.lines).toBeInstanceOf(Uint32Array);
    buffers.push(geometry.points.buffer,geometry.lines.buffer);
  }
  expect(Object.keys(result.changeBySystem)).toEqual(["N01-1","N01-2","N02/N03"]);
  expect(new Set(buffers).size).toBe(buffers.length);
  expect(transfers).toEqual(buffers);
  expect(result.changePoints).toBeInstanceOf(Uint32Array);
  expect(result.changeLines).toBeInstanceOf(Uint32Array);
});

test("対象外のメッセージは無視し、入力不正は完成と区別してエラーを返す", () => {
  const send = jest.fn();
  globalThis.postMessage = send;
  globalThis.onmessage({data:{type:"irrelevant"}});
  expect(send).not.toHaveBeenCalled();
  globalThis.onmessage({data:{type:"start", inputs:{children:[]}}});
  expect(send.mock.calls).toEqual([[{type:"error", message:expect.stringMatching(/子ども/)}]]);
});
