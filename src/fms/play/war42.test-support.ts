import {War42Session} from './war42-session';
import {portFixture41} from './war41.test-support';
import type {War42Run} from './war42-model';
import {graphFor} from './naval-rules';
import {maritimeView} from './tactics-model';
import {tacticsView} from './campaign-model';
import {campaignView} from './war42-model';
export const stamp42=(r:War42Run)=>({day:r.world.day,nextEventId:r.world.nextEventId,tick:r.clock.tick});
export const graph42=(r:War42Run)=>graphFor(maritimeView(tacticsView(campaignView(r))));
export function portFixture42(){const r=new War42Session().execute({type:'copy',run:portFixture41()}).run as War42Run;r.diplomacy.worldAuto=false;for(const id of Object.keys(r.voyages.enabled))r.voyages.enabled[id]=false;return r;}
