export const HALF_Z=.46, CAMERA_DISTANCE=12;
// The two salaries increase toward screen right; their split varies in depth.
// Keep both salary directions visible: an almost edge-on view collapses the two
// allowance boundaries into what looks like a single line.
const rad=Math.PI/180, ca=Math.cos(-36*rad),sa=Math.sin(-36*rad),ce=Math.cos(26*rad),se=Math.sin(26*rad);
// World → screen right, screen up, depth away. Drag rotates about the screen axes,
// not world up; crossing either pole has no singularity, clamp or control reversal.
export const INITIAL_VIEW=Object.freeze([ca,-sa,0, sa*se,ca*se,ce, sa*ce,ca*ce,-se]);
export function rotateView(view,dx,dy) {
  const mag=Math.hypot(dx,dy);
  if(!mag) return view;
  const a=-dy/mag,b=-dx/mag,c=Math.cos(mag*rad),s=Math.sin(mag*rad),t=1-c;
  const r=[c+a*a*t,a*b*t,b*s, a*b*t,c+b*b*t,-a*s, -b*s,a*s,c];
  return r.map((_,i)=>{
    const row=i-i%3,col=i%3;
    return r[row]*view[col]+r[row+1]*view[col+3]+r[row+2]*view[col+6];
  });
}

const homeBounds=new WeakMap();
function framing(surface,low,high) {
  const cached=homeBounds.get(surface);
  if (cached) return cached;
  const v=INITIAL_VIEW, zScale=2*HALF_Z/(high-low);
  let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;
  let floorLeft=Infinity,floorRight=-Infinity;
  function include(x,y,z,floor=false) {
    const d=CAMERA_DISTANCE+v[6]*x+v[7]*y+v[8]*z;
    const u=(v[0]*x+v[1]*y+v[2]*z)/d, t=-(v[3]*x+v[4]*y+v[5]*z)/d;
    left=Math.min(left,u);right=Math.max(right,u);
    top=Math.min(top,t);bottom=Math.max(bottom,t);
    if (floor) {floorLeft=Math.min(floorLeft,u);floorRight=Math.max(floorRight,u);}
  }
  const zero=-low*zScale-HALF_Z;
  for (const x of [-1,1]) for (const y of [-1,1]) include(x,y,zero,true);
  include(-1,-1,-HALF_Z);include(-1,-1,HALF_Z); // fixed income axis
  // Frame the actual completed grid once, not imaginary corners at maximum income.
  // Rotating, dragging the salary cursor, or resizing never rescans this surface.
  const {width:w,heights}=surface;
  if (w>=2 && heights?.length===w*w) {
    const step=2/(w-1);
    for (let j=0;j<w;j++) {
      const y=j*step-1;
      for (let i=0;i<w;i++) {
        const h=heights[j*w+i];
        if (Number.isFinite(h)) include(i*step-1,y,(h-low)*zScale-HALF_Z);
      }
    }
  } else {
    for (const x of [-1,1]) for (const y of [-1,1]) {
      include(x,y,-HALF_Z);include(x,y,HALF_Z);
    }
  }
  const bounds={left,right,top,bottom,floorWidth:floorRight-floorLeft};
  homeBounds.set(surface,bounds);
  return bounds;
}

// Resize according to the fixed home projection. Rotation never triggers auto-zoom or pan.
// Keep one physical focal length for both dimensions and a fixed vertical lens shift.
export function makeScene([w,h],matrix,surface) {
  const distance=CAMERA_DISTANCE;
  let low=100*Math.floor(Math.min(0,surface.min)/100),high=Math.max(low+100,100*Math.ceil(surface.max/100));
  if (surface.kind==="disability-difference") {
    // Jは差額（万円）。実額のGと違い100万円を最小表示幅としない。
    // 円未満の刻みは計算値にない。符号が片方だけでも0基準面は必ず見せる。
    const lo=Math.min(0,surface.min), hi=Math.max(0,surface.max);
    const target=Math.max(.0001,(hi-lo)/5), power=10**Math.floor(Math.log10(target));
    const step=([1,2,5,10].find(v=>v*power>=target)??10)*power;
    low=lo===0?0:Math.floor(lo/step)*step;
    high=hi===0?0:Math.ceil(hi/step)*step;
    if (low===high) {low=-.0001;high=.0001;} // 全点同額：1円ずつの余白で0面を中央に。
  }
  const b=framing(surface,low,high);
  const side=Math.min(42,.053*w), topPad=Math.min(26,.06*h), bottomPad=Math.min(40,.08*h);
  const focalPixels=Math.max(1,Math.min(.885*w/b.floorWidth,(w/2-side)/Math.max(-b.left,b.right),
    (h-topPad-bottomPad)/(b.bottom-b.top)));
  const yMin=topPad-focalPixels*b.top, yMax=h-bottomPad-focalPixels*b.bottom;
  const centerY=Math.max(yMin,Math.min(h/2,yMax));
  const vz=z=>(2*(z-low)/(high-low)-1)*HALF_Z;
  const cameraDepth=(x,y,z)=>distance+matrix[6]*x+matrix[7]*y+matrix[8]*vz(z);
  return {w,h,distance,focalPixels,centerY,matrix,low,high,cameraDepth,project(x,y,z){
    const k=focalPixels/cameraDepth(x,y,z), v=vz(z);
    return [w/2+k*(matrix[0]*x+matrix[1]*y+matrix[2]*v),centerY-k*(matrix[3]*x+matrix[4]*y+matrix[5]*v)];
  }};
}
