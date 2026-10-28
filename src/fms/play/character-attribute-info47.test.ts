import {expect,it} from 'vitest';
import {characterAttributeInfo47} from './character-attribute-info47';
import {nativeGoldSettlement} from './native-economy/settlement';
import {nativeNavalFactor47,nativeNavyHit47} from './native-war/naval-damage47';
import {nativeVassalRebellion} from './native-war/vassal-rebellion';

const base={charisma:95,military:95,diplomatic:95,administrative:95};
it('shows base, full trait contribution and capped result separately, including negative traits',()=>{
 const info=characterAttributeInfo47({base,traits:['Genius','Brave']});
 expect(info.skills.find(s=>s.key==='military')).toMatchObject({base:95,modifier:25,current:100});
 const low=characterAttributeInfo47({base:{...base,military:0},traits:['Craven']});
 expect(low.skills.find(s=>s.key==='military')!.modifier).toBeLessThan(0);
 expect(low.skills.find(s=>s.key==='military')!.current).toBe(0);
 expect(characterAttributeInfo47({base,traits:['Reformer']}).traits[0].effects).toContain('改革效果待还原');
});
it('displayed tax and naval modifiers change the production settlement and damage kernels',()=>{
 const info=characterAttributeInfo47({base,traits:['Genius','NavalMastery']});
 const settle=(tax:number)=>nativeGoldSettlement({gold:0,provinceIncome:[1000],leaderTaxMultiplier:Math.fround(1+tax),centralIncomeMultiplier:1,armyCostGold:100,goldProductionModifier:1,ethnic:'Other'});
 expect(settle(0).gold).toBe(900);expect(settle(info.tax).gold).toBe(1000);
 const damage=(modifier:number)=>nativeNavyHit47(nativeNavalFactor47({destiny:30,maritime:false,livingLeaderModifier:modifier}),1,'fleet');
 expect(damage(0)).toBe(40);expect(damage(info.naval)).toBe(52);
});
it('resistance changes an eligible rebellion roll; enemy combat uses first nonzero rather than summed traits',()=>{
 const info=characterAttributeInfo47({base,traits:['Just','BattleHardened','WarWeary']});
 expect(info.perEnemy).toBe(Math.fround(.05));
 const roll=(resistance:number)=>nativeVassalRebellion({years:12,strengthRatio:.2,destinyDifference:0,resistance,overlordCollapsed:()=>false,randomValue:()=>.033});
 expect(roll(0)).toBe('default');expect(roll(info.resistance)).toBeNull();
});
