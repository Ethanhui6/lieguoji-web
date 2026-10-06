import {it,expect} from 'vitest';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createFmsDocument,prepareFmsOutlineEdit,commitFmsEdit} from '../model';
import {Upper14Session} from './upper14-session';
import type {Upper14Run} from './upper14-model';
it('advances all 722 provinces and 480 armies with synchronized native combat metadata',async()=>{
 const raw=await createFmsDocument(),w=raw.width,h=raw.height,terrain=commitFmsEdit(raw,prepareFmsOutlineEdit(raw,[[w*.05,h*.25],[w*.95,h*.25],[w*.95,h*.75],[w*.05,h*.75]],45));
 const s=new Upper14Session(),start=performance.now(),r=s.execute({type:'create',terrain,count:2,relations:'war'}).run as Upper14Run,createdMs=performance.now()-start;
 const tick=performance.now(),n=s.execute({type:'step',days:1}).run as Upper14Run,dayMs=performance.now()-tick;
 mkdirSync('.autopilot/upper14-evidence',{recursive:true});writeFileSync('.autopilot/upper14-evidence/scale.json',JSON.stringify({scope:'Synthetic full drawn map, production Session; local CPU, not phone acceptance.',createdMs,dayMs,provinces:r.world.provinces.length,cities:r.world.cities.length,armies:r.world.armies.length,upperCombatBytes:JSON.stringify(r.upperCombat).length,engine:r.engine},null,2));
 expect(r.world.provinces).toHaveLength(722);expect(r.world.cities).toHaveLength(722);expect(r.world.armies).toHaveLength(480);expect(Object.keys(n.upperCombat.provinces)).toHaveLength(722);expect(n.terrainContext).toBe(r.terrainContext);expect(n.clock.tick).toBe(120);expect(n.world.day).toBe(1);expect(createdMs).toBeLessThan(15000);expect(dayMs).toBeLessThan(4000);
},30000);
