import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fingerprintUpper14 } from '../../../../scripts/fms-upper14-fingerprint';
import { roundInt, idiv } from './numeric';
import { nativeGoldSettlement, nativeProvinceIncome, nativeMonthlyArmyCost, type GoldSettlementInput, type ProvinceIncomeInput, type NativeFeeProvince } from './settlement';
import { nativeInitialPopulation, POPULATION_CAPACITY, FOOD_PRODUCTION_EFFICIENCY, type PopulationInput } from './population';
import { ORIGINAL_RESOURCE_TABLE, buildNativeResourceTable, nativeInitialResources, type ResourceTable } from './resources';
const f=Math.fround;
const gold=(p:Partial<GoldSettlementInput>={}):GoldSettlementInput=>({gold:100,provinceIncome:[100],leaderTaxMultiplier:1,centralIncomeMultiplier:1,armyCostGold:0,goldProductionModifier:1,ethnic:'Other',...p});
const population=(p:Partial<PopulationInput>={}):PopulationInput=>({cellBiomes:[0,1,6],perCellFactor:100,growthRate:f(1.002),statePercentage:f(.8),provinceRandom:1,atWarInProvince:false,oldPopulation:0,oldMaxPopulation:0,maxLocked:false,...p});
const income=(p:Partial<ProvinceIncomeInput>={}):ProvinceIncomeInput=>({population:10000,maxPopulation:10000,cellCount:1000,resources:[{name:'Gold',baseValue:500,probability:1,affectedBy:['Commercial']}],ethnic:'Other',destiny:100,nationProvinceCount:9,worldProvinceCount:20,localIncomeMultiplier:1,...p});

describe('recovered economy: pure original contracts, no v14 gameplay mutation',()=>{
 it('preserves original resource bytes and the current playable engine',()=>{
  const bytes=readFileSync('src/fms/play/native-economy/biome-resources.json');
  expect(createHash('sha256').update(bytes).digest('hex')).toBe('c6fe1e80f126358d058921ca17a96e0088164d15b1af283ff7285fcc70104445');
  expect(fingerprintUpper14()).toBe('3482083ac4b38cb0201ddb7517fd40c007fc99285680361b74313858e4dc0f12');
 });
 it('uses native midpoint-to-even and signed truncating division, never JS Math.round',()=>{
  expect([.5,1.5,2.5,3.5,-.5,-1.5,-2.5,-3.5].map(roundInt)).toEqual([0,2,2,4,0,-2,-2,-4]);
  expect(idiv(-7,2)).toBe(-3);expect(idiv(7,-2)).toBe(-3);expect(idiv(-1,2)).toBe(0);expect(roundInt(-0)).toBe(0);
  expect(()=>idiv(1,0)).toThrow();expect(()=>idiv(-2147483648,-1)).toThrow();expect(()=>roundInt(Infinity)).toThrow();
 });
 it('caches positive gold efficiency before army fees turn the ending balance negative',()=>{
  const input=gold({armyCostGold:500}),before=structuredClone(input),r=nativeGoldSettlement(input);
  expect(r).toEqual({gold:-300,goldPerMonth:100,armyCostGold:500,goldBattleModifier:f(1.1),baseIncome:100,inventoryFactor:1,goldBeforeArmyCost:200});expect(input).toEqual(before);
  const next=nativeGoldSettlement(gold({gold:r.gold,armyCostGold:0}));expect(next.gold).toBe(-200);expect(next.goldBattleModifier).toBe(f(.9));
 });
 it('limits pre-fee debt but does not clamp again after charging army costs',()=>{
  const r=nativeGoldSettlement(gold({gold:-10000,armyCostGold:10000}));expect(r.goldBeforeArmyCost).toBe(-1500);expect(r.gold).toBe(-11500);expect(r.goldPerMonth).toBe(100);expect(r.goldBattleModifier).toBe(f(.9));
  expect(nativeGoldSettlement(gold({provinceIncome:[0],gold:-1})).goldBeforeArmyCost).toBe(0);
 });
 it('keeps integer-division stockpile steps and strict 20000/30000 boundaries',()=>{
  expect([20000,20001,25001,30000,30001].map(g=>nativeGoldSettlement(gold({gold:g,provinceIncome:[1000]})).goldPerMonth)).toEqual([1000,1000,1000,1000,50]);
  expect([20001,59999,60000,60001,99999,100000,100001].map(g=>nativeGoldSettlement(gold({gold:g,provinceIncome:[4000]})).goldPerMonth)).toEqual([4000,4000,400,400,400,200,200]);
 });
 it('rounds after leader and central modifiers and keeps int32 aggregation',()=>{
  expect(nativeGoldSettlement(gold({provinceIncome:[5],leaderTaxMultiplier:.5})).baseIncome).toBe(2);
  expect(nativeGoldSettlement(gold({provinceIncome:[7],leaderTaxMultiplier:.5})).baseIncome).toBe(4);
  expect(nativeGoldSettlement(gold({provinceIncome:[2147483647,1],leaderTaxMultiplier:0})).baseIncome).toBe(0);
  expect(()=>nativeGoldSettlement(gold({gold:1.2}))).toThrow();
 });
 it('computes original population/resource income with ethnic, destiny and nation-size order',()=>{
  expect(nativeProvinceIncome(income())).toBe(135);
  expect(nativeProvinceIncome(income({ethnic:'Commercial'}))).toBe(160);
  expect(nativeProvinceIncome(income({destiny:70}))).toBe(122);
  expect(nativeProvinceIncome(income({nationProvinceCount:20,localIncomeMultiplier:1.1}))).toBe(75);
  expect(nativeProvinceIncome(income({resources:[],population:2500}))).toBe(2);
  expect(()=>nativeProvinceIncome(income({cellCount:0}))).toThrow();
 });
 it('charges only attacking/reorganizing armies at their resolved current province',()=>{
  const ps:NativeFeeProvince[]=[
   {id:1,owner:'a',land:true,distance:4,neighbors:[]},{id:2,owner:'a',land:true,distance:5,neighbors:[]},
   {id:3,owner:'a',land:true,distance:13,neighbors:[]},{id:4,owner:'b',land:true,distance:1,neighbors:[1,3]},
   {id:5,owner:null,land:false,distance:0,neighbors:[]},{id:6,owner:'b',land:true,distance:0,neighbors:[]},
  ];
  expect(nativeMonthlyArmyCost('a',ps.map(p=>({provinceId:p.id,state:'Attacking'})),ps)).toBe(750); // 0+12+78+240+420+0
  expect(nativeMonthlyArmyCost('a',[{provinceId:3,state:'Other'},{provinceId:2,state:'Reorganization'}],ps)).toBe(12);
  expect(nativeMonthlyArmyCost('a',[{provinceId:4,state:'Attacking'}],ps.map(p=>p.id===4?{...p,neighbors:[3,1]}:p))).toBe(780);
 });
 it('honors first matching zero-ID neighbor and stops enumerating after a match',()=>{
  const ps:NativeFeeProvince[]=[{id:0,owner:'a',land:true,distance:8,neighbors:[]},{id:1,owner:'b',land:true,distance:0,neighbors:[0,999]}];
  expect(nativeMonthlyArmyCost('a',[{provinceId:1,state:'Attacking'}],ps)).toBe(0);
  expect(()=>nativeMonthlyArmyCost('a',[{provinceId:999,state:'Attacking'}],ps)).toThrow();
 });
 it('initializes capacity by ordered original cells including Marine, then applies growth',()=>{
  expect(POPULATION_CAPACITY).toEqual([5,.5,.5,4,6,8,10,6,6,4,3,.5,5]);expect(FOOD_PRODUCTION_EFFICIENCY).toEqual([5,1,1,3,5,7,10,5,6,3,2,0,4]);
  expect(nativeInitialPopulation(population())).toEqual({population:5250,maxPopulation:6550});
  expect(nativeInitialPopulation(population({atWarInProvince:true}))).toEqual({population:5092,maxPopulation:6550});
 });
 it('retains loaded data or locked capacity before the original minimum population clamp',()=>{
  expect(nativeInitialPopulation(population({oldPopulation:0,oldMaxPopulation:10000,maxLocked:true}))).toEqual({population:3000,maxPopulation:10000});
  expect(nativeInitialPopulation(population({oldPopulation:20000,oldMaxPopulation:10000,maxLocked:false}))).toEqual({population:6550,maxPopulation:6550});
  expect(nativeInitialPopulation(population({statePercentage:1,provinceRandom:1.05}))).toEqual({population:6550,maxPopulation:6550});
  expect(()=>nativeInitialPopulation(population({perCellFactor:.5}))).toThrow();
 });
 it('preserves exact native mismatches and excludes absent resource candidates before drawing random',()=>{
  expect(ORIGINAL_RESOURCE_TABLE.unresolved).toEqual(['Tundra/Fox Fur','Snow-covered land/Fox Fur']);
  let draws=0;expect(nativeInitialResources([3,6],false,()=>{draws++;return 0;})).toEqual([]);expect(draws).toBe(0);
  const resources=nativeInitialResources([3,6],true,()=>{draws++;return 0;});expect(resources.length).toBe(ORIGINAL_RESOURCE_TABLE.table.Marine.length);expect(draws).toBe(resources.length);
  expect(ORIGINAL_RESOURCE_TABLE.table.Tundra.some(r=>r.name==='Fox Fur')).toBe(false);
 });
 it('uses strict random comparison with no fallback when every candidate misses',()=>{
  const table:ResourceTable={Marine:[{name:'A',baseValue:1,probability:.5,affectedBy:[]}]};
  expect(nativeInitialResources([0],false,()=>.5,table)).toEqual([]);
  expect(nativeInitialResources([0],false,()=>0,table)).toEqual([{name:'A',baseValue:1,probability:1,affectedBy:[]}]);
  expect(nativeInitialResources([0],true,()=>1,table)).toEqual([]);
 });
 it('adds independent coastal candidates, merges duplicate names and keeps first traits',()=>{
  const table:ResourceTable={Marine:[{name:'A',baseValue:10,probability:1,affectedBy:['Maritime']}],Steppe:[{name:'A',baseValue:20,probability:1,affectedBy:['Nomadic']},{name:'B',baseValue:5,probability:1,affectedBy:[]}]};
  let draws=0;const r=nativeInitialResources([0,4],true,()=>{draws++;return 0;},table);
  expect(draws).toBe(4);expect(r.map(x=>[x.name,x.baseValue,x.affectedBy])).toEqual([['A',20,['Maritime']],['B',5,[]]]);
  expect(r.map(x=>x.probability)).toEqual([f(f(1.3)/f(f(1.3)+.5)),f(.5/f(f(1.3)+.5))]);
  expect(table.Marine[0].probability).toBe(1);
 });
 it('normalizes using double accumulation before final float32 rather than repeated float32 sums',()=>{
  const ps=[1,f(3e-8),f(3e-8)],table:ResourceTable={Marine:ps.map((probability,index)=>({name:String(index),baseValue:1,probability,affectedBy:[]}))};
  // Each tiny term individually vanishes if rounded into 1f, but together they
  // round the double accumulator up by one float ULP before division.
  const actual=nativeInitialResources([0],false,()=>0,table);expect(actual[0].probability).toBe(0.9999998807907104);expect(actual[0].probability).not.toBe(1);
 });
 it('skips missing exact names without replacing or merging ethnic lists',()=>{
  const built=buildNativeResourceTable({resources:[{Name:'Arctic Fox Fur',BaseValue:1,AffectedBy:['Commercial']}],biomeDistribution:[{Name:'Tundra',Resources:[{Name:'Fox Fur',Probability:.5}]}]});expect(built.table.Tundra).toEqual([]);expect(built.unresolved).toEqual(['Tundra/Fox Fur']);
  expect(()=>nativeInitialResources([99],false,()=>0)).toThrow();expect(()=>nativeInitialResources([0],false,()=>NaN)).toThrow();
 });
 it('retains int32 resource values above float32 exact precision until income evaluation',()=>{
  const built=buildNativeResourceTable({resources:[{Name:'A',BaseValue:16777217,AffectedBy:['Commercial']}],biomeDistribution:[{Name:'Marine',Resources:[{Name:'A',Probability:1}]}]});
  expect(built.table.Marine[0].baseValue).toBe(16777217);expect(nativeInitialResources([0],false,()=>0,built.table)[0].baseValue).toBe(16777217);
  expect(()=>nativeProvinceIncome(income({resources:[{name:'A',baseValue:1.2,probability:1,affectedBy:[]}]}))).toThrow();
  expect(()=>buildNativeResourceTable({resources:[{Name:'A',BaseValue:1,AffectedBy:['Other']}],biomeDistribution:[{Name:'Marine',Resources:[{Name:'A',Probability:1}]}]})).toThrow();
 });
});
