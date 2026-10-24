import {describe,expect,it} from 'vitest';
import {grid} from './fixture.test-support';
import {Culture47Session} from './culture47-session';
import {SETTLEMENT47_ALGORITHM} from './settlement47-regions';
import {populationStamp47} from './civilization47-population-types';
import {FOUNDING_RULE47} from './civilization47-founding';
import {OFFICE_RULE47,centralIncome47,localIncome47,localRebellion47,officeHolder47,type OfficeRun47} from './civilization47-offices';

describe('original government offices (GovernmentOfficeAI)',()=>{
  it('fills the central offices and governors monthly with valid holders and replays exactly',()=>{
    const s=new Culture47Session();
    let x=s.create({terrain:grid((x,y)=>x>10&&x<245&&y>10&&y<245?45:0),count:3,cityCount:40,relations:'peace',settlementAlgorithm:SETTLEMENT47_ALGORITHM,setup:{mode:'culture-generated',enabled:['chinese','japanese','arab']},families:'original'});
    x=s.execute({kind:'enable-foundings',rule:FOUNDING_RULE47,expected:populationStamp47(x.run)},x.journal.actions.length);
    x=s.execute({kind:'enable-offices',rule:OFFICE_RULE47,expected:populationStamp47(x.run)},x.journal.actions.length);
    for(let i=0;i<75;i++)x=s.execute({kind:'advance',ticks:120},x.journal.actions.length);
    const r=x.run as unknown as OfficeRun47;
    expect(r.offices47).toBeDefined();
    let filled=0;
    for(const n of r.world.nations){
      const stateId=r.people.nations[n.id].id,book=r.offices47!.nations[n.id];
      for(const a of book.assignments){
        const p=r.kin.persons[a.holderId];
        expect(p.isAlive).toBe(true);expect(p.stateId).toBe(stateId);expect(p.age).toBeGreaterThanOrEqual(18);expect(p.age).toBeLessThanOrEqual(75);
        if(a.scopeKind===1){const p=r.world.provinces[a.scopeId-1];expect(p.controller).toBe(n.id);expect(officeHolder47(r,n.id,'Governor',a.scopeId)?.id).toBe(a.holderId);
          expect(localIncome47(r,p.id)).toBeGreaterThanOrEqual(.92);expect(localIncome47(r,p.id)).toBeLessThanOrEqual(1.08);expect(localRebellion47(r,p.id)).toBeGreaterThanOrEqual(.85);expect(localRebellion47(r,p.id)).toBeLessThanOrEqual(1.15);}
      }
      // A holder never keeps two central offices.
      const central=book.assignments.filter(a=>a.scopeKind===0).map(a=>a.holderId);expect(new Set(central).size).toBe(central.length);
      if(officeHolder47(r,n.id,'Chancellor',stateId))filled++;
      expect(centralIncome47(r,n.id)).toBeGreaterThanOrEqual(.88);expect(centralIncome47(r,n.id)).toBeLessThanOrEqual(1.12);
    }
    expect(filled).toBeGreaterThan(0);
    const replay=new Culture47Session().load(x.journal);
    expect((replay.run as unknown as OfficeRun47).offices47).toEqual(r.offices47);
  },600000);
});
