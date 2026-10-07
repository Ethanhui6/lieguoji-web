import type {Point,Province} from '../../sim/types';

/** World-space typography adapter for the web's polygon territories. Exact
 * area moments avoid a dense tessellation pulling the axis toward one end.
 * This is not claimed to be Unity's cell/path placement algorithm. */
export function territoryAxis(provinces:readonly Province[],origin:Point):number{
 let area=0,x=0,y=0,xx=0,yy=0,xy=0;
 for(const province of provinces){
  let a=0,sx=0,sy=0,sxx=0,syy=0,sxy=0;
  for(let i=0;i<province.polygon.length;i++){
   const p=province.polygon[i],q=province.polygon[(i+1)%province.polygon.length],ax=p.x-origin.x,ay=p.y-origin.y,bx=q.x-origin.x,by=q.y-origin.y,c=ax*by-bx*ay;
   a+=c;sx+=(ax+bx)*c;sy+=(ay+by)*c;sxx+=(ax*ax+ax*bx+bx*bx)*c;syy+=(ay*ay+ay*by+by*by)*c;sxy+=(2*ax*ay+ax*by+bx*ay+2*bx*by)*c;
  }
  const sign=Math.sign(a);area+=sign*a/2;x+=sign*sx/6;y+=sign*sy/6;xx+=sign*sxx/12;yy+=sign*syy/12;xy+=sign*sxy/24;
 }
 if(area<=0)return 0;
 const vx=xx/area-(x/area)**2,vy=yy/area-(y/area)**2,cov=xy/area-x*y/area**2;
 const spread=Math.hypot(vx-vy,2*cov),total=vx+vy;
 // Near-circular components have no meaningful direction; avoid arbitrary tilt.
 if(spread<total*.18)return 0;
 const angle=.5*Math.atan2(2*cov,vx-vy);
 return Math.abs(angle)<Math.PI/36?0:angle;
}

/** A rectangular text band wholly inside this connected component, including
 * concavities and holes. The anchor, band and angle never use camera/UI state. */
export function territoryTextBand(point:Point,angle:number,clearance:number,boundary:readonly (readonly [Point,Point])[]){
 const c=Math.cos(angle),s=Math.sin(angle),local=(p:Point)=>({x:(p.x-point.x)*c+(p.y-point.y)*s,y:-(p.x-point.x)*s+(p.y-point.y)*c});
 const edges=boundary.map(([a,b])=>[local(a),local(b)] as const);
 let left=Infinity,right=Infinity;
 for(const [a,b]of edges)if((a.y<=0&&b.y>0)||(b.y<=0&&a.y>0)){
  const x=a.x+(b.x-a.x)*(-a.y)/(b.y-a.y);if(x<0)left=Math.min(left,-x);else right=Math.min(right,x);
 }
 const height=clearance*.9,halfH=height/2;
 const intersects=(a:Point,b:Point,halfW:number)=>{
  let lo=0,hi=1;for(const [p,d,size]of [[a.x,b.x-a.x,halfW],[a.y,b.y-a.y,halfH]]){
   if(Math.abs(d)<1e-10){if(Math.abs(p)>size)return false;}
   else {const t1=(-size-p)/d,t2=(size-p)/d;lo=Math.max(lo,Math.min(t1,t2));hi=Math.min(hi,Math.max(t1,t2));if(lo>hi)return false;}
  }return true;
 };
 let low=0,high=Math.min(left,right)*.9;
 if(!Number.isFinite(high))high=clearance*.8;
 for(let i=0;i<20;i++){const mid=(low+high)/2;if(edges.some(([a,b])=>intersects(a,b,mid)))high=mid;else low=mid;}
 return {length:Math.max(0,low*2),height};
}
