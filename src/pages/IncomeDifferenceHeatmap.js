import {useEffect,useMemo,useRef,useState} from "react";
import "./IncomeDifferenceHeatmap.css";
import {DifferenceExtrema} from "./IncomeDifferenceReadout";
import {DIFFERENCE_PALETTE,differenceHeatmapPixels} from "./prepareSalaryGraphDrawing.js";
import {WIDTH as W,HEIGHT as H,LEFT as L,RIGHT as R,TOP as T,BOTTOM as B,viewBox,xPlot,yPlot} from "./SalaryPlaneAxes";

const plotBox={left:L/W*100+"%",top:T/H*100+"%",width:(R-L)/W*100+"%",height:(B-T)/H*100+"%"};
const format=new Intl.NumberFormat("ja-JP",{maximumFractionDigits:4});
const fmt=v=>Number.isFinite(v)?format.format(v):"—";
const signed=v=>(v>0?"＋":v<0?"−":"")+fmt(Math.abs(v));
const {missing:MISS,zero:ZERO,negative:MINUS,positive:PLUS}=DIFFERENCE_PALETTE;
const boundOf=s=>Math.max(Math.abs(s.min??0),Math.abs(s.max??0));
const rgb=(c)=>"rgb("+c.join(",")+")";

/** 1整数給与点＝1画素。入力は横軸（世帯主）が内側、縦軸（配偶者）が外側で下から上に増加。 */
function paint(ctx,surface){
  const {width}=surface,pixels=surface.heatmapPixels??differenceHeatmapPixels(surface);
  if(typeof ImageData==="function")ctx.putImageData(new ImageData(pixels,width,width),0,0);
  else{
    const img=ctx.createImageData(width,width);img.data.set(pixels);ctx.putImageData(img,0,0);
  }
}

function ticks(n){
  if(n===0)return [0];
  const step=Math.max(1,Math.ceil(n/6));
  const values=[];for(let i=0;i<=n;i+=step)values.push(i);
  if(values[values.length-1]!==n)values.push(n);
  return values;
}
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));

// Pin the representative salary coordinates already used in the readout.
// Values and ties come from the full integer-yen grid, not the display colours.
function ExtremeOverlay({surface,sx,sy,valid}){
  const {minimum,maximum}=surface;
  if(!minimum||!maximum||!valid(minimum.headWan,minimum.spouseWan)||!valid(maximum.headWan,maximum.spouseWan))return null;
  if(minimum.differenceYen===maximum.differenceYen)return <text className="diff-extreme-label"
    x={(L+R)/2} y={(T+B)/2} textAnchor="middle">全算定点：最小＝最大　{signed(minimum.differenceYen)}円／年</text>;
  const marks=[["maximum","最大点",maximum],["minimum","最小点",minimum]].map(([id,label,p],i)=>{
    const x=sx(p.headWan),y=sy(p.spouseWan),side=x<(L+R)/2?1:-1;
    return {id,label,p,x,y,side,tx:x+side*14,ty:clamp(y+(i?23:-14),T+18,B-7)};
  });
  // At the plot edges the two callouts can be clamped onto the same row.
  // Move the labels only; both symbols stay at the actual salary coordinates.
  if(Math.abs(marks[0].x-marks[1].x)<230 && Math.abs(marks[0].ty-marks[1].ty)<23){
    const mid=clamp((marks[0].ty+marks[1].ty)/2,T+32,B-21);
    marks[0].ty=mid-14;marks[1].ty=mid+14;
  }
  return marks.map(({id,label,p,x,y,side,tx,ty})=><g key={id} data-difference-extreme={id} transform={`translate(${x} ${y})`}>
    <title>{label}：世帯主 {fmt(p.headWan)}万円、配偶者 {fmt(p.spouseWan)}万円、可処分所得差 {signed(p.differenceYen)}円／年{p.count>1?`（同額 ${fmt(p.count)}点の一例）`:""}</title>
    <line className="diff-extreme-leader" x2={tx-x} y2={ty-y-5}/>
    <path className="diff-extreme-mark" d={id==="maximum"?"M0 -7 L7 5 L-7 5 Z":"M0 7 L7 -5 L-7 -5 Z"}/>
    <text className="diff-extreme-label" x={tx-x} y={ty-y} textAnchor={side===1?"start":"end"}>{label}　{signed(p.differenceYen)}円</text>
  </g>);
}

/** 各給与点の差をそのまま描く。指示点の金額は表示用Float32ではなく共有格子の円額を優先する。 */
export default function IncomeDifferenceHeatmap({surface,grid,lookupPair,differenceYen=grid?.differenceYen}){
  const canvas=useRef(null),[failed,setFailed]=useState(false),[hover,setHover]=useState(null);
  const {width,heights}=surface,max=width-1;
  const stepTicks=useMemo(()=>ticks(max),[max]),bound=boundOf(surface);
  const sx=v=>xPlot(v,max||1),sy=v=>yPlot(v,max||1);
  // The ends of both axes pass through the centres of the first and last pixels.
  // Crop the outer half pixels so salary coordinates match the boundary map exactly.
  const rasterSize=(max>0?width/max:1)*100+"%";
  const valid=(x,y)=>Number.isInteger(x)&&Number.isInteger(y)&&x>=0&&y>=0&&x<width&&y<width&&(x!==0||y!==0)&&Number.isFinite(heights[y*width+x]);
  useEffect(()=>{
    setHover(null);
    try{
      const ctx=canvas.current.getContext("2d");
      if(!ctx)throw new Error("canvas-unavailable");
      paint(ctx,surface);setFailed(false);
    }catch{setFailed(true);}
  },[surface]);
  function readPosition(e){
    const box=e.currentTarget.getBoundingClientRect();if(!box.width||!box.height)return null;
    const fx=(e.clientX-box.left)/box.width,fy=1-(e.clientY-box.top)/box.height;
    if(fx<0||fx>1||fy<0||fy>1)return null;
    const x=clamp(Math.floor(fx*width),0,max),y=clamp(Math.floor(fy*width),0,max);
    return valid(x,y)?[x,y]:null;
  }
  function key(e){
    const moves={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowDown:[0,-1],ArrowUp:[0,1]},move=moves[e.key];
    if(!move)return;
    e.preventDefault();
    const [dx,dy]=move;
    const x=(hover?.[0]??0)+dx,y=(hover?.[1]??0)+dy;
    if(valid(x,y))setHover([x,y]);
  }
  const shown=hover&&valid(...hover)?hover:null;
  return <figure className="diff-heatmap" aria-label="可処分所得差の平面図">
    <figcaption>年間可処分所得差（設定した世帯 − 同じ給与・家族構成で子に障害がない世帯）</figcaption>
    {failed&&<p role="alert">この環境では平面図を描画できません。</p>}
    <div className="diff-map-frame" style={{aspectRatio:W+" / "+H}}>
      <div className="diff-map-raster" style={plotBox}><canvas ref={canvas} width={width} height={width} style={{width:rasterSize,height:rasterSize}} role="img" tabIndex="0" aria-label="横軸：世帯主の給与収入、縦軸：配偶者の給与収入。色は障害の有無による可処分所得差"
        onPointerMove={e=>{const q=readPosition(e);setHover(old=>old?.[0]===q?.[0]&&old?.[1]===q?.[1]?old:q);}}
        onClick={e=>setHover(readPosition(e))} onKeyDown={key}/></div>
      <svg className="diff-map-axes" viewBox={viewBox} aria-hidden="true">
        <rect x={L} y={T} width={R-L} height={B-T} fill="none" stroke="#6e8084"/>
        {stepTicks.map(x=><g key={x}><path d={`M${sx(x)} ${B}v6 M${L} ${sy(x)}h-6`} stroke="#486468"/>
          <text x={sx(x)} y={B+25} textAnchor="middle">{fmt(x)}</text><text x={L-10} y={sy(x)+5} textAnchor="end">{fmt(x)}</text></g>)}
        <text className="diff-axis-title" x={(L+R)/2} y={H-15} textAnchor="middle">世帯主の給与収入（万円／年）</text>
        <text className="diff-axis-title" transform={`translate(21 ${(T+B)/2}) rotate(-90)`} textAnchor="middle">配偶者の給与収入（万円／年）</text>
        <ExtremeOverlay surface={surface} sx={sx} sy={sy} valid={valid}/>
      </svg>
    </div>
    <div className="diff-key" aria-label="可処分所得差の色の目盛">
      <span>可処分所得差（万円／年）</span>
      {bound>0?<div className="diff-scale">
        <div aria-hidden="true" className="diff-ramp" style={{background:`linear-gradient(to right,${rgb(MINUS[1])},${rgb(MINUS[0])} 49.8%,${rgb(ZERO)} 49.8%,${rgb(ZERO)} 50.2%,${rgb(PLUS[0])} 50.2%,${rgb(PLUS[1])})`}}/>
        <div className="diff-stops"><span>{signed(-bound)}</span><span>0</span><span>{signed(bound)}</span></div>
      </div>:<span><i style={{background:rgb(ZERO)}}/>0</span>}
      <span><i style={{background:rgb(MISS)}}/>算定外</span>
    </div>
    <DifferenceExtrema surface={surface} grid={grid} lookupPair={lookupPair} shown={shown&&{headWan:shown[0],spouseWan:shown[1],
      differenceYen:differenceYen?.[shown[1]*width+shown[0]]}}/>
  </figure>;
}
