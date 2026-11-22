import {CAMERA_DISTANCE,HALF_Z} from "./salarySurfaceCamera.js";

export const BAR_BIN_WAN=25;

/** 各区画の正の最大点・負の最小点をすべての1万円格子から取得。0は欠測とは区別する。 */
export function binIncomeDifferences({heights,width},span=BAR_BIN_WAN) {
  if(!Number.isInteger(span)||span<1||!Number.isInteger(width)||width<2||heights?.length!==width*width)
    throw Error("給与格子または区画幅が不正です。");
  const max=width-1,count=Math.ceil(max/span),bins=Array.from({length:count*count},(_,i)=>({
    bx:i%count,by:Math.floor(i/count),valid:0,zero:-1,pos:-1,neg:-1,
  }));
  for(let y=0;y<width;y++){
    const row=Math.min(count-1,Math.floor(y/span))*count;
    for(let x=0;x<width;x++){
      const i=y*width+x,z=heights[i]; if(!Number.isFinite(z))continue;
      const b=bins[row+Math.min(count-1,Math.floor(x/span))];b.valid++;
      if(z===0){if(b.zero<0)b.zero=i;}
      else if(z>0){if(b.pos<0||z>heights[b.pos])b.pos=i;}
      else if(b.neg<0||z<heights[b.neg])b.neg=i;
    }
  }
  return {bins,count,width,max,span,heights};
}

/** 透視投影の視点から遠い区画を先に描く。軸に沿う非交差の柱のため奥行きバッファは不要。 */
export function barGeometry(grid,scene){
  const {bins,count,span,max,heights}=grid,P=scene.project,m=scene.matrix;
  const eyeX=-CAMERA_DISTANCE*m[6],eyeY=-CAMERA_DISTANCE*m[7];
  const eyeZ=scene.low+(1-CAMERA_DISTANCE*m[8]/HALF_Z)*(scene.high-scene.low)/2;
  const edges=Array.from({length:count},(_,j)=>{
    const a=2*j*span/max-1,b=2*Math.min(max,(j+1)*span)/max-1,margin=(b-a)*.11;
    return [a+margin,b-margin];
  });
  const order=eye=>Array.from({length:count},(_,i)=>i).sort((a,b)=>
    Math.abs(eye-(edges[b][0]+edges[b][1])/2)-Math.abs(eye-(edges[a][0]+edges[a][1])/2));
  const xs=order(eyeX),ys=order(eyeY),faces=[];
  const colors={pos:["#137f83","#0b626b","#349193"],neg:["#ae3454","#832740","#c05b74"],zero:["#e0e6e6"]};
  for(const by of ys){
    const [y0,y1]=edges[by];
    for(const bx of xs){
      const bin=bins[by*count+bx];if(!bin.valid)continue;
      const [x0,x1]=edges[bx],blocks=eyeZ>=0?["neg","pos"]:["pos","neg"];
      const origin=[P(x0,y0,0),P(x1,y0,0),P(x1,y1,0),P(x0,y1,0)];
      function face(kind,shade,points){
        faces.push({index:bin[kind],bin,kind,color:colors[kind][shade],points});
      }
      if(bin.neg<0&&bin.pos<0){face("zero",0,origin);continue;}
      for(const kind of blocks){
        const i=bin[kind];if(i<0)continue;
        const z=heights[i],cap=[P(x0,y0,z),P(x1,y0,z),P(x1,y1,z),P(x0,y1,z)];
        const side=(a,b,shade)=>face(kind,shade,[origin[a],origin[b],cap[b],cap[a]]);
        if(eyeX<=x0)side(0,3,1);else if(eyeX>=x1)side(1,2,1);
        if(eyeY<=y0)side(0,1,2);else if(eyeY>=y1)side(3,2,2);
        if((z>0&&eyeZ>=z)||(z<0&&eyeZ<=z))face(kind,0,cap);
        // 底面がこちらを向く場合。正負両方の柱があるときは相互の接合面を描かない。
        if((z<0&&eyeZ>=0&&bin.pos<0)||(z>0&&eyeZ<=0&&bin.neg<0))face(kind,0,origin);
      }
    }
  }
  return faces;
}

/** 描画順を逆にたどって最前面の柱を選択。戻り値は区画平均ではなく実際に端値を取る給与点。 */
export function pickBar(faces,x,y){
  for(let i=faces.length-1;i>=0;i--){
    const p=faces[i].points;let positive=false,negative=false;
    for(let j=0;j<p.length;j++){
      const a=p[j],b=p[(j+1)%p.length],d=(b[0]-a[0])*(y-a[1])-(b[1]-a[1])*(x-a[0]);
      if(d>1e-6)positive=true; if(d< -1e-6)negative=true;
      if(positive&&negative)break;
    }
    if(positive!==negative)return faces[i];
  }
  return null;
}

/** 総額固定時も、選んだ端値と同じ高さの実在点が区画内にあればそこを選ぶ。 */
export function barSalaryPoint(grid,hit,fixedTotal=null){
  if(!hit)return null;
  const {width,heights,span,max,count}=grid,i=hit.index;
  if(fixedTotal==null)return [i%width,Math.floor(i/width)];
  const {bx,by}=hit.bin,x0=bx*span,y0=by*span;
  const x1=bx===count-1?max:x0+span-1,y1=by===count-1?max:y0+span-1;
  for(let y=Math.max(y0,fixedTotal-x1);y<=Math.min(y1,fixedTotal-x0);y++){
    const x=fixedTotal-y;if(heights[y*width+x]===heights[i])return [x,y];
  }
  return null;
}
