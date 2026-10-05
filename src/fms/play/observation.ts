import type { GameEvent, World } from '../../sim/types';

export const eventFilters = [
  { id: 'important', label: '要闻', kinds: ['battle', 'occupation', 'retreat', 'diplomacy'] },
  { id: 'war', label: '战事', kinds: ['battle', 'occupation', 'retreat', 'march', 'order'] },
  { id: 'economy', label: '内政与补给', kinds: ['economy', 'supply'] },
  { id: 'diplomacy', label: '外交', kinds: ['diplomacy'] },
  { id: 'all', label: '全部类别', kinds: [] },
] as const;
export type EventFilter = typeof eventFilters[number]['id'];
export function visibleEvents(events: readonly GameEvent[], filter: EventFilter): GameEvent[] {
  const kinds: readonly string[] = eventFilters.find(f => f.id === filter)!.kinds;
  // Filter the retained window before presenting it; no invented full history.
  return events.filter(e => filter === 'all' || kinds.includes(e.kind)).slice().reverse();
}
export type EventLocation = { kind: 'province'; id: string; label: string } | { kind: 'army-current'; id: string; label: string };
/** Core also records starvation destruction as kind=battle. Only these known
 * contact/combat templates prove an actual clash, without altering core rules. */
export function isClash(world:World,event:GameEvent):boolean{
  return event.kind==='battle'&&(world.provinces.some(p=>event.text.startsWith(`${p.name}交战：`))||world.armies.some(a=>event.text===`${a.name}遭遇敌军`));
}

/** Old saves contain prose, not historical entity IDs. Only known templates and
 * unique full names support a link. Never infer a historical site from current control. */
export function eventLocation(world: World, event: GameEvent): EventLocation | null {
  const sites: EventLocation[] = [];
  for (const p of world.provinces) {
    let label = '';
    if (event.kind === 'battle' && event.text.startsWith(`${p.name}交战：`)) label = '查看交战辖区';
    if (event.kind === 'occupation' && world.nations.some(n => event.text === `${n.name}控制${p.name}`)) label = '查看控制辖区';
    if (['march', 'retreat'].includes(event.kind) && world.armies.some(a => event.text === `${a.name}抵达${p.name}`)) label = '查看抵达地点';
    if (['order', 'retreat'].includes(event.kind) && world.armies.some(a => [`${a.name}向${p.name}进发`, `${a.name}撤向${p.name}进发`, `${a.name}自主向${p.name}行军`].includes(event.text))) label = '查看命令目标';
    if (label) sites.push({ kind: 'province', id: p.id, label });
  }
  if (sites.length) return sites.length === 1 ? sites[0] : null;
  const actions = ['断粮减员 ', '自主休整', '遭遇敌军', '脱离接触', '维持防御'];
  const armies = world.armies.filter(a => actions.some(action => event.text.startsWith(`${a.name}${action}`)));
  if (armies.length !== 1 || armies[0].status === 'destroyed' || armies[0].troops === 0) return null;
  return { kind: 'army-current', id: armies[0].id, label: '查看军队当前位置' };
}
