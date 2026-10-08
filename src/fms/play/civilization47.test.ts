import {beforeAll,describe,expect,it} from 'vitest';
import {grid} from './fixture.test-support';
import {CULTURE_IDS47,CULTURES47,RELIGIONS47,POLITIES47,rulerTitle47,stateTitle47,personalName47,type NamingMode47} from './civilization47-catalog';
import {initialCivilization47,assertCivilization47,createRulerIdentity47,assertRulerIdentity47,editCivilization47,currentRuler47,validateCultureSetup47,type WorldCultureSetup47} from './civilization47-names';
import {createCivilizationWorld47} from './civilization47-world';
import {validRegnalName} from './chronicle-records';
import {validateCivilizationWorld47} from './civilization47-world-validation';
import {validateWorld} from '../../compat/v0_4/sim/core';
import {verifyWar46Compatibility,FROZEN_WAR46_ENGINE} from '../../../scripts/fms-war47-compat';

const continent=()=>grid((x,y)=>x>20&&x<230&&y>20&&y<230?45:0);
const setup=(mode:NamingMode47):WorldCultureSetup47=>({mode,enabled:[...CULTURE_IDS47]});
type Candidate=ReturnType<typeof createCivilizationWorld47>;
const worlds={} as Record<NamingMode47,Candidate>;
beforeAll(()=>{for(const mode of ['culture-generated','historical-names'] as const)worlds[mode]=createCivilizationWorld47(continent(),12,60,'peace',setup(mode));},20000);

describe('real culture 47 actual founding chain',()=>{
  it.each(['culture-generated','historical-names'] as const)('%s creates consistent actual map, capital, reign and person identities',mode=>{
    const r=worlds[mode],before=structuredClone(r);
    assertCivilization47(r.civilization,r.world,r.chronicle);
    expect(r.world.nations).toHaveLength(12);expect(r.world.cities).toHaveLength(60);
    expect(r.chronicle.entries).toHaveLength(12);expect(r.world.day).toBe(0);
    expect(r.world.armies).toEqual([]); // Creation phase is not the full run47 owner.
    for(const [i,n] of r.world.nations.entries()) {
      const c=r.civilization.nations[n.id],reign=r.chronicle.leaders[n.id][0];
      expect(c.cultureId).toBe(CULTURE_IDS47[i]);expect(c.name.mode).toBe(mode);
      const city=r.world.cities.find(v=>v.id===n.capitalId)!,province=r.world.provinces.find(p=>p.id===city.provinceId)!;
      expect(province.controller).toBe(n.id);expect(r.civilization.cities[city.id].cultureId).toBe(c.cultureId);
      expect(province.name).toBe(city.name);expect(validRegnalName(reign.regnalName)).toBe(true);
      const person=r.people.persons[r.people.nations[n.id].leaderId!];
      expect(person.rulerId).toBe(reign.id);expect(person.name).toBe(reign.name);expect(person.family).toBe(reign.family);
      expect(r.life.persons[person.id].source).toBe('native-founding');expect(r.life.persons[person.id].age).toBeGreaterThan(0);
      expect(r.chronicle.entries[i].text).toContain(n.name);expect(r.chronicle.entries[i].text).toContain(reign.name);
      expect(r.civilization.rulers[reign.id].mode).toBe(mode);
    }
    expect(new Set(r.world.cities.map(c=>c.name)).size).toBe(60);
    expect(r).toEqual(before);
  });
  it('uses independent religion and polity choices, with no culture aliasing or silent translation fallback',()=>{
    const c=initialCivilization47('independent',2,[0,1],{mode:'culture-generated',enabled:['arab','japanese'],nations:{'n-0':{cultureId:'arab',religionId:'catholic',polity:'Republic'},'n-1':{cultureId:'japanese',religionId:'islam',polity:'Theocracy'}}});
    expect(c.nations['n-0']).toMatchObject({cultureId:'arab',religionId:'catholic',polity:'Republic'});
    expect(c.nations['n-1']).toMatchObject({cultureId:'japanese',religionId:'islam',polity:'Theocracy'});
    expect(c.cities['c-1'].cultureId).toBe('japanese');
    expect(createRulerIdentity47(c,'n-0','r-0','x').titleAtAccession).toBe('总统');
    expect(createRulerIdentity47(c,'n-1','r-1','x').titleAtAccession).toBe('哈里发');
  });
  it('replays both naming modes deterministically and never mutates the input setup',()=>{
    for(const mode of ['culture-generated','historical-names'] as const){const s=setup(mode),before=structuredClone(s),owners=Array.from({length:60},(_,i)=>i%12),a=initialCivilization47('seed',12,owners,s);expect(initialCivilization47('seed',12,owners,s)).toEqual(a);expect(s).toEqual(before);}
  });
  it('fails closed at historical capacity instead of mixing generated names or numeric suffixes',()=>{
    const c=initialCivilization47('capacity',2,Array(32).fill(0),{mode:'historical-names',enabled:['english']});
    expect(new Set(Object.values(c.cities).map(v=>v.name.value)).size).toBe(32);
    expect(()=>initialCivilization47('capacity',2,Array(33).fill(0),{mode:'historical-names',enabled:['english']})).toThrow(/已用尽/);
    const generated=initialCivilization47('capacity',2,Array(240).fill(0),{mode:'culture-generated',enabled:['english']});
    expect(new Set(Object.values(generated.cities).map(v=>v.name.value)).size).toBe(240);
    expect(Object.values(generated.cities).some(v=>/\d/.test(v.name.value))).toBe(false);
  });
  it('rejects impossible geography and an exhausted dictionary without changing terrain or an existing candidate',()=>{
    const d=continent(),before=structuredClone(d),old=structuredClone(worlds['culture-generated']);
    expect(()=>createCivilizationWorld47(d,2,60,'peace',{mode:'historical-names',enabled:['english']})).toThrow(/已用尽/);
    expect(()=>createCivilizationWorld47(grid(()=>0),2,24,'peace',setup('culture-generated'))).toThrow();
    expect(d).toEqual(before);expect(worlds['culture-generated']).toEqual(old);
  });
  it.each(['culture-generated','historical-names'] as const)('%s identity serializes without losing mode, source or person provenance',mode=>{
    const r=worlds[mode],c=JSON.parse(JSON.stringify(r.civilization));
    expect(c).toEqual(r.civilization);assertCivilization47(c,r.world,r.chronicle);
  });
});

describe('name and office transactions',()=>{
  it('changes the actual nation label and current office together without rewriting the accession record',()=>{
    const old=worlds['culture-generated'],before=structuredClone(old),next=editCivilization47(old,{kind:'nation',id:'n-0',patch:{polity:'Republic'}},0);
    expect(next.world.nations[0].name).toBe(old.civilization.nations['n-0'].name.value+'共和国');
    expect(currentRuler47(next.civilization,next.chronicle,'n-0')!.title).toBe('总统');
    expect(next.civilization.rulers).toEqual(old.civilization.rulers);expect(next.chronicle).toEqual(old.chronicle);expect(next.people).toEqual(old.people);
    expect(old).toEqual(before);expect(next.civilization.revision).toBe(1);
    expect(()=>editCivilization47(next,{kind:'nation',id:'n-0',patch:{polity:'Empire'}},0)).toThrow(/已变化/);
  });
  it('preserves a player override across reforms and restores automatic suffix only on explicit reset',()=>{
    const original=worlds['historical-names'],named=editCivilization47(original,{kind:'nation',id:'n-0',patch:{customName:'东海自由邦'}},0);
    const reformed=editCivilization47(named,{kind:'nation',id:'n-0',patch:{polity:'Federation',religionId:'buddhism'}},1);
    expect(reformed.world.nations[0].name).toBe('东海自由邦');expect(reformed.civilization.nations['n-0'].name.sourceKey).toBe(original.civilization.nations['n-0'].name.sourceKey);
    const automatic=editCivilization47(reformed,{kind:'nation',id:'n-0',patch:{customName:null}},2);
    expect(automatic.world.nations[0].name).toBe(original.civilization.nations['n-0'].name.value+'联邦');expect(original.civilization.revision).toBe(0);
  });
  it('renames city and region together; conquest never silently replaces the founding culture',()=>{
    const r=structuredClone(worlds['culture-generated']),city=r.world.cities[0],region=r.world.provinces.find(p=>p.id===city.provinceId)!;
    region.controller=r.world.nations.find(n=>n.id!==region.controller)!.id;
    const next=editCivilization47(r,{kind:'city',id:city.id,customName:'玩家港'},0);
    expect(next.world.cities[0].name).toBe('玩家港');expect(next.world.provinces.find(p=>p.id===region.id)!.name).toBe('玩家港');
    expect(next.civilization.cities[city.id].cultureId).toBe(r.civilization.cities[city.id].cultureId);
    const reset=editCivilization47(next,{kind:'city',id:city.id,customName:null},1);expect(reset.world.cities[0].name).toBe(city.name);
  });
  it.each(['__proto__','constructor','toString','missing'])('rejects inherited or unknown writable identity %s without prototype pollution',id=>{
    const r=worlds['culture-generated'],before=structuredClone(r),proto=Object.getOwnPropertyDescriptors(Object.prototype);
    expect(()=>editCivilization47(r,{kind:'nation',id,patch:{polity:'Empire'}},0)).toThrow();
    expect(()=>editCivilization47(r,{kind:'city',id,customName:'伪造'} ,0)).toThrow();
    expect(Object.getOwnPropertyDescriptors(Object.prototype)).toEqual(proto);expect(r).toEqual(before);
  });
  it('rejects malformed commands, overflow and stale confirmations before any state mutation',()=>{
    const r=worlds['culture-generated'],before=structuredClone(r);
    for(const patch of [{},{polity:undefined},{customName:' '},{customName:'x\n'},{religionId:'future'},{polity:'Empire',future:1}])expect(()=>editCivilization47(r,{kind:'nation',id:'n-0',patch} as Parameters<typeof editCivilization47>[1],0)).toThrow();
    expect(()=>editCivilization47(r,{kind:'city',id:'c-0',customName:'X'},NaN)).toThrow();
    const max=structuredClone(r);max.civilization.revision=Number.MAX_SAFE_INTEGER;expect(()=>editCivilization47(max,{kind:'city',id:'c-0',customName:'X'},max.civilization.revision)).toThrow(/上限/);expect(r).toEqual(before);
  });
});

describe('catalogue and persisted-source contracts',()=>{
  it('keeps all catalogue choices and complete historical people within actual downstream field limits',()=>{
    for(const c of Object.values(CULTURES47)) {
      expect(c.id).toBeTruthy();expect(Object.hasOwn(RELIGIONS47,c.suggestedReligion)).toBe(true);expect(POLITIES47).toContain(c.suggestedPolity);
      expect(new Set(c.historicalCities).size).toBe(c.historicalCities.length);
      for(const p of c.historicalPeople){expect(validRegnalName(p.given),p.name).toBe(true);expect(p.name).not.toBe('');expect(p.house).not.toBe('');}
    }
    expect(personalName47('roman','Prima','Julius',1)).toBe('Julia Prima');
    expect(personalName47('arab','Yusuf','Banu Hashim',0)).toBe('Yusuf');
  });
  it('distinguishes culture-specific imperial offices from kingdoms and elective/theocratic offices',()=>{
    expect(rulerTitle47('chinese','Empire','chineseFolk',0)).toBe('皇帝');expect(rulerTitle47('japanese','Empire','shinto',0)).toBe('天皇');
    expect(rulerTitle47('chinese','Kingdom','chineseFolk',0)).toBe('国王');expect(stateTitle47('秦','chinese','Kingdom','chineseFolk')).toBe('秦王国');
    expect(rulerTitle47('roman','Republic','catholic',0)).toBe('执政官');expect(rulerTitle47('arab','Theocracy','catholic',0)).toBe('教宗');expect(rulerTitle47('arab','Theocracy','islam',0)).toBe('哈里发');
  });
  it('checks every historical and generated source for twelve cultures, including inherited houses',()=>{
    for(const mode of ['culture-generated','historical-names'] as const){const c=worlds[mode].civilization;
      for(const [i,culture] of CULTURE_IDS47.entries()) {
        const seen=new Set<string>();
        for(let j=0;j<100;j++) {const a=createRulerIdentity47(c,'n-'+i,'new-'+j,'source');assertRulerIdentity47(a,mode,c.enabled);seen.add(a.sourceKey);if(mode==='culture-generated'){const b=createRulerIdentity47(c,'n-'+i,'heir-'+j,'source',a);assertRulerIdentity47(b,mode,c.enabled);expect(b.house).toBe(a.house);}}
        if(mode==='historical-names')expect(seen.size,culture).toBe(CULTURES47[culture].historicalPeople.length);
      }
    }
  });
  it.each(['version','catalog','nationFuture','nameSource','rulerSource','rulerTitle','rulerFuture','worldName','missingRuler','revision'] as const)('rejects %s corruption before editing or accepting a saved identity',fault=>{
    const r=structuredClone(worlds['culture-generated']),c=r.civilization,leader=Object.values(c.rulers)[0];
    if(fault==='version')Object.assign(c,{version:2});if(fault==='catalog')Object.assign(c,{catalog:'future'});
    if(fault==='nationFuture')Object.assign(c.nations['n-0'],{future:1});if(fault==='nameSource')c.cities['c-0'].name.sourceKey+='/0';
    if(fault==='rulerSource')leader.sourceKey+='/0';if(fault==='rulerTitle')leader.titleAtAccession='伪造';if(fault==='rulerFuture')Object.assign(leader,{future:1});
    if(fault==='worldName')r.world.nations[0].name='过期地图国名';if(fault==='missingRuler')delete c.rulers[Object.keys(c.rulers)[0]];if(fault==='revision')c.revision=-1;
    const before=structuredClone(r);expect(()=>assertCivilization47(c,r.world,r.chronicle)).toThrow();expect(()=>editCivilization47(r,{kind:'city',id:'c-0',customName:'X'},c.revision)).toThrow();expect(r).toEqual(before);
  });
  it('does not accept the old six pool ids as real culture identities, nor unknown fields or invalid nation overrides',()=>{
    for(const s of [{mode:'future',enabled:['chinese']},{mode:'culture-generated',enabled:['EasternFantasy']},{...setup('culture-generated'),future:1},{...setup('culture-generated'),nations:{'n-2':{cultureId:'chinese',religionId:'none',polity:'Republic'}}},{...setup('culture-generated'),nations:JSON.parse('{"__proto__":{}}')}])expect(()=>validateCultureSetup47(s as WorldCultureSetup47,2)).toThrow();
    expect(()=>validateCultureSetup47(setup('culture-generated'),Infinity)).toThrow();
    expect(()=>assertCivilization47(worlds['culture-generated'].civilization,worlds['culture-generated'].world,undefined as never)).toThrow();
  });
  // This hashes the complete frozen source chain on disk, not one simulation
  // frame. Keep an explicit audit timeout; it is not a gameplay speed target.
  it('keeps the whole playable v46 rule chain frozen',()=>{expect(verifyWar46Compatibility()).toBe(FROZEN_WAR46_ENGINE);},20000);
  it('permits a real pre-muster new world while retaining geometry, army and unknown-field checks',()=>{
    const r=worlds['culture-generated'];expect(validateWorld(r.world)).toBe(false);expect(validateCivilizationWorld47(r.world)).toBe(true);
    const invalid=[(w:Candidate['world'])=>{w.provinces[0].center.x=NaN;},(w:Candidate['world'])=>{w.cities[0].provinceId='missing';},(w:Candidate['world'])=>{w.provinces[0].neighbors.push('missing');},(w:Candidate['world'])=>{Object.assign(w,{future:1});},(w:Candidate['world'])=>{w.armies.push({id:'a-0',name:'Invalid',nationId:'missing',provinceId:'p-0',originId:'p-0',troops:100,morale:100,supplies:100,status:'idle',route:[],progress:0});}];
    for(const damage of invalid){const next=structuredClone(r);damage(next.world);expect(validateCivilizationWorld47(next.world)).toBe(false);expect(()=>editCivilization47(next,{kind:'city',id:'c-0',customName:'X'},0)).toThrow();}
  });
});
