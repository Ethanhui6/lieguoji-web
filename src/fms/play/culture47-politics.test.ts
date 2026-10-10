import {beforeAll,describe,it,expect} from 'vitest';
import {grid} from './fixture.test-support';
import {Culture47Session,type Culture47Journal,type Culture47Opening} from './culture47-session';
import {assertPolitics47,applyPoliticalCommand47,politicalStamp47,reconcileGovernmentContinuity47,recordPoliticalOccupation47,advancePolitics47} from './civilization47-political-owner';
import {createFoundingForces47} from './civilization47-forces';
import {attachPolitics47} from './civilization47-political-owner';
import {settleWar47,reconcileDiplomaticForces47} from './civilization47-war-settlement';
import {diplomaticContext46,evaluateDeclaration47} from './civilization47-declaration';
import {advanceSessionBatch47} from './session-advance47';
import {advanceFamilyCalendar47} from './civilization47-calendar';
import {advancePeopleMonthOwned47,diePersonOwned47} from './civilization47-lifecycle';
import {advanceDiplomaticSchedule46} from './civilization47-diplomatic-state';
import {currentRuler47} from './civilization47-names';
import {actualForces47} from './force-runtime47';
import {armyTravelLocation47,beginArmyTravel47} from './army-travel47-state';
import {coversPair46} from './war46-coalition';
import {claimEntry47} from './civilization47-diplomatic-world';
const opening:Culture47Opening={terrain:grid((x,y)=>x>20&&x<230&&y>20&&y<230?45:0),count:3,cityCount:24,relations:'peace',setup:{mode:'culture-generated',enabled:['chinese','japanese','arab']}};
let journal:Culture47Journal;
beforeAll(()=>{journal=new Culture47Session().create(opening).journal;},30000);
const load=()=>{const s=new Culture47Session();s.load(journal);return s;};
const command={type:'declare-war' as const,nationId:'n-0',targetNationId:'n-1'};
function declare(s:Culture47Session){const p=s.preview(command);expect(p.valid,p.reason).toBe(true);return s.execute({kind:'politics',action:command,expected:p.expected},p.sequence);}
describe('real culture diplomatic owner',()=>{
  it('preview consumes no state; confirm records real culture declaration, names, chronology and replay',()=>{
    const s=load(),before=s.snapshot(),p=s.preview(command);expect(s.snapshot()).toEqual(before);expect(p.valid,p.reason).toBe(true);
    const out=s.execute({kind:'politics',action:command,expected:p.expected},p.sequence),war=out.run.nativeWars.campaigns.at(-1)!;
    expect(war.history).toBe('complete');expect(war.attacker).toBe('n-0');expect(war.goals.length).toBeGreaterThan(0);expect(war.initialOwners.length).toBeGreaterThan(0);
    expect(out.run.chronicle.entries.at(-1)?.nationIds.sort()).toEqual(['n-0','n-1']);expect(new Culture47Session().load(out.journal)).toEqual(out);
    const c=diplomaticContext46(out.run);expect(c.states.find(s=>s.nationId==='n-2')?.religionId).toBe('islam');
  },30000);
  it('stale after same-tick rename, repeat and invalid commands never commit partial changes',()=>{
    const s=load(),p=s.preview(command);const renamed=s.execute({kind:'identity',edit:{kind:'nation',id:'n-0',patch:{customName:'共同国'}}},0);
    expect(()=>s.execute({kind:'politics',action:command,expected:p.expected},1)).toThrow(/过期/);expect(s.snapshot()).toEqual(renamed);
    const out=declare(s);expect(()=>s.execute({kind:'politics',action:command,expected:p.expected},0)).toThrow();expect(s.snapshot()).toEqual(out);
  },30000);
  it('same display names do not add an unrelated country to declaration history',()=>{
    const s=load();for(let i=0;i<3;i++)s.execute({kind:'identity',edit:{kind:'nation',id:'n-'+i,patch:{customName:'共同国'}}},i);
    expect(declare(s).run.chronicle.entries.at(-1)?.nationIds.sort()).toEqual(['n-0','n-1']);
  },30000);
  it('manual peace leaves land and precise positions unchanged, clears sieges/port occupation, and prevents immediate redeclaration',()=>{
    const s=load(),out=declare(s),r=out.run,war=r.nativeWars.campaigns[0];const graph=actualForces47(r).spatial.graph;
    const positions=()=>Object.fromEntries(Object.entries(r.armyPositions.records).map(([id,t])=>[id,armyTravelLocation47(t,graph).point]));
    const before=positions(),land=r.world.provinces.map(p=>[p.id,p.controller,p.legalOwner]);
    const port=Object.values(r.portControl.ports).find(p=>p.landOwnerId==='n-0');if(port)Object.assign(port,{occupierId:'n-1',value:25});
    settleWar47(r,war,11);assertPolitics47(r);expect(positions()).toEqual(before);expect(r.world.provinces.map(p=>[p.id,p.controller,p.legalOwner])).toEqual(land);if(port)expect(r.portControl.ports[Object.keys(r.portControl.ports).find(id=>r.portControl.ports[id].landOwnerId==='n-0')!].occupierId).toBe('n-0');
    expect(war.settlement?.reason).toBe(11);expect(war.settlement?.transfers).toEqual([]);expect(r.nativeDiplomacy.relations[0].warCount).toBe(1);expect(()=>applyPoliticalCommand47(r,command,politicalStamp47(r))).toThrow(/停战/);
  },30000);
  it('unknown opening wars may cease without invented goals, attacker or settlement',()=>{
    const r=attachPolitics47(createFoundingForces47(opening.terrain,opening.count,opening.cityCount,'war',opening.setup)),w=r.nativeWars.campaigns[0];expect(w.history).toBe('unknown');
    const action={type:'make-peace' as const,nationId:w.nations[0],targetNationId:w.nations[1]},out=applyPoliticalCommand47(r,action,politicalStamp47(r)),ended=out.nativeWars.campaigns.find(c=>c.id===w.id)!;
    expect(ended.endedTick).toBe(0);expect(ended.attacker).toBeNull();expect(ended.startTime).toBeNull();expect(ended.goals).toEqual([]);expect(ended.settlement).toBeNull();assertPolitics47(out);
    const history=out.chronicle.entries.at(-1)!.reason;expect(history).not.toContain('进攻阵营');expect(history).not.toContain('防守阵营');expect(history).toContain('原始目标未记录');
  },30000);
  it('calendar diplomacy uses actual cultures/religions and persisted native monthly evaluation, without driving old movement',()=>{
    const r=load().snapshot().run;for(const id of Object.keys(r.nativeDiplomacy.nations)){r.nativeDiplomacy.nations[id].pools.startWar=100;}
    const positions=structuredClone(r.armyPositions),beforeDraws=r.nativeDiplomacy.draws;
    for(let tick=1;tick<=62*120;tick++){r.clock.tick=tick;r.world.day=Math.floor(tick/120);advanceFamilyCalendar47(r,tick);if(tick%120===0){advancePeopleMonthOwned47(r);advanceDiplomaticSchedule46(r.nativeDiplomacy,r,id=>{evaluateDeclaration47(r,id);});}}
    expect(r.nativeDiplomacy.lastDay).toBe(62);expect(r.nativeDiplomacy.draws).toBeGreaterThan(beforeDraws);expect(r.nativeWars.campaigns.length).toBeGreaterThan(0);expect(r.armyPositions).toEqual(positions);
  },30000);
  it('real extinction closes office without killing the family; recaptured land resumes the same living person and remains valid',()=>{
    const r=declare(load()).run,personId=r.people.nations['n-1'].leaderId!,family=structuredClone(r.kin),owned=r.world.provinces.filter(p=>p.controller==='n-1');
    for(const p of owned)p.controller='n-0';reconcileGovernmentContinuity47(r);advancePolitics47(r,false);expect(r.people.nations['n-1'].leaderId).toBeNull();expect(currentRuler47(r.civilization,r.chronicle,'n-1')).toBeNull();expect(r.kin.families).toEqual(family.families);expect(r.kin.persons[personId].identity).toEqual(family.persons[personId].identity);expect(r.kin.persons[personId].roles.filter(v=>v.nativeKind==='leader')).toEqual([]);expect(r.kin.persons[personId].pastRoles.at(-1)?.endReason).toBe('extinction');expect(r.kin.persons[personId].isAlive).toBe(true);
    owned[0].controller='n-1';reconcileGovernmentContinuity47(r);reconcileDiplomaticForces47(r,new Set());assertPolitics47(r);expect(r.people.nations['n-1'].leaderId).toBe(personId);expect(r.chronicle.leaders['n-1']).toHaveLength(2);expect(r.sovereignty.restorations['n-1']).toBe(1);
  },30000);
  it('restores the eligible republican ruler independently of a young patriarch at a partial-day tick',()=>{
    const owner=load();owner.execute({kind:'identity',edit:{kind:'nation',id:'n-1',patch:{polity:'Republic'}}},0);
    const r=owner.execute({kind:'advance',ticks:60},1).run,nation='n-1',old=r.kin.persons[r.people.nations[nation].leaderId!],family=r.kin.families[old.familyId];
    const young=family.memberIds.map(id=>r.kin.persons[id]).find(p=>p.isAlive&&p.age<25)!;expect(young).toBeDefined();family.heirId=young.id;
    diePersonOwned47(r,old);const leader=r.people.nations[nation].leaderId!;
    expect(r.kin.persons[leader].age).toBeGreaterThanOrEqual(25);expect(family.headId).not.toBe(leader);expect(r.kin.persons[family.headId].age).toBeLessThan(25);
    const land=r.world.provinces.filter(p=>p.controller===nation);for(const p of land)p.controller='n-0';reconcileGovernmentContinuity47(r);assertPolitics47(r);
    r.clock.tick++;advanceFamilyCalendar47(r,r.clock.tick);land[0].controller=nation;reconcileGovernmentContinuity47(r);assertPolitics47(r);
    expect(r.people.nations[nation].leaderId).toBe(leader);expect(r.kin.persons[leader].roles.find(v=>v.nativeKind==='leader')).toMatchObject({reignStartTime:Math.fround(61/120*r.life.secondsPerDay)});
  },30000);
  it('restoration without a qualified republican adult retains an evidenced vacancy and survives the next month',()=>{
    const owner=load();owner.execute({kind:'identity',edit:{kind:'nation',id:'n-1',patch:{polity:'Republic'}}},0);
    const r=owner.execute({kind:'advance',ticks:60},1).run,nation='n-1',head=r.people.nations[nation].leaderId!,family=r.kin.families[r.kin.persons[head].familyId];
    for(const id of family.memberIds)if(id!==head&&r.kin.persons[id].age>=25)diePersonOwned47(r,r.kin.persons[id]);diePersonOwned47(r,r.kin.persons[head]);
    const land=r.world.provinces.filter(p=>p.controller===nation);for(const p of land)p.controller='n-0';reconcileGovernmentContinuity47(r);assertPolitics47(r);
    land[0].controller=nation;reconcileGovernmentContinuity47(r);assertPolitics47(r);
    expect(r.people.nations[nation].leaderId).toBeNull();expect(r.kin.lifecycle.vacancies[nation].reason).toBe('restoration-no-known-candidate');expect(r.chronicle.entries.filter(e=>e.kind==='restoration').at(-1)?.people).toEqual([]);
    let next=r;for(let day=0;day<31;day++)next=advanceSessionBatch47(next,[{kind:'advance',ticks:120}],{preferPorts:false,portSeaFaces:new Set<number>(),oceanRouteFaces:new Set<number>()});
    assertPolitics47(next);expect(next.kin.lifecycle.lastMonth).toBe(13);expect(next.people.nations[nation].leaderId).toBeNull();
  },30000);
  it('two actual same-tick transfers retain both immutable history entries while third-party wars remain',()=>{
    const r=declare(load()).run,third={...command,nationId:'n-2',targetNationId:'n-1'},other=applyPoliticalCommand47(r,third,politicalStamp47(r));
    const p=other.world.provinces.find(p=>p.controller==='n-1')!,before=structuredClone(other.world);p.controller='n-0';recordPoliticalOccupation47(other,before);const again=structuredClone(other.world);p.controller='n-2';recordPoliticalOccupation47(other,again);
    const entries=other.chronicle.entries.filter(e=>e.kind==='occupation');expect(entries.map(e=>e.nationIds)).toEqual([['n-1','n-0'],['n-0','n-2']]);expect(entries[0].place?.id).toBe(p.id);
    settleWar47(other,other.nativeWars.campaigns.find(c=>coversPair46(c,other.nativeWars,'n-0','n-1'))!,11);expect(other.world.statecraft!.relations.find(v=>v.a==='n-1'&&v.b==='n-2')?.status).toBe('war');assertPolitics47(other);
  },30000);
  it('continuous-day and split-day steps preserve the same diplomacy and journal replay',()=>{
    const a=load(),b=load();declare(a);declare(b);const x=a.execute({kind:'advance',ticks:120},1);b.execute({kind:'advance',ticks:60},1);const y=b.execute({kind:'advance',ticks:60},2);expect(x.run).toEqual(y.run);expect(new Culture47Session().load(x.journal).run).toEqual(x.run);
  },60000);
  it('separate islands have an actual coastal declaration entry without requiring two harbor cities',()=>{
    const s=new Culture47Session(),r=s.create({...opening,count:2,terrain:grid((x,y)=>y>40&&y<210&&(x>20&&x<90||x>150&&x<230)?45:0)}).run;
    expect(claimEntry47(r,'n-0','n-1')).toBeTruthy();const f=r.navy.fleets[0];if(f){const g=actualForces47(r).spatial.graph,old=r.fleetPositions.records[f.id];expect(beginArmyTravel47(f.id,[old.nodes[0]],g)).toBeDefined();}
  },30000);
  it('peace after day one keeps a future truce and two terminal wars finish only once',()=>{
    const s=load();declare(s);const r=s.execute({kind:'advance',ticks:120},1).run;
    const second={...command,nationId:'n-2'},next=applyPoliticalCommand47(r,second,politicalStamp47(r));
    for(const p of next.world.provinces)if(p.controller==='n-1')p.controller='n-0';
    reconcileGovernmentContinuity47(next);advancePolitics47(next,false);assertPolitics47(next);
    expect(next.nativeWars.campaigns.filter(c=>c.endedTick!==null)).toHaveLength(2);expect(next.people.nations['n-1'].leaderId).toBeNull();
    const entries=next.chronicle.entries.length;advancePolitics47(next,false);expect(next.chronicle.entries).toHaveLength(entries);
    expect(next.world.statecraft!.relations.filter(r=>r.a==='n-1'||r.b==='n-1').every(r=>r.truceUntilDay>=next.world.day+10)).toBe(true);
  },60000);
  it('same-name cities record the actual province and attacker on simultaneous changes',()=>{
    const r=declare(load()).run,a=r.world.provinces.find(p=>p.controller==='n-1')!,b=r.world.provinces.find(p=>p.controller==='n-2')!;
    a.name=b.name='同名城';const before=structuredClone(r.world);a.controller='n-0';b.controller='n-1';recordPoliticalOccupation47(r,before);
    const e=r.chronicle.entries.filter(e=>e.kind==='occupation');expect(e.map(v=>v.place?.id).sort()).toEqual([a.id,b.id].sort());expect(e.find(v=>v.place?.id===b.id)?.nationIds).toEqual(['n-2','n-1']);expect(e.every(v=>v.sourceEventId===null)).toBe(true);
  },30000);
});
