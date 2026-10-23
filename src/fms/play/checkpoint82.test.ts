import {describe,expect,it} from 'vitest';
import {grid} from './fixture.test-support';
import {Culture47Session,Culture47CheckpointMismatch} from './culture47-session';
import {SETTLEMENT47_ALGORITHM} from './settlement47-regions';
import {populationStamp47} from './civilization47-population-types';
import {FOUNDING_RULE47} from './civilization47-founding';
import {ARMY_BATCH_RULE47} from './army-batch47';
import {FRAME_LOOP_RULE47} from './frame-loop47';
import {ARMY_RETIREMENT_RULE47} from './army-retirement47';
import {ARMY_RECOVERY_RULE47} from './army-recovery47';

describe('save checkpoint (fast continue without replay)',()=>{
  it('a resumed world continues exactly like the uninterrupted one; a mismatched checkpoint is refused',()=>{
    const a=new Culture47Session();let x=a.create({terrain:grid((x,y)=>x>10&&x<245&&y>10&&y<245?45:0),count:4,cityCount:40,relations:'war',settlementAlgorithm:SETTLEMENT47_ALGORITHM,setup:{mode:'culture-generated',enabled:['chinese','japanese','arab']},families:'original'});
    for(const [kind,rule] of [['enable-retirement',ARMY_RETIREMENT_RULE47],['enable-recovery',ARMY_RECOVERY_RULE47],['enable-frame-loop',FRAME_LOOP_RULE47],['enable-army-batch',ARMY_BATCH_RULE47],['enable-foundings',FOUNDING_RULE47]] as const)x=a.execute({kind,rule,expected:populationStamp47(x.run)} as never,x.journal.actions.length);
    for(let i=0;i<20;i++)a.executeDisplay([{kind:'advance',ticks:120},{kind:'advance',ticks:120},{kind:'advance',ticks:120}],x.journal.actions.length+i*3);
    const saved=structuredClone({journal:a.snapshot().journal,checkpoint:a.checkpoint()});
    const b=new Culture47Session();b.resume(saved.journal,saved.checkpoint);
    expect(b.snapshot()).toEqual(a.snapshot());
    let seq=saved.journal.actions.length;
    for(let i=0;i<20;i++){a.executeDisplay([{kind:'advance',ticks:120},{kind:'advance',ticks:120},{kind:'advance',ticks:120}],seq);b.executeDisplay([{kind:'advance',ticks:120},{kind:'advance',ticks:120},{kind:'advance',ticks:120}],seq);seq+=3;}
    expect(b.snapshot()).toEqual(a.snapshot());
    expect(new Culture47Session().load(b.snapshot().journal)).toEqual(b.snapshot());
    const bad=structuredClone(saved);(bad.checkpoint.run as {clock:{tick:number}}).clock.tick+=120;
    expect(()=>new Culture47Session().resume(bad.journal,bad.checkpoint)).toThrow(Culture47CheckpointMismatch);
    const short=structuredClone(saved);short.checkpoint.actions--;
    expect(()=>new Culture47Session().resume(short.journal,short.checkpoint)).toThrow(Culture47CheckpointMismatch);
  },1200000);
});
