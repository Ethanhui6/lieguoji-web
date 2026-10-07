const f=Math.fround;
export interface NativeDiplomaticPower {power:number;startWar:number;endWar:number;efficiency:number}
/** State constructors' three point pools are 100. Efficiency is assigned by
 * UpdateStateData; its constructor value is intentionally not guessed here. */
export const NATIVE_INITIAL_DIPLOMATIC_POWER=100;
export const NATIVE_DIPLOMATIC_EFFICIENCY_FACTOR=20;
export const NATIVE_START_WAR_THRESHOLD=100;
/** UpdateStateData 5E0650 fragment, called monthly even with auto diplomacy
 * disabled. Political/army updates and the complete scheduler are separate. */
export function nativeAccumulateDiplomaticPower(s:NativeDiplomaticPower,factor:number):void{
 s.efficiency=f(factor);s.power=f(f(s.power)+s.efficiency);s.endWar=f(f(s.endWar)+s.efficiency);s.startWar=f(f(s.startWar)+s.efficiency);
}
/** UpdateDiplomacy 5DD840 V2 declaration fragment AFTER its switch/vassal and
 * alliance work. Not a replacement for that full method's missing branches. */
export function nativeSpendDeclarationPower<R>(s:NativeDiplomaticPower,threshold:number,evaluate:()=>R|null):R|null{
 if(!(f(s.startWar)>f(threshold)))return null;
 const result=evaluate();s.startWar=result===null?f(f(s.startWar)*f(.5)):0;return result;
}
