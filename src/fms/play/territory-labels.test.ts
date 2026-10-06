import { expect,it } from 'vitest';
import { createWorld } from '../../sim/demo';
import type { Province } from '../../sim/types';
import { territoryLabels } from './territory-labels';
import { namedWorld,worldNames } from './names';

function box(id:string,x:number,y:number,width:number,height:number,controller:string,neighbors:string[]=[]):Province{
  return {id,name:id,polygon:[{x,y},{x:x+width,y},{x:x+width,y:y+height},{x,y:y+height}],center:{x:x+width/2,y:y+height/2},label:{x,y},controller,legalOwner:'dayan',terrain:'plain',supply:80,neighbors};
}
it('follows current control after occupation, independent of the capital and legal owner',()=>{
  const w=createWorld();w.nations=w.nations.slice(0,2);const [a,b]=w.nations.map(n=>n.id);
  w.provinces=[box('p-0',0,0,10,10,a),box('p-1',100,100,30,30,b)];
  const before=structuredClone(w),initial=territoryLabels(w);expect(initial.find(l=>l.nationId===a)?.point.x).toBeCloseTo(5);
  expect(w).toEqual(before);w.provinces[1].controller=a;w.provinces[0].controller=b;
  const moved=territoryLabels(w);expect(moved.find(l=>l.nationId===a)?.point.x).toBeCloseTo(115);
  expect(moved.find(l=>l.nationId===b)?.point.x).toBeCloseTo(5);expect(w.cities).toEqual(before.cities);
  w.provinces.forEach(p=>{p.controller=a;});expect(territoryLabels(w).map(l=>l.nationId)).toEqual([a,a]);
});
it('names every disconnected controlled component with stable interior anchors',()=>{
  const w=createWorld(),id=w.nations[0].id;w.nations=w.nations.slice(0,1);
  w.provinces=[box('big',0,0,100,100,id),box('small-1',500,0,10,10,id,['small-2']),box('small-2',510,0,10,10,id,['small-1'])];
  const label=territoryLabels(w)[0];expect(label.provinceIds).toEqual(['big']);expect(label.point).toEqual({x:50,y:50});expect(label.clearance).toBe(50);
  const all=territoryLabels(w);expect(all).toHaveLength(2);expect(all[1].provinceIds).toEqual(['small-1','small-2']);expect(all.map(l=>l.componentId)).toEqual(['big','small-1']);
  expect(territoryLabels({...w,provinces:[...w.provinces].reverse()})).toEqual(all);
});
it('keeps the anchor on a ring-shaped state instead of placing its name in the inland sea',()=>{
  const w=createWorld(),id=w.nations[0].id;w.nations=w.nations.slice(0,1);w.provinces=[];
  for(let y=0;y<3;y++)for(let x=0;x<3;x++)if(x!==1||y!==1){const key=`${x}:${y}`,neighbors=[[x-1,y],[x+1,y],[x,y-1],[x,y+1]].filter(([a,b])=>a>=0&&a<3&&b>=0&&b<3&&(a!==1||b!==1)).map(([a,b])=>`${a}:${b}`);w.provinces.push(box(key,x*10,y*10,10,10,id,neighbors));}
  const p=territoryLabels(w)[0].point;expect(p.x<10||p.x>20||p.y<10||p.y>20).toBe(true);
  expect(p.x).toBeGreaterThan(0);expect(p.y).toBeGreaterThan(0);expect(p.x).toBeLessThan(30);expect(p.y).toBeLessThan(30);
});
it('replaces only the known generated old capital with its source place name in the display',()=>{
  const w=createWorld(),n=w.nations[0],p=w.provinces[0],c=w.cities[0];w.custom={id:'legacy',seed:'legacy',name:'旧局',rivers:[]};
  p.id='p-0';p.name=`${n.name}·1区`;p.legalOwner=n.id;c.id='c-0';c.provinceId=p.id;c.name=`${n.name}京`;n.capitalId=c.id;
  const view=namedWorld(w);expect(view.cities[0].name).toBe(worldNames('legacy',1).places[0]);expect(w.cities[0].name).toBe(`${n.name}京`);
  const custom=structuredClone(w);custom.cities[0].name='我的首都';expect(namedWorld(custom).cities[0].name).toBe('我的首都');
});
