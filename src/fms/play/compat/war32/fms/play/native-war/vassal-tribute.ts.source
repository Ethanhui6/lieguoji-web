import {f,int32,iadd,roundInt} from '../native-economy/numeric';

/** VassalManager.Update 658A50, tribute branch 658CBD–658E41.
 * The recovered build uses the auto-rebellion gate for the whole manager.
 * This kernel covers payment only, not the later rebellion branch.
 * Input gold/income and output balances use the native signed-int32 contract. */
export function nativeTributeAmount(goldPerMonth:number,rate:number){
 return roundInt(f(f(f(int32(goldPerMonth))*f(rate))*12));
}
export function nativeTributePayment(input:{gold:number;overlordGold:number;goldPerMonth:number;rate:number;atWar:boolean}){
 const gold=int32(input.gold),overlordGold=int32(input.overlordGold);
 // Native checks war BEFORE evaluating/rounding the amount.
 if(input.atWar)return {status:'at-war' as const,amount:null,gold,overlordGold};
 const amount=nativeTributeAmount(input.goldPerMonth,input.rate);
 if(gold<amount)return {status:'insufficient' as const,amount,gold,overlordGold};
 return {status:'paid' as const,amount,gold:iadd(gold,-amount),overlordGold:iadd(overlordGold,amount)};
}
