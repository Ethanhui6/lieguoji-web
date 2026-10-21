import {beforeAll,describe,expect,it} from 'vitest';
import {grid} from './fixture.test-support';
import {Culture47Session,type Culture47Journal,type Culture47Opening} from './culture47-session';
import {populationStamp47} from './civilization47-population-types';
import {FRAME_LOOP_RULE47,frameTicks47} from './frame-loop47';
import {ARMY_BATCH_RULE47} from './army-batch47';
import {SETTLEMENT47_ALGORITHM} from './settlement47-regions';

const opening:Culture47Opening={terrain:grid((x,y)=>x>20&&x<230&&y>20&&y<230?45:0),count:4,cityCount:24,relations:'war',settlementAlgorithm:SETTLEMENT47_ALGORITHM,setup:{mode:'culture-generated',enabled:['chinese','japanese','arab','english']}};
let journal:Culture47Journal;
beforeAll(()=>{const s=new Culture47Session();let snap=s.create(opening);
  for(const [kind,rule] of [['enable-frame-loop',FRAME_LOOP_RULE47],['enable-army-batch',ARMY_BATCH_RULE47]] as const)snap=s.execute({kind,rule,expected:populationStamp47(snap.run)} as never,snap.journal.actions.length);
  journal=snap.journal;},120000);
const load=()=>{const s=new Culture47Session();s.load(journal);return s;};
const days=(s:Culture47Session,n:number)=>{let snap=s.snapshot();for(let i=0;i<n;i++)snap=s.execute({kind:'advance',ticks:120},snap.journal.actions.length);return snap;};

describe('original timeScale: frame length follows the speed level',()=>{
  it('switches at a day boundary, keeps advancing, and replays exactly',()=>{
    const s=load();days(s,3);
    const fast=s.execute({kind:'frame-length',ticks:120},s.snapshot().journal.actions.length);expect(frameTicks47(fast.run)).toBe(120);
    days(s,20);const slow=s.execute({kind:'frame-length',ticks:2},s.snapshot().journal.actions.length);expect(frameTicks47(slow.run)).toBe(2);
    const end=days(s,3);expect(end.run.clock.tick).toBe(fast.run.clock.tick+23*120);
    expect(new Culture47Session().load(end.journal)).toEqual(end);
  },300000);
  it('rejects a switch inside a day, an unknown length and a no-op',()=>{
    const s=load();days(s,1);
    s.execute({kind:'advance',ticks:60},s.snapshot().journal.actions.length);
    expect(()=>s.execute({kind:'frame-length',ticks:120},s.snapshot().journal.actions.length)).toThrow('日界');
    s.execute({kind:'advance',ticks:60},s.snapshot().journal.actions.length);
    expect(()=>s.execute({kind:'frame-length',ticks:20},s.snapshot().journal.actions.length)).toThrow();
    expect(()=>s.execute({kind:'frame-length',ticks:80},s.snapshot().journal.actions.length)).toThrow();
  },300000);
  it('one frame per day costs less per game day than six',()=>{
    const time=(ticks:number|null)=>{const s=load();days(s,2);if(ticks)s.execute({kind:'frame-length',ticks},s.snapshot().journal.actions.length);const t=performance.now();days(s,40);return performance.now()-t;};
    const six=time(null),one=time(120);
    console.log(JSON.stringify({msPerDay:{sixFrames:six/40,oneFrame:one/40}}));
    expect(one).toBeLessThan(six);
  },600000);
});
