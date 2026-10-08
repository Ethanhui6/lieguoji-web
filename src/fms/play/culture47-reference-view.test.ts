import {beforeAll,describe,it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {createElement} from 'react';
import {Culture47Session} from './culture47-session';
import {grid} from './fixture.test-support';
import type {FoundingForces47} from './civilization47-forces';
import {nationFamily47,nationOverview47} from './CultureNationOverview47';
import {CultureHistoryText47,historyDate47} from './CultureHistory47';
let run:FoundingForces47;
beforeAll(()=>{run=new Culture47Session().create({terrain:grid((x,y)=>x>20&&x<230&&y>20&&y<230?45:0),count:2,cityCount:24,relations:'peace',setup:{mode:'culture-generated',enabled:['chinese','japanese']}}).run;},30000);
describe('native screenshot driven real47 read-only views',()=>{
 it('counts actual controlled population and capacity, retains negative treasury and never substitutes a fallen capital',()=>{
  const r=structuredClone(run),id=r.world.nations[0].id,capital=r.world.cities.find(c=>c.id===r.world.nations[0].capitalId)!;
  const before=nationOverview47(r,id),p=r.world.provinces.find(p=>p.id===capital.provinceId)!,people=r.world.statecraft!.provinces.find(v=>v.provinceId===p.id)!.population;
  p.controller=r.world.nations[1].id;r.finance.nations[id].gold=-75;
  const after=nationOverview47(r,id);expect(after.population).toBe(before.population-people);expect(after.capacity).toBe(before.capacity-r.finance.provinces[p.id].maxPopulation);expect(after.regions).toBe(before.regions-1);expect(after.cities).toBe(before.cities-1);expect(after.gold).toBe(-75);expect(after.capital).toBe(capital.name);expect(after.capitalHeld).toBe(false);
 });
 it('does not count destroyed forces, lost fleets or hull-zero wrecks as live units',()=>{
  const r=structuredClone(run),id=r.world.nations[0].id,a=r.world.armies.find(a=>a.nationId===id)!;
  // Explicit display-only fleet fixture: this does not claim a funded starter
  // fleet exists on every real opening coast or exercise naval movement.
  const f={id:'display-fleet',name:'舰队',nationId:id,ships:3,crew:60,food:100,node:0,route:[],progress:0,dockId:null,targetId:null,patrol:false,status:'anchored' as const};
  r.navy.fleets=[f,{...f,id:'lost-fleet',status:'lost'}];r.maritime.hulls[f.id]=300;r.maritime.hulls['lost-fleet']=300;
  const before=nationOverview47(r,id);expect(before.fleets).toBe(1);expect(before.ships).toBe(3);const troops=a.troops;a.status='destroyed';r.maritime.hulls[f.id]=0;
  const after=nationOverview47(r,id);expect(after.armies).toBe(before.armies-1);expect(after.troops).toBe(before.troops-troops);expect(after.fleets).toBe(before.fleets-1);expect(after.ships).toBe(before.ships-f.ships);
 });
 it('preserves registered family members when a nation no longer has a ruler',()=>{
  const r=structuredClone(run),id=r.world.nations[0].id,before=nationFamily47(r,id);r.people.nations[id].leaderId=null;r.chronicle.ended[id]=r.world.day;
  const after=nationFamily47(r,id);expect(after).toEqual(before);expect(after.members.length).toBeGreaterThan(1);expect(after.family).toBeDefined();expect(nationOverview47(r,id).extinct).toBe(true);
 });
 it('keeps recorded names after renaming, handles duplicate names without false attribution, and escapes text',()=>{
  const render=(text:string,names:{id:string;name:string;color:string}[])=>renderToStaticMarkup(createElement(CultureHistoryText47,{text,nations:names}));
  const old='旧国向邻国宣战',newName=[{id:'n-0',name:'新国',color:'#aabbcc'}];expect(render(old,newName)).toBe(old);
  expect(render('国甲向国乙宣战',[{id:'a',name:'国甲',color:'#aabbcc'},{id:'b',name:'国乙',color:'#ccbbaa'}])).toBe('国甲向国乙宣战');
  expect(render('甲国向乙国宣战',[{id:'a',name:'丙国',color:'#aabbcc'},{id:'b',name:'甲国',color:'#ccbbaa'}])).toBe('甲国向乙国宣战');
  expect(render('同名国',newName.map(n=>({...n,name:'同名国'})).concat({id:'n-1',name:'同名国',color:'#ccbbaa'}))).not.toContain('<mark');
  expect(render('<script>输入</script>',[])).toBe('&lt;script&gt;输入&lt;/script&gt;');
 });
 it('uses the actual Gregorian calendar across leap days and year boundaries',()=>{
  expect(historyDate47({year:4,month:2,day:28},1)).toEqual({year:4,month:2,day:29});expect(historyDate47({year:1,month:1,day:1},365)).toEqual({year:2,month:1,day:1});
 });
});
