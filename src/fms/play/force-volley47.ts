import {nativeArmyHit} from './native-war/battle-damage';
import {nativeNavalFactor47, nativeNavyHit47, type NavalCombatInput47} from './native-war/naval-damage47';
import {forceKey47, type MovingForce47, type ForceContacts47} from './force-motion47';

export type ForceVolley47 = {attacker: string; victim: string; nativeDamage: number};
/** One due update, from one immutable pre-damage snapshot. Typed identities
 * prevent a Fleet from being a fake Army or consuming an Army's Elite rule.
 * The session must apply the complete ledger simultaneously, then remove dead
 * units/old cargo and reconcile contacts. Calling the old sea pulse as well
 * would double-charge Navy outputs and is forbidden for the new runtime. */
export function forceVolley47(forces: readonly MovingForce47[], contacts: ForceContacts47, due: ReadonlySet<string>, inputs: {
  enemy: (a: string, b: string) => boolean;
  onLand: (force: MovingForce47) => boolean;
  army: (force: MovingForce47) => {efficiency: number; damageToArmy: number; multiplier: number};
  elite: (force: MovingForce47) => boolean;
  navy: (force: MovingForce47) => NavalCombatInput47;
}): ForceVolley47[] {
  const byId = new Map(forces.map(f => [forceKey47(f), f])), edges = new Map<string, Set<string>>();
  if (byId.size !== forces.length) throw Error('伤害快照含重复部队。');
  for (const c of contacts.pairs) {
    if (!byId.has(c.a) || !byId.has(c.b) || c.a === c.b) throw Error('伤害接触引用无效。');
    for (const [a, b] of [[c.a, c.b], [c.b, c.a]]) {const set = edges.get(a) ?? new Set<string>(); set.add(b); edges.set(a, set);}
  }
  const output: ForceVolley47[] = [];
  for (const id of [...due].sort()) {
    const a = byId.get(id); if (!a) throw Error('攻击轮次引用缺少实际部队。');
    const enemies = [...(edges.get(id) ?? [])].sort().map(key => byId.get(key)!).filter(b => inputs.enemy(a.nationId, b.nationId));
    if (a.kind === 'army') {
      // Recovered Army sea attack enumerates Army only, not enemy navies.
      // A simultaneous shore-gate encounter is a web boundary battle; the
      // target is still a real Army. Do not strand both sides unable to fight.
      const targets = enemies.filter(b => b.kind === 'army');
      if (!targets.length) continue; const v = inputs.army(a);
      for (const b of targets) output.push({attacker: id, victim: forceKey47(b), nativeDamage: nativeArmyHit(v.efficiency, targets.length, inputs.elite(b), v.damageToArmy, v.multiplier)});
    } else {
      if (inputs.onLand(a)) throw Error('海军伤害源位于陆地。');
      const factor = nativeNavalFactor47(inputs.navy(a));
      for (const kind of ['fleet', 'army'] as const) {
        const targets = enemies.filter(b => b.kind === kind && !inputs.onLand(b));
        for (const b of targets) output.push({attacker: id, victim: forceKey47(b), nativeDamage: nativeNavyHit47(factor, targets.length, kind)});
      }
    }
  }
  return output;
}
