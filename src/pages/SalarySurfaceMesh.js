import { useEffect, useMemo, useRef, useState } from "react";
import { CAMERA_DISTANCE, HALF_Z, INITIAL_VIEW, makeScene, rotateView } from "./salarySurfaceCamera";
import { pickSalaryAtPointer, visibleSalaryCursor } from "./salarySurfacePick";
import SalaryBoundaryDetail, { readSalaryBoundary } from "./SalaryBoundaryDetail";
import "./SalarySurfaceMesh.css";
import { SURFACE_SYSTEMS } from "../calc/salarySurfaceSystems.js";
import { salaryInkGeometry, salaryInkRGB } from "./salarySurfaceInk.js";
import { useSessionParameter } from "./salarySimulatorSession";

const RESTART = 0xffffffff;
const fmt = n => n.toLocaleString("ja-JP", {maximumFractionDigits:2});
const clamp = (n, a, b) => Math.max(a, Math.min(n, b));

// Each consecutive triple in a row strip is exactly one triangle in a 1×1 cell.
// Restarting at every gap drops all (and only) triangles touching an unknown vertex.
export function salaryMeshIndices(heights, width) {
  const out = new Uint32Array((2 * width + 1) * (width - 1));
  let n = 0;
  for (let y = 0; y < width - 1; y++) {
    let start = n;
    for (let k = 0; k < 2 * width; k++) {
      const i = (y + (k % 2)) * width + (k >>> 1);
      if (Number.isFinite(heights[i])) out[n++] = i;
      else {
        if (n - start >= 3) out[n++] = RESTART;
        else n = start;
        start = n;
      }
    }
    if (n - start >= 3) out[n++] = RESTART;
    else n = start;
  }
  return out.subarray(0, n);
}

// Float heights on the GPU; X/Y follow directly from each index. No JS vertex objects.
const vertexSource = `#version 300 es
precision highp float;
precision highp int;
layout(location=0) in float height;
uniform int size;
uniform vec2 rangeZ;
uniform mat3 view;
uniform vec2 scale;
uniform float lensY;
uniform float pointSize;
out float norm;
out vec3 position;
void main() {
  vec2 xy = 2.0 * vec2(gl_VertexID % size, gl_VertexID / size) / float(size-1) - 1.0;
  norm = (height-rangeZ.x) / (rangeZ.y-rangeZ.x);
  float z = (2.0*norm-1.0)*${HALF_Z};
  position = vec3(xy,z);
  vec3 camera = view * position;
  float distanceFromEye = ${CAMERA_DISTANCE.toFixed(1)} + camera.z;
  gl_Position = vec4(scale*camera.xy+vec2(0.0,lensY*distanceFromEye), 2.0*camera.z, distanceFromEye);
  gl_PointSize = pointSize;
}`;
const fragmentSource = `#version 300 es
precision highp float;
in float norm;
in vec3 position;
uniform int ink;
uniform int inkCount;
uniform vec3 inkColors[${SURFACE_SYSTEMS.length}];
uniform float pixelRatio;
out vec4 color;
void main() {
  if (ink != 0) {
    int band = 0;
    if (ink == 2) {
      vec2 p = gl_PointCoord - .5;
      if (dot(p,p) > .25) discard;
      float turn = (atan(p.y, p.x+.000001) + 3.141593) / 6.283186;
      band = min(inkCount - 1, int(turn * float(inkCount)));
    } else if (inkCount > 1) {
      // The chevron phase changes along both screen axes at a constant CSS scale.
      vec2 p = gl_FragCoord.xy / pixelRatio;
      band = int(floor((p.x + abs(mod(p.y,48.)-24.)) / 3.)) % inkCount;
    }
    color = vec4(inkColors[band], 1.);
    return;
  }
  vec3 n = normalize(cross(dFdx(position), dFdy(position)));
  if (n.z < 0.0) n = -n;
  float light = 0.74 + 0.26*abs(dot(n, normalize(vec3(-0.55,-0.45,0.72))));
  vec3 base = mix(vec3(.52,.72,.78),vec3(.83,.90,.85),clamp(norm,0.0,1.0));
  color=vec4(base*light,1.0);
}`;

function createRenderer(canvas, surface) {
  const gl = canvas.getContext("webgl2", {alpha:true, antialias:false, depth:true});
  if (!gl) throw Error("WebGL 2を利用できないため、立体図は表示できません。");
  const shaders = [], buffers = [], program = gl.createProgram();
  let fence = null;
  const dispose = () => {
    if (fence) gl.deleteSync(fence);
    gl.useProgram(null);
    gl.bindBuffer(gl.ARRAY_BUFFER,null);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,null);
    buffers.forEach(b => gl.deleteBuffer(b));
    gl.deleteProgram(program);
    shaders.forEach(s => gl.deleteShader(s));
  };
  try {
    for (const [type, source] of [[gl.VERTEX_SHADER,vertexSource],[gl.FRAGMENT_SHADER,fragmentSource]]) {
      const s = gl.createShader(type);
      shaders.push(s); gl.shaderSource(s, source); gl.compileShader(s); gl.attachShader(program,s);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error("立体図の描画プログラムを起動できませんでした。");
    gl.useProgram(program);
    const bind = (target,data) => {
      const b=gl.createBuffer(); buffers.push(b); gl.bindBuffer(target,b); gl.bufferData(target,data,gl.STATIC_DRAW);
      return b;
    };
    const indices = salaryMeshIndices(surface.heights,surface.width);
    if (!indices.length) throw Error("隣接する算定点が足りないため、立体面を描けません。");
    const count=indices.length;
    bind(gl.ARRAY_BUFFER,surface.heights);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0,1,gl.FLOAT,false,0,0);
    const faceIndex=bind(gl.ELEMENT_ARRAY_BUFFER,indices);
    const indexBuffer=data=>({count:data.length, buffer:data.length?bind(gl.ELEMENT_ARRAY_BUFFER,data):null});
    const systems=SURFACE_SYSTEMS.map(s=>({...s,rgb:salaryInkRGB(s.color)}));
    const groups=salaryInkGeometry(surface,systems).map(({mask,points,lines,markers})=>{
      const members=systems.filter(s=>s.bit & mask);
      return {mask,colors:new Float32Array(members.flatMap(s=>s.rgb)),number:members.length,
        points:indexBuffer(points),lines:indexBuffer(lines),markers:indexBuffer(markers)};
    });
    if (gl.getError() !== gl.NO_ERROR) throw Error("立体図を描くためのGPUメモリを確保できませんでした。");
    gl.enable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.clearColor(0,0,0,0);
    gl.uniform1i(gl.getUniformLocation(program,"size"),surface.width);
    const rangeZ=gl.getUniformLocation(program,"rangeZ"), orientation=gl.getUniformLocation(program,"view"), scale=gl.getUniformLocation(program,"scale");
    const ink=gl.getUniformLocation(program,"ink"), pointSize=gl.getUniformLocation(program,"pointSize");
    const inkCount=gl.getUniformLocation(program,"inkCount"), inkColors=gl.getUniformLocation(program,"inkColors[0]");
    const pixelRatio=gl.getUniformLocation(program,"pixelRatio"), lensY=gl.getUniformLocation(program,"lensY");
    const drawIndices=(mode,{buffer,count:n})=>{
      if(buffer) { gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,buffer); gl.drawElements(mode,n,gl.UNSIGNED_INT,0); }
    };
    return {dispose, draw(scene,focusSystem) {
      // Keep at most one full-resolution frame in flight during dragging.
      if (fence) {
        const ready=gl.clientWaitSync(fence,0,0);
        if (ready===gl.TIMEOUT_EXPIRED) return false;
        gl.deleteSync(fence); fence=null;
      }
      const dpr=Math.min(2,window.devicePixelRatio||1), w=Math.round(scene.w*dpr), h=Math.round(scene.h*dpr);
      if (canvas.width!==w || canvas.height!==h) {canvas.width=w; canvas.height=h;}
      gl.viewport(0,0,w,h); gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      gl.uniform2f(rangeZ,scene.low,scene.high);
      const m=scene.matrix;
      gl.uniformMatrix3fv(orientation,false,[m[0],m[3],m[6],m[1],m[4],m[7],m[2],m[5],m[8]]);
      gl.uniform2f(scale,2*scene.focalPixels/scene.w,2*scene.focalPixels/scene.h);
      gl.uniform1f(lensY,1-2*scene.centerY/scene.h);
      gl.uniform1f(pointSize,1.8*dpr);
      gl.uniform1i(ink,0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,faceIndex);
      gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1,1);
      gl.drawElements(gl.TRIANGLE_STRIP,count,gl.UNSIGNED_INT,0);
      gl.disable(gl.POLYGON_OFFSET_FILL);
      // The same height buffer anchors all strokes to the observed, post-change salary point.
      // Keep depth testing: a boundary on the far side must not show through the surface.
      const focus=systems.find(s=>s.id===focusSystem);
      const visible=focus?groups.filter(g=>g.mask & focus.bit):groups;
      const palette=g=>{
        gl.uniform1i(inkCount,focus?1:g.number);
        gl.uniform3fv(inkColors,focus?focus.rgb:g.colors);
      };
      // Test against faces without letting an exactly coincident edge hide its
      // sector marker. The face pass of the next frame clears the depth buffer.
      gl.depthMask(false); gl.uniform1f(pixelRatio,dpr); gl.uniform1i(ink,1);
      for(const g of visible) {
        palette(g); drawIndices(gl.LINES,g.lines); drawIndices(gl.POINTS,g.points);
      }
      gl.uniform1i(ink,2); gl.uniform1f(pointSize,(focus?2.5:6)*dpr);
      for(const g of visible) if(g.markers.count) { palette(g); drawIndices(gl.POINTS,g.markers); }
      gl.depthMask(true);
      fence=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0);
      gl.flush();
      return true;
    }};
  } catch (e) {dispose(); throw e;}
}

const pointsAttr = pts=>pts.map(p=>p.join(",")).join(" ");
function zTicks(scene) {
  const target=(scene.high-scene.low)/(scene.w<420?3:5), order=10**Math.floor(Math.log10(target));
  const step=[1,2,5,10].reduce((a,b)=>Math.abs(a*order-target)<Math.abs(b*order-target)?a:b)*order;
  const values=[];
  for(let i=Math.ceil(scene.low/step); i<=Math.floor(scene.high/step); i++) values.push(i===0?0:i*step);
  return values;
}
function ReferencePlanes({scene}) {
  const {w,h,project:P}=scene;
  return <svg className="salary-grid-back" aria-hidden="true" viewBox={'0 0 '+w+' '+h}>
    <polygon points={pointsAttr([P(-1,-1,0),P(1,-1,0),P(1,1,0),P(-1,1,0)])}/>
  </svg>;
}

function Axes({scene,cursor,surface}) {
  const {w,h,low,high,project:P}=scene, max=surface.width-1;
  const axisTicks=(axis,at,values,outward)=>{
    const a=at(0),b=at(1),m=at(.5),out=outward(.5);
    const len=Math.max(4,Math.hypot(out[0]-m[0],out[1]-m[1]));
    const nx=(out[0]-m[0])/len,ny=(out[1]-m[1])/len;
    const vertical=axis==="可処分所得";
    const lm=at(w<520?.33:.47);
    const labelX=vertical ? clamp(b[0],44,w-44) : clamp(lm[0]+nx*38,42,w-42);
    const labelY=vertical ? clamp(b[1]-13,14,h-4) : clamp(lm[1]+ny*36+5,14,h-4);
    return <g key={axis} className="salary-mesh-axis"><line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]}/>
      {values.map(([t,value])=>{const [x,y]=at(t);return <g key={t}><line x1={x} y1={y} x2={x+nx*4} y2={y+ny*4}/>
        <text style={vertical?{textAnchor:"end"}:undefined} x={vertical?x-6:clamp(x+nx*15,19,w-19)} y={clamp(y+ny*14+3,12,h-4)}>{fmt(value)}</text></g>;})}
      <text className="salary-mesh-axis-name" x={labelX} y={labelY}>{axis}</text>
    </g>;
  };
  const fractions=w<410?[0,.5,1]:[0,1/3,2/3,1], ticks=fractions.map(t=>[t,max*t]);
  return <svg aria-hidden="true" viewBox={'0 0 '+w+' '+h}>
    {axisTicks("世帯主給与",t=>P(2*t-1,-1,0),ticks,t=>P(2*t-1,-1.2,0))}
    {axisTicks("配偶者給与",t=>P(-1,2*t-1,0),ticks.slice(1),t=>P(-1.2,2*t-1,0))}
    {axisTicks("可処分所得",t=>P(-1,-1,low+(high-low)*t),zTicks(scene).filter(z=>z!==0).map(z=>[(z-low)/(high-low),z]),t=>P(-1.2,-1.2,low+(high-low)*t))}
    <text className="salary-mesh-unit" x={w-12} y="20" textAnchor="end">万円／年</text>
    {cursor && <g aria-label="点P"><circle cx={cursor.px} cy={cursor.py} r="6" fill="#b9460c" stroke="white" strokeWidth="2"/><circle cx={cursor.px} cy={cursor.py} r="2" fill="#fff"/><text x={cursor.px+9} y={cursor.py-6} className="salary-mesh-unit">P</text></g>}
  </svg>;
}

export default function SalarySurfaceMesh({surface,head,spouse,selectedZ,calculator,onSelectSalary,fixedTotal=null}) {
  const canvas=useRef(null), frame=useRef(null), renderer=useRef(null), drag=useRef(null);
  const [size,setSize]=useState([640,410]), [view,setView]=useSessionParameter("camera",INITIAL_VIEW), [version,setVersion]=useState(0);
  const [state,setState]=useState(null), [painted,setPainted]=useState(null);
  const [hit,setHit]=useState(null);
  const [preferredSystem,setFocusSystem]=useSessionParameter("focusSystem",null);
  const focusSystem=surface?.changeBySystem?.[preferredSystem]?.points?.length ? preferredSystem : null;
  const ok=surface && surface.width>=2 && surface.heights?.length===surface.width**2 && surface.validCount>0 &&
    Number.isFinite(surface.min) && Number.isFinite(surface.max);
  const scene=useMemo(()=>ok?makeScene(size,view,surface):null,[size,view,surface,ok]);
  useEffect(()=>{
    const el=frame.current;
    if(!el) return undefined;
    const resize=()=>{const w=Math.round(el.clientWidth),h=Math.round(el.clientHeight);
      if(w>0&&h>0) setSize(old=>old[0]===w&&old[1]===h?old:[w,h]);};
    resize();
    if(typeof ResizeObserver!=="undefined"){const observer=new ResizeObserver(resize); observer.observe(el);return ()=>observer.disconnect();}
    window.addEventListener("resize",resize);return ()=>window.removeEventListener("resize",resize);
  },[ok]);
  useEffect(()=>{
    if(!ok) return undefined;
    const el=canvas.current;
    const lost=e=>{e.preventDefault();setState({surface,error:"GPUとの接続が失われました。立体図の復帰を待っています。"});};
    const restored=()=>setVersion(n=>n+1);
    el.addEventListener("webglcontextlost",lost);el.addEventListener("webglcontextrestored",restored);
    let r;
    try { r=createRenderer(el,surface);renderer.current=r;setState({surface,error:null});}
    catch(e){setState({surface,error:e.message||"立体図を描画できませんでした。"});}
    return ()=>{el.removeEventListener("webglcontextlost",lost);el.removeEventListener("webglcontextrestored",restored);renderer.current=null;r?.dispose();};
  },[surface,ok,version]);
  useEffect(()=>{
    if (!scene || state?.surface!==surface || state.error || !renderer.current) return undefined;
    let id;
    const redraw=()=>{if(renderer.current?.draw(scene,focusSystem)) setPainted({surface,scene}); else id=requestAnimationFrame(redraw);};
    id=requestAnimationFrame(redraw);
    return ()=>cancelAnimationFrame(id);
  },[scene,state,surface,focusSystem]);
  const rotate=(dx,dy)=>setView(prev=>rotateView(prev,dx,dy));
  const keys={ArrowLeft:[-8,0],ArrowRight:[8,0],ArrowUp:[0,-8],ArrowDown:[0,8]};
  const error=state?.surface===surface && state.error;
  const cursor=useMemo(()=>painted?.surface===surface && Number.isFinite(selectedZ)
    ? visibleSalaryCursor(surface,painted?.scene,head,spouse) : null,[painted,surface,head,spouse,selectedZ]);
  const inspected=hit && hit.surface===surface && hit.focus===focusSystem && hit.x===head && hit.y===spouse ? hit : null;
  function selectBoundary(e) {
    const d=drag.current;
    if(d?.id!==e.pointerId) return;
    drag.current=null;
    if(d.moved || !calculator || painted?.surface!==surface || !ok || error) return;
    const rect=e.currentTarget.getBoundingClientRect();
    const i=pickSalaryAtPointer(surface,painted.scene,e.clientX-rect.left,e.clientY-rect.top,focusSystem,fixedTotal,cursor);
    if(i===null) {setHit(null);return;}
    const x=i%surface.width,y=Math.floor(i/surface.width);
    const events=readSalaryBoundary(calculator,x,y,focusSystem);
    if(events.length) onSelectSalary?.(x,y);
    setHit(events.length?{surface,focus:focusSystem,x,y,z:surface.heights[i],events}:null);
  }
  return <div className="salary-mesh">
    {!ok && <p role="status">この範囲に算定できた給与点がないため、立体図を表示できません。</p>}
    {ok && <>{!error && <div className="salary-mesh-legend" role="group" aria-label="福祉制度の境界線">
      <span className="salary-mesh-legend-title">福祉制度の境界線</span>
      <button type="button" aria-pressed={focusSystem===null} onClick={()=>setFocusSystem(null)}>すべて</button>
      {SURFACE_SYSTEMS.map(({id,label,color})=>{
        const n=surface.changeBySystem?.[id]?.points?.length??0;
        return <button key={id} type="button" aria-label={label} aria-pressed={focusSystem===id} disabled={!n}
          title={n?`${label}の境界線（${fmt(n)}点）`:`${label}：この条件では境界なし`}
          onClick={()=>setFocusSystem(focusSystem===id?null:id)}>
          <i aria-hidden="true" style={{backgroundColor:color}}/>{label}
        </button>;
      })}
    </div>}
    <div className="salary-mesh-stage" ref={frame} tabIndex={error?-1:0} role="group"
      aria-label="立体図。矢印キーで回転、Homeキーで向きを戻す"
      onKeyDown={e=>{if(keys[e.key]){e.preventDefault();rotate(...keys[e.key]);}else if(e.key==="Home"){e.preventDefault();setView(INITIAL_VIEW);}}}
      onPointerDown={e=>{if(error || e.button!==0 || drag.current) return;drag.current={id:e.pointerId,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,moved:false};e.currentTarget.setPointerCapture(e.pointerId);}}
      onPointerMove={e=>{const d=drag.current;if(d?.id!==e.pointerId)return;
        if(!d.moved && Math.hypot(e.clientX-d.startX,e.clientY-d.startY)<3)return;
        d.moved=true; const dx=e.clientX-d.x,dy=e.clientY-d.y; d.x=e.clientX;d.y=e.clientY;rotate(dx*.55,dy*.55);}}
      onLostPointerCapture={()=>{drag.current=null;}} onPointerUp={selectBoundary} onPointerCancel={()=>{drag.current=null;}}>
      {!error && painted?.surface===surface && <ReferencePlanes scene={painted.scene}/>}
      <canvas ref={canvas} aria-hidden="true"/>
      {!error && painted?.surface===surface && <Axes scene={painted.scene} cursor={cursor} surface={surface}/>}
      {error && <p className="salary-mesh-error" role="status">{error}</p>}
    </div>{inspected && <SalaryBoundaryDetail events={inspected.events}/>}</>}
  </div>;
}
