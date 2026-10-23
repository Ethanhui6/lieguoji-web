import {describe,it,expect,vi,afterEach} from 'vitest';
import {createFmsOriginalDocument} from '../original/original-document';
import {generateFmsFullMap} from '../full-map-terrain';
import {Culture47Session} from './culture47-session';
import {SETTLEMENT47_ALGORITHM} from './settlement47-regions';
import {populationStamp47} from './civilization47-population-types';
import {FOUNDING_RULE47} from './civilization47-founding';
import {ARMY_BATCH_RULE47} from './army-batch47';
import {FRAME_LOOP_RULE47} from './frame-loop47';
import {ARMY_RETIREMENT_RULE47} from './army-retirement47';
import {ARMY_RECOVERY_RULE47} from './army-recovery47';

// Fixed worlds that 0.5.3 could not carry through strict validation: the same
// opening (pinned ids) on the default 20k original grid, advanced day by day
// under every validator, as loading a saved journal does.
async function strictWorld(tag:string,days:number){
  let uuid=0;vi.spyOn(crypto,'randomUUID').mockImplementation(()=>`00000000-0000-4000-8000-${tag}${String(++uuid).padStart(11,'0')}`.slice(0,36) as `${string}-${string}-${string}-${string}-${string}`);
  const doc=await createFmsOriginalDocument('20k');doc.elevations=(await generateFmsFullMap(doc,{seed:'421730',template:'continents'})).elevations;
  const s=new Culture47Session();let x=s.create({terrain:doc,count:6,cityCount:60,relations:'war',settlementAlgorithm:SETTLEMENT47_ALGORITHM,setup:{mode:'culture-generated',enabled:['chinese','japanese','arab','english','roman']},families:'original'});
  for(const [kind,rule] of [['enable-retirement',ARMY_RETIREMENT_RULE47],['enable-recovery',ARMY_RECOVERY_RULE47],['enable-frame-loop',FRAME_LOOP_RULE47],['enable-army-batch',ARMY_BATCH_RULE47],['enable-foundings',FOUNDING_RULE47]] as const)x=s.execute({kind,rule,expected:populationStamp47(x.run)} as never,x.journal.actions.length);
  for(let d=0;d<days;d++)x=s.execute({kind:'advance',ticks:120},x.journal.actions.length);
  return x;
}
describe('original-family worlds stay valid under strict replay',()=>{
 afterEach(()=>vi.restoreAllMocks());
 it('accepts the members of a family founded mid-month at their founding age',async()=>{
  const x=await strictWorld('2',40);expect(x.run.world.day).toBe(40);
 },300000);
 // About two minutes: run with LIEGUOJI_LONG=1 (long CI job / before a release).
 it.runIf(process.env.LIEGUOJI_LONG==='1')('accepts a widow who remarried into another family',async()=>{
  const x=await strictWorld('a',705);expect(x.run.world.day).toBe(705);
 },900000);
});
