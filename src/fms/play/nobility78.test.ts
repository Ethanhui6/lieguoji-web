import {beforeAll,describe,expect,it} from 'vitest';
import {grid} from './fixture.test-support';
import {Culture47Session} from './culture47-session';
import {SETTLEMENT47_ALGORITHM} from './settlement47-regions';
import {NOBILITY_RULE47,type NobilityRun47} from './civilization47-nobility';
import {nativeMaxProvinceRatio} from './native-economy/noble-families';
import {populationStamp47} from './civilization47-population-types';
import {GENERATIONS_RULE47} from './civilization47-generations-ledger';

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
});
