const f=Math.fround;
export type NativeRebellionReason='powerful'|'war'|'destiny'|'development'|'default';
export type NativeRebellionInput={years:number;strengthRatio:number;destinyDifference:number;resistance:number;overlordCollapsed:()=>boolean;randomValue:()=>number};
/** VassalManager.ShouldRebel 6581B0 + GenerateRebellionReason 64A3A0.
 * Random.value calls and float32 operations retain native branch order.
 * Calendar scheduling and actual war creation belong to the caller. */
export function nativeVassalRebellion(q:NativeRebellionInput):NativeRebellionReason|null{
 if(q.years<12)return null;
 const ratio=f(q.strengthRatio);let chance=f(f(ratio*f(.05))*f(1-f(q.resistance)));
 if(ratio>f(.85))return 'powerful';
 if(q.overlordCollapsed()){
  chance=f(chance*f(1.5));if(ratio>f(.4))chance=f(chance*f(1.3));
  if(chance>q.randomValue())return 'war';
 }
 const difference=f(q.destinyDifference);
 if(difference>30){chance=f(chance+f(Math.min(f(difference*f(.002)),f(.2))*ratio));if(chance>q.randomValue())return 'destiny';}
 if(q.years>=10){chance=f(chance+f(Math.min(f(f(q.years)*f(.01)),f(.3))*ratio));if(ratio>f(.3)&&chance>q.randomValue())return 'development';}
 chance=Math.max(f(.002),Math.min(f(.1),chance));
 return chance>q.randomValue()?'default':null;
}
/** Character.GetRebellionResistanceModifier 83C200; sum, no clamp. */
export const nativeRebellionResistance=(traits:readonly {rebellionResistanceModifier?:number}[])=>traits.reduce((sum,t)=>f(sum+f(t.rebellionResistanceModifier??0)),0);
