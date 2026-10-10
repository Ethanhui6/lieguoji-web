import {useEffect,useRef,useState} from 'react';
import type {NewsItem} from './news';
import type {FoundingForces47} from './civilization47-forces';
import {CultureHistoryText47,historyDate47,historyPresentation47} from './CultureHistory47';
import {PlayIcon} from './PlayIcon';
import type {HistoricalEntry} from './chronicle-records';
/** Existing ordinary recruitment/demobilization gets the original normal
 * channel. Wars, emergency mobilization and political/person events stay major.
 * This changes only presentation priority, never the persisted chronicle. */
export function cultureNewsItem47(e:HistoricalEntry,death=false):NewsItem{
  const presentation=historyPresentation47(e,death),normal=presentation.kind==='征募'||presentation.kind==='遣散';
  return {key:'history-'+e.id,day:e.day,text:e.text,reason:presentation.reason,priority:normal?'normal':'major',location:null,historyId:e.id};
}
export const cultureNewsDwell47=(item:NewsItem)=>item.priority==='major'?8000:1000;
/** UI-only queue. Ordinary floods cannot evict waiting major news; a flood of
 * major news retains the latest 64. The complete chronicle is always separate. */
export class CultureNewsQueue47{
  private seen=new Set<string>();private pending:NewsItem[]=[];private initialized=false;
  ingest(items:NewsItem[]){
    const fresh=items.filter(i=>!this.seen.has(i.key));items.forEach(i=>this.seen.add(i.key));
    if(!this.initialized){this.initialized=true;this.pending=fresh.slice(-1);}
    else this.pending.push(...fresh);
    while(this.pending.length>64){const normal=this.pending.findIndex(i=>i.priority==='normal');this.pending.splice(normal<0?0:normal,1);}
  }
  next(){const major=this.pending.findIndex(i=>i.priority==='major');return this.pending.splice(major<0?0:major,1)[0];}
  get count(){return this.pending.length;}
}
/** Source-backed 8s major / 1s normal dwell, with a 180ms web slide/fade.
 * No empty status strip and no fabricated events to keep it occupied. */
export function CultureNews47({run,open}:{run:FoundingForces47;open:(id:number|null)=>void}){
  const chronicle=run.chronicle;
  const queue=useRef(new CultureNewsQueue47()),active=useRef<NewsItem|null>(null);
  const [shown,setShown]=useState<NewsItem|null>(null),[leaving,setLeaving]=useState(false),[pending,setPending]=useState(0);
  useEffect(()=>{
    const deaths=new Set(run.kin.lifecycle?.deaths.map(d=>d.deathHistoryId));
    queue.current.ingest(chronicle.entries.filter(e=>e.kind!=='occupation').map(e=>cultureNewsItem47(e,deaths.has(e.id))));
    if(!active.current){active.current=queue.current.next()??null;setLeaving(false);setShown(active.current);}
    setPending(queue.current.count);
  },[chronicle,run.kin.lifecycle]);
  useEffect(()=>{
    if(!shown)return;
    let exit:ReturnType<typeof setTimeout>|undefined;
    const dwell=setTimeout(()=>{setLeaving(true);exit=setTimeout(()=>{active.current=queue.current.next()??null;setShown(active.current);setLeaving(false);setPending(queue.current.count);},180);},cultureNewsDwell47(shown));
    // StrictMode may replay this effect. The displayed item stays active while
    // only its owned timers are replaced, so the first item is neither lost nor stuck.
    return()=>{clearTimeout(dwell);clearTimeout(exit);};
  },[shown?.key]);
  if(!shown)return null;
  const entry=chronicle.entries.find(e=>e.id===shown.historyId),date=historyDate47(run.life.startDate,shown.day),related=run.world.nations.filter(n=>entry?.nationIds.includes(n.id));
  return <button className={`c47-news${leaving?' is-leaving':''}`} aria-label="顶部重要事件" title={shown.reason} onClick={()=>open(shown.historyId??null)}><PlayIcon name="book" size={17}/><span key={shown.key} className="c47-news-copy" aria-live="polite"><small>{date.year}年{date.month}月{date.day}日</small><strong><CultureHistoryText47 text={shown.text} nations={related}/></strong></span>{pending>0&&<small>+{pending}</small>}<PlayIcon name="chevron" size={14}/></button>;
}
