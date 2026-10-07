import {War40Session} from './war40-session';
import {portFixture39} from './war39.test-support';
import type {War40Run} from './war40-model';
import {graphFor} from './naval-rules';
import {maritimeView} from './tactics-model';
import {tacticsView} from './campaign-model';
import {campaignView} from './war40-model';
export const stamp40=(r:War40Run)=>({day:r.world.day,nextEventId:r.world.nextEventId,tick:r.clock.tick});
export const graph40=(r:War40Run)=>graphFor(maritimeView(tacticsView(campaignView(r))));
export function portFixture40(){const r=new War40Session().execute({type:'copy',run:portFixture39()}).run as War40Run;r.diplomacy.worldAuto=false;for(const id of Object.keys(r.voyages.enabled))r.voyages.enabled[id]=false;return r;}
