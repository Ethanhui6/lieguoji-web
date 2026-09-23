import {describe,it,expect} from 'vitest';
import {createDraft,generateNations,generateCities,compileWorld} from '../worldgen/engine';
import {advanceWorld,validateWorld,initializeStatecraft,previewStateAction,applyStateAction,nationReports} from './core';
import {createWorld} from './demo';
import type {World} from './types';

describe('statecraft integrated invariants',()=>{
 it.each(['群岛与粮道','山地边境','和平初局'])('keeps 90 daily ledgers closed and deterministic for %s',seed=>{
  const initial=compileWorld(generateCities(generateNations(createDraft(seed),5),2));
  const untouched=structuredClone(initial);let world=initial;
  for(let day=1;day<=90;day++){
   world=advanceWorld(world,1);
   expect(validateWorld(world),`invalid state on day ${day}`).toBe(true);
   const reports=nationReports(world);
   for(const report of reports){
    const ledger=report.lastLedger!;
    expect(ledger.day).toBe(day);
    expect(ledger.openingGrain+ledger.production-ledger.civilianConsumed-ledger.militaryConsumed+ledger.territoryTransfer).toBe(ledger.closingGrain);
    expect(report.grain).toBe(ledger.closingGrain);
    expect(report.population).toBeGreaterThanOrEqual(0);
    expect(Number.isSafeInteger(report.grain)).toBe(true);
   }
   expect(world.statecraft!.provinces.every(province=>province.population>=0&&province.grain>=0)).toBe(true);
   expect(world.statecraft!.relations).toHaveLength(initial.nations.length*(initial.nations.length-1)/2);
   expect(world.events.length).toBeLessThanOrEqual(160);
  }
  expect(advanceWorld(initial,90)).toEqual(world);
  expect(initial).toEqual(untouched);
 },30000);

 it('a neutral army sharing a province with two belligerents takes no combat loss',()=>{
  const legacy:World={...createWorld(),scenario:'custom-world',custom:{id:'world-neutral-regression',name:'中立旁观样本',seed:'neutral',rivers:[]}};
  const attacker=legacy.armies.find(army=>army.nationId==='lie')!;
  const defender=legacy.armies.find(army=>army.nationId==='ming')!;
  const neutral=legacy.armies.find(army=>army.nationId==='fan')!;
  legacy.armies=[attacker,defender,neutral];
  for(const army of legacy.armies){army.provinceId=attacker.provinceId;army.originId=attacker.provinceId;army.route=[];army.progress=0;army.status='idle';army.supplies=100;army.morale=100;}
  let world=initializeStatecraft(legacy,'peace');
  const action={type:'declare-war' as const,nationId:'lie',targetNationId:'ming'};
  const preview=previewStateAction(world,action);expect(preview.valid).toBe(true);
  world=applyStateAction(world,action,preview.basedOn);
  const next=advanceWorld(world,1);
  expect(validateWorld(next)).toBe(true);
  expect(next.armies.find(army=>army.id===neutral.id)!.troops).toBe(neutral.troops);
  expect(next.armies.find(army=>army.id===attacker.id)!.troops).toBeLessThan(attacker.troops);
  expect(next.armies.find(army=>army.id===defender.id)!.troops).toBeLessThan(defender.troops);
 });
});
