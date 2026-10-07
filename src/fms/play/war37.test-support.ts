import {War37Session} from './war37-session';
import type {War37Run} from './war37-model';
import {grid} from './fixture.test-support';
import {graphFor} from './naval-rules';
import {maritimeView} from './tactics-model';
import {tacticsView} from './campaign-model';
import {campaignView} from './war37-model';
export const graph37=(r:War37Run)=>graphFor(maritimeView(tacticsView(campaignView(r))));
export const stamp37=(r:War37Run)=>({day:r.world.day,nextEventId:r.world.nextEventId,tick:r.clock.tick});
export function navalFixture37(){
 const s=new War37Session();let r=s.execute({type:'create',terrain:grid((x,y)=>x>20&&x<230&&y>20&&y<230?45:0),count:5,cityCount:60,relations:'peace'}).run as War37Run;r.diplomacy.worldAuto=false;
 const g=graph37(r),fleet=r.navy.fleets.find(f=>g.ports.filter(p=>r.world.provinces.find(v=>v.id===p.provinceId)?.controller===f.nationId).length>=3)!;if(!fleet?.dockId)throw Error('Fixture requires three own coastal ports');s.execute({type:'load',run:r});
 for(let i=0;i<3;i++){r=s.execute({type:'naval',action:{type:'build-fleet',nationId:fleet.nationId,portId:fleet.dockId,ships:1},expected:stamp37(r)}).run as War37Run;const f=r.navy.fleets.at(-1)!;r=s.execute({type:'naval-deployment',fleetId:f.id,revision:r.navalDeployment.revision,runId:r.id,expected:stamp37(r)}).run as War37Run;}
 return r;
}
