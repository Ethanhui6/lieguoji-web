import {useEffect,useRef,useState} from 'react';
import {NewsQueue,type NewsItem} from './news';
export function NewsRibbon({items,open}:{items:NewsItem[];open:(item:NewsItem|null)=>void}){
  const queue=useRef(new NewsQueue()),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const [shown,setShown]=useState<NewsItem>();const [pending,setPending]=useState(0);
  useEffect(()=>{
    queue.current.ingest(items);
    function advance(){
      const next=queue.current.next();setPending(queue.current.count);
      if(!next){timer.current=undefined;return;}
      setShown(next);timer.current=setTimeout(advance,next.priority==='major'?8000:1000);
    }
    setPending(queue.current.count);if(!timer.current)advance();
  },[items]);
  useEffect(()=>()=>{clearTimeout(timer.current);timer.current=undefined;},[]);
  return <button className="play-news" aria-label="顶部大事记" onClick={()=>open(shown??null)}>
    <span className="play-news-tag">大事记</span><span className="play-news-copy" key={shown?.key??'empty'} aria-live="polite"><small>{shown?`第 ${shown.day} 日`:'世界史'}</small><strong>{shown?.text??'天下尚无要闻 · 点击查看记录'}</strong></span><span className="play-news-more">{pending?`+${pending}`:'查看'} ›</span>
  </button>;
}
