import {useState} from 'react';
import type {FmsDocument} from '../model';
import FmsGame from './FmsGame';
import {CultureWorld47} from './CultureWorld47';
export function WorldEntry({terrain,onClose,entryNotice}:{terrain:FmsDocument;onClose:()=>void;entryNotice?:string}){
  const [legacy,setLegacy]=useState(false);
  return legacy?<FmsGame terrain={terrain} onClose={()=>setLegacy(false)}/>:<CultureWorld47 terrain={terrain} onClose={onClose} onLegacy={()=>setLegacy(true)} entryNotice={entryNotice}/>;
}
