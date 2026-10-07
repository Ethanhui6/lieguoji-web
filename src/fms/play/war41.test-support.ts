import {War41Session} from './war41-session';
import {portFixture40} from './war40.test-support';
import type {War41Run} from './war41-model';
import {graphFor} from './naval-rules';
import {maritimeView} from './tactics-model';
import {tacticsView} from './campaign-model';
import {campaignView} from './war41-model';
export const stamp41=(r:War41Run)=>({day:r.world.day,nextEventId:r.world.nextEventId,tick:r.clock.tick});
export const graph41=(r:War41Run)=>graphFor(maritimeView(tacticsView(campaignView(r))));
export function portFixture41(){const r=new War41Session().execute({type:'copy',run:portFixture40()}).run as War41Run;r.diplomacy.worldAuto=false;for(const id of Object.keys(r.voyages.enabled))r.voyages.enabled[id]=false;return r;}
