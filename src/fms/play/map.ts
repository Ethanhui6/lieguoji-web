import { Container, Graphics, Text, Texture, Sprite } from 'pixi.js';
import icons from './military-icons.json';
import { unitProfile, type UnitAssignments, type UnitKey } from './military-profile';
import type { World } from '../../sim/types';
import { armyMarkerPoint } from './navigation';
import { nationColor, politicalStyle, type PoliticalView } from './politics';
import { territoryLabels, type TerritoryLabel } from './territory-labels';

export class PlayMap {
  readonly layer = new Container();
  private textures=new Map<UnitKey,Texture>();
  private disposed=false;
  constructor(refresh=()=>{}){for(const [key,url] of Object.entries(icons)){const img=new Image();img.onload=()=>{if(this.disposed)return;this.textures.set(key as UnitKey,Texture.from(img));refresh();};img.src=url;}}
  dispose(){this.disposed=true;for(const texture of this.textures.values())texture.destroy(true);this.textures.clear();}

  private territoryKey='';
  private territories:TerritoryLabel[]=[];
  labelPositions(){return this.territories.map(({nationId,point})=>({nationId,...point}));}
  draw(world: World, scale: number, zoom: number, selected: string | null, armyId: string | null, mode:PoliticalView='political',units?:UnitAssignments): void {
    for (const child of this.layer.removeChildren()) child.destroy({ children: true });
    const g = new Graphics(), marks = new Graphics(); this.layer.addChild(g, marks);
    const nations = new Map(world.nations.map(n => [n.id, n])), provinces = new Map(world.provinces.map(p => [p.id, p]));
    const pixel = 1 / zoom, style=politicalStyle(mode);
    const territoryKey=`${world.custom?.id}/${world.provinces.map(p=>`${p.id}:${p.controller}`).join('|')}`;
    if(territoryKey!==this.territoryKey){this.territoryKey=territoryKey;this.territories=territoryLabels(world);}
    const borders = new Map<string, { a: { x:number;y:number }; b: {x:number;y:number}; owner:string; shared:boolean; foreign:boolean }>();
    for (const p of world.provinces) {
      g.poly(p.polygon.flatMap(v => [v.x / scale, v.y / scale])).fill({ color: nationColor(nations.get(p.controller)!), alpha: style.fill });
      if(zoom>.6)g.stroke({ color: 0x303e37, alpha: style.province, width: .55 * pixel });
      if (p.id === selected) g.poly(p.polygon.flatMap(v => [v.x / scale, v.y / scale])).stroke({ color: 0xffe7a7, width: 2.5 * pixel });
      for(let i=0;i<p.polygon.length;i++) {const a=p.polygon[i],b=p.polygon[(i+1)%p.polygon.length],ka=`${a.x},${a.y}`,kb=`${b.x},${b.y}`,key=ka<kb?`${ka}/${kb}`:`${kb}/${ka}`,old=borders.get(key);if(old){old.shared=true;old.foreign=old.owner!==p.controller;}else borders.set(key,{a,b,owner:p.controller,shared:false,foreign:false});}
    }
    for(const edge of borders.values())if(edge.foreign){
      g.moveTo(edge.a.x/scale,edge.a.y/scale).lineTo(edge.b.x/scale,edge.b.y/scale).stroke({color:0xfff5db,width:(style.border+1.5)*pixel,alpha:.8});
      g.moveTo(edge.a.x/scale,edge.a.y/scale).lineTo(edge.b.x/scale,edge.b.y/scale).stroke({color:0x35453a,width:style.border*pixel,alpha:.9});
    }
    const label = (text: string, x: number, y: number, size: number, color = '#f9f1d4') => {
      const t = new Text({ text, style: { fontFamily: 'Georgia, serif', fontSize: size, fill: color, fontWeight: 'bold', stroke: { color: '#263d40', width: 3 } } });
      t.anchor.set(.5, 1); t.scale.set(pixel); t.position.set(x, y); this.layer.addChild(t);
    };
    const countryLabels=this.territories.map(territory=>{
      const n=nations.get(territory.nationId)!,size=Math.max(13,Math.min(27,territory.clearance/scale*zoom*.65));
      const t=new Text({text:n.name,style:{fontFamily:'Georgia, "Microsoft YaHei", serif',fontSize:size,fill:'#263a30',fontWeight:'bold',stroke:{color:'#fffae5',width:2},letterSpacing:2}});
      t.anchor.set(.5);t.scale.set(pixel);t.position.set(territory.point.x/scale,territory.point.y/scale);t.alpha=mode==='political'?.94:.7;this.layer.addChild(t);
      return {point:territory.point,size,width:n.name.length*(size+2)};
    });
    for (const city of world.cities) {
      const capital = world.nations.find(n => n.capitalId === city.id), x = city.position.x / scale, y = city.position.y / scale;
      if(capital)marks.poly([x,y-5*pixel,x+5*pixel,y,x,y+5*pixel,x-5*pixel,y]).fill(0xffdd87).stroke({width:1*pixel,color:0x38453e});
      else marks.circle(x, y, 2.5 * pixel).fill(0xf0e5cc).stroke({width:1*pixel,color:0x38453e});
      if(capital||zoom>.6){
        const near=countryLabels.find(c=>Math.abs(c.point.x-city.position.x)/scale*zoom<(c.width+city.name.length*12)/2&&Math.abs(c.point.y-city.position.y)/scale*zoom<c.size+20);
        const offset=near?Math.max(8,(city.position.y-near.point.y)/scale*zoom+near.size/2+8):7;
        label(city.name,x,y-offset*pixel,capital?12:11);
      }
    }
    // Near view resolves actual local names. A countryside province is not
    // presented as an invented city merely to fill the map with settlements.
    const cityProvinces=new Set(world.cities.map(c=>c.provinceId));
    for(const p of world.provinces){
      if(cityProvinces.has(p.id))continue;
      const area=Math.abs(p.polygon.reduce((sum,a,i)=>{const b=p.polygon[(i+1)%p.polygon.length];return sum+a.x*b.y-b.x*a.y;},0))/2;
      if(area*(zoom/scale)**2<2400&&p.id!==selected)continue;
      const x=p.center.x/scale,y=p.center.y/scale;
      if(countryLabels.some(c=>Math.abs(c.point.x-p.center.x)/scale*zoom<(c.width+p.name.length*10)/2&&Math.abs(c.point.y-p.center.y)/scale*zoom<c.size+14))continue;
      label(p.name,x,y-5*pixel,10,'#e2e9cb');
    }
    for (const army of world.armies) {
      if (army.status === 'destroyed') continue;
      const p = provinces.get(army.provinceId)!, marker = armyMarkerPoint(world, army, scale, { x:0, y:0, scale:zoom });
      const x = marker.x / zoom, y = marker.y / zoom;
      const unit=units?unitProfile(units[army.id]):undefined,texture=unit&&this.textures.get(unit.key);
      if(unit){
        marks.roundRect(x-16*pixel,y-17*pixel,32*pixel,32*pixel,5*pixel).fill({color:nationColor(nations.get(army.nationId)!),alpha:.96}).stroke({color:army.id===armyId?0xffefbc:0x33493e,width:(army.id===armyId?2.5:1.2)*pixel});
        if(texture){const sprite=new Sprite(texture);sprite.anchor.set(.5);sprite.width=24*pixel;sprite.height=24*pixel;sprite.position.set(x,y-2*pixel);this.layer.addChild(sprite);}
        else label(unit.name,x,y,10);
        label(String(army.troops),x,y+27*pixel,10);
        if(army.status==='marching'||army.status==='retreating')marks.poly([x+13*pixel,y-12*pixel,x+20*pixel,y-8*pixel,x+13*pixel,y-4*pixel]).fill(army.status==='retreating'?0xfacba0:0xfff8d6);
      }else{
        marks.roundRect(x - 13 * pixel, y - 7 * pixel, 26 * pixel, 14 * pixel, 3 * pixel).fill(nationColor(nations.get(army.nationId)!)).stroke({ color: army.id === armyId ? 0xffefbc : 0xede6cf, width: (army.id === armyId ? 2 : 1) * pixel });
        label(`${(army.troops / 1000).toFixed(1)}k`, x, y + 6 * pixel, 10);
      }
      if (army.id === armyId && army.route.length) {
        marks.moveTo(p.center.x / scale, p.center.y / scale);
        for (const id of army.route) { const next = provinces.get(id)!; marks.lineTo(next.center.x / scale, next.center.y / scale); }
        marks.stroke({ color: 0xfff0b0, width: 2 * pixel, alpha: .9 });
      }
    }
  }
}
