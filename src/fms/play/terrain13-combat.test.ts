import {it,expect} from 'vitest';
import {Terrain13Session} from './terrain13-session';
import {assertTerrain13,type Terrain13Run} from './terrain13-model';
import {grid} from './fixture.test-support';
import {combatEfficiency} from './terrain13-rules';
import {advanceCombat} from './terrain13-battle';
import {advanceTacticsOccupation} from './terrain13-occupation';
import {armyReadiness,siegeInsight} from './siege-insight';
import {createMilitaryCore} from './terrain13-core';
const fixture=()=>new Terrain13Session().execute({type:'create',terrain:grid((x,y)=>x>20&&x<230&&y>20&&y<230?(x+y)%40===0?90:45:0),count:2,relations:'war'}).run as Terrain13Run;
function pair(){const r=fixture(),w=r.world,p=w.provinces.find(p=>p.neighbors.length>1)!,q=w.provinces.find(v=>v.id===p.neighbors[0])!,a=w.armies[0],b=w.armies.find(b=>b.nationId!==a.nationId)!;w.armies=[a,b];r.units={[a.id]:'Cavalry',[b.id]:'Shield'};r.tactics.forces=Object.fromEntries(w.armies.map(a=>[a.id,r.tactics.forces[a.id]]));q.controller=b.nationId;p.controller=a.nationId;for(const army of w.armies)Object.assign(army,{provinceId:q.id,originId:q.id,route:[],progress:0,status:'idle',troops:3000,morale:80,supplies:100});return{r,w,p,q,a,b};}
it('uses the same recovered multiplier for real pulse casualties, full resistance and displayed siege contributions',()=>{
 const {r,w,q,a,b}=pair(),due=new Set([a.id]),eff=combatEfficiency(w,a,r.units,q,true,r.terrainContext),report=siegeInsight(w,q.id,r.units,{},0,undefined,r.terrainContext)!;
 const combat=advanceCombat(w,r.battles,r.units,21,()=>due,r.terrainContext);expect(combat.world.armies.find(v=>v.id===b.id)!.troops).toBe(3000-Math.floor(400*eff));expect(combat.world.armies.find(v=>v.id===a.id)!.troops).toBe(3000);
 const siege=advanceTacticsOccupation(w,r.occupation,r.units,21,due,'resistance',r.terrainContext).occupation.sieges[0];expect(siege.maximum).toBeGreaterThan(100);expect(siege.maximum-siege.resistance).toBeCloseTo(report.attack[0].perPulse,10);expect(report.attack[0].perPulse).toBeCloseTo(eff*10,10);
 const readiness=armyReadiness(combat.world,a.id,r.units,{},21,combat.battles,undefined,r.terrainContext)!;expect(readiness.efficiency).toBe(eff);
 const big=structuredClone(w);big.armies[0].troops=6000;expect(advanceCombat(big,r.battles,r.units,21,()=>due,r.terrainContext).world.armies[1].troops).toBe(combat.world.armies[1].troops);
});
it('uses real road contact geography without either endpoint city fort and keeps UI in agreement',()=>{
 const {r,w,p,q,a,b}=pair();Object.assign(a,{provinceId:p.id,route:[q.id],progress:.499,status:'marching'});Object.assign(b,{provinceId:q.id,route:[p.id],progress:.499,status:'marching'});
 const first=advanceCombat(w,r.battles,r.units,1,()=>new Set(),r.terrainContext);expect(first.battles.engagements[0].b).not.toBeNull();const view=armyReadiness(first.world,a.id,r.units,{},1,first.battles,undefined,r.terrainContext)!;
 const marching=armyReadiness(w,a.id,r.units,{},0,{version:1,nextId:1,engagements:[],plans:{}},undefined,r.terrainContext)!;expect(marching.land).toBeDefined();expect(marching.atNode).toBe(false);
 const next=advanceCombat(first.world,first.battles,r.units,21,()=>new Set([a.id]),r.terrainContext);expect(3000-next.world.armies[1].troops).toBe(Math.floor(400*view.efficiency));expect(view.atNode).toBe(false);
 for(const c of first.world.cities)c.fort=5;expect(advanceCombat(first.world,first.battles,r.units,21,()=>new Set([a.id]),r.terrainContext).world.armies[1].troops).toBe(next.world.armies[1].troops);
});
it('preserves real full-strength resistance and food consumption until siege capture, without an artificial near-zero fixture',()=>{
 const {r,q,a}=pair();r.world.armies=[a];r.units={[a.id]:'Cavalry'};r.tactics.forces={[a.id]:r.tactics.forces[a.id]};r.tactics.unopposed='resistance';r.world.cities.filter(c=>c.provinceId===q.id).forEach(c=>c.fort=0);for(const v of Object.values(r.chronicle.unrest))v.controller=r.world.provinces.find(p=>r.chronicle.unrest[p.id]===v)!.controller;
 const s=new Terrain13Session();s.execute({type:'load',run:r});let n=r,firstMaximum=0,days=0,previous=100;
 while(n.world.provinces.find(p=>p.id===q.id)!.controller!==a.nationId&&days<40){n=s.execute({type:'step',days:1}).run as Terrain13Run;days++;firstMaximum ||= n.occupation.sieges.find(v=>v.provinceId===q.id)?.maximum??0;const army=n.world.armies.find(v=>v.id===a.id)!;if(n.world.provinces.find(p=>p.id===q.id)!.controller!==a.nationId){expect(army.supplies).toBe(Math.max(0,previous-4));previous=army.supplies;}assertTerrain13(n);}
 console.log(JSON.stringify({benchmark:'terrain13-full-resistance',maximum:firstMaximum,days,supplies:n.world.armies.find(v=>v.id===a.id)!.supplies,captured:n.world.provinces.find(p=>p.id===q.id)!.controller===a.nationId}));expect(firstMaximum).toBeGreaterThan(100);expect(days).toBeGreaterThan(1);expect(n.world.provinces.find(p=>p.id===q.id)!.controller).toBe(a.nationId);
});
it('uses target terrain in autonomous relief decisions',()=>{
 const {r,w,p,q,a,b}=pair();q.controller=p.controller=a.nationId;Object.assign(a,{provinceId:p.id,troops:1800});Object.assign(b,{provinceId:q.id,troops:2500});r.units={[a.id]:'Cavalry',[b.id]:'Cavalry'};w.cities.forEach(c=>c.fort=0);const stagger=[...a.id].reduce((s,c)=>s+c.charCodeAt(0),0);w.day=(3-((stagger+1)%3))%3;
 const steppe=structuredClone(r.terrainContext),forest=structuredClone(r.terrainContext);for(const ctx of [steppe,forest])ctx.provinces[q.id].mountain=false;
 steppe.provinces[q.id].biomes=[0,0,0,0,1,0,0,0,0,0,0,0,0];forest.provinces[q.id].biomes=[0,0,0,0,0,0,0,1,0,0,0,0,0];
 // The same armies face a target-dependent threshold; synthetic biome fixtures
 // isolate AI consumption, separate from tested real geographic construction.
 const grass=createMilitaryCore(r.units,true,true,steppe).settleDay(w),woods=createMilitaryCore(r.units,true,true,forest).settleDay(w);
 expect(grass.armies.find(v=>v.id===a.id)!.route).not.toEqual(woods.armies.find(v=>v.id===a.id)!.route);
});
