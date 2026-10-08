import {Children,useId,type ReactNode} from 'react';
import {PlayIcon,type PlayIconName} from './PlayIcon';

export function InspectorGroup({icon,title,children,defaultOpen=false}:{icon:PlayIconName;title:string;children:ReactNode;defaultOpen?:boolean}){
  if(!Children.toArray(children).length)return null;
  return <details className="play-inspector-group" open={defaultOpen||undefined}><summary><PlayIcon name={icon}/><span>{title}</span><PlayIcon name="chevron" size={16}/></summary><div className="play-inspector-group-body">{children}</div></details>;
}

/** Hidden panels stay mounted: a tab switch must not discard a form or a route draft. */
export function InspectorTabs({sections,selected,setSelected}:{sections:{id:string;label:string;icon:PlayIconName;content:ReactNode}[];selected:string;setSelected:(id:string)=>void}){
  const id=useId();
  return <div className="play-inspector-tabs">
    <div className="play-inspector-tabbar" role="tablist" aria-label="国家详情分类">
      {sections.map((s,index)=><button key={s.id} id={`${id}-${s.id}-tab`} role="tab" aria-selected={s.id===selected} aria-controls={`${id}-${s.id}`} tabIndex={s.id===selected?0:-1} onClick={()=>setSelected(s.id)} onKeyDown={e=>{
        const next=e.key==='ArrowRight'?(index+1)%sections.length:e.key==='ArrowLeft'?(index+sections.length-1)%sections.length:e.key==='Home'?0:e.key==='End'?sections.length-1:-1;
        if(next<0)return;e.preventDefault();setSelected(sections[next].id);(e.currentTarget.parentElement?.children[next] as HTMLButtonElement)?.focus();
      }}><PlayIcon name={s.icon}/><span>{s.label}</span></button>)}
    </div>
    {sections.map(s=><section key={s.id} id={`${id}-${s.id}`} role="tabpanel" aria-labelledby={`${id}-${s.id}-tab`} hidden={s.id!==selected} className="play-inspector-page">{s.content}</section>)}
  </div>;
}
