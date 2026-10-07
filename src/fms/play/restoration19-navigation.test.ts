import {describe,it,expect} from 'vitest';
import {IDBFactory} from 'fake-indexeddb';
import {Restoration19Session} from './restoration19-session';
import {assertRestoration19,chronicleView,type Restoration19Run} from './restoration19-model';
import {seaGraph} from './sea-path';
import {previewMaritime} from './maritime';
import {maritimeView} from './tactics-model';
import {campaignView} from './chronicle-model';
import {tacticsView} from './campaign-model';
import {grid} from './fixture.test-support';
import {saveRun,loadRun} from './restoration19-stores';
import {createMilitaryCore} from './restoration19-core';
import {createMilitaryCore as oldCore} from './fiscal15-core';
const stamp=(r:Restoration19Run)=>({day:r.world.day,nextEventId:r.world.nextEventId,tick:r.clock.tick});
const sea=(r:Restoration19Run)=>maritimeView(tacticsView(campaignView(chronicleView(r))));
function fixture(){
 const s=new Restoration19Session(),r=s.execute({type:'create',terrain:grid((x,y)=>x>30&&x<220&&y>30&&y<220?45:0),count:2,relations:'war'}).run as Restoration19Run;
 const g=seaGraph(r.terrain,r.world),id=r.world.nations[0].id,ports=g.ports.filter(p=>r.world.provinces.find(v=>v.id===p.provinceId)!.controller===id),from=ports[0],army=r.world.armies.find(a=>a.nationId===id)!;
 // Isolated carrier fixture; its subsequent orders, movement and landing use
 // the actual v19 session. No player save or production initialization changed.
 r.navy.fleets=[{id:'carrier',name:'试航水师',nationId:id,ships:4,crew:160,food:9600,node:from.node,route:[],progress:0,dockId:from.id,targetId:null,patrol:false,status:'docked'}];r.maritime={version:1,hulls:{carrier:400},contacts:[],retreating:{}};
 Object.assign(army,{provinceId:from.provinceId,troops:500,status:'idle',route:[],progress:0});assertRestoration19(r);s.execute({type:'load',run:r});return {s,r,g,from,army};
}
describe('v19 historical capitals and cargo command continuity',()=>{
 it('accepts a lost historic real capital without weakening missing-city checks or old rules',()=>{
  const {r}=fixture(),a=r.world.nations[0],b=r.world.nations[1];a.capitalId=b.capitalId;
  expect(createMilitaryCore(r.units,true,true).validateWorld(r.world)).toBe(true);expect(oldCore(r.units,true,true).validateWorld(r.world)).toBe(false);
  a.capitalId='absent-city';expect(createMilitaryCore(r.units,true,true).validateWorld(r.world)).toBe(false);expect(()=>assertRestoration19(r)).toThrow();
 });
 it.each(['raid','retreat'] as const)('keeps cargo synchronized through %s, stale rejection, actual arrival and landing',async type=>{
  const f=fixture();let r=f.s.execute({type:'transport',action:{type:'embark',fleetId:'carrier',armyId:f.army.id},expected:stamp(f.r)}).run as Restoration19Run;
  const candidates=f.g.ports.map(p=>({port:p,preview:previewMaritime(sea(r),f.g,{type,fleetId:'carrier',portId:p.id})})).filter(p=>p.preview.valid&&p.port.id!==f.from.id&&p.preview.route.length>1).sort((a,b)=>a.preview.days-b.preview.days),target=candidates[0];expect(target).toBeTruthy();
  const before=structuredClone(r),action={type,fleetId:'carrier',portId:target.port.id};expect(previewMaritime(sea(r),f.g,action).valid).toBe(true);expect(r).toEqual(before); // Cancel sends no command.
  expect(()=>f.s.execute({type:'maritime',action,expected:{...stamp(r),tick:r.clock.tick+1}})).toThrow('时刻');
  const baseline=new Restoration19Session();baseline.execute({type:'load',run:r});r=f.s.execute({type:'maritime',action,expected:stamp(r)}).run as Restoration19Run;expect(r).toEqual(baseline.execute({type:'maritime',action,expected:stamp(before)}).run);
  expect(r.navy.fleets[0].targetId).toBe(target.port.id);expect(r.transports.cargo[0].targetPortId).toBe(target.port.id);
  const db=new IDBFactory();await saveRun(r,null,db);const loaded=(await loadRun(db))!.run;expect(loaded).toEqual(r);f.s.execute({type:'load',run:loaded});
  let batches=0;while(r.navy.fleets[0].route.length&&batches++<target.preview.days+2)r=f.s.execute({type:'tick',ticks:120,expected:stamp(r)}).run as Restoration19Run;
  expect(r.navy.fleets[0].route).toEqual([]);expect(r.navy.fleets[0].node).toBe(target.port.node);
  r=f.s.execute({type:'transport',action:{type:'land',fleetId:'carrier'},expected:stamp(r)}).run as Restoration19Run;expect(r.transports.cargo).toHaveLength(0);const landed=r.world.armies.find(a=>a.id===f.army.id)!;expect(landed.provinceId).toBe(target.port.provinceId);expect(landed.troops).toBeGreaterThan(0);assertRestoration19(r);
 },60000);
});
