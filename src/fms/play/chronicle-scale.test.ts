import {it,expect} from 'vitest';
import {createFmsDocument,prepareFmsOutlineEdit,commitFmsEdit} from '../model';
import {ChronicleSession} from './chronicle-session';
import type {ChronicleRun} from './chronicle-model';
it('advances a full drawn fine map without trimming its standing armies',async()=>{
 const raw=await createFmsDocument(),w=raw.width,h=raw.height,terrain=commitFmsEdit(raw,prepareFmsOutlineEdit(raw,[[w*.05,h*.25],[w*.95,h*.25],[w*.95,h*.75],[w*.05,h*.75]],45));
 const s=new ChronicleSession(),r=s.execute({type:'create',terrain,count:2,relations:'war'}).run as ChronicleRun;
 const start=performance.now(),n=s.execute({type:'step',days:1}).run as ChronicleRun,elapsed=performance.now()-start;
 console.log(JSON.stringify({benchmark:'v11-fine-map-day',provinces:r.world.provinces.length,cities:r.world.cities.length,armies:r.world.armies.length,ms:elapsed}));
 expect(n.world.day).toBe(1);expect(n.clock.tick).toBe(120);expect(r.world.armies.length).toBeGreaterThan(80);expect(elapsed).toBeLessThan(4000);
},30000);
