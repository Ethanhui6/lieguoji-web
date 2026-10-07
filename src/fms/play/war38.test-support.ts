import {War38Session} from './war38-session';
import {navalFixture37} from './war37.test-support';
import type {War38Run} from './war38-model';
import {graphFor} from './naval-rules';
import {maritimeView} from './tactics-model';
import {tacticsView} from './campaign-model';
import {campaignView} from './war38-model';
export const stamp38=(r:War38Run)=>({day:r.world.day,nextEventId:r.world.nextEventId,tick:r.clock.tick});
export const graph38=(r:War38Run)=>graphFor(maritimeView(tacticsView(campaignView(r))));
export function garrisonFixture38(){const r=new War38Session().execute({type:'copy',run:navalFixture37()}).run as War38Run;r.diplomacy.worldAuto=false;return r;}
