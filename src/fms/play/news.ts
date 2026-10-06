import type {GameEvent,World} from '../../sim/types';
import {eventLocation,type EventLocation} from './observation';
export type NewsItem={key:string;day:number;text:string;reason:string;priority:'major'|'normal';location:EventLocation|null;historyId?:number};
/** Conservative display adapter. It never writes fabricated political events. */
export function locateRecent(world:World,event:GameEvent):EventLocation|null{
  const old=eventLocation(world,event);if(old)return old;
  if(event.kind!=='occupation')return null;
  const found=world.provinces.filter(p=>world.nations.some(n=>[`${n.name}接管${p.name}`,`${n.name}攻下${p.name}`].includes(event.text)));
  return found.length===1?{kind:'province',id:found[0].id,label:'查看事发地方'}:null;
}
export function recentNews(world:World):NewsItem[]{
  return world.events.filter(e=>['occupation','diplomacy'].includes(e.kind)).map(e=>({key:`event-${e.id}`,day:e.day,text:e.text,reason:e.reason,priority:e.kind==='diplomacy'?'major':'normal',location:locateRecent(world,e)}));
}
/** Original MajorEventMessageUI declares 8s priority / 1s normal queues.
 * Web motion is an explicit presentation adaptation; all retained records remain accessible. */
export class NewsQueue{
  private seen=new Set<string>();private pending:NewsItem[]=[];private initialized=false;
  ingest(items:NewsItem[]){
    const fresh=items.filter(i=>!this.seen.has(i.key));items.forEach(i=>this.seen.add(i.key));
    if(!this.initialized){this.initialized=true;this.pending=fresh.slice(-1);}
    else this.pending.push(...fresh);
    // The strip is bounded; the real chronicle is kept separately, not discarded here.
    this.pending=this.pending.slice(-64);
  }
  next(){const index=this.pending.findIndex(i=>i.priority==='major');return this.pending.splice(index<0?0:index,1)[0];}
  get count(){return this.pending.length;}
}
