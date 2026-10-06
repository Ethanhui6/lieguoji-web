import type {ProvinceTerrain} from './terrain13-context';
const names=['海洋','热沙漠','冷沙漠','稀树草原','草原','热带季雨林','温带落叶林','热带雨林','亚热带常绿林','针叶林','苔原','积雪地','湿地'];
export function TerrainSummary({land}:{land?:ProvinceTerrain}){
 if(!land)return null;const types=land.biomes.map((ratio,id)=>({ratio,name:names[id]})).filter(b=>b.ratio>.001).sort((a,b)=>b.ratio-a.ratio);
 return <section className="play-army-readiness" aria-label="当地地貌"><strong>{land.mountain?'山地':land.plateau?'高原':'非山地'} · 兵种地利</strong><p>{types.map(b=>`${b.name} ${(b.ratio*100).toFixed(0)}%`).join(' · ')}</p><small>兵种攻防按这片辖区的陆地地貌占比计算；山地由高程分布决定。地貌取自创建本局时的地图。</small></section>;
}
