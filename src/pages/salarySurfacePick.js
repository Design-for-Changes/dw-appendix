import { HALF_Z } from "./salarySurfaceCamera.js";

const R = 7, EPS = 1e-8, BOUND = Math.hypot(1,1,HALF_Z);
function lowerBound(indices, value) {
  let lo=0, hi=indices.length;
  while (lo<hi) {
    const m=(lo+hi)>>>1;
    if (indices[m]<value) lo=m+1; else hi=m;
  }
  return lo;
}

// Grid traversal along p + t*d, 0 <= t <= end. Only cells crossed by the
// segment are visited. Include both sides of a grid edge, and exact corners.
function crossesCell(x,y,dx,dy,end,visit) {
  const sx=Math.sign(dx), sy=Math.sign(dy);
  let i=Math.floor(x), j=Math.floor(y);
  if (dx<0 && i===x) i--;
  if (dy<0 && j===y) j--;
  let tx=dx ? ((sx>0 ? i+1 : i)-x)/dx : Infinity;
  let ty=dy ? ((sy>0 ? j+1 : j)-y)/dy : Infinity;
  const dtX=dx ? 1/Math.abs(dx) : Infinity, dtY=dy ? 1/Math.abs(dy) : Infinity;
  const edgeX=!dx && x===i, edgeY=!dy && y===j;
  for (let t=0; t<=end;) {
    const stop=Math.min(tx,ty,end);
    if (visit(i,j,t,stop) || (edgeX && visit(i-1,j,t,stop))
      || (edgeY && visit(i,j-1,t,stop)) || (edgeX && edgeY && visit(i-1,j-1,t,stop))) return true;
    if (stop===end) break;
    const stepX=tx<=ty, stepY=ty<=tx;
    if (stepX && stepY && (visit(i+sx,j,stop,stop) || visit(i,j+sy,stop,stop))) return true;
    if (stepX) {i+=sx;tx+=dtX;}
    if (stepY) {j+=sy;ty+=dtY;}
    t=stop;
  }
  return false;
}

// At a candidate vertex, trace toward the eye. The strip uses triangles
// (00,10,01) and (11,01,10); a triangle touching NaN was never submitted.
function isHidden(surface,scene,x,y,z,eye) {
  const n=surface.width-1, h=surface.heights, w=surface.width;
  const dx=eye[0]-x, dy=eye[1]-y, dz=eye[2]-z;
  let end=1;
  for (const [p,d,lo,hi] of [[x,dx,0,n],[y,dy,0,n],[z,dz,scene.low,scene.high]]) {
    if (d) end=Math.min(end,((d>0 ? hi : lo)-p)/d);
  }
  if (end<=EPS) return false;
  return crossesCell(x,y,dx,dy,end,(i,j,start,stop)=>{
    if (i<0 || j<0 || i>=n || j>=n) return false;
    const k=j*w+i, a=h[k], b=h[k+1], c=h[k+w], d=h[k+w+1];
    if (!Number.isFinite(b) || !Number.isFinite(c)) return false;
    const u=x-i, v=y-j;
    function hits(base,gx,gy,corner) {
      if (!Number.isFinite(base)) return false;
      const denom=dz-gx*dx-gy*dy;
      if (!denom) return false; // coplanar or parallel triangles have no front hit
      const t=(base+gx*(u-corner)+gy*(v-corner)-z)/denom;
      if (t<=EPS || t<start-EPS || t>stop+EPS) return false;
      const sum=u+v+t*(dx+dy);
      return corner===0 ? sum<=1+EPS : sum>=1-EPS;
    }
    return hits(a,b-a,c-a,0) || hits(d,d-c,d-b,1);
  });
}

/** Convert the camera position back into salary coordinates and income (万円). */
function salaryEye(scene,half) {
  const {matrix:m,distance:d,low,high}=scene;
  return [(1-d*m[6])*half,(1-d*m[7])*half,low+(1-d*m[8]/HALF_Z)*(high-low)/2];
}

/** Project P from the GPU's Float32 height and hide it behind the same triangles used for picking. */
export function visibleSalaryCursor(surface,scene,x,y) {
  if (!surface || !scene || !Number.isInteger(x) || !Number.isInteger(y)) return null;
  const w=surface.width,n=w-1;
  if(n<=0 || x<0 || x>n || y<0 || y>n) return null;
  const index=w*y+x,z=surface.heights[index];
  if(!Number.isFinite(z)) return null;
  const [px,py]=scene.project(2*x/n-1,2*y/n-1,z);
  if(px<0 || px>scene.w || py<0 || py>scene.h || isHidden(surface,scene,x,y,z,salaryEye(scene,n/2))) return null;
  return {index,px,py};
}

/** A click on the visible P glyph retains that exact salary even beside another boundary. */
export function pickSalaryAtPointer(surface,scene,px,py,focusSystem,fixedTotal,cursor) {
  if (cursor && (px-cursor.px)**2+(py-cursor.py)**2<=R*R) return cursor.index;
  return pickSalaryChange(surface,scene,px,py,focusSystem,fixedTotal);
}

/**
 * Find a visible, actually marked salary vertex within seven CSS pixels.
 * The worker emits marker indices in row-major order. Binary-search a narrow
 * band around the camera ray; never scan the 1501² height grid or evaluate a household.
 */
export function pickSalaryChange(surface,scene,px,py,focusSystem=null,fixedTotal=null) {
  if (!surface || !scene || !Number.isFinite(px) || !Number.isFinite(py)) return null;
  const ids=focusSystem==null ? surface.changePoints : surface.changeBySystem?.[focusSystem]?.points;
  if (!ids?.length || surface.width<2) return null;
  const {matrix:m,distance:dist,focalPixels:f}=scene, w=surface.width, n=w-1, half=n/2;
  const screenX=(px-scene.w/2)/f, screenY=(scene.centerY-py)/f;
  const eye=salaryEye(scene,half);
  const far=dist+BOUND, near=dist-BOUND;
  const axis=(i)=>m[6+i]+m[i]*screenX+m[3+i]*screenY;
  const ax=axis(0)*half, ay=axis(1)*half;
  const x0=eye[0]+near*ax, y0=eye[1]+near*ay, depthSpan=far-near;
  const pad=R/f*far*half+EPS, hits=[];
  const y1=y0+depthSpan*ay;
  const firstRow=Math.max(0,Math.ceil(Math.min(y0,y1)-pad)), lastRow=Math.min(n,Math.floor(Math.max(y0,y1)+pad));
  for (let y=firstRow; y<=lastRow; y++) {
    let t0=0, t1=depthSpan;
    if (ay) {
      const a=(y-pad-y0)/ay, b=(y+pad-y0)/ay;
      t0=Math.max(t0,Math.min(a,b)); t1=Math.min(t1,Math.max(a,b));
      if (t0>t1) continue;
    }
    const a=x0+ax*t0, b=x0+ax*t1;
    const from=Math.max(0,Math.ceil(Math.min(a,b)-pad),fixedTotal==null?0:fixedTotal-y);
    const to=Math.min(n,Math.floor(Math.max(a,b)+pad),fixedTotal==null?n:fixedTotal-y);
    if (from>to) continue;
    const row=y*w, last=row+to;
    for (let j=lowerBound(ids,row+from); j<ids.length && ids[j]<=last; j++) {
      const k=ids[j], z=surface.heights[k];
      if (!Number.isFinite(z)) continue;
      const x=k-row, wx=x/half-1, wy=y/half-1, [sx,sy]=scene.project(wx,wy,z);
      const ds=(sx-px)**2+(sy-py)**2;
      if (ds<=R*R+EPS) hits.push({k,x,y,z,sx,sy,ds,depth:scene.cameraDepth(wx,wy,z)});
    }
  }
  hits.sort((a,b)=>a.ds-b.ds || a.depth-b.depth || a.k-b.k);
  for (const {k,x,y,z,sx,sy,depth} of hits) {
    // At this depth, don't let the snap jump a salary coordinate known to
    // be missing. Outside the plot there is no salary coordinate to cross.
    const ux=(px-sx)*depth/f*half, uy=(sy-py)*depth/f*half;
    if (crossesCell(x+.5,y+.5,m[0]*ux+m[3]*uy,m[1]*ux+m[4]*uy,1,
      (i,j)=>i>=0 && j>=0 && i<w && j<w && !Number.isFinite(surface.heights[j*w+i]))) continue;
    if (!isHidden(surface,scene,x,y,z,eye)) return k;
  }
  return null;
}
