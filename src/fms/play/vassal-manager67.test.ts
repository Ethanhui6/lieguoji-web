import {beforeAll,describe,expect,it} from 'vitest';
import {grid} from './fixture.test-support';
import {Culture47Session,type Culture47Journal,type Culture47Opening} from './culture47-session';
import {globalStamp47,type GlobalOrder47} from './civilization47-global-orders';
import {advanceVassalManager47} from './civilization47-vassal-manager';
import {settleWar47} from './civilization47-war-settlement';
import {overlord46} from './war46-vassals';
import {war26Strength} from './war26-strength';
import {SETTLEMENT47_ALGORITHM} from './settlement47-regions';

const opening:Culture47Opening={terrain:grid((x,y)=>x>20&&x<230&&y>20&&y<230?45:0),count:4,cityCount:24,relations:'peace',settlementAlgorithm:SETTLEMENT47_ALGORITHM,setup:{mode:'culture-generated',enabled:['chinese','japanese','arab','english']}};
let journal:Culture47Journal;
beforeAll(()=>{journal=new Culture47Session().create(opening).journal;},60000);
const load=()=>{const s=new Culture47Session();s.load(journal);return s;};
const order=(s:Culture47Session,o:GlobalOrder47)=>{const snap=s.snapshot();return s.execute({kind:'global',order:o,expected:globalStamp47(snap.run)},snap.journal.actions.length);};
const advanceDays=(s:Culture47Session,days:number)=>{let snap=s.snapshot();for(let i=0;i<days;i++)snap=s.execute({kind:'advance',ticks:120},snap.journal.actions.length);return snap;};
/** Stronger state as vassal so ShouldRebel takes the deterministic 'powerful' branch. */
const pair=(s:Culture47Session)=>{const r=s.snapshot().run,ids=['n-0','n-1','n-2','n-3'].sort((a,b)=>war26Strength(r.world,r,b)-war26Strength(r.world,r,a));return {vassalId:ids[0],overlordId:ids[1]};};

describe('original VassalManager.Update on the live world',()=>{
  it('pays December tribute on the update day; disabling 允许附庸叛乱 stops the whole manager',()=>{
    const run=(enabled:boolean)=>{const s=load(),{vassalId,overlordId}=pair(s);order(s,{kind:'vassal',edit:{type:'make',vassalId,overlordId}});
      if(!enabled)order(s,{kind:'vassal',edit:{type:'automatic',enabled:false}});
      const out=advanceDays(s,400);return {receipts:out.run.vassalManager.receipts,journal:out.journal,out};};
    const on=run(true);
    expect(on.receipts.length).toBeGreaterThan(0);
    expect(on.receipts[0]).toMatchObject({status:'paid'});expect(on.receipts[0].amount).toBeGreaterThan(0);
    expect(new Culture47Session().load(on.journal)).toEqual(on.out);
    expect(run(false).receipts).toHaveLength(0);
  },600000);
  it('a twelve-year vassal of strength above 0.85 starts the original independence war (CB16); annexing its overlord frees it',()=>{
    const s=load(),{vassalId,overlordId}=pair(s);order(s,{kind:'vassal',edit:{type:'make',vassalId,overlordId}});
    const snap=advanceDays(s,75),r=structuredClone(snap.run),v=r.vassals.records.find(v=>v.vassalId===vassalId&&v.endedTick===null)!;
    expect(r.life.currentDate.month%3).toBe(0);
    v.time=Math.fround(r.life.gameTime-r.life.secondsPerDay*366*13);v.updateDay=r.life.currentDate.day;r.vassalManager.lastDay=r.world.day-1;
    advanceVassalManager47(r);
    const war=r.nativeWars.campaigns.find(c=>c.endedTick===null&&c.internal?.casusBelliId===16)!;
    expect(war).toBeDefined();expect(r.vassalManager.rebellions.at(-1)).toMatchObject({vassalId,overlordId,reason:'powerful'});
    const names=[vassalId,overlordId].map(id=>r.world.nations.find(n=>n.id===id)!.name);
    expect(r.chronicle.entries.some(e=>e.text===`傀儡国${names[0]}发生叛变`&&e.reason.startsWith(`反抗宗主国${names[1]}：`))).toBe(true);
    expect(overlord46(r,vassalId)).toBe(overlordId);
    // Player intervention (reason 11) skips the settlement effects: the relation survives.
    const kept=structuredClone(r);settleWar47(kept,kept.nativeWars.campaigns.find(c=>c.id===war.id)!,11);expect(overlord46(kept,vassalId)).toBe(overlordId);
    // Normal settlement with the mother still alive follows nativeRebelPrevailed.
    const settled=structuredClone(r);settleWar47(settled,settled.nativeWars.campaigns.find(c=>c.id===war.id)!,1);
    expect(settled.nativeWars.campaigns.find(c=>c.id===war.id)!.endedTick).not.toBeNull();
  },600000);
  it('annexing an overlord frees its vassal immediately with the original text',()=>{
    const s=load(),{vassalId,overlordId}=pair(s);order(s,{kind:'vassal',edit:{type:'make',vassalId,overlordId}});
    const third=['n-0','n-1','n-2','n-3'].find(id=>id!==vassalId&&id!==overlordId)!;
    const snap=s.snapshot();
    const out=s.execute({kind:'territory',edit:{nationId:third,provinceIds:snap.run.world.provinces.filter(p=>p.controller===overlordId).map(p=>p.id)},expected:{runId:snap.run.id,day:snap.run.world.day,tick:snap.run.clock.tick,nextEventId:snap.run.world.nextEventId,diplomacy:snap.run.nativeDiplomacy.revision,wars:snap.run.nativeWars.revision,civilization:snap.run.civilization.revision}},snap.journal.actions.length);
    expect(overlord46(out.run,vassalId)).toBeNull();
    expect(out.run.chronicle.entries.some(e=>e.text.includes('的灭亡而获得独立'))).toBe(true);
  },120000);
});
