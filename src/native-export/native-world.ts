import {createFmsOriginalDocument} from '../fms/original/original-document';
import {generateFmsFullMap,prepareFmsFullMapPreview} from '../fms/full-map-terrain';
import {Culture47Session,type Culture47Opening} from '../fms/play/culture47-session';
import {SETTLEMENT47_ALGORITHM} from '../fms/play/settlement47-regions';
import {populationStamp47} from '../fms/play/civilization47-population-types';
import {ARMY_RETIREMENT_RULE47} from '../fms/play/army-retirement47';
import {ARMY_RECOVERY_RULE47} from '../fms/play/army-recovery47';
import {FRAME_LOOP_RULE47} from '../fms/play/frame-loop47';
import {ARMY_BATCH_RULE47} from '../fms/play/army-batch47';
import {FOUNDING_RULE47} from '../fms/play/civilization47-founding-time';
import {OFFICE_RULE47} from '../fms/play/civilization47-offices';
import {ORIGINAL_ARMY_RULE47} from '../fms/play/civilization47-original-army';

/** The one world the native app ships (stage 2+): original 20k grid, seed 421730 continents,
 * eight nations, created and then initialized with the same rule actions the web UI sends after
 * "从当前地图创建文化世界" (CultureWorld47.tsx), so its state is exactly a new web world on day 0. */
export const NATIVE_WORLD_OPTIONS={seed:'421730',template:'continents'} as const;
export async function createNativeWorld(){
  const blank=await createFmsOriginalDocument('20k');
  blank.worldId='42173000-0000-4000-8000-000000000001';
  const terrain=(await prepareFmsFullMapPreview(blank,{worldId:blank.worldId,baseRevision:blank.revision,
    ...await generateFmsFullMap(blank,NATIVE_WORLD_OPTIONS,{yieldTask:async()=>{}})},NATIVE_WORLD_OPTIONS)).document;
  const opening:Culture47Opening={terrain,count:8,cityCount:80,relations:'peace',settlementAlgorithm:SETTLEMENT47_ALGORITHM,
    setup:{mode:'culture-generated',enabled:['chinese','japanese','english','arab','roman','german']},families:'original'};
  const session=new Culture47Session();
  let x=session.create(opening);
  for(const [kind,rule] of [['enable-retirement',ARMY_RETIREMENT_RULE47],['enable-recovery',ARMY_RECOVERY_RULE47],['enable-frame-loop',FRAME_LOOP_RULE47],
    ['enable-army-batch',ARMY_BATCH_RULE47],['enable-foundings',FOUNDING_RULE47],['enable-offices',OFFICE_RULE47],['enable-original-army',ORIGINAL_ARMY_RULE47]] as const)
    x=session.execute({kind,rule,expected:populationStamp47(x.run)} as never,x.journal.actions.length);
  return {terrain,opening,session,snapshot:x};
}
