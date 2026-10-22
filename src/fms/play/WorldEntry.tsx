import './play.css';
import './play-live.css';
import './play-inspector.css';
import './family.css';
import type {FmsDocument} from '../model';
import {CultureWorld47} from './CultureWorld47';
export function WorldEntry({terrain,onClose,entryNotice}:{terrain:FmsDocument;onClose:()=>void;entryNotice?:string}){
  return <CultureWorld47 terrain={terrain} onClose={onClose} entryNotice={entryNotice}/>;
}
