/** GameAssembly d42658a…: ApplyNavyOccupation 40F460,
 * UpdatePortOccupationRecovery 41FA00, IsPortValid… 419E50.
 * Caller supplies actual port presence and diplomacy. No land title changes. */
export type NativePortControl={landOwnerId:string;occupierId:string;value:number};
const f=Math.fround;
export const PORT_MAX=100;
export function nativePortTarget(p:NativePortControl,actor:string,enemy:(id:string)=>boolean){return p.occupierId!==actor&&(p.landOwnerId===actor?enemy(p.occupierId):enemy(p.landOwnerId));}
export function nativePortAttack(p:NativePortControl,actor:string,strength:number,dt:number,enemy:(id:string)=>boolean){
 if(actor===p.landOwnerId&&p.occupierId===actor){p.value=Math.min(100,f(p.value+f(f(dt)*2)));return false;}
 if(!nativePortTarget(p,actor,enemy)&&p.occupierId!==actor)return false;
 if(actor!==p.landOwnerId&&!enemy(p.landOwnerId))return false;
 const delta=f(f(f(Math.min(1,Math.max(0,f(strength)))+f(.6))*15)*f(dt));
 if(p.occupierId===actor){p.value=Math.min(100,f(p.value+delta));return false;}
 p.value=f(p.value-delta);if(p.value>0)return false;p.occupierId=actor;p.value=10;return true;
}
/** Native HasEnemyNavyInPort means any OTHER state's presence, not only
 * diplomatic enemies. Callers must not silently strengthen that predicate. */
export function nativePortRecovery(p:NativePortControl,landOwner:string,holderPresent:boolean,otherPresent:boolean,dt:number){
 if(p.landOwnerId!==landOwner){p.landOwnerId=landOwner;p.occupierId=landOwner;p.value=100;return;}
 if(p.occupierId!==landOwner){if(holderPresent)p.value=Math.min(100,f(p.value+f(dt)));else{p.value=f(p.value-f(f(dt)*2));if(p.value<=0){p.occupierId=landOwner;p.value=5;}}}
 else if(!otherPresent)p.value=Math.min(100,f(p.value+f(f(dt)*2)));
}
/** HandleWarEnded 418550: caller invokes for an actual completed war. */
export function nativePortPeace(p:NativePortControl,participants:Set<string>,stillEnemies:(a:string,b:string)=>boolean){
 if(p.landOwnerId===p.occupierId||!participants.has(p.landOwnerId)&&!participants.has(p.occupierId)||stillEnemies(p.landOwnerId,p.occupierId))return false;
 p.occupierId=p.landOwnerId;p.value=100;return true;
}
/** FindBestEnemyPortTarget 4147E0: reclaim before attack, then distance;
 * stable ties. Inputs must already satisfy sea-component and valid-land tests. */
export function nativeBestPort<T extends {control:NativePortControl;distance:number}>(rows:T[],actor:string,enemy:(id:string)=>boolean):T|null{
 let best:T|null=null;for(const row of rows){if(!nativePortTarget(row.control,actor,enemy))continue;const rank=row.control.landOwnerId===actor?0:1,bestRank=best?.control.landOwnerId===actor?0:1;if(!best||rank<bestRank||rank===bestRank&&row.distance<best.distance)best=row;}return best;
}
