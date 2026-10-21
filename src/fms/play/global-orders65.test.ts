import {beforeAll,describe,expect,it} from 'vitest';
import {grid} from './fixture.test-support';
import {Culture47Session,type Culture47Journal,type Culture47Opening} from './culture47-session';
import {politicalStamp47} from './civilization47-political-owner';
import {globalStamp47,type GlobalOrder47} from './civilization47-global-orders';
import {allianceOf46} from './war46-alliance';
import {SETTLEMENT47_ALGORITHM} from './settlement47-regions';

const opening:Culture47Opening={terrain:grid((x,y)=>x>20&&x<230&&y>20&&y<230?45:0),count:4,cityCount:24,relations:'peace',settlementAlgorithm:SETTLEMENT47_ALGORITHM,setup:{mode:'culture-generated',enabled:['chinese','japanese','arab','english']}};
let journal:Culture47Journal;
beforeAll(()=>{journal=new Culture47Session().create(opening).journal;},60000);
const load=()=>{const s=new Culture47Session();s.load(journal);return s;};
const order=(s:Culture47Session,o:GlobalOrder47)=>{const snap=s.snapshot();return s.execute({kind:'global',order:o,expected:globalStamp47(snap.run)},snap.journal.actions.length);};

describe('original nation actions and AI global config',()=>{
  it('缔结盟约 forms an originally named alliance and ends the pair war; 退出同盟 dissolves it; replay is exact',()=>{
    const s=load();let snap=s.snapshot();
    snap=s.execute({kind:'politics',action:{type:'declare-war',nationId:'n-0',targetNationId:'n-1'},expected:politicalStamp47(snap.run)},snap.journal.actions.length);
    expect(snap.run.nativeWars.campaigns.some(c=>c.endedTick===null)).toBe(true);
    const united=order(s,{kind:'alliance',edit:{type:'unite',nationId:'n-0',targetId:'n-1'}}),a=allianceOf46(united.run,'n-0')!;
    expect(a.members.sort()).toEqual(['n-0','n-1']);
    const names=['n-0','n-1'].map(id=>united.run.world.nations.find(n=>n.id===id)!.name);expect(a.name).toBe(`${names[0]}-${names[1]}联盟`);
    expect(united.run.nativeWars.campaigns.filter(c=>c.endedTick===null)).toHaveLength(0);
    expect(united.run.chronicle.entries.some(e=>e.text===`${names[0]}与${names[1]}结成联盟`)).toBe(true);
    const left=order(s,{kind:'alliance',edit:{type:'leave',nationId:'n-0'}});
    expect(allianceOf46(left.run,'n-1')).toBeNull();
    expect(new Culture47Session().load(left.journal)).toEqual(left);
  },60000);
  it('global and per-nation switches change only their settings and reject stale or no-op orders',()=>{
    const s=load(),before=s.snapshot();
    const off=order(s,{kind:'diplomacy',edit:{scope:'world',enabled:false}});expect(off.run.diplomacy.worldAuto).toBe(false);
    const nation=order(s,{kind:'diplomacy',edit:{scope:'nation',nationId:'n-2',enabled:false}});expect(nation.run.diplomacy.nations['n-2']).toBe(false);
    const months=order(s,{kind:'diplomacy',edit:{scope:'duration',months:36}});expect(months.run.diplomacy.maximumMonths).toBe(36);
    const noAlliances=order(s,{kind:'alliance',edit:{type:'automatic',enabled:false}});expect(noAlliances.run.alliances.enabled).toBe(false);
    expect(()=>order(s,{kind:'alliance',edit:{type:'automatic',enabled:false}})).toThrow();
    expect(()=>s.execute({kind:'global',order:{kind:'diplomacy',edit:{scope:'world',enabled:true}},expected:globalStamp47(before.run)},s.snapshot().journal.actions.length)).toThrow('已变化');
    expect(noAlliances.run.world.provinces.map(p=>p.controller)).toEqual(before.run.world.provinces.map(p=>p.controller));
  },60000);
  it('允许联盟 controls autonomous alliances in the monthly schedule',()=>{
    const run=(enabled:boolean)=>{const s=load();if(!enabled)order(s,{kind:'alliance',edit:{type:'automatic',enabled:false}});let snap=s.snapshot();
      for(let i=0;i<6*365;i++)snap=s.execute({kind:'advance',ticks:120},snap.journal.actions.length);
      return snap.run.alliances.records.length;};
    const disabled=run(false),enabled=run(true);
    expect(disabled).toBe(0);expect(enabled).toBeGreaterThan(0);
    console.log(JSON.stringify({alliancesFormedIn6Years:{enabled,disabled}}));
  },600000);
});
