import {useEffect,useMemo,useRef,useState} from "react";
import "./IncomeDifferenceHeatmap.css";

const W=1000,H=625,L=99,R=974,T=20,B=554;
const format=new Intl.NumberFormat("ja-JP",{maximumFractionDigits:4});
const fmt=v=>Number.isFinite(v)?format.format(v):"—";
const signed=v=>(v>0?"＋":v<0?"−":"")+fmt(Math.abs(v));
const MISS=[110,121,128],ZERO=[251,250,246],MINUS=[[251,221,228],[174,52,84]],PLUS=[[215,237,235],[19,127,131]];

// 1 = zero, 0 = not calculated. Any nonzero amount, including ±1 yen, gets a
// sign-specific colour before magnitude is encoded. Zero is not a band.
const LUT=[MISS,ZERO,...[MINUS,PLUS].flatMap(([a,b])=>Array.from({length:256},(_,i)=>
  a.map((v,c)=>Math.round(v+(b[c]-v)*i/255))))];
const boundOf=s=>Math.max(Math.abs(s.min??0),Math.abs(s.max??0));
const rgb=(c)=>"rgb("+c.join(",")+")";

/** 1整数給与点＝1画素。入力は横軸（世帯主）が内側、縦軸（配偶者）が外側で下から上に増加。 */
function paint(ctx,surface){
  const {width,heights}=surface,bound=boundOf(surface),img=ctx.createImageData(width,width),data=img.data;
  for(let y=0;y<width;y++){
    let dst=(width-1-y)*width*4;
    for(let x=0;x<width;x++,dst+=4){
      const v=heights[y*width+x],code= !Number.isFinite(v)||(x===0&&y===0)?0:v===0?1:
        (v<0?2:258)+Math.min(255,Math.round(255*Math.abs(v)/(bound||1)));
      const c=LUT[code];data[dst]=c[0];data[dst+1]=c[1];data[dst+2]=c[2];data[dst+3]=255;
    }
  }
  ctx.putImageData(img,0,0);
}

function ticks(n){
  if(n===0)return [0];
  const step=Math.max(1,Math.ceil(n/6));
  const values=[];for(let i=0;i<=n;i+=step)values.push(i);
  if(values[values.length-1]!==n)values.push(n);
  return values;
}
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));

/** Jの3D面と同一の全給与格子を平面に投影。点Pを動かしてもラスターは描き直さない。 */
export default function IncomeDifferenceHeatmap({surface,head,spouse,onSelectSalary,fixedTotal=null}){
  const canvas=useRef(null),[failed,setFailed]=useState(false),[hover,setHover]=useState(null);
  const {width,heights}=surface,max=width-1;
  const stepTicks=useMemo(()=>ticks(max),[max]),bound=boundOf(surface);
  const sx=v=>L+(v+.5)/width*(R-L),sy=v=>B-(v+.5)/width*(B-T);
  const valid=(x,y)=>Number.isInteger(x)&&Number.isInteger(y)&&x>=0&&y>=0&&x<width&&y<width&&(x!==0||y!==0)&&Number.isFinite(heights[y*width+x]);
  const pointOK=valid(head,spouse),minX=fixedTotal==null?0:Math.max(0,fixedTotal-max),maxX=fixedTotal==null?max:Math.min(max,fixedTotal);
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
    let x=clamp(Math.floor(fx*width),0,max),y=clamp(Math.floor(fy*width),0,max);
    if(fixedTotal!=null && x+y!==fixedTotal){
      if(minX>maxX)return null;
      // Snap only within a small visual hit area of the fixed-total segment.
      // The projection is in screen pixels, so a nonsquare plot does not bias picking.
      const ax=box.width/width,ay=box.height/width,wx=fx*width-.5,wy=fy*width-.5;
      x=clamp(Math.round((ax*ax*wx+ay*ay*(fixedTotal-wy))/(ax*ax+ay*ay)),minX,maxX); y=fixedTotal-x;
      if(Math.hypot((x-wx)*ax,(y-wy)*ay)>7)return null;
    }
    return valid(x,y)?[x,y]:null;
  }
  function key(e){
    const moves={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowDown:[0,-1],ArrowUp:[0,1]},move=moves[e.key];
    if(!move)return;
    e.preventDefault();
    const [dx,dy]=move;
    let x=(pointOK?head:0)+dx,y=(pointOK?spouse:0)+dy;
    if(fixedTotal!=null){if(dx)y=fixedTotal-x;else x=fixedTotal-y;}
    if(valid(x,y))onSelectSalary(x,y);
  }
  const hoverOK=hover&&valid(...hover)&&(fixedTotal==null||hover[0]+hover[1]===fixedTotal);
  const shown=hoverOK?hover:pointOK?[head,spouse]:null;
  return <figure className="diff-heatmap" aria-label="可処分所得差の平面図">
    <figcaption>可処分所得差の平面図</figcaption>
    {failed&&<p role="alert">この環境では平面図を描画できません。</p>}
    <div className="diff-map-frame">
      <canvas ref={canvas} width={width} height={width} role="img" tabIndex="0" aria-label="横軸：世帯主の給与収入、縦軸：配偶者の給与収入。色は障害の有無による可処分所得差"
        onPointerMove={e=>{const q=readPosition(e);setHover(old=>old?.[0]===q?.[0]&&old?.[1]===q?.[1]?old:q);}}
        onPointerLeave={()=>setHover(null)} onClick={e=>{const q=readPosition(e);if(q)onSelectSalary(...q);}} onKeyDown={key}/>
      <svg className="diff-map-axes" viewBox={`0 0 ${W} ${H}`} aria-hidden="true" preserveAspectRatio="none">
        <rect x={L} y={T} width={R-L} height={B-T} fill="none" stroke="#6e8084"/>
        {stepTicks.map(x=><g key={x}><path d={`M${sx(x)} ${B}v6 M${L} ${sy(x)}h-6`} stroke="#486468"/>
          <text x={sx(x)} y={B+25} textAnchor="middle">{fmt(x)}</text><text x={L-10} y={sy(x)+5} textAnchor="end">{fmt(x)}</text></g>)}
        <text className="diff-axis-title" x={(L+R)/2} y={H-10} textAnchor="middle">世帯主の給与収入（万円／年）</text>
        <text className="diff-axis-title" transform={`translate(23 ${(T+B)/2}) rotate(-90)`} textAnchor="middle">配偶者の給与収入（万円／年）</text>
        {fixedTotal!=null&&minX<=maxX&&<path d={`M${sx(minX)} ${sy(fixedTotal-minX)}L${sx(maxX)} ${sy(fixedTotal-maxX)}`} stroke="#324850" strokeWidth="2" strokeDasharray="6 4" fill="none"/>}
        {pointOK&&<g transform={`translate(${sx(head)} ${sy(spouse)})`}><circle r="6" fill="white" stroke="#132f38" strokeWidth="2.5"/><text x={head>max*.90?-10:10} y={spouse>max*.95?19:-9} textAnchor={head>max*.90?"end":"start"} className="diff-point-p">P</text></g>}
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
    {shown&&<div className="diff-map-readout">{hoverOK?"指示点":"点P"}　世帯主 {fmt(shown[0])}万円／配偶者 {fmt(shown[1])}万円　差 {signed(Math.round(heights[shown[1]*width+shown[0]]*10000))}円／年</div>}
  </figure>;
}
