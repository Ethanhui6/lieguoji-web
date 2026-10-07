import {War39Session} from './war39-session';
import {garrisonFixture38} from './war38.test-support';
import type {War39Run} from './war39-model';
import {graphFor} from './naval-rules';
import {maritimeView} from './tactics-model';
import {tacticsView} from './campaign-model';
import {campaignView} from './war39-model';
export const stamp39=(r:War39Run)=>({day:r.world.day,nextEventId:r.world.nextEventId,tick:r.clock.tick});
export const graph39=(r:War39Run)=>graphFor(maritimeView(tacticsView(campaignView(r))));
export function portFixture39(){const r=new War39Session().execute({type:'copy',run:garrisonFixture38()}).run as War39Run;r.diplomacy.worldAuto=false;for(const id of Object.keys(r.voyages.enabled))r.voyages.enabled[id]=false;return r;}
