import {MorphIcon} from 'morphicons/react';
import {BookOpen,Building2,ChevronLeft,ChevronRight,CircleHelp,Crosshair,Crown,Dices,Ellipsis,Flag,Hand,Landmark,Layers,Lock,Maximize,Minus,Mountain,Pause,Pencil,Pentagon,Play,Plus,Redo2,Route,Save,Search,Shield,Ship,SkipForward,SlidersHorizontal,Undo2,Users,Wallet,Waves,Wheat,X} from 'lucide';

/** One icon family for the whole game (map editor and world): Lucide stroke
 * icons, drawn by Morphicons so that a control whose icon changes (play ↔
 * pause, menu ↔ close) morphs between the two instead of jumping. */
const icons={
  browse:Hand,outline:Pentagon,sea:Waves,undo:Undo2,redo:Redo2,lock:Lock,back:ChevronLeft,save:Save,layers:Layers,
  plus:Plus,minus:Minus,fit:Maximize,play:Play,pause:Pause,step:SkipForward,more:Ellipsis,close:X,chevron:ChevronRight,
  locate:Crosshair,edit:Pencil,nation:Landmark,crown:Crown,diplomacy:Flag,city:Building2,army:Shield,route:Route,ship:Ship,
  grain:Wheat,people:Users,settings:SlidersHorizontal,treasury:Wallet,terrain:Mountain,book:BookOpen,search:Search,help:CircleHelp,generate:Dices,
} as const;
export type PlayIconName = keyof typeof icons;
/** Labels belong to the enclosing control; the icon itself is hidden from assistive tech. */
export function PlayIcon({name,size=20}:{name:PlayIconName;size?:number}){
  return <MorphIcon className="play-icon" icon={icons[name]} size={size} strokeWidth={1.75} spring="snappy" reducedMotion="user" focusable="false"/>;
}
