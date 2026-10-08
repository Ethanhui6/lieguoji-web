import {PlayIcon} from './PlayIcon';
import {useRef,type PointerEvent} from 'react';

/** Only the sheet header owns the mobile dismissal gesture; list scrolling stays native. */
export function PlayPanelTitle({title,close}:{title:string;close:()=>void}){
  const drag=useRef<{id:number;y:number;start:number;panel:HTMLElement}|null>(null);
  const finish=(e:PointerEvent<HTMLDivElement>,cancel=false)=>{
    const d=drag.current;if(!d||d.id!==e.pointerId)return;
    drag.current=null;
    const distance=e.clientY-d.y,elapsed=Math.max(1,e.timeStamp-d.start);
    d.panel.removeAttribute('data-dragging');d.panel.style.removeProperty('transform');
    if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
    if(!cancel&&(distance>72||(distance>24&&distance/elapsed>.45)))close();
  };
  return <div className="play-panel-title" onPointerDown={e=>{
    if(drag.current||!e.isPrimary||e.button!==0||!matchMedia('(max-width:600px)').matches||(e.target as Element).closest('button'))return;
    const panel=e.currentTarget.closest<HTMLElement>('.play-panel');if(!panel)return;
    drag.current={id:e.pointerId,y:e.clientY,start:e.timeStamp,panel};panel.setAttribute('data-dragging','true');e.currentTarget.setPointerCapture(e.pointerId);
  }} onPointerMove={e=>{const d=drag.current;if(!d||d.id!==e.pointerId)return;const delta=e.clientY-d.y;d.panel.style.transform=`translateY(${delta>0?delta:delta*.12}px)`;}}
  onPointerUp={e=>finish(e)} onPointerCancel={e=>finish(e,true)} onLostPointerCapture={e=>finish(e,true)}>
    <span className="play-sheet-grip" aria-hidden="true"/><strong>{title}</strong><button aria-label="收起面板" onClick={close}><PlayIcon name="close" size={16}/></button>
  </div>;
}
