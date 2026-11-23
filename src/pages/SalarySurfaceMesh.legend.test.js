import {fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import SalarySurfaceMesh from "./SalarySurfaceMesh";
import {SURFACE_SYSTEMS} from "../calc/salarySurfaceSystems";

// Verify the connection from the accessible legend to the actual draw uniforms.
// Shader compilation, depth and pixel colors themselves require a real browser.
function mockWebGL() {
  const gl = {NO_ERROR:0, TIMEOUT_EXPIRED:1, LINK_STATUS:2};
  for (const name of ("createProgram createShader createBuffer fenceSync getUniformLocation deleteSync useProgram " +
    "bindBuffer deleteBuffer deleteProgram deleteShader shaderSource compileShader attachShader linkProgram " +
    "bufferData enableVertexAttribArray vertexAttribPointer enable disable clearColor uniform1i uniform1f " +
    "uniform2f uniform3fv uniformMatrix3fv viewport clear polygonOffset drawElements drawArrays blendFuncSeparate depthMask flush").split(" ")) gl[name]=jest.fn();
  for (const name of ["createProgram","createShader","createBuffer","fenceSync"]) gl[name].mockImplementation(()=>({}));
  gl.getUniformLocation.mockImplementation((_, name)=>name);
  gl.getProgramParameter=()=>true; gl.getError=()=>gl.NO_ERROR; gl.clientWaitSync=()=>0;
  return gl;
}

test("凡例の単独選択は共通線の実際の描画色を一色にし、すべてで元に戻す", async () => {
  const gl=mockWebGL(), context=jest.spyOn(HTMLCanvasElement.prototype,"getContext").mockReturnValue(gl);
  const [special,welfare,services]=SURFACE_SYSTEMS;
  const u=(...arr)=>Uint32Array.from(arr);
  const segment={points:u(2,5),lines:u(2,5)};
  const surface={width:3,heights:new Float32Array(9).fill(10),min:10,max:10,validCount:9,
    changePoints:u(2,5),changeBySystem:{[special.id]:segment,[welfare.id]:segment,[services.id]:segment}};
  const paletteSize=()=>gl.uniform1i.mock.calls.filter(([name])=>name==="inkCount").map(([,value])=>value).pop();
  try {
    const result=render(<SalarySurfaceMesh surface={surface} head={0} spouse={0} selectedZ={10}/>);
    for (const parent of ["世帯主","配偶者"]) expect(await screen.findByText(parent+"の年間給与（万円）")).toBeVisible();
    const legend=within(screen.getByRole("group",{name:"福祉制度の境界線"}));
    const all=legend.getByRole("button",{name:"すべて"}), aButton=legend.getByRole("button",{name:special.label});
    expect(legend.getAllByRole("button")).toHaveLength(4);
    expect(legend.getByRole("button",{name:welfare.label})).toBeEnabled();
    expect(legend.getByRole("button",{name:services.label})).toBeEnabled();
    expect(legend.queryByRole("button",{name:/税|年金|健保|健康保険/})).not.toBeInTheDocument();
    expect(all).toHaveAttribute("aria-pressed","true");
    await waitFor(()=>expect(paletteSize()).toBe(3));
    fireEvent.click(aButton);
    expect(aButton).toHaveAttribute("aria-pressed","true");
    await waitFor(()=>expect(paletteSize()).toBe(1));
    fireEvent.click(all);
    await waitFor(()=>expect(paletteSize()).toBe(3));
    const partial={...surface,changeBySystem:{[special.id]:segment}};
    result.rerender(<SalarySurfaceMesh surface={partial} head={0} spouse={0} selectedZ={10}/>);
    expect(legend.getByRole("button",{name:services.label})).toBeDisabled();
    result.unmount();
  } finally { context.mockRestore(); }
});

test.each([false,true])("JのWebGL描画は符号・0面だけを描き、Gの制度境界用バッファを作らない（全点同額=%s）",async flat=>{
  const gl=mockWebGL(), context=jest.spyOn(HTMLCanvasElement.prototype,"getContext").mockReturnValue(gl);
  const sel=jest.fn(), max=flat?0:.0001, min=flat?0:-.0001;
  const surface={kind:"disability-difference",width:3,
    heights:Float32Array.from([NaN,min,0,min,0,max,0,max,max]),min,max,validCount:8,
    minimum:{headWan:flat?1:2,spouseWan:flat?0:0,differenceYen:flat?0:-1},
    maximum:{headWan:2,spouseWan:1,differenceYen:flat?0:1}};
  if(!flat) surface.heights[2]=min;
  try{
    const result=render(<SalarySurfaceMesh surface={surface} head={1} spouse={1} selectedZ={0} onSelectSalary={sel}/>);
    for(const text of ["負","差なし（0）","正"]) expect(within(screen.getByRole("group",{name:"可処分所得差の符号"})).getByText(text)).toBeInTheDocument();
    expect(screen.queryByRole("group",{name:"福祉制度の境界線"})).not.toBeInTheDocument();
    await waitFor(()=>expect(gl.drawArrays).toHaveBeenCalled());
    expect(gl.createBuffer).toHaveBeenCalledTimes(2); // 高さ・面インデックスのみ
    expect(gl.uniform1i.mock.calls.filter(([id])=>id==="zeroPlane").map(([,v])=>v).slice(-2)).toEqual([0,1]);
    expect(gl.uniform1i.mock.calls.some(([id])=>id==="ink")).toBe(false);
    expect(screen.getByText("可処分所得差",{selector:"svg text"})).toBeInTheDocument();
    expect(screen.getByText("0.0001",{selector:"svg text"})).toBeInTheDocument();
    if(flat) expect(screen.getByText("最小＝最大")).toBeInTheDocument();
    result.unmount();
  }finally{context.mockRestore();}
});
