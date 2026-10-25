import {describe,expect,it} from 'vitest';
import {grid} from './fixture.test-support';
import {Culture47Session} from './culture47-session';
import {SETTLEMENT47_ALGORITHM} from './settlement47-regions';
import {populationStamp47} from './civilization47-population-types';
import {OFFICE_RULE47,officeCandidates47,officeSlots47,type OfficeRun47} from './civilization47-offices';

describe('官员任用 (original GovernmentOfficeManagementPanel)',()=>{
  it('appoint, lock, dismiss, AI switch and fill vacancies; the monthly AI respects them; replay exact',()=>{
    const s=new Culture47Session();
    let x=s.create({terrain:grid((x,y)=>x>10&&x<245&&y>10&&y<245?45:0),count:3,cityCount:30,relations:'peace',settlementAlgorithm:SETTLEMENT47_ALGORITHM,families:'original',setup:{mode:'culture-generated',enabled:['chinese','japanese','arab']}});
    x=s.execute({kind:'enable-offices',rule:OFFICE_RULE47,expected:populationStamp47(x.run)},x.journal.actions.length);
    const nation=x.run.world.nations[0].id,stamp=()=>populationStamp47(x.run),run=()=>x.run as unknown as OfficeRun47;
    // AI off first, so nothing is filled behind the player's back.
    x=s.execute({kind:'office-manage',edit:{type:'auto',nationId:nation,enabled:false},expected:stamp()},x.journal.actions.length);
    for(let i=0;i<40;i++)x=s.execute({kind:'advance',ticks:120},x.journal.actions.length);
    expect(officeSlots47(x.run,nation).every(slot=>!slot.assignment)).toBe(true);
    const chancellor=officeSlots47(x.run,nation)[0],[best]=officeCandidates47(x.run,nation,'Chancellor',chancellor.scopeId);
    expect(best).toBeDefined();
    x=s.execute({kind:'office-manage',edit:{type:'appoint',nationId:nation,officeId:'Chancellor',scopeId:chancellor.scopeId,holderId:best.person.id},expected:stamp()},x.journal.actions.length);
    expect(officeSlots47(x.run,nation)[0].holder?.id).toBe(best.person.id);
    expect(run().offices47!.nations[nation].assignments[0].source).toBe(1);
    x=s.execute({kind:'office-manage',edit:{type:'lock',nationId:nation,officeId:'Chancellor',scopeId:chancellor.scopeId,locked:true},expected:stamp()},x.journal.actions.length);
    expect(run().offices47!.nations[nation].assignments[0].locked).toBe(true);
    x=s.execute({kind:'office-manage',edit:{type:'fill',nationId:nation},expected:stamp()},x.journal.actions.length);
    const filled=officeSlots47(x.run,nation);
    expect(filled.filter(slot=>slot.holder).length).toBeGreaterThan(1);
    expect(filled[0].holder?.id).toBe(best.person.id);
    x=s.execute({kind:'office-manage',edit:{type:'dismiss',nationId:nation,officeId:'Steward',scopeId:chancellor.scopeId},expected:stamp()},x.journal.actions.length);
    expect(officeSlots47(x.run,nation)[1].assignment).toBeNull();
    x=s.execute({kind:'office-manage',edit:{type:'auto',nationId:nation,enabled:true},expected:stamp()},x.journal.actions.length);
    for(let i=0;i<40;i++)x=s.execute({kind:'advance',ticks:120},x.journal.actions.length);
    // AI back on: the vacancy is filled again; the locked chancellor stays.
    expect(officeSlots47(x.run,nation)[1].holder).not.toBeNull();
    expect(officeSlots47(x.run,nation)[0].holder?.id).toBe(best.person.id);
    const replay=new Culture47Session().load(x.journal);
    expect((replay.run as unknown as OfficeRun47).offices47).toEqual(run().offices47);
    expect(()=>s.execute({kind:'office-manage',edit:{type:'appoint',nationId:nation,officeId:'Marshal',scopeId:chancellor.scopeId,holderId:best.person.id},expected:stamp()},x.journal.actions.length)).toThrow('任命失败');
  },300000);
});
