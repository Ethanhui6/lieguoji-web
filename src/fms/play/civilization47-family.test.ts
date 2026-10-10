import {beforeAll,describe,expect,it} from 'vitest';
import {grid} from './fixture.test-support';
import {CULTURE_IDS47} from './civilization47-catalog';
import {createCivilizationWorld47} from './civilization47-world';
import {attachFamilies47} from './civilization47-family';
import {assertPopulation47} from './civilization47-population-validation';
import {populationStamp47,type Population47,type PopulationBase47} from './civilization47-population-types';
import {previewFamilySuccession47,appointFamilyRuler47,familyHeir47} from './civilization47-succession';
import {advanceFoundingPopulation47,advanceFamilyCalendar47} from './civilization47-calendar';
import {editCivilization47,assertPersonName47,currentRuler47} from './civilization47-names';
import {nativeFindSuccessor} from './native-economy/family-succession';
import {nativeGetYearSince} from './native-economy/character-calendar';
import {createNativeIsoCalendar} from './native-economy/iso-calendar';
import {diePersonOwned47} from './civilization47-lifecycle';

type Candidate=ReturnType<typeof createCivilizationWorld47>;
let base:Candidate,historical:Candidate;
beforeAll(()=>{
  const d=grid((x,y)=>x>20&&x<230&&y>20&&y<230?45:0);
  const nations=Object.fromEntries(CULTURE_IDS47.map((cultureId,i)=>['n-'+i,{cultureId,religionId:'none' as const,polity:'Empire' as const}]));
  base=createCivilizationWorld47(d,12,60,'peace',{mode:'culture-generated',enabled:[...CULTURE_IDS47],nations});
  historical=createCivilizationWorld47(d,12,60,'peace',{mode:'historical-names',enabled:[...CULTURE_IDS47],nations});
},20000);
const copy=()=>structuredClone(base);
// These dictionaries use JSON; terrain typed arrays require the separate map
// codec. Do not imply this fixture is the full IndexedDB save implementation.
const population=({id,world,clock,chronicle,civilization,people,life,kin,sovereignty}:Population47):Population47=>({id,world,clock,chronicle,civilization,people,life,kin,sovereignty});
// Synthetic selection fixtures use a complete death transaction. They do not
// assert that these casualties occur naturally (several candidates are minors).
function setAlive(r:Population47,id:number,alive:boolean){if(alive)throw Error('Fixture never resurrects');diePersonOwned47(r,r.kin.persons[id]);}

describe('native family generation with independent real-culture names',()=>{
  it('builds reciprocal families and complete birth records for all twelve cultures',()=>{
    assertPopulation47(base);
    expect(Object.keys(base.kin.families)).toHaveLength(12);
    expect(Object.keys(base.people.persons)).toHaveLength(12);
    expect(Object.keys(base.kin.persons).length).toBeGreaterThan(72);
    for(const f of Object.values(base.kin.families)){
      const head=base.kin.persons[f.headId],spouse=base.kin.persons[head.spouseId];
      expect(spouse.spouseId).toBe(head.id);expect(head.childrenIds!.length).toBeGreaterThanOrEqual(1);expect(head.childrenIds!.length).toBeLessThanOrEqual(3);
      expect(f.collateralMemberIds).toEqual([]); // Original generator uses memberIds.
      for(const id of f.memberIds){const p=base.kin.persons[id];expect(p.cultureName).toBe(f.cultureName);expect(p.religionId).toBe('none');expect(p.identity.house).toBe(f.surname);assertPersonName47(p.identity,'culture-generated',CULTURE_IDS47);expect(base.life.persons[id].birthTime).toBe(p.birthTime);}
      for(const id of head.childrenIds!){const p=base.kin.persons[id];expect([p.fatherId,p.motherId].sort()).toEqual([head.id,spouse.id].sort());expect(spouse.childrenIds).toContain(id);}
    }
  });
  it('uses either place mode without splicing unrelated historical people into a family',()=>{
    assertPopulation47(historical);
    expect(historical.civilization.mode).toBe('historical-names');expect(base.civilization.mode).toBe('culture-generated');
    expect(historical.civilization.peopleMode).toBe('culture-generated');expect(historical.kin).toEqual(base.kin);expect(historical.life).toEqual(base.life);
    expect(historical.world.cities.map(c=>c.name)).not.toEqual(base.world.cities.map(c=>c.name));
  });
  it('keeps the fully validated population unchanged across JSON restoration',()=>{
    const source=population(base),restored=JSON.parse(JSON.stringify(source));assertPopulation47(restored);expect(restored).toEqual(source);
    expect(familyHeir47(restored,'n-0')).toEqual(familyHeir47(base,'n-0'));
  });
  it('rejects duplicate family initialization and ID exhaustion atomically',()=>{
    const before=copy();expect(()=>attachFamilies47(base)).toThrow(/初始化一次/);expect(base).toEqual(before);
    const initial:PopulationBase47=copy();delete (initial as Partial<Population47>).kin;delete (initial as Partial<Population47>).sovereignty;
    // Reconstruct the founding-only input, without carrying generated relatives.
    initial.life.persons=Object.fromEntries(Object.entries(initial.life.persons).filter(([id])=>Object.hasOwn(initial.people.persons,id)));
    initial.people.nextPersonId=2147483647;const exhausted=structuredClone(initial);
    expect(()=>attachFamilies47(initial)).toThrow(/上限/);expect(initial).toEqual(exhausted);
  });
});

describe('known-heir atomic accession',()=>{
  it('keeps a real minor/female child ahead of older relatives according to recovered stages',()=>{
    for(const gender of [0,1]){
      const r=copy(),head=Object.values(r.kin.persons).find(p=>p.source==='founding'&&p.childrenIds!.some(id=>{const c=r.kin.persons[id];return c.gender===gender&&c.age<18;}))!;
      expect(head).toBeTruthy();const chosen=head.childrenIds!.map(id=>r.kin.persons[id]).find(c=>c.gender===gender&&c.age<18)!;
      for(const id of head.childrenIds!)if(id!==chosen.id)setAlive(r,id,false);
      assertPopulation47(r);const nation=r.kin.families[head.familyId].nationId,preview=previewFamilySuccession47(r,nation);
      expect(preview.personId).toBe(chosen.id);expect(preview.age).toBeLessThan(18);
      const expected=nativeFindSuccessor(r.kin.families[head.familyId],head,id=>r.kin.persons[id],()=>null);expect(preview.personId).toBe(expected!.id);
    }
  });
  it('previews without mutation, appoints the same known person and retains the living predecessor',()=>{
    const before=copy(),preview=previewFamilySuccession47(base,'n-0'),person=base.kin.persons[preview.personId],birth=base.life.persons[person.id];
    expect(base).toEqual(before);const next=appointFamilyRuler47(base,'n-0',preview.expected);
    expect(next.people.nations['n-0'].leaderId).toBe(person.id);expect(next.people.nextPersonId).toBe(base.people.nextPersonId);
    expect({...next.kin.persons[person.id],roles:person.roles}).toEqual(person);expect(next.kin.persons[person.id].roles).toHaveLength(person.roles.length+1);expect(next.kin.persons[person.id].roles.at(-1)).toMatchObject({nativeKind:'leader',holderId:person.id});expect(next.life.persons[person.id]).toEqual(birth);
    expect(next.people.persons[person.id].base).toEqual(person.base);expect(next.people.persons[person.id].traits).toEqual(person.traits);
    expect(next.kin.persons[base.people.nations['n-0'].leaderId!].isAlive).toBe(true);
    expect(next.chronicle.leaders['n-0'][0]).toEqual({...base.chronicle.leaders['n-0'][0],endedDay:0});
    expect(next.civilization.rulers['ruler-n-0-1']).toEqual(base.civilization.rulers['ruler-n-0-1']);
    expect(next.chronicle.entries.at(-1)!.sourceEventId).toBe(next.world.events.at(-1)!.id);expect(base).toEqual(before);
  });
  it('records a king-name separately from identity and reuses a former ruler on a later tenure',()=>{
    const p=previewFamilySuccession47(base,'n-0','景明'),next=appointFamilyRuler47(base,'n-0',p.expected,'景明');
    const founderId=base.people.nations['n-0'].leaderId!,current=next.people.nations['n-0'].leaderId!;
    expect(next.kin.persons[current].identity.given).not.toBe('景明');expect(next.civilization.rulers['ruler-n-0-2'].regnalName).toBe('景明');
    const f=next.kin.families[next.kin.persons[current].familyId];for(const id of f.memberIds)if(id!==founderId&&id!==current)setAlive(next,id,false);
    const againPreview=previewFamilySuccession47(next,'n-0','景明');expect(againPreview.personId).toBe(founderId);
    const again=appointFamilyRuler47(next,'n-0',againPreview.expected,'景明');
    expect(again.people.persons[founderId]).toEqual(base.people.persons[founderId]);expect(again.sovereignty.reigns['ruler-n-0-3']).toBe(founderId);
    expect(currentRuler47(again.civilization,again.chronicle,'n-0')).toMatchObject({regnalName:'景明',regnalOrdinal:2,order:3});
    expect(again.people.nextPersonId).toBe(base.people.nextPersonId);assertPopulation47(JSON.parse(JSON.stringify(again)));
  });
  it('rejects stale, duplicate and cross-world confirmations with no partial writes',()=>{
    const preview=previewFamilySuccession47(base,'n-0'),next=appointFamilyRuler47(base,'n-0',preview.expected),before=structuredClone(next);
    expect(()=>appointFamilyRuler47(next,'n-0',preview.expected)).toThrow(/过期/);expect(next).toEqual(before);
    expect(()=>appointFamilyRuler47(historical,'n-0',preview.expected)).toThrow(/过期/);
    const edited=editCivilization47(base,{kind:'nation',id:'n-0',patch:{religionId:'buddhism'}},0);
    expect(()=>appointFamilyRuler47(edited,'n-0',preview.expected)).toThrow(/过期/);
    const malformed={...populationStamp47(base),future:1};expect(()=>appointFamilyRuler47(base,'n-0',malformed)).toThrow(/过期/);
  });
  it.each(['__proto__','constructor','missing'])('rejects unknown nation %s without mutation',nation=>{
    const before=copy();expect(()=>appointFamilyRuler47(base,nation,populationStamp47(base))).toThrow(/不存在/);expect(base).toEqual(before);
  });
  it('rejects no known living heir and does not invent a virtual relative',()=>{
    const r=copy(),head=r.people.nations['n-0'].leaderId!,f=r.kin.families[r.kin.persons[head].familyId];
    for(const id of f.memberIds)if(id!==head)setAlive(r,id,false);
    assertPopulation47(r);const before=structuredClone(r);expect(familyHeir47(r,'n-0')).toBeNull();expect(()=>appointFamilyRuler47(r,'n-0',populationStamp47(r))).toThrow(/没有已知/);expect(r).toEqual(before);
  });
  it('does not pretend a hereditary appointment is an election or theocratic process',()=>{
    for(const polity of ['Republic','Federation','Theocracy'] as const){const r=editCivilization47(base,{kind:'nation',id:'n-0',patch:{polity}},0),before=structuredClone(r);assertPopulation47(r);expect(()=>appointFamilyRuler47(r,'n-0',populationStamp47(r))).toThrow(/尚待接入/);expect(r).toEqual(before);}
  });
  it('rejects invalid king-names and exhausted history revision without mutation',()=>{
    for(const name of ['', 'x\n', 'a'.repeat(13)])expect(()=>appointFamilyRuler47(base,'n-0',populationStamp47(base),name)).toThrow();
    const r=copy();r.kin.revision=2147483647;const before=structuredClone(r);expect(()=>appointFamilyRuler47(r,'n-0',populationStamp47(r))).toThrow(/上限/);expect(r).toEqual(before);
  });
});

describe('family birthdays and strict candidate persistence',()=>{
  it('ages all living relatives at calendar month boundaries before first office, preserving actual birthdays',()=>{
    const before=copy(),r=advanceFoundingPopulation47(base,120*32),preview=previewFamilySuccession47(r,'n-0'),heir=r.kin.persons[preview.personId];
    expect(r.world.day).toBe(32);expect(r.life.currentDate).toEqual({year:1,month:2,day:2});expect(r.life.lastAgeMonth).toBe(13);
    for(const p of Object.values(r.kin.persons)){expect(p.birthTime).toBe(base.kin.persons[p.id].birthTime);expect(p.age).toBe(nativeGetYearSince(p.birthTime,r.kin.ageTime,r.life.secondsPerDay,createNativeIsoCalendar(r.life.startDate)));expect(r.life.persons[p.id].updatedMonth).toBe(13);}
    expect(r.people.persons[heir.id]).toBeUndefined();const next=appointFamilyRuler47(r,'n-0',preview.expected);expect(next.life.persons[heir.id]).toEqual(r.life.persons[heir.id]);expect(next.people.persons[heir.id].recordedDay).toBe(32);expect(base).toEqual(before);
  });
  it('keeps step chunks and JSON checkpoint continuation equal across two month boundaries',()=>{
    const source=population(base),whole=advanceFoundingPopulation47(source,120*60+17),a=advanceFoundingPopulation47(source,120*30+19),checkpoint=JSON.parse(JSON.stringify(a));
    const split=advanceFoundingPopulation47(checkpoint,120*30-2);expect(split).toEqual(whole);assertPopulation47(split);
  });
  it('rejects skipped calendar ticks and refuses to advance a military world through the population-only fixture',()=>{
    const r=copy(),before=structuredClone(r);expect(()=>advanceFamilyCalendar47(r,2)).toThrow(/不连续/);expect(r).toEqual(before);
    r.world.armies.push({id:'a-0',name:'Existing',nationId:'n-0',provinceId:r.world.cities.find(c=>c.id===r.world.nations[0].capitalId)!.provinceId,originId:r.world.cities.find(c=>c.id===r.world.nations[0].capitalId)!.provinceId,troops:100,morale:100,supplies:100,status:'idle',route:[],progress:0});
    expect(()=>advanceFoundingPopulation47(r,120)).toThrow();
    for(const ticks of [0,-1,NaN,120*367])expect(()=>advanceFoundingPopulation47(base,ticks)).toThrow();
  });
  it('rejects a coherently changed future birthday even when both tables round it to age zero',()=>{
    const r=copy(),p=Object.values(r.kin.persons).find(p=>p.source==='initial-family')!;
    p.birthTime=Math.fround(1);p.age=0;Object.assign(r.life.persons[p.id],{birthTime:p.birthTime,age:0});
    expect(nativeGetYearSince(p.birthTime,0,r.life.secondsPerDay,createNativeIsoCalendar(r.life.startDate))).toBe(0);
    const before=structuredClone(r);expect(()=>assertPopulation47(r)).toThrow();expect(()=>advanceFoundingPopulation47(r,120)).toThrow();expect(r).toEqual(before);
  });
  it('rejects a changed original-family provenance even when the displayed surname still matches',()=>{
    for(const source of ['founding','initial-family'] as const){const r=copy(),p=Object.values(r.kin.persons).find(p=>p.source===source)!;p.originalFamilyId=source==='founding'?0:p.familyId;expect(()=>assertPopulation47(r)).toThrow();}
  });
  it('rejects an extra family without a recorded family creation transition',()=>{
    const r=copy(),f=r.kin.families[1],head=f.memberIds.map(id=>r.kin.persons[id]).find(p=>p.source==='initial-family'&&!p.spouseId&&!p.childrenIds!.length&&!p.fatherId&&!p.motherId)!;
    expect(head).toBeTruthy();f.memberIds=f.memberIds.filter(id=>id!==head.id);head.familyId=100;
    r.kin.families[100]={...structuredClone(f),id:100,headId:head.id,memberIds:[head.id],collateralMemberIds:[]};
    const before=structuredClone(r);expect(()=>assertPopulation47(r)).toThrow();expect(()=>appointFamilyRuler47(r,'n-0',populationStamp47(r))).toThrow();expect(r).toEqual(before);
  });
  it.each(['kinFuture','personFuture','nameSource','birthday','kinBirthday','familySurname','familyId','parentCycle','spouse','memberDuplicate','lifeMissing','reignLink','runIdentity','month','regnalName'] as const)('rejects %s corruption before candidate writes',fault=>{
    const r=copy(),head=r.kin.persons[r.people.nations['n-0'].leaderId!],f=r.kin.families[head.familyId];
    if(fault==='kinFuture')Object.assign(r.kin,{future:1});if(fault==='personFuture')Object.assign(head,{future:1});if(fault==='nameSource')head.identity.sourceKey+='/0';
    if(fault==='birthday')r.life.persons[head.id].birthTime=0;if(fault==='kinBirthday')head.birthTime=0;if(fault==='familySurname')f.surname='INVALID';if(fault==='familyId')f.id++;
    if(fault==='parentCycle'){head.fatherId=head.id;head.childrenIds!.push(head.id);}if(fault==='spouse')r.kin.persons[head.spouseId].spouseId=0;if(fault==='memberDuplicate')f.memberIds.push(head.id);
    if(fault==='lifeMissing')delete r.life.persons[head.id];if(fault==='reignLink')r.sovereignty.reigns['ruler-n-0-1']=head.spouseId;if(fault==='runIdentity')r.id='another-run';if(fault==='month')r.kin.lastAgeMonth++;
    if(fault==='regnalName')r.civilization.rulers['ruler-n-0-1'].regnalName='不匹配';
    const before=structuredClone(r);expect(()=>assertPopulation47(r)).toThrow();expect(()=>appointFamilyRuler47(r,'n-0',populationStamp47(r))).toThrow();expect(r).toEqual(before);
  });
});
