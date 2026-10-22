import {beforeAll,describe,expect,it} from 'vitest';
import {grid} from './fixture.test-support';
import {Culture47Session} from './culture47-session';
import {SETTLEMENT47_ALGORITHM} from './settlement47-regions';
import {NOBILITY_RULE47,type NobilityRun47} from './civilization47-nobility';
import {nativeMaxProvinceRatio} from './native-economy/noble-families';
import {populationStamp47} from './civilization47-population-types';
import {GENERATIONS_RULE47} from './civilization47-generations-ledger';
import {processBirths47} from './civilization47-nobility-births';
import {familyRelation47} from './civilization47-nobility-relations';
import {executeFamilyFate47,fateWeights47} from './civilization47-nobility-fate';
import {nobleMonarchySuccessor47,checkFamilyExtinction47} from './civilization47-nobility-succession';
import {assertPopulation47} from './civilization47-population-validation';

const opening={terrain:grid((x,y)=>x>10&&x<245&&y>10&&y<245?45:0),count:3,cityCount:60,relations:'peace' as const,settlementAlgorithm:SETTLEMENT47_ALGORITHM,setup:{mode:'culture-generated' as const,enabled:['chinese','japanese','arab'] as const},families:'original' as const};
let snap:ReturnType<Culture47Session['create']>;
beforeAll(()=>{snap=new Culture47Session().create(structuredClone({...opening,setup:{...opening.setup,enabled:[...opening.setup.enabled]}}));},120000);
describe('original opening families (State.InitializeCharactersAndFamilies)',()=>{
  it('gives every state a ruling family territory and noble families covering all its provinces',()=>{
    const r=snap.run as NobilityRun47,n=r.nobility!;
    expect(n.rule).toBe(NOBILITY_RULE47);expect(r.houses).toBeUndefined();expect(r.generations).toBeUndefined();
    for(const nation of r.world.nations){
      const fams=Object.entries(n.families).filter(([,f])=>f.nationId===nation.id),owned=r.world.provinces.filter(p=>p.controller===nation.id).map(p=>p.id);
      const ruling=fams.filter(([,f])=>f.ruling);expect(ruling).toHaveLength(1);
      expect(ruling[0][0]).toBe(String(r.people.nations[nation.id].id));
      expect(ruling[0][1].homeProvinceId).toBe(r.world.cities.find(c=>c.id===nation.capitalId)!.provinceId);
      expect(fams.flatMap(([,f])=>f.controlledProvinces).sort()).toEqual([...owned].sort());
      const max=Math.floor(owned.length*nativeMaxProvinceRatio(r.civilization.nations[nation.id].polity));
      for(const [id,f] of fams){
        expect(f.controlledProvinces).toContain(f.homeProvinceId);expect(f.controlledProvinces.length).toBeLessThanOrEqual(Math.max(max,1));
        const k=r.kin.families[id];expect(k.nationId).toBe(nation.id);
        if(!f.ruling){const head=r.kin.persons[k.headId];expect(head.gender).toBe(0);expect(head.age).toBeGreaterThanOrEqual(25);expect(head.age).toBeLessThanOrEqual(61);}
      }
      expect(fams.length).toBeGreaterThan(1);
    }
  });
  it('advances, rejects the web generations rule and replays identically',()=>{
    const s=new Culture47Session();let x=s.load(snap.journal);
    expect(()=>s.execute({kind:'enable-generations',rule:GENERATIONS_RULE47,expected:populationStamp47(x.run)},x.journal.actions.length)).toThrow('原作家族世界使用原作婚育');
    for(let i=0;i<30;i++)x=s.execute({kind:'advance',ticks:120},x.journal.actions.length);
    expect((x.run as NobilityRun47).nobility).toBeTruthy();
    expect(new Culture47Session().load(x.journal)).toEqual(x);
  },300000);
  it('runs the original family schedule: update days, duration, influence, collateral, yearly claims',()=>{
    const s=new Culture47Session();let x=s.load(snap.journal);
    for(let i=0;i<400;i++)x=s.execute({kind:'advance',ticks:120},x.journal.actions.length);
    const r=x.run as NobilityRun47,n=r.nobility!;
    expect(n.year).toBe(2);expect(n.monthFamilies.length).toBe(Object.keys(n.families).length);
    for(const [id,fam] of Object.entries(n.families)){
      const k=r.kin.families[id];
      expect(fam.updateDay).toBeGreaterThanOrEqual(1);expect(fam.updateDay).toBeLessThanOrEqual(28);
      expect(fam.stateResidenceMonths[fam.nationId]).toBeGreaterThanOrEqual(11);
      expect(k.collateralMemberIds.length).toBeGreaterThanOrEqual(1);expect(k.collateralMemberIds.length).toBeLessThanOrEqual(4);
      for(const c of k.collateralMemberIds){const p=r.kin.persons[c];expect(p.source).toBe('collateral');expect(p.age).toBeGreaterThanOrEqual(19);}
      expect(fam.influence).toBeGreaterThan(fam.ruling?100:10);
      if(fam.ruling){expect(fam.rulingDuration[fam.nationId]).toBe(fam.stateResidenceMonths[fam.nationId]);expect(fam.historicalStateIds).toEqual([fam.nationId]);
        for(const p of fam.controlledProvinces)expect(fam.historicalClaims[p]).toBeGreaterThan(1);}
      else for(const p of fam.controlledProvinces)expect(fam.historicalClaims[p]).toBe(1);
    }
    expect(new Culture47Session().load(x.journal)).toEqual(x);
  },600000);
  it('redistributes family territories every 24 months (RedistributeTerritoriesForState)',()=>{
    const s=new Culture47Session();let x=s.load(snap.journal);
    for(let i=0;i<820;i++)x=s.execute({kind:'advance',ticks:120},x.journal.actions.length);
    const r=x.run as NobilityRun47,n=r.nobility!;
    for(const nation of r.world.nations){
      const v=n.redistribution[nation.id];expect(v).toBeGreaterThanOrEqual(1);expect(v).toBeLessThanOrEqual(24);
      const land=r.world.provinces.filter(p=>p.controller===nation.id).map(p=>p.id),held=Object.values(n.families).filter(fam=>fam.nationId===nation.id).flatMap(fam=>fam.controlledProvinces);
      for(const p of held)expect(land).toContain(p);
      for(const fam of Object.values(n.families).filter(fam=>fam.nationId===nation.id&&fam.controlledProvinces.length))expect(fam.controlledProvinces).toContain(fam.homeProvinceId);
    }
    const entries=r.chronicle.entries.filter(e=>(e.kind as string)==='family');
    expect(entries.filter(e=>e.text.includes('领土重新分配')).length).toBeGreaterThan(0);
    // ProcessBirths: the original rate is low (≈2 a year here); drive it directly on a copy.
    const copy=structuredClone(r);for(let m=0;m<36;m++)for(const id of Object.keys(copy.nobility!.families))processBirths47(copy,copy.nobility!,id);
    assertPopulation47(copy);expect(copy.nobility!.births.length).toBeGreaterThan(0);
    for(const b of copy.nobility!.births){const r=copy;const c=r.kin.persons[b.personId];expect(c.source).toBe('newborn');expect(c.fatherId).toBe(b.fatherId);expect(c.motherId).toBe(b.motherId);expect(r.kin.families[b.familyId].memberIds).toContain(c.id);expect(r.kin.persons[b.motherId].gender).toBe(1);}
    for(const e of entries.filter(e=>e.text.includes('领土重新分配')))expect(e.text).toMatch(/进行领土重新分配，.+家族战功最高，.+家族战功最低/);
    expect(new Culture47Session().load(x.journal)).toEqual(x);
  },900000);
  it('marries unmarried adults across families (ProcessSingleFamilyMarriage)',()=>{
    const s=new Culture47Session();let x=s.load(snap.journal);
    for(let i=0;i<200;i++)x=s.execute({kind:'advance',ticks:120},x.journal.actions.length);
    const r=x.run as NobilityRun47,n=r.nobility!;
    expect(n.marriages.length).toBeGreaterThan(0);
    for(const m of n.marriages){
      const a=r.kin.persons[m.aId],b=r.kin.persons[m.bId];expect(a.gender).not.toBe(b.gender);
      if(a.isAlive&&b.isAlive){expect(a.spouseId).toBe(b.id);expect(b.spouseId).toBe(a.id);}
      if(m.moverId){const p=r.kin.persons[m.moverId];expect(p.originalFamilyId).toBeGreaterThan(0);expect(m.matrilineal?p.gender:1-p.gender).toBe(0);}
    }
    expect(new Culture47Session().load(x.journal)).toEqual(x);
  },600000);
  it('picks a new dynasty and retires extinct families (HandleMonarchySuccession, CheckFamilyExtinction)',()=>{
    const r=structuredClone(snap.run) as NobilityRun47,n=r.nobility!;
    const nation=r.world.nations.find(v=>['Kingdom','Empire'].includes(r.civilization.nations[v.id].polity))??r.world.nations[0];
    const rulingId=String(r.people.nations[nation.id].id),leader=r.kin.persons[r.people.nations[nation.id].leaderId!];
    if(['Kingdom','Empire'].includes(r.civilization.nations[nation.id].polity)){
      for(const id of [...r.kin.families[rulingId].memberIds,...r.kin.families[rulingId].collateralMemberIds])r.kin.persons[id].isAlive=false;
      const heir=nobleMonarchySuccessor47(r,nation.id,leader)!;
      expect(heir.isAlive).toBe(true);expect(String(heir.familyId)).not.toBe(rulingId);expect(n.families[String(heir.familyId)].nationId).toBe(nation.id);
    }
    const noble=Object.keys(n.families).find(id=>!n.families[id].ruling)!,k=r.kin.families[noble];
    for(const id of k.memberIds)r.kin.persons[id].isAlive=false;
    expect(checkFamilyExtinction47(r,n,noble)).toBe(true);
    expect(n.families[noble]).toBeUndefined();expect(n.extinct).toContain(Number(noble));
    expect(r.chronicle.entries.at(-1)!.text).toMatch(new RegExp(`^${k.surname}家族灭绝，最后成员.+去世$`));
  });
  it('computes family relations within a state (CalculateFamilyRelation)',()=>{
    const r=snap.run as NobilityRun47,n=r.nobility!;
    for(const nation of r.world.nations){
      const ids=Object.keys(n.families).filter(id=>n.families[id].nationId===nation.id);
      for(const a of ids)for(const b of ids){
        const v=familyRelation47(r,a,b);
        if(a===b)expect(v).toBe(0);else{expect(v).toBeGreaterThanOrEqual(-100);expect(v).toBeLessThanOrEqual(100);}
      }
    }
    const other=r.world.nations.map(v=>Object.keys(n.families).find(id=>n.families[id].nationId===v.id)!);
    expect(familyRelation47(r,other[0],other[1])).toBe(0);
  });
  it('assigns armies to families and records war merit (RecordBattleMerit/RecordConquestMerit)',()=>{
    const s=new Culture47Session();let x=s.create({...structuredClone({...opening,setup:{...opening.setup,enabled:[...opening.setup.enabled]}}),relations:'war'});
    for(let i=0;i<150;i++)x=s.execute({kind:'advance',ticks:120},x.journal.actions.length);
    const r=x.run as NobilityRun47,n=r.nobility!;
    for(const a of r.world.armies)if(a.status!=='destroyed')expect(n.armies[a.id]).toBeTruthy();
    for(const [id,row] of Object.entries(n.armies))if(row.familyId>0){const a=r.world.armies.find(v=>v.id===id)!;expect(n.families[String(row.familyId)]?.nationId??a.nationId).toBe(a.nationId);}
    const merit=Object.values(n.families).reduce((v,fam)=>v+fam.totalEnemyDestroyed+fam.totalProvincesConquered,0);
    expect(merit).toBeGreaterThan(0);
    expect(new Culture47Session().load(x.journal)).toEqual(x);
  },900000);
  it('executes the original family fates (FamilyFateDecision)',()=>{
    const base=snap.run as NobilityRun47,[a,b]=base.world.nations.map(v=>v.id);
    const id=Object.keys(base.nobility!.families).find(v=>base.nobility!.families[v].nationId===a&&!base.nobility!.families[v].ruling)!;
    const w=fateWeights47(base,id,b,0);expect(Object.values(w).every(v=>v>=0)).toBe(true);
    for(const fate of ['fealty','restore','dispossessed','exile','purge'] as const){
      const r=structuredClone(base),n=r.nobility!;
      n.families[id].controlledProvinces=[];// lost to the conqueror first
      executeFamilyFate47(r,id,fate,b);assertPopulation47(r);
      const fam=n.families[id],k=r.kin.families[id];
      if(fate==='purge'){expect(fam).toBeUndefined();expect(n.extinct).toContain(Number(id));expect(k.memberIds.every(m=>!r.kin.persons[m].isAlive)).toBe(true);continue;}
      expect(fam.ruling).toBe(false);if(fate!=="restore")expect(fam.controlledProvinces).toEqual([]);
      if(fate==='fealty')expect(fam.nationId).toBe(b);
      for(const m of [...k.memberIds,...k.collateralMemberIds])expect(r.kin.persons[m].stateId).toBe(r.people.nations[fam.nationId].id);
      expect(r.chronicle.entries.at(-1)!.text).toContain(k.surname+'家族');
    }
  });
});
