import {useEffect,useRef,useState} from 'react';
import {NewsQueue,type NewsItem} from './news';
import type {FoundingForces47} from './civilization47-forces';
import {CultureHistoryText47,historyDate47,historyPresentation47} from './CultureHistory47';
import {PlayIcon} from './PlayIcon';
/** Source-backed 8s major-message dwell, with a 180ms web slide/fade.
 * No empty status strip and no fabricated events to keep it occupied. */
export function CultureNews47({run,open}:{run:FoundingForces47;open:(id:number|null)=>void}){
  const chronicle=run.chronicle;
  const queue=useRef(new NewsQueue()),active=useRef<NewsItem|null>(null);
  const [shown,setShown]=useState<NewsItem|null>(null),[leaving,setLeaving]=useState(false),[pending,setPending]=useState(0);
  useEffect(()=>{
    queue.current.ingest(chronicle.entries.filter(e=>e.kind!=='occupation').map(e=>({key:'history-'+e.id,day:e.day,text:e.text,reason:historyPresentation47(e).reason,priority:'major',location:null,historyId:e.id})));
    if(!active.current){active.current=queue.current.next()??null;setLeaving(false);setShown(active.current);}
    setPending(queue.current.count);
  },[chronicle]);
  useEffect(()=>{
    if(!shown)return;
    let exit:ReturnType<typeof setTimeout>|undefined;
    const dwell=setTimeout(()=>{setLeaving(true);exit=setTimeout(()=>{active.current=queue.current.next()??null;setShown(active.current);setLeaving(false);setPending(queue.current.count);},180);},8000);
    // StrictMode may replay this effect. The displayed item stays active while
    // only its owned timers are replaced, so the first item is neither lost nor stuck.
    return()=>{clearTimeout(dwell);clearTimeout(exit);};
  },[shown?.key]);
  if(!shown)return null;
  const entry=chronicle.entries.find(e=>e.id===shown.historyId),date=historyDate47(run.life.startDate,shown.day),related=run.world.nations.filter(n=>entry?.nationIds.includes(n.id));
  return <button className={`c47-news${leaving?' is-leaving':''}`} aria-label="顶部重要事件" title={shown.reason} onClick={()=>open(shown.historyId??null)}><PlayIcon name="book" size={17}/><span key={shown.key} className="c47-news-copy" aria-live="polite"><small>{date.year}年{date.month}月{date.day}日</small><strong><CultureHistoryText47 text={shown.text} nations={related}/></strong></span>{pending>0&&<small>+{pending}</small>}<PlayIcon name="chevron" size={14}/></button>;
}
