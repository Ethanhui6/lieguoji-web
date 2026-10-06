import { assertFmsRun, type FmsRun } from './world';
import type { PlayVersion } from './session';
import { originalStatePalette } from './politics';
import { namedWorld } from './names';

export type IdentityEdit = { kind:'nation'|'city'|'province'|'army'|'world'; id:string; name:string; color?:string };
export type CustomizeCommand = { type:'customize'; runId:string; expected:PlayVersion; edits:IdentityEdit[] };

/** An explicit paused editor transaction over existing identity fields. No
 * simulation formula, entity reference, geometry or old archive is changed. */
export function customizeRun(source:FmsRun, command:CustomizeCommand):FmsRun {
  if(source.id!==command.runId || command.expected.day!==source.world.day || command.expected.nextEventId!==source.world.nextEventId ||
    (source.version>=4 && command.expected.tick!==(source as Extract<FmsRun,{version:4|5|6|7}>).clock.tick)) throw Error('世界已经变化，请重新打开编辑。');
  if(!Array.isArray(command.edits)||command.edits.length<1||command.edits.length>32)throw Error('请一次修改 1—32 项名称。');
  const next=structuredClone(source), seen=new Set<string>(), changes:string[]=[];
  const displayed=namedWorld(source.world);
  const changedCountries=new Set(command.edits.filter(e=>e.kind==='nation').map(e=>e.id));
  const changedProvinces=new Set(command.edits.filter(e=>e.kind==='province').map(e=>e.id));
  // Materialize only exact legacy aliases whose matching owner/province is
  // about to change. Other entities and historical prose are never rewritten.
  for(const p of next.world.provinces){if(changedCountries.has(p.legalOwner)){const visible=displayed.provinces.find(v=>v.id===p.id)!;if(visible.name!==p.name)p.name=visible.name;changedProvinces.add(p.id);}}
  for(const c of next.world.cities)if(changedProvinces.has(c.provinceId)){const visible=displayed.cities.find(v=>v.id===c.id)!;if(visible.name!==c.name)c.name=visible.name;}
  for(const edit of command.edits){
    if(!edit || Object.keys(edit).some(k=>!['kind','id','name','color'].includes(k)) || typeof edit.name!=='string' || typeof edit.id!=='string')throw Error('编辑字段无效。');
    const name=edit.name.trim(), key=`${edit.kind}/${edit.id}`;
    if(!name || [...name].length>24 || [...name].some(c=>c.charCodeAt(0)<32||c.charCodeAt(0)===127) || seen.has(key))throw Error('名称需要 1—24 个字，不能包含控制字符或重复编辑项。');
    seen.add(key);
    const w=next.world;
    const target=edit.kind==='nation'?w.nations.find(n=>n.id===edit.id):edit.kind==='city'?w.cities.find(c=>c.id===edit.id):edit.kind==='province'?w.provinces.find(p=>p.id===edit.id):edit.kind==='army'?w.armies.find(a=>a.id===edit.id):edit.kind==='world'&&edit.id===source.id?w.custom:undefined;
    if(!target)throw Error('要编辑的对象已经不存在。');
    // Exact legacy placeholders are reserved by the old display adapter.
    if(/·\d+区$/.test(name)|| (edit.kind==='city' && w.nations.some(n=>name===`${n.name}京`||new RegExp(`^${n.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\d+城$`).test(name))))throw Error('这个名称属于旧版自动占位格式，请使用独立地名。');
    if(edit.color!==undefined){if(edit.kind!=='nation'||!originalStatePalette.some(c=>c===edit.color))throw Error('请选择色板中的国家颜色。');const n=w.nations.find(n=>n.id===edit.id)!;if(n.color!==edit.color){n.color=edit.color;changes.push(`${name}更换国色`);}}
    if(target.name!==name){changes.push(`${target.name} → ${name}`);target.name=name;}
  }
  if(!changes.length)throw Error('名称与颜色没有变化。');
  next.world.events.push({id:next.world.nextEventId++,day:next.world.day,kind:'system',text:changes.join('；'),reason:'玩家暂停时间后编辑名称与国色；人口、领土、兵力和历史事件保持原样。'});
  next.world.events=next.world.events.slice(-160);
  assertFmsRun(next);
  return next;
}
