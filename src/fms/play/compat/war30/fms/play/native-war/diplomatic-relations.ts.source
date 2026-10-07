import {nativeRoundToEven} from '../native-economy/native-round';

/** Both native State constructors initialize active/passive war time to these
 * exact double bits. This is not zero, founding time, or a nullable sentinel. */
export const NATIVE_INITIAL_WAR_TIME=-8.988465674311579e307;
export interface NativeDiplomaticRelation {state1Id:number;state2Id:number;lastWar:number;warCount:number}
export function nativeDiplomaticPairKey(left:number,right:number):bigint{
 const min=Math.min(left,right)|0,max=Math.max(left,right)|0;
 return BigInt.asIntN(64,(BigInt(min)<<32n)|BigInt(max));
}
/** GetRelation 896E00 writes both the ordered relation list and the lookup.
 * Use on a private candidate when previews must remain side-effect free. */
export function nativeGetDiplomaticRelation(left:number,right:number,relations:NativeDiplomaticRelation[],lookup:Map<bigint,NativeDiplomaticRelation|null>):NativeDiplomaticRelation{
 const key=nativeDiplomaticPairKey(left,right),existing=lookup.get(key);if(existing)return existing;
 const result={state1Id:Math.min(left,right),state2Id:Math.max(left,right),lastWar:-200,warCount:0};
 relations.push(result);
 if(lookup.has(key))throw Error('Native duplicate relation key');
 lookup.set(key,result);return result;
}
/** GetTruceYears 896FA0. Whole YEARS, unlike declaration cooldown MONTHS.
 * Native Round(double) is ties-to-even, with a float setting widened first. */
export function nativeTruceYears(relation:Pick<NativeDiplomaticRelation,'warCount'>|null,minimumYears:number):number{
 const repetitions=relation?Math.min(3,Math.max(0,(relation.warCount-1)|0)):0;
 return Math.imul(repetitions+1,nativeRoundToEven(Math.fround(minimumYears),0));
}
