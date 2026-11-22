import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RevisionSurface } from "./RevisionSurface";
import createWorker from "./createSalarySurfaceWorker";

jest.mock("./createSalarySurfaceWorker", () => ({ __esModule:true, default:jest.fn() }));
jest.mock("./SalarySurfaceMesh", () => ({head, spouse, selectedZ}) => <output>{head}/{spouse}/{selectedZ}</output>);
jest.mock("./IncomeDifferenceBars",()=>({surface})=><div>追加柱状図 {surface.validCount}点</div>);
jest.mock("./IncomeDifferenceHeatmap",()=>({surface})=><div>追加平面図 {surface.validCount}点</div>);

test("給与点だけの移動では格子を再計算せず、世帯変更で古いワーカーの結果を破棄する", async () => {
  const original = global.Worker;
  global.Worker = jest.fn();
  const make = () => ({postMessage:jest.fn(), terminate:jest.fn()});
  const a = make(), b = make();
  createWorker.mockReturnValueOnce(a).mockReturnValueOnce(b);
  const inputs1 = {children:[{age:8}]}, inputs2 = {children:[{age:9}]};
  const view = (inputs, head, z) => <RevisionSurface inputs={inputs} head={head} spouse={0} point={{studyDisposableWan:z}} />;
  try {
    const {rerender,unmount} = render(view(inputs1,123,99));
    await waitFor(() => expect(a.postMessage).toHaveBeenCalledWith({type:"start",inputs:inputs1}));
    rerender(view(inputs1,124,100));
    expect(createWorker).toHaveBeenCalledTimes(1);
    const end = {type:"complete",width:2,heights:new Float32Array([NaN,5,6,7]),min:5,max:7,validCount:3};
    act(()=>a.onmessage({data:end}));
    expect(screen.getByText("124/0/100")).toBeInTheDocument();
    rerender(view(inputs2,124,75));
    expect(screen.queryByText("124/0/100")).not.toBeInTheDocument();
    await waitFor(() => expect(b.postMessage).toHaveBeenCalledTimes(1));
    act(()=>a.onmessage({data:end}));
    expect(screen.queryByText("124/0/75")).not.toBeInTheDocument();
    act(()=>b.onmessage({data:end}));
    expect(screen.getByText("124/0/75")).toBeInTheDocument();
    unmount();
    expect(b.terminate).toHaveBeenCalled();
  } finally {
    if (original === undefined) delete global.Worker; else global.Worker=original;
  }
});

test("Jでは旧3D図を残し、同じ計算結果で追加の柱状図と平面図を切り替える",async()=>{
  const original=global.Worker;global.Worker=jest.fn();
  const worker={postMessage:jest.fn(),terminate:jest.fn()};createWorker.mockReset().mockReturnValue(worker);
  try{
    const inputs={children:[{age:8}]};
    render(<RevisionSurface comparison inputs={inputs} head={1} spouse={0} point={{status:"calculated",differenceYen:50000}}/>);
    await waitFor(()=>expect(worker.postMessage).toHaveBeenCalledTimes(1));
    const e={headWan:1,spouseWan:0,differenceYen:50000,count:1};
    act(()=>worker.onmessage({data:{type:"complete",width:2,heights:new Float32Array([NaN,5,6,7]),min:5,max:7,validCount:3,negativeCount:0,minimum:e,maximum:{...e,differenceYen:70000}}}));
    expect(screen.getByText("1/0/5")).toBeVisible();
    expect(screen.getByText("追加柱状図 3点")).toBeVisible();
    fireEvent.click(screen.getByRole("button",{name:"平面図"}));
    expect(screen.getByText("1/0/5")).toBeVisible();
    expect(screen.getByText("追加平面図 3点")).toBeVisible();
    expect(worker.postMessage).toHaveBeenCalledTimes(1);
  }finally{if(original===undefined)delete global.Worker;else global.Worker=original;}
});
