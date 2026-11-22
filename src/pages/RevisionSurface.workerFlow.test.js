import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RevisionSurface } from "./RevisionSurface";
import createWorker from "./createSalarySurfaceWorker";

jest.mock("./createSalarySurfaceWorker", () => ({ __esModule:true, default:jest.fn() }));
jest.mock("./SalarySurfaceMesh", () => ({head, spouse, selectedZ,surface}) => <output data-testid="mesh" data-width={surface.width}>{head}/{spouse}/{selectedZ}</output>);
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

test("差額タブには2D色分布だけを表示し、3D面・柱状図・表示形式切替を設けない",async()=>{
  const original=global.Worker;global.Worker=jest.fn();
  const worker={postMessage:jest.fn(),terminate:jest.fn()};createWorker.mockReset().mockReturnValue(worker);
  try{
    const inputs={children:[{age:8}]};
    render(<RevisionSurface comparison inputs={inputs} head={1} spouse={0} point={{status:"calculated",differenceYen:50000}}/>);
    await waitFor(()=>expect(worker.postMessage).toHaveBeenCalledTimes(1));
    const e={headWan:1,spouseWan:0,differenceYen:50000,count:1};
    act(()=>worker.onmessage({data:{type:"complete",width:2,heights:new Float32Array([NaN,5,6,7]),min:5,max:7,validCount:3,negativeCount:0,minimum:e,maximum:{...e,differenceYen:70000}}}));
    expect(screen.queryByTestId("mesh")).toBeNull();
    expect(screen.queryByText(/追加柱状図/)).toBeNull();
    expect(screen.queryByRole("button",{name:"平面図"})).toBeNull();
    expect(screen.getByText("追加平面図 3点")).toBeVisible();
    expect(worker.postMessage).toHaveBeenCalledTimes(1);
  }finally{if(original===undefined)delete global.Worker;else global.Worker=original;}
});

test("共有計算では未描画・進捗・失敗でも個別ワーカーを作らず、別タブでの完了後も同じ面を使える",async()=>{
  const previous=global.Worker;global.Worker=jest.fn();
  createWorker.mockReset();
  const inputs={children:[{age:8}]},retry=jest.fn();
  const e={headWan:1,spouseWan:0,differenceYen:50000,count:1};
  const complete={type:"complete",income:{width:2,validCount:3},comparison:{width:3,validCount:8,
    negativeCount:0,minimum:e,maximum:e}};
  const view=(datasetState,comparison=false)=><RevisionSurface inputs={inputs} datasetState={datasetState}
    comparison={comparison} head={1} spouse={0} point={{status:"calculated",studyDisposableWan:105,differenceYen:50000}}/>;
  try{
    const first=render(view(null));
    expect(screen.queryByText(/計算中|計算を開始できません/)).toBeNull();
    first.rerender(view({type:"progress",percent:38}));
    expect(screen.getByText(/計算中：38%/)).toBeVisible();
    first.rerender(view({type:"error",message:"共有計算に失敗",retry}));
    expect(screen.getByText(/共有計算に失敗/)).toBeVisible();
    fireEvent.click(screen.getByRole("button",{name:"再計算"}));
    expect(retry).toHaveBeenCalledTimes(1);
    first.unmount(); // 別タブへ。完了後に再マウントする。
    const second=render(view(complete,true));
    expect(screen.queryByTestId("mesh")).toBeNull();
    expect(screen.getByText("追加平面図 8点")).toBeVisible();
    second.rerender(view(complete));
    expect(screen.getByTestId("mesh")).toHaveAttribute("data-width","2");
    expect(screen.getByText("1/0/105")).toBeVisible();
    second.rerender(view(null)); // 世帯変更直後に直前の面を残さない。
    expect(screen.queryByTestId("mesh")).toBeNull();
    await act(async()=>{}); // 遅延importが存在する場合も検知する。
    expect(createWorker).not.toHaveBeenCalled();
  }finally{if(previous===undefined)delete global.Worker;else global.Worker=previous;}
});
