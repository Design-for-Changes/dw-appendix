import { act, render, screen, waitFor } from "@testing-library/react";
import { RevisionSurface } from "./RevisionSurface";
import createWorker from "./createSalarySurfaceWorker";

jest.mock("./createSalarySurfaceWorker", () => ({ __esModule:true, default:jest.fn() }));
jest.mock("./SalarySurfaceMesh", () => ({head, spouse, selectedZ}) => <output>{head}/{spouse}/{selectedZ}</output>);

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
