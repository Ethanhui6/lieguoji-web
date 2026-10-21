import {expect,it} from 'vitest';
import {contains} from './settlement25-terrain';
import {insideTravelCell47,locateTravelCell47,type TravelCell47,type TravelGraph47} from './army-travel47-graph';
const cell=(id:number):TravelCell47=>({id,face:id,surface:'land',provinceId:'p',center:{x:5,y:5},polygon:[{x:0,y:0},{x:10,y:0},{x:10,y:10},{x:0,y:10}],links:[]});
it('preserves closed-edge tolerance, lowest-id ties, province filtering and mutable geometry',()=>{
 const a=cell(4),b=cell(2),g:TravelGraph47={cells:new Map([[4,a],[2,b]]),byProvince:new Map([['p',[4,2]]]),scale:1,polygonWork:0};
 const legacy=(c:TravelCell47,p:{x:number;y:number})=>contains(c.polygon,p)||c.polygon.some((a,i)=>{const b=c.polygon[(i+1)%c.polygon.length],dx=b.x-a.x,dy=b.y-a.y,l=dx*dx+dy*dy,t=l?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/l)):0;return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy)<=1e-8;});
 for(const x of [-100,-2e-8,-.5e-8,0,5,10,10+.5e-8,10+2e-8,100])for(const y of [-1,0,5,10,11])expect(insideTravelCell47(a,{x,y})).toBe(legacy(a,{x,y}));
 expect(locateTravelCell47(g,{x:0,y:5})?.id).toBe(2);expect(locateTravelCell47(g,{x:5,y:5},'absent')).toBeNull();
 b.polygon=b.polygon.map(p=>({x:p.x+100,y:p.y}));expect(locateTravelCell47(g,{x:5,y:5})?.id).toBe(4);
 expect(locateTravelCell47(g,{x:NaN,y:0})).toBeNull();
});
