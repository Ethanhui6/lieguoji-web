import {describe,expect,it} from 'vitest';
import {grid} from './fixture.test-support';
import {Culture47Session} from './culture47-session';
import {SETTLEMENT47_ALGORITHM} from './settlement47-regions';
import {populationStamp47} from './civilization47-population-types';
import {familyEditBlocker47} from './civilization47-family-edit';
import {assertPopulation47} from './civilization47-population-validation';

describe('family actions (original FamilyTreeUI)',()=>{
  it('patriarch, heir, divorce and execution change the families and replay exactly',()=>{
    const s=new Culture47Session();
    let x=s.create({terrain:grid((x,y)=>x>10&&x<245&&y>10&&y<245?45:0),count:3,cityCount:30,relations:'peace',settlementAlgorithm:SETTLEMENT47_ALGORITHM,families:'original',setup:{mode:'culture-generated',enabled:['chinese','japanese','arab']}});
    for(let i=0;i<3;i++)x=s.execute({kind:'advance',ticks:120},x.journal.actions.length);
    const kin=x.run.kin,fam=Object.values(kin.families).find(f=>f.memberIds.filter(id=>kin.persons[id].isAlive).length>=3)!;
    const alive=fam.memberIds.map(id=>kin.persons[id]).filter(p=>p.isAlive&&p.id!==fam.headId);
    const next=alive[0];
    x=s.execute({kind:'family-edit',edit:{type:'patriarch',personId:next.id},expected:populationStamp47(x.run)},x.journal.actions.length);
    expect(x.run.kin.families[fam.id].headId).toBe(next.id);
    expect(x.run.kin.families[fam.id].heirId).not.toBe(next.id);
    const heir=x.run.kin.families[fam.id].memberIds.map(id=>x.run.kin.persons[id]).find(p=>p.isAlive&&p.id!==next.id)!;
    x=s.execute({kind:'family-edit',edit:{type:'heir',personId:heir.id},expected:populationStamp47(x.run)},x.journal.actions.length);
    expect(x.run.kin.families[fam.id].heirId).toBe(heir.id);
    expect(familyEditBlocker47(x.run,{type:'heir',personId:next.id})).toBe('族长不能同时是继承人。');
    const married=Object.values(x.run.kin.persons).find(p=>p.isAlive&&p.spouseId&&x.run.kin.persons[p.spouseId]?.isAlive)!;
    const spouse=married.spouseId;
    x=s.execute({kind:'family-edit',edit:{type:'divorce',personId:married.id},expected:populationStamp47(x.run)},x.journal.actions.length);
    expect(x.run.kin.persons[married.id].spouseId).toBe(0);expect(x.run.kin.persons[spouse].spouseId).toBe(0);
    expect(x.run.kin.persons[married.id].roles.some(r=>r.nativeKind==='spouse'&&r.spouseOfId===spouse)).toBe(false);
    // Executing a ruler ends the reign and runs succession, with its own chronicle wording.
    const nation=x.run.world.nations[0].id,ruler=x.run.people.nations[nation].leaderId!;
    x=s.execute({kind:'family-edit',edit:{type:'kill',personId:ruler},expected:populationStamp47(x.run)},x.journal.actions.length);
    expect(x.run.kin.persons[ruler].isAlive).toBe(false);
    expect(x.run.people.nations[nation].leaderId).not.toBe(ruler);
    expect(x.run.chronicle.entries.at(-1)!.text+x.run.chronicle.entries.at(-2)!.text).toContain('被处死');
    for(let i=0;i<3;i++)x=s.execute({kind:'advance',ticks:120},x.journal.actions.length);
    expect(()=>assertPopulation47(x.run)).not.toThrow();
    const replay=new Culture47Session().load(x.journal);
    expect(replay.run.kin).toEqual(x.run.kin);
    expect(()=>s.execute({kind:'family-edit',edit:{type:'kill',personId:ruler},expected:populationStamp47(x.run)},x.journal.actions.length)).toThrow('人物已故。');
    expect(()=>s.execute({kind:'family-edit',edit:{type:'heir',personId:heir.id},expected:{...populationStamp47(x.run),tick:0}},x.journal.actions.length)).toThrow();
  },300000);
});
