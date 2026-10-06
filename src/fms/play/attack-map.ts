import {Graphics} from 'pixi.js';
import type {Point} from '../../sim/types';
/** Original MathUtility quadratic curve; these are CSS widths adapted to web,
 * not a recovered prefab. The strategic arrow never replaces the actual path. */
export function bezierPoint(a:Point,b:Point,c:Point,t:number):Point{return {x:(1-t)**2*a.x+2*(1-t)*t*b.x+t*t*c.x,y:(1-t)**2*a.y+2*(1-t)*t*b.y+t*t*c.y};}
export function drawAttackArrow(g:Graphics,points:Point[],pixel:number,color:string|number,preview=false,growth=1){
  if(points.length<2)return;const a=points[0],c=points.at(-1)!,middle=points[Math.floor((points.length-1)/2)],distance=Math.hypot(c.x-a.x,c.y-a.y);if(distance<12*pixel)return;
  const b=points.length>2?{x:2*middle.x-(a.x+c.x)/2,y:2*middle.y-(a.y+c.y)/2}:{x:(a.x+c.x)/2-(c.y-a.y)*.13,y:(a.y+c.y)/2+(c.x-a.x)*.13};
  const progress=Math.max(.1,Math.min(1,growth)),samples=Array.from({length:30},(_,i)=>bezierPoint(a,b,c,.1+.65*i/29*progress)),left:Point[]=[],right:Point[]=[];
  samples.forEach((p,i)=>{const before=samples[Math.max(0,i-1)],after=samples[Math.min(29,i+1)],dx=after.x-before.x,dy=after.y-before.y,len=Math.max(1e-8,Math.hypot(dx,dy)),half=(8-5*i/29)*pixel/2;left.push({x:p.x-dy/len*half,y:p.y+dx/len*half});right.push({x:p.x+dy/len*half,y:p.y-dx/len*half});});
  g.poly([...left,...right.reverse()].flatMap(p=>[p.x,p.y])).fill({color,alpha:preview?.7:.48}).stroke({color:0x273731,width:.8*pixel,alpha:.7});
  const tail=samples.at(-1)!,before=samples.at(-2)!,dx=tail.x-before.x,dy=tail.y-before.y,len=Math.max(1e-8,Math.hypot(dx,dy)),tip={x:tail.x+dx/len*9*pixel,y:tail.y+dy/len*9*pixel};g.poly([tail.x-dy/len*6*pixel,tail.y+dx/len*6*pixel,tip.x,tip.y,tail.x+dy/len*6*pixel,tail.y-dx/len*6*pixel]).fill({color,alpha:.85}).stroke({color:0x273731,width:.8*pixel});
}
