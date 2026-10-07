import {War36Session} from './war36-session';
import {allianceFixture35} from './war35.test-support';
import type {War36Run} from './war36-model';
export function accessFixture36(){return new War36Session().execute({type:'copy',run:allianceFixture35()}).run as War36Run;}
export const stamp36=(r:War36Run)=>({day:r.world.day,nextEventId:r.world.nextEventId,tick:r.clock.tick});
/** An actual adjacent foreign province and its own neighbour, preserving the
 * generated geometry. No synthetic adjacency or virtual ownership is used. */
export function border36(r:War36Run){
 for(const p of r.world.provinces)for(const id of p.neighbors){const q=r.world.provinces.find(q=>q.id===id)!;
  if(p.controller!==q.controller){const after=q.neighbors.map(id=>r.world.provinces.find(p=>p.id===id)!).find(t=>t.controller===q.controller&&t.id!==p.id);
   if(after){const a=r.world.armies.find(a=>a.nationId===p.controller&&a.status==='idle')!;Object.assign(a,{provinceId:p.id,originId:p.id,route:[],progress:0,supplies:100,morale:100});return {p,q,after,a};}
  }
 }throw Error('Fixture needs adjacent multi-province countries');
}
