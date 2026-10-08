import type {War46Run} from './war46-model';
import {applyActualVolley47} from './force-losses47';
import {forceKey47} from './force-motion47';
import {lossRecorder,reconcileLosses,assertLosses} from './war27-losses';
import {war28DamageSink,type War28World} from './war47-wars';

type Run = Parameters<typeof applyActualVolley47>[0] & War28World & Pick<War46Run,'losses'|'nativeWars'>;
/** Apply physical damage and both ledgers to the SAME returned candidate.
 * Native Navy's recovered leaf directly subtracts Army/Fleet strength, without
 * a War damage callback. Its real casualties enter web accounting only; do not
 * invent raw Navy kills in the source-backed Army war-score ledger. */
export function applyAccountedVolley47<T extends Run>(input: T, due: ReadonlySet<string>, inputs: Parameters<typeof applyActualVolley47>[2]) {
  assertLosses(input.losses,input.world,input.warfare,input.clock.tick);
  const identities=new Map<string,{kind:'army'|'fleet';nation:string}>([
    ...input.world.armies.map(a=>[forceKey47({kind:'army',id:a.id}),{kind:'army',nation:a.nationId}] as const),
    ...input.navy.fleets.map(a=>[forceKey47({kind:'fleet',id:a.id}),{kind:'fleet',nation:a.nationId}] as const),
    ...input.transports.cargo.map(c=>[forceKey47({kind:'army',id:c.army.id}),{kind:'army',nation:c.army.nationId}] as const),
  ]);
  const output=applyActualVolley47(input,due,inputs), r=output.run;
  reconcileLosses(r.losses,r.world,r.warfare,r.clock.tick);
  const raw=war28DamageSink(r.nativeWars,r), loss=lossRecorder(r.losses,r.warfare);
  const attackers=new Map<string,Set<string>>();
  for(const hit of output.nativeHits) {
    const a=identities.get(hit.attacker)!,b=identities.get(hit.victim)!;
    if(a.kind==='army' && b.kind==='army') raw(a.nation,b.nation,hit.nativeDamage);
    if(hit.nativeDamage>0) {const set=attackers.get(hit.victim)??new Set<string>();set.add(a.nation);attackers.set(hit.victim,set);}
  }
  for(const c of output.casualties) {
    const identity=identities.get(c.key);if(!identity) throw Error('实际战损缺少原部队身份。');
    const enemies=(input.forceDamage.carry[c.key]??0)>0?[]:[...(attackers.get(c.key)??[])];
    loss(identity.nation,identity.kind==='army'?'combat':'hull',c.strength,enemies);
    loss(identity.nation,'crew',c.crew,enemies);loss(identity.nation,'ships',c.lostShips,enemies);
    // Cargo was deducted by a carrier sinking, not by an invented Army hit.
    loss(identity.nation,'cargo',c.cargo);
  }
  assertLosses(r.losses,r.world,r.warfare,r.clock.tick);return output;
}
