import {provinceDefense,type UpperCombat} from './upper14-state';
import type { Point, World } from '../../sim/types';
import { nationColor } from './politics';
import {currentCapital} from './capital-view';

/** Read the actual selected province ledger; never apportion a national ledger. */
export function LocalityPanel({upperCombat,world,id,focus,selectArmy}:{upperCombat?:UpperCombat;world:World;id:string;focus:(point:Point)=>void;selectArmy:(id:string)=>void}){
  const p=world.provinces.find(p=>p.id===id);if(!p)return null;
  const owner=world.nations.find(n=>n.id===p.controller)!,legal=world.nations.find(n=>n.id===p.legalOwner)!;
  const economy=world.statecraft?.provinces.find(e=>e.provinceId===id),cities=world.cities.filter(c=>c.provinceId===id),armies=world.armies.filter(a=>a.provinceId===id&&a.status!=='destroyed');
  const number=(n:number)=>Math.round(n).toLocaleString('zh-CN');
  return <section className="play-locality" aria-label="所选地方详情"><div className="play-row"><h2>{p.name}</h2><button onClick={()=>focus(p.center)}>定位</button></div>
    <p className="play-nation-name"><i style={{background:nationColor(owner)}}/>{owner.name}控制 · {({plain:'平原',forest:'森林',mountain:'山地'})[p.terrain]}</p>
    {legal.id!==owner.id&&<p className="play-muted">原属{legal.name}，目前由{owner.name}控制</p>}
    {economy&&<dl className="play-stats"><div><dt>当地人口</dt><dd>{number(economy.population)}</dd></div><div><dt>地方粮储 · 人日粮</dt><dd>{number(economy.grain)}</dd></div></dl>}
    {cities.map(c=><button className="play-city" key={c.id} onClick={()=>focus(c.position)}>{currentCapital(world,owner.id)?.id===c.id?'◆ ':'· '}{c.name} · {upperCombat?`通用防御 ×${provinceDefense(upperCombat,c.provinceId).toFixed(2)}`:`城防 ${c.fort}`}</button>)}
    {!cities.length&&<p className="play-muted">这里是乡野辖区，尚无城市。</p>}
    {armies.map(a=><button className="play-city" key={a.id} onClick={()=>selectArmy(a.id)}>{a.name} · {number(a.troops)} 人 · {a.status==='marching'?'行军':a.status==='retreating'?'撤退':a.status==='fighting'?'交战':'驻守'}</button>)}
    <p className="play-muted">陆地相邻：{p.neighbors.map(id=>world.provinces.find(p=>p.id===id)?.name).filter(Boolean).join('、')||'无陆地通道'}</p>
  </section>;
}
