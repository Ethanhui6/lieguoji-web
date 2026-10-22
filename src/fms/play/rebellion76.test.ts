import {beforeAll,describe,expect,it} from 'vitest';
import {grid} from './fixture.test-support';
import {Culture47Session,type Culture47Journal} from './culture47-session';
import {SETTLEMENT47_ALGORITHM} from './settlement47-regions';
import {populationStamp47} from './civilization47-population-types';
import {FOUNDING_RULE47,type FoundingRun47} from './civilization47-founding';
import {GENERATIONS_RULE47} from './civilization47-generations-ledger';
import {advanceRebellion47,tryRebel47} from './civilization47-rebellion';
import {assertPolitics47,reconcileGovernmentContinuity47} from './civilization47-political-owner';
import {transferEconomy} from '../../compat/v0_4/sim/statecraft';

let journal:Culture47Journal;
beforeAll(()=>{
  const s=new Culture47Session();let snap=s.create({terrain:grid((x,y)=>x>5&&x<250&&y>5&&y<250?45:0),count:2,cityCount:120,relations:'peace',settlementAlgorithm:SETTLEMENT47_ALGORITHM,setup:{mode:'culture-generated',enabled:['chinese','japanese']}});
  snap=s.execute({kind:'enable-generations',rule:GENERATIONS_RULE47,expected:populationStamp47(snap.run)},snap.journal.actions.length);
  snap=s.execute({kind:'enable-foundings',rule:FOUNDING_RULE47,expected:populationStamp47(snap.run)},snap.journal.actions.length);
  for(let i=0;i<500;i++)snap=s.execute({kind:'advance',ticks:120},snap.journal.actions.length);
  journal=snap.journal;
},600000);
const run=()=>structuredClone(new Culture47Session().load(journal).run) as FoundingRun47;
const big=(r:FoundingRun47)=>[...r.world.nations].sort((a,b)=>r.world.provinces.filter(p=>p.controller===b.id).length-r.world.provinces.filter(p=>p.controller===a.id).length)[0].id;
const capital=(r:FoundingRun47,id:string)=>r.world.cities.find(c=>c.id===r.world.nations.find(n=>n.id===id)!.capitalId)!.provinceId;
const weaken=(r:FoundingRun47,id:string,destiny:number)=>{r.destiny.nations[id].destiny=destiny;r.upperCombat.nations[id].destiny=destiny;};

describe('original TryRebel gates (State.CanProvinceRebel, Province.TryRebel)',()=>{
  it('a weak state of 30+ provinces loses a non-capital province; the 12-month interval then blocks the next one',()=>{
    const r=run(),id=big(r);expect(r.world.provinces.filter(p=>p.controller===id).length).toBeGreaterThanOrEqual(30);
    weaken(r,id,10);
    const candidates=r.world.provinces.filter(p=>p.controller===id&&p.id!==capital(r,id));
    let rebelled:string|null=null;for(const p of candidates)if(tryRebel47(r,p.id,false)){rebelled=p.id;break;}
    expect(rebelled).not.toBeNull();
    expect(r.world.provinces.find(p=>p.id===rebelled)!.controller).not.toBe(id);
    expect(r.foundings!.lastRebel[id]).toBe(r.life.gameTime);
    expect(r.chronicle.entries.some(e=>e.text.endsWith('发生叛乱'))).toBe(true);
    for(const p of candidates.filter(p=>p.id!==rebelled))expect(tryRebel47(r,p.id,false)).toBe(false);
    assertPolitics47(r);
  },120000);
  it('no rebellion when 允许叛乱 is off, destiny is above the threshold, or for the capital',()=>{
    const r=run(),id=big(r),others=r.world.provinces.filter(p=>p.controller===id&&p.id!==capital(r,id));
    weaken(r,id,10);r.foundings!.enabled=false;for(const p of others)expect(tryRebel47(r,p.id,false)).toBe(false);
    r.foundings!.enabled=true;weaken(r,id,90);for(const p of others)expect(tryRebel47(r,p.id,false)).toBe(false);
    weaken(r,id,10);expect(tryRebel47(r,capital(r,id),false)).toBe(false);
  },120000);
  it('MonthsCoreProvinceForState: core months grow by 1 per monthly update; the province update day is 1..days in month',()=>{
    const r=run(),s=r.foundings!,p=r.world.provinces.find(v=>v.controller===big(r)&&r.upperCombat.provinces[v.id].distance<=r.upperCombat.nations[v.controller].coreThreshold)!;
    expect(s.coreMonths[p.id]?.[p.controller]).toBeGreaterThanOrEqual(15);
    for(const d of Object.values(s.updateDays)){expect(d).toBeGreaterThanOrEqual(1);expect(d).toBeLessThanOrEqual(31);}
    const before=s.coreMonths[p.id][p.controller];s.updateDays[p.id]=r.life.currentDate.day;advanceRebellion47(r);
    expect(s.coreMonths[p.id][p.controller]).toBe(Math.fround(before+1));
  },120000);
  it('a forced rebellion may re-establish a dead former owner of that province (ReestablishedEvent)',()=>{
    let restored=0;
    for(let k=0;k<12&&!restored;k++){
      const r=run(),id=big(r),other=r.world.nations.find(n=>n.id!==id)!.id,s=r.foundings!;
      const p=r.world.provinces.find(v=>v.controller===id&&v.id!==capital(r,id))!;
      s.coreMonths[p.id]={...s.coreMonths[p.id],[other]:30};s.random.state=(s.random.state+k*7919)>>>0;
      // The other state dies: all its land goes to id.
      for(const q of r.world.provinces.filter(v=>v.controller===other)){transferEconomy(r.world,q.id,other,id);q.controller=q.legalOwner=id;}reconcileGovernmentContinuity47(r);expect(Object.hasOwn(r.chronicle.ended,other)).toBe(true);
      if(tryRebel47(r,p.id,true)&&r.world.provinces.find(v=>v.id===p.id)!.controller===other){restored++;expect(r.chronicle.entries.some(e=>e.kind==='restoration'&&e.text.includes('复国'))).toBe(true);assertPolitics47(r);}
    }
    expect(restored).toBe(1);
  },300000);
});
