import {useEffect,useMemo,useRef,useState} from 'react';
import type {FmsDocument} from '../model';
import {settlementRegions47} from './settlement47-regions';
import {settlementPalette} from './settlement25-palette';
import {assignRegion47,defaultLayout47,placeNation47,removeNation47,setCapital47,MAX_OPENING_NATIONS47,MIN_OPENING_NATIONS47,type OpeningLayout47} from './opening-layout47';

type Tool='draw'|'capital'|'place';
const TOOLS:readonly [Tool,string,string][]=[['draw','绘制领土','选中国家后在地图上涂抹，把行省划入该国；首都所在行省不会被改动。'],['capital','设为首都','点击选中国家境内的行省，设为该国首都。'],['place','放置国家','点击地图，在该行省建立一个新国家（首都行省除外）。']];

/** Original map editor "编辑国家" adapted for the web opening: the same
 * settlement regions the world will be built from, edited before creation. */
export function CultureLayoutEditor47({terrain,cityCount,count,layout,onChange}:{terrain:FmsDocument;cityCount:number;count:number;layout:OpeningLayout47|null;onChange:(layout:OpeningLayout47|null)=>void}){
  const {regions,error}=useMemo(()=>{try{return {regions:settlementRegions47(terrain,cityCount).regions,error:''};}catch(e){return {regions:null,error:e instanceof Error?e.message:'无法划分行省。'};}},[terrain,cityCount]);
  const current=useMemo(()=>regions?(layout??defaultLayout47(regions,count)):null,[regions,layout,count]);
  const [tool,setTool]=useState<Tool>('draw'),[nation,setNation]=useState(0);
  const canvas=useRef<HTMLCanvasElement>(null),painting=useRef(false);
  const selected=current?Math.min(nation,current.seeds.length-1):0;
  useEffect(()=>{
    const c=canvas.current;if(!c||!regions||!current)return;
    const draw=()=>{
      const ratio=window.devicePixelRatio||1,width=c.clientWidth,height=width*terrain.height/terrain.width;
      c.width=Math.round(width*ratio);c.height=Math.round(height*ratio);c.style.height=height+'px';
      const g=c.getContext('2d')!,k=width/terrain.width*ratio;g.setTransform(k,0,0,k,0,0);
      g.fillStyle='#a9c2c6';g.fillRect(0,0,terrain.width,terrain.height);
      regions.forEach((r,i)=>{const owner=current.owners[i];g.beginPath();r.ring.forEach((p,j)=>j?g.lineTo(p.x,p.y):g.moveTo(p.x,p.y));g.closePath();
        g.fillStyle=settlementPalette[owner%settlementPalette.length];g.globalAlpha=owner===selected?1:.78;g.fill();g.globalAlpha=1;
        g.lineWidth=1/k*ratio;g.strokeStyle='#26343a55';g.stroke();});
      current.seeds.forEach((s,i)=>{const {x,y}=regions[s].center,size=(i===selected?7:5)/k*ratio;g.beginPath();g.arc(x,y,size,0,Math.PI*2);g.fillStyle='#fff';g.fill();g.lineWidth=2/k*ratio;g.strokeStyle='#1d2b2f';g.stroke();});
    };
    draw();const observer=new ResizeObserver(draw);observer.observe(c);return()=>observer.disconnect();
  },[regions,current,selected,terrain]);
  if(error)return <p className="c47-layout-error" role="alert">{error}</p>;
  if(!regions||!current)return null;
  const regionAt=(e:{clientX:number;clientY:number})=>{
    const b=canvas.current!.getBoundingClientRect(),x=(e.clientX-b.left)/b.width*terrain.width,y=(e.clientY-b.top)/b.height*terrain.height;
    return regions.findIndex(r=>{let inside=false;for(let i=0,j=r.ring.length-1;i<r.ring.length;j=i++){const a=r.ring[i],c=r.ring[j];if((a.y>y)!==(c.y>y)&&x<(c.x-a.x)*(y-a.y)/(c.y-a.y)+a.x)inside=!inside;}return inside;});
  };
  const apply=(region:number,first:boolean)=>{
    if(region<0)return;
    if(tool==='draw'){const next=assignRegion47(current,region,selected);if(next)onChange(next);return;}
    if(!first)return;
    if(tool==='capital'){if(current.owners[region]!==selected){setNation(current.owners[region]);return;}const next=setCapital47(current,region);if(next)onChange(next);return;}
    const next=placeNation47(current,region);if(next){onChange(next);setNation(next.seeds.length-1);}
  };
  const remove=()=>{const next=removeNation47(regions,current,selected);if(next){onChange(next);setNation(Math.max(0,selected-1));}};
  const sizes=current.seeds.map((_,i)=>current.owners.filter(o=>o===i).length);
  return <section className="c47-layout" aria-label="编辑国家与领土">
    <div className="c47-segment" role="group" aria-label="领土编辑工具">{TOOLS.map(([id,label])=><button key={id} aria-pressed={tool===id} onClick={()=>setTool(id)}>{label}</button>)}</div>
    <small>{TOOLS.find(t=>t[0]===tool)![2]}</small>
    <canvas ref={canvas} className="c47-layout-map" data-testid="c47-layout-map" data-layout={JSON.stringify({nations:current.seeds.length,sizes,seeds:current.seeds,regions:regions.length})}
      onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);painting.current=true;apply(regionAt(e),true);}}
      onPointerMove={e=>{if(painting.current&&tool==='draw')apply(regionAt(e),false);}}
      onPointerUp={()=>{painting.current=false;}} onPointerCancel={()=>{painting.current=false;}}/>
    <div className="c47-layout-nations" role="group" aria-label="选择要编辑的国家">{current.seeds.map((_,i)=><button key={i} aria-pressed={i===selected} onClick={()=>setNation(i)}><i style={{background:settlementPalette[i%settlementPalette.length]}}/>国家 {i+1}<small>{sizes[i]} 省</small></button>)}</div>
    <div className="c47-layout-actions">
      <button disabled={current.seeds.length<=MIN_OPENING_NATIONS47} onClick={remove}>删除国家 {selected+1}</button>
      <button onClick={()=>{onChange(null);setNation(0);}}>重新生成</button>
      <small>{current.seeds.length} 国 · {regions.length} 个行省 · 最多 {Math.min(MAX_OPENING_NATIONS47,regions.length)} 国</small>
    </div>
  </section>;
}
