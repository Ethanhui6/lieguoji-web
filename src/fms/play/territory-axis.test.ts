import {it,expect} from 'vitest';
import {createWorld} from '../../sim/demo';
import type {Province} from '../../sim/types';
import {territoryLabels} from './territory-labels';
import {territoryAxis} from './territory-axis';
import {capitalNameLabels} from './map-label-layout';
import {cityLabels} from './city-labels';

const rectangle=(id:string,width:number,height:number,angle:number,x=0):Province=>{
 const c=Math.cos(angle),s=Math.sin(angle),polygon=[[-width/2,-height/2],[width/2,-height/2],[width/2,height/2],[-width/2,height/2]].map(([a,b])=>({x:x+a*c-b*s,y:a*s+b*c}));
 return {id,name:id,controller:'dayan',legalOwner:'dayan',center:{x,y:0},label:{x,y:0},polygon,neighbors:[],terrain:'plain',supply:80};
};
it.each([-.9,-.4,.4,.9,Math.PI/2])('follows the actual diagonal territory at %s radians with an interior band',angle=>{
 const p=rectangle('p',200,35,angle),w=createWorld();w.nations=w.nations.slice(0,1);p.controller=w.nations[0].id;w.provinces=[p];const label=territoryLabels(w)[0];
 expect(Math.abs(label.angle)).toBeCloseTo(Math.abs(angle),8);expect(label.length).toBeGreaterThan(150);expect(label.height).toBeGreaterThan(10);expect(label.point.x).toBeCloseTo(0);expect(label.point.y).toBeCloseTo(0);
});
it('does not tilt a round component or bias toward densely sampled polygon edges',()=>{
 const p=rectangle('p',100,100,0);expect(territoryAxis([p],{x:0,y:0})).toBe(0);
 const a=rectangle('a',200,20,.5),expected=territoryAxis([a],{x:0,y:0}),[first,second]=a.polygon;
 a.polygon.splice(1,0,...Array.from({length:39},(_,i)=>({x:first.x+(second.x-first.x)*(i+1)/40,y:first.y+(second.y-first.y)*(i+1)/40})));
 expect(territoryAxis([a],{x:0,y:0})).toBeCloseTo(expected,10);
});
it('capital and city labels translate through viewport edges instead of jumping to the other side',()=>{
 const cities=[{id:'a',name:'海岭',x:45,y:20,selected:false},{id:'b',name:'青丘',x:140,y:70,selected:false}],viewport={width:400,height:300},shift={x:110,y:82};
 const moved=cities.map(c=>({...c,x:c.x+shift.x,y:c.y+shift.y}));
 const cap=capitalNameLabels(cities,13,[],viewport),capMoved=capitalNameLabels(moved,13,[],viewport);
 for(const a of cap){const b=capMoved.find(b=>b.id===a.id)!;expect(b.x-a.x).toBeCloseTo(shift.x);expect(b.y-a.y).toBeCloseTo(shift.y);}
 const towns=cityLabels(cities,[],viewport,false),townsMoved=cityLabels(moved,[],viewport,false);
 for(const a of towns){const b=townsMoved.find(b=>b.id===a.id)!;expect(b.labelX-a.labelX).toBeCloseTo(shift.x);expect(b.labelY-a.labelY).toBeCloseTo(shift.y);}
});
