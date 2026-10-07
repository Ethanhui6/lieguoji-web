import {describe,it,expect} from 'vitest';
import {War28Session} from './war28-session';
import {type War28Run,chronicleView,presentationOf} from './war28-model';
import {grid} from './fixture.test-support';
import {graphFor} from './naval-rules';
import {applyTransport} from './transport';
import {transportBase} from './maritime';
import {maritimeView} from './tactics-model';
import {tacticsView,campaignView} from './war28-model';
import {advanceWar28Voyages} from './war28-voyages';
import {war28DeclarationGoals} from './war28-goals';
describe('sea AI declaration receives actual post-unloading forces',()=>{
 it('does not count the same landed army as both land and cargo in a shared iteration',()=>{
  const r=new War28Session().execute({type:'create',terrain:grid((x,y)=>((x>=30&&x<=80)||(x>=150&&x<=220))&&y>=30&&y<=210?45:0),count:2,cityCount:24,relations:'peace'}).run as War28Run;
  const [a,b]=r.world.nations.map(n=>n.id),g=graphFor(presentationOf(r)),from=g.ports.find(p=>r.world.provinces.find(v=>v.id===p.provinceId)!.controller===a)!,army=r.world.armies.find(v=>v.nationId===a)!;
  for(const v of r.world.armies)Object.assign(v,{troops:v.nationId===b?100000:500,supplies:100,morale:100,status:'idle',route:[],progress:0});
  Object.assign(army,{provinceId:from.provinceId,originId:from.provinceId});r.navy.fleets=[{id:'returning',name:'返航舰队',nationId:a,ships:1,crew:40,food:2400,node:from.node,route:[],progress:0,dockId:from.id,targetId:null,patrol:false,status:'docked'}];
  const embarked=applyTransport(transportBase(maritimeView(tacticsView(campaignView(r)))),g,{type:'embark',fleetId:'returning',armyId:army.id},{day:0,nextEventId:r.world.nextEventId,tick:0});
  let n={...chronicleView(r),world:embarked.world,navy:embarked.navy,units:embarked.units,transports:embarked.transports,battles:embarked.battles};n.world.day=14;n.clock.tick=1680;for(const p of n.world.statecraft!.provinces)p.grain=1e9;for(const p of n.world.statecraft!.nations)p.priority=p.nationId===b?'military':'civilian';
  const voyages=structuredClone(r.voyages);voyages.missions[a]={armyId:army.id,fleetId:'returning',fromPortId:from.id,toPortId:from.id,phase:'returning',startedTick:0};
  const context={...r.terrainContext,upper:r.upperCombat,finance:r.finance,people:r.people,culture:r.culture,destiny:r.destiny};let calls=0;
  n=advanceWar28Voyages(n,voyages,g,context,r.warfare,(world,attacker,defender,tick,forces)=>{
   calls++;expect([attacker,defender,tick]).toEqual([b,a,1680]);expect(forces.transports.cargo).toHaveLength(0);expect(world.armies.filter(v=>v.id===army.id)).toHaveLength(1);expect(forces.navy.fleets.find(f=>f.id==='returning')!.patrol).toBe(true);
   const input={...r,...forces,world,clock:{version:1 as const,tick}},goals=war28DeclarationGoals(input,r.nativeWars,g,attacker,defender);
   // Reopening at this exact declaration boundary supplies the same current
   // force records, so no closure from the start of the batch can change goals.
   expect(war28DeclarationGoals(structuredClone(input),structuredClone(r.nativeWars),g,attacker,defender)).toEqual(goals);
  });
  expect(calls).toBe(1);expect(n.world.statecraft!.relations[0].status).toBe('war');expect(n.transports.cargo).toHaveLength(0);
 });
});
