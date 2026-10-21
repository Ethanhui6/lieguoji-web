import {beforeAll,describe,expect,it} from 'vitest';
import {grid} from './fixture.test-support';
import {Culture47Session,type Culture47Journal,type Culture47Opening} from './culture47-session';
import {politicalStamp47} from './civilization47-political-owner';
import {globalStamp47,type GlobalOrder47} from './civilization47-global-orders';
import {allianceOf46} from './war46-alliance';
import {overlord46} from './war46-vassals';
import {SETTLEMENT47_ALGORITHM} from './settlement47-regions';

const opening:Culture47Opening={terrain:grid((x,y)=>x>20&&x<230&&y>20&&y<230?45:0),count:4,cityCount:24,relations:'peace',settlementAlgorithm:SETTLEMENT47_ALGORITHM,setup:{mode:'culture-generated',enabled:['chinese','japanese','arab','english']}};
let journal:Culture47Journal;
beforeAll(()=>{journal=new Culture47Session().create(opening).journal;},60000);
const load=()=>{const s=new Culture47Session();s.load(journal);return s;};
const order=(s:Culture47Session,o:GlobalOrder47)=>{const snap=s.snapshot();return s.execute({kind:'global',order:o,expected:globalStamp47(snap.run)},snap.journal.actions.length);};
const name=(s:Culture47Session,id:string)=>s.snapshot().run.world.nations.find(n=>n.id===id)!.name;

describe('original annex (AnnexSelectedState) and vassals (VassalManager)',()=>{
  it('吞并 moves every province of the clicked state, ends it, records the original text and replays',()=>{
    const s=load(),before=s.snapshot().run,count=before.world.provinces.filter(p=>p.controller==='n-1').length,own=before.world.provinces.filter(p=>p.controller==='n-0').length;
    const out=order(s,{kind:'annex',edit:{nationId:'n-0',targetId:'n-1'}});
    expect(out.run.world.provinces.filter(p=>p.controller==='n-0')).toHaveLength(own+count);
    expect(out.run.world.provinces.some(p=>p.controller==='n-1'||p.legalOwner==='n-1')).toBe(false);
    expect(Object.hasOwn(out.run.chronicle.ended,'n-1')).toBe(true);
    expect(out.run.chronicle.entries.some(e=>e.kind==='extinction'&&e.text===`${name(s,'n-1')}被${name(s,'n-0')}灭亡`)).toBe(true);
    expect(out.run.chronicle.entries.filter(e=>e.kind==='extinction'&&e.nationIds.includes('n-1'))).toHaveLength(1);
    expect(()=>order(s,{kind:'annex',edit:{nationId:'n-0',targetId:'n-0'}})).toThrow();
    expect(new Culture47Session().load(out.journal)).toEqual(out);
  },60000);
  it('收为附庸: clicked state becomes vassal, leaves alliance and wars, cannot declare war; original refusals',()=>{
    const s=load();let snap;
    order(s,{kind:'alliance',edit:{type:'unite',nationId:'n-1',targetId:'n-2'}});snap=s.snapshot();
    snap=s.execute({kind:'politics',action:{type:'declare-war',nationId:'n-1',targetNationId:'n-3'},expected:politicalStamp47(snap.run)},snap.journal.actions.length);
    expect(snap.run.nativeWars.campaigns.some(c=>c.endedTick===null)).toBe(true);
    const out=order(s,{kind:'vassal',edit:{type:'make',vassalId:'n-1',overlordId:'n-0'}});
    expect(overlord46(out.run,'n-1')).toBe('n-0');expect(allianceOf46(out.run,'n-1')).toBeNull();
    expect(out.run.vassals.records.at(-1)).toMatchObject({tributeRate:Math.fround(.3),armyCapMultiplier:.5});
    expect(out.run.nativeWars.campaigns.filter(c=>c.endedTick===null&&c.nations.includes('n-1'))).toHaveLength(0);
    expect(out.run.chronicle.entries.some(e=>e.text===`${name(s,'n-1')}成为${name(s,'n-0')}的傀儡国`)).toBe(true);
    expect(()=>order(s,{kind:'vassal',edit:{type:'make',vassalId:'n-1',overlordId:'n-2'}})).toThrow('已经是附庸');
    expect(()=>order(s,{kind:'vassal',edit:{type:'make',vassalId:'n-2',overlordId:'n-1'}})).toThrow('自身是附庸，不能拥有附庸');
    expect(()=>order(s,{kind:'vassal',edit:{type:'make',vassalId:'n-0',overlordId:'n-0'}})).toThrow('国家不能成为自己的附庸');
    const now=s.snapshot();expect(()=>s.execute({kind:'politics',action:{type:'declare-war',nationId:'n-1',targetNationId:'n-3'},expected:politicalStamp47(now.run)},now.journal.actions.length)).toThrow();
    const freed=order(s,{kind:'vassal',edit:{type:'release',vassalId:'n-1'}});
    expect(overlord46(freed.run,'n-1')).toBeNull();
    expect(freed.run.chronicle.entries.some(e=>e.text===`${name(s,'n-1')}从${name(s,'n-0')}的统治下获得独立`)).toBe(true);
    expect(new Culture47Session().load(freed.journal)).toEqual(freed);
  },60000);
  it('a destroyed overlord frees its vassal with the original liberation-by-destruction text',()=>{
    const s=load();order(s,{kind:'vassal',edit:{type:'make',vassalId:'n-2',overlordId:'n-1'}});
    const out=order(s,{kind:'annex',edit:{nationId:'n-3',targetId:'n-1'}});
    expect(overlord46(out.run,'n-2')).toBeNull();
    expect(out.run.chronicle.entries.some(e=>e.text===`${name(s,'n-2')}因${name(s,'n-1')}的灭亡而获得独立`)).toBe(true);
    let next=out;for(let i=0;i<60;i++)next=s.execute({kind:'advance',ticks:120},next.journal.actions.length);
    expect(next.run.clock.tick).toBe(out.run.clock.tick+60*120);
  },120000);
});
