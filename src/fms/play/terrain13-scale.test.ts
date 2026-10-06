import {it,expect} from 'vitest';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createFmsDocument,prepareFmsOutlineEdit,commitFmsEdit} from '../model';
import {Terrain13Session} from './terrain13-session';
import type {Terrain13Run} from './terrain13-model';
it('maps the full fine geography once and advances all 480 standing armies',async()=>{
 const raw=await createFmsDocument(),w=raw.width,h=raw.height,terrain=commitFmsEdit(raw,prepareFmsOutlineEdit(raw,[[w*.05,h*.25],[w*.95,h*.25],[w*.95,h*.75],[w*.05,h*.75]],45));
 const s=new Terrain13Session(),start=performance.now(),r=s.execute({type:'create',terrain,count:2,relations:'war'}).run as Terrain13Run,createdMs=performance.now()-start;
 const tick=performance.now(),n=s.execute({type:'step',days:1}).run as Terrain13Run,dayMs=performance.now()-tick;
 mkdirSync('.autopilot/terrain13-evidence',{recursive:true});writeFileSync('.autopilot/terrain13-evidence/scale.json',JSON.stringify({scope:'Synthetic full drawn map, real production Session. Local machine CPU, not phone performance.',createdMs,dayMs,provinces:r.world.provinces.length,cities:r.world.cities.length,armies:r.world.armies.length,terrainContextBytes:JSON.stringify(r.terrainContext).length,engine:r.engine},null,2));
 expect(r.world.provinces).toHaveLength(722);expect(r.world.cities).toHaveLength(722);expect(r.world.armies).toHaveLength(480);expect(Object.keys(r.terrainContext.provinces)).toHaveLength(722);expect(n.terrainContext).toBe(r.terrainContext);expect(n.clock.tick).toBe(120);expect(n.world.day).toBe(1);expect(createdMs).toBeLessThan(15000);expect(dayMs).toBeLessThan(4000);
},30000);
