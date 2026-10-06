import { useState } from 'react';
import type { World } from '../../sim/types';
import {locateRecent} from './news';
import { eventFilters, visibleEvents, type EventFilter, type EventLocation } from './observation';

export function EventPanel({ world, locate }: { world: World; locate: (location: EventLocation) => void }) {
  const [filter, setFilter] = useState<EventFilter>('important');
  const events = visibleEvents(world.events, filter);
  return <><div className="play-event-filters" role="group" aria-label="大事记筛选">{eventFilters.map(f => <button key={f.id} aria-pressed={filter === f.id} className={filter === f.id ? 'is-active' : ''} onClick={() => setFilter(f.id)}>{f.label}</button>)}</div>
    <p className="play-muted">已保留 {world.events.length} 条近期记录，当前类别 {events.length} 条。最多保留最近 160 条；不代表完整历史。</p>
    {!events.length && <p>当前类别暂无记录。可以切换类别或继续推进时间。</p>}
    {events.map(event => { const location = locateRecent(world, event); return <article className="play-event" key={event.id} data-event-id={event.id}><small>第 {event.day} 日</small><p>{event.text}</p><details><summary>查看原因</summary><p>{event.reason}</p></details>{location && <button className="play-event-location" onClick={() => locate(location)}>{location.label} ↗</button>}</article>; })}
  </>;
}
