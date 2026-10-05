import { Container, Graphics, Text } from 'pixi.js';
import type { World } from '../../sim/types';
import { armyMarkerPoint } from './navigation';
import { nationColor, politicalStyle, type PoliticalView } from './politics';

export class PlayMap {
  readonly layer = new Container();
  draw(world: World, scale: number, zoom: number, selected: string | null, armyId: string | null, mode:PoliticalView='political'): void {
    for (const child of this.layer.removeChildren()) child.destroy({ children: true });
    const g = new Graphics(), marks = new Graphics(); this.layer.addChild(g, marks);
    const nations = new Map(world.nations.map(n => [n.id, n])), provinces = new Map(world.provinces.map(p => [p.id, p]));
    const pixel = 1 / zoom, style=politicalStyle(mode);
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
    for (const city of world.cities) {
      const capital = world.nations.find(n => n.capitalId === city.id), x = city.position.x / scale, y = city.position.y / scale;
      marks.circle(x, y, (capital ? 4.5 : 2.5) * pixel).fill(capital ? 0xffdd87 : 0xf0e5cc).stroke({ width: 1 * pixel, color: 0x38453e });
      if (capital) label(`${capital.name} · ${city.name}`, x, y - 7 * pixel, 13);
      else if (zoom > .6) label(city.name, x, y - 5 * pixel, 11);
    }
    for (const army of world.armies) {
      if (army.status === 'destroyed') continue;
      const p = provinces.get(army.provinceId)!, marker = armyMarkerPoint(world, army, scale, { x:0, y:0, scale:zoom });
      const x = marker.x / zoom, y = marker.y / zoom;
      marks.roundRect(x - 13 * pixel, y - 7 * pixel, 26 * pixel, 14 * pixel, 3 * pixel).fill(nationColor(nations.get(army.nationId)!)).stroke({ color: army.id === armyId ? 0xffefbc : 0xede6cf, width: (army.id === armyId ? 2 : 1) * pixel });
      label(`${(army.troops / 1000).toFixed(1)}k`, x, y + 6 * pixel, 10);
      if (army.id === armyId && army.route.length) {
        marks.moveTo(p.center.x / scale, p.center.y / scale);
        for (const id of army.route) { const next = provinces.get(id)!; marks.lineTo(next.center.x / scale, next.center.y / scale); }
        marks.stroke({ color: 0xfff0b0, width: 2 * pixel, alpha: .9 });
      }
    }
  }
}
