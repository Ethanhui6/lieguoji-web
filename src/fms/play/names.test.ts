import { expect,it } from 'vitest';
import { createWorld } from '../../sim/demo';
import { namedWorld,worldNames } from './names';
import { nationColor,originalStatePalette,statePalette } from './politics';

it('draws 1000 distinct source place names with stable seeded ordering and no numeric suffixes',()=>{
  const first=worldNames('one',1000);expect(first).toEqual(worldNames('one',1000));expect(first).not.toEqual(worldNames('two',1000));
  expect(new Set(first.places).size).toBe(1000);expect(new Set(first.countries).size).toBe(171);
  expect(first.places.every(n=>!/[0-9]/.test(n))).toBe(true);expect(()=>worldNames('one',1001)).toThrow();
});
it('displays old numeric placeholders consistently without mutating saved entities or event text',()=>{
  const w=createWorld();w.custom={id:'fms-test',seed:'seed',name:'旧世界',rivers:[]};
  const p=w.provinces[0],c=w.cities[0],n=w.nations[0];p.id='p-0';p.legalOwner=n.id;p.name=`${n.name}·1区`;c.id='c-0';c.provinceId=p.id;c.name=`${n.name}1城`;
  w.events=[{id:1,day:0,kind:'battle',text:`${p.name}交战：记录`,reason:`${c.name}周边`}];
  const before=structuredClone(w),view=namedWorld(w);
  expect(w).toEqual(before);expect(view.provinces[0].name).toBe(worldNames('seed',1).places[0]);
  expect(view.cities[0].name).toBe(view.provinces[0].name);expect(view.events[0].text).toBe(`${view.provinces[0].name}交战：记录`);expect(view.events[0].reason).toBe(`${view.cities[0].name}周边`);
  expect(namedWorld(w)).toBe(view);
});
it('preserves player chosen labels and colors',()=>{
  const w=createWorld(),before=structuredClone(w);expect(namedWorld(w)).toEqual(before);
  expect(nationColor({id:'n-0',color:'#123456'})).toBe('#123456');expect(nationColor({id:'n-0',color:'#537f95'})).toBe('#80b1d3');
  expect(new Set(statePalette).size).toBe(8);expect(statePalette.every(c=>originalStatePalette.includes(c))).toBe(true);
});
