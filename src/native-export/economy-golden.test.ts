import {it,expect} from 'vitest';
import {writeFile,mkdir} from 'node:fs/promises';
import {createNativeWorld} from './native-world';
import {createArmyEconomy47} from '../fms/play/war47-economy';
import {actualForces47} from '../fms/play/force-runtime47';
import {LOGISTICS_DAY_FACTOR47} from '../fms/play/logistics-clock47';
import {nativeEconomyState} from './native-state';

/** Golden samples for the Swift daily grain ledger (war47-economy.ts createArmyEconomy47.advanceEconomy
 * followed by the original-army daily reset, civilization47-original-army settleOriginalArmyDay47).
 * Armies stay where they are, so this checks the economy module alone: for each of 60 days the
 * population and grain of every province and each army's supplies after the ledger.
 * Run with EXPORT_NATIVE_WORLD=1. */
it.skipIf(process.env.EXPORT_NATIVE_WORLD!=='1')('exports economy golden samples',async()=>{
  const {snapshot}=await createNativeWorld();
  const run=structuredClone(snapshot.run);
  const initial=nativeEconomyState(run);
  const economy=createArmyEconomy47(run.finance,()=>({...actualForces47(run).spatial,positions:run.armyPositions}),LOGISTICS_DAY_FACTOR47);
  const order=run.world.statecraft!.provinces.map(p=>p.provinceId);
  const days:{population:number[];grain:number[];supplies:number[]}[]=[];
  for(let d=0;d<60;d++){
    run.world.day++;
    economy.advanceEconomy(run.world,()=>{});
    const byId=new Map(run.world.statecraft!.provinces.map(p=>[p.provinceId,p]));
    days.push({population:order.map(id=>byId.get(id)!.population),grain:order.map(id=>byId.get(id)!.grain),supplies:run.world.armies.map(a=>a.supplies)});
    for(const a of run.world.armies)if(a.troops>0&&a.status!=='destroyed'){a.supplies=100;a.morale=100;}
  }
  expect(days[59].grain.some((g,i)=>g!==days[0].grain[i])).toBe(true);
  await mkdir('ios-native/Core/Tests/LieguojiCoreTests/Golden',{recursive:true});
  await writeFile('ios-native/Core/Tests/LieguojiCoreTests/Golden/economy.json',JSON.stringify({initial,dayFactor:LOGISTICS_DAY_FACTOR47,days}));
},300000);
