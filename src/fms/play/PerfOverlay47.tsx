import {useEffect,useState} from 'react';

/** On-device performance readout (open the game with ?perf=1): achieved
 * game days per second, frames per second, the slowest frame, and the
 * Worker compute / round trip per game day of the last batch. */
export function PerfOverlay47({root}:{root:{current:HTMLElement|null}}){
  const [text,setText]=useState('性能统计中…');
  useEffect(()=>{
    let frames=0,worst=0,last=performance.now(),raf=0;
    const loop=(t:number)=>{frames++;worst=Math.max(worst,t-last);last=t;raf=requestAnimationFrame(loop);};raf=requestAnimationFrame(loop);
    const day=()=>{const v=Number(root.current?.dataset.day);return Number.isFinite(v)?v:null;};
    let prevDay=day(),prevAt=performance.now();
    const timer=setInterval(()=>{
      const now=performance.now(),secs=(now-prevAt)/1000,d=day(),days=d!==null&&prevDay!==null?(d-prevDay)/secs:0;prevDay=d;prevAt=now;
      let batch='';
      try{const p=JSON.parse(root.current?.dataset.pipeline??'null') as {compute:number;roundTrip:number;total:number;ticks:number;phases?:Record<string,number>}|null;
        if(p&&p.ticks>0){const days=p.ticks/120,perDay=(v:number)=>Math.round(v/days);batch=` · 每日计算 ${perDay(p.compute)}ms · 往返 ${perDay(p.roundTrip)}ms · 含界面 ${perDay(p.total)}ms`;
          const phases=Object.entries(p.phases??{}).sort((a,b)=>b[1]-a[1]).slice(0,7).map(([k,v])=>`${k} ${perDay(v)}`).join(' · ');if(phases)batch+=` ｜ 每日分项(ms)：${phases}`;}}catch{/* no batch yet */}
      setText(`${days.toFixed(1)} 日/秒 · ${Math.round(frames/secs)} 帧/秒 · 最慢帧 ${Math.round(worst)}ms${batch} · 像素比 ${devicePixelRatio}`);
      frames=0;worst=0;
    },1000);
    return()=>{cancelAnimationFrame(raf);clearInterval(timer);};
  },[root]);
  return <div className="c47-perf" role="status">{text}</div>;
}
