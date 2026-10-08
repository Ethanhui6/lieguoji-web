import {useRef} from 'react';

const tabs = [
  ['nation', '政治', 'M4 21h16M6 21V9m4 12V9m4 12V9m4 12V9M3 9h18L12 3 3 9Z'],
  ['army', '军事', 'M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3Zm-3 9 2 2 4-4'],
  ['navy', '海军', 'M12 4v15m-4-9h8M4 14c0 4 3 7 8 7s8-3 8-7M2 15l2-2 2 2m12 0 2-2 2 2M14 4a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z'],
  ['battles', '战争', 'm4 3 15 15m-1-15L4 17m-1-4 6 6m6-6 6 6M3 21l3-3m12 0 3 3'],
  ['events', '大事记', 'M12 6c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V5c-3-1-6-1-9 1Zm0 0v15'],
] as const;
export type PlayTab = typeof tabs[number][0];

/** One moving selection surface; the buttons retain their identity on every tick. */
export function PlayNavigation({selected,choose}:{selected:PlayTab|null;choose:(tab:PlayTab)=>void}){
  const lastIndex=useRef(0),index=tabs.findIndex(([id])=>id===selected);
  if(index>=0)lastIndex.current=index;
  return <nav className="play-navigation" aria-label="世界信息">
    <span className="play-navigation-selection" aria-hidden="true" style={{transform:`translateX(${lastIndex.current*100}%)`,opacity:index<0?0:1}}/>
    {tabs.map(([id,label,path])=><button key={id} aria-label={label} aria-pressed={selected===id} className={selected===id?'is-active':''} onClick={()=>choose(id)}>
      <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round"><path d={path}/></svg><span>{label}</span>
    </button>)}
  </nav>;
}
