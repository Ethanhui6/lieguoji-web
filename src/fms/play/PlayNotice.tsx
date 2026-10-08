import {PlayIcon} from './PlayIcon';
import {useEffect,useState} from 'react';

/** Routine feedback makes room for the map. Failures stay until dismissed. */
export function PlayNotice({message,critical=false}:{message:string;critical?:boolean}){
  const [dismissed,setDismissed]=useState('');
  useEffect(()=>{if(critical)return;const timer=setTimeout(()=>setDismissed(message),5500);return()=>clearTimeout(timer);},[message,critical]);
  if(!message||dismissed===message)return null;
  return <div className="play-notice" role={critical?'alert':'status'}><span>{message}</span><button aria-label="收起提示" onClick={()=>setDismissed(message)}><PlayIcon name="close" size={16}/></button></div>;
}
