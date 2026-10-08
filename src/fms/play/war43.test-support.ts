import {War43Session} from './war43-session';
import {portFixture42} from './war42.test-support';
import type {War43Run} from './war43-model';
import {graphFor} from './naval-rules';
import {maritimeView} from './tactics-model';
import {tacticsView} from './campaign-model';
import {campaignView} from './war43-model';
export const stamp43=(r:War43Run)=>({day:r.world.day,nextEventId:r.world.nextEventId,tick:r.clock.tick});
export const graph43=(r:War43Run)=>graphFor(maritimeView(tacticsView(campaignView(r))));
export function portFixture43(){const r=new War43Session().execute({type:'copy',run:portFixture42()}).run as War43Run;r.diplomacy.worldAuto=false;for(const id of Object.keys(r.voyages.enabled))r.voyages.enabled[id]=false;return r;}
