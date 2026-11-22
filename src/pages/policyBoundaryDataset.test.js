import {act, render, screen, waitFor} from "@testing-library/react";
import {usePolicyBoundaryDataset, retryPolicyBoundaryDataset} from "./policyBoundaryDataset";
import createPolicyOnlyWorker from "./createPolicyOnlyWorker";

jest.mock("./createPolicyOnlyWorker",()=>({__esModule:true,default:jest.fn()}));
const jobKey=tag=>JSON.stringify({inputs:{tag},options:{}});
function Probe({cacheKey}) {
  const value=usePolicyBoundaryDataset(cacheKey);
  return <span>{value?.type || "idle"}:{value?.percent ?? value?.result?.maxSalaryWan ?? ""}</span>;
}
beforeEach(()=>createPolicyOnlyWorker.mockReset());

test("制度図を離れても計算を中断せず、同じ条件へ戻ると結果を再利用",async()=>{
  const worker={postMessage:jest.fn(),terminate:jest.fn()};
  createPolicyOnlyWorker.mockReturnValue(worker);
  const key=jobKey("resume");
  const {rerender}=render(<Probe cacheKey={null}/>);
  expect(screen.getByText("idle:")).toBeVisible();
  expect(createPolicyOnlyWorker).not.toHaveBeenCalled();
  rerender(<Probe cacheKey={key}/>);
  await waitFor(()=>expect(worker.postMessage).toHaveBeenCalledTimes(1));
  const {jobId,...payload}=worker.postMessage.mock.calls[0][0];
  expect(payload).toEqual(JSON.parse(key));
  act(()=>worker.onmessage({data:{jobId:jobId-1,type:"progress",percent:33}}));
  expect(screen.getByText("progress:0")).toBeVisible();
  act(()=>worker.onmessage({data:{jobId,type:"progress",percent:33}}));
  expect(screen.getByText("progress:33")).toBeVisible();
  rerender(<Probe cacheKey={null}/>);
  expect(worker.terminate).not.toHaveBeenCalled();
  act(()=>worker.onmessage({data:{jobId,type:"result",result:{maxSalaryWan:1500,layers:[]}}}));
  rerender(<Probe cacheKey={key}/>);
  expect(screen.getByText("ready:1500")).toBeVisible();
  expect(worker.terminate).toHaveBeenCalledTimes(1);
  expect(createPolicyOnlyWorker).toHaveBeenCalledTimes(1);
});

test("計算エラーを保持したままにせず、同じ条件で再実行できる",async()=>{
  const worker={postMessage:jest.fn(),terminate:jest.fn()};
  createPolicyOnlyWorker.mockImplementationOnce(()=>{throw Error("worker unavailable")}).mockReturnValueOnce(worker);
  const key=jobKey("retry");
  render(<Probe cacheKey={key}/>);
  await screen.findByText("error:");
  act(()=>retryPolicyBoundaryDataset(key));
  await waitFor(()=>expect(worker.postMessage).toHaveBeenCalledTimes(1));
  const {jobId}=worker.postMessage.mock.calls[0][0];
  act(()=>worker.onmessage({data:{jobId,type:"result",result:{maxSalaryWan:1500,layers:[]}}}));
  expect(screen.getByText("ready:1500")).toBeVisible();
});
