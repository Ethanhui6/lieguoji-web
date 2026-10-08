import {useState} from 'react';
import type {FmsDocument} from '../model';
import FmsGame from './FmsGame';
import {CultureWorld47} from './CultureWorld47';
export function WorldEntry({terrain,onClose}:{terrain:FmsDocument;onClose:()=>void}){
  const [legacy,setLegacy]=useState(false);
  return legacy?<FmsGame terrain={terrain} onClose={()=>setLegacy(false)}/>:<CultureWorld47 terrain={terrain} onClose={onClose} onLegacy={()=>setLegacy(true)}/>;
}
