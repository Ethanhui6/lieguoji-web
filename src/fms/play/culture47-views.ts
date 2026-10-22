import type {FoundingForces47} from './civilization47-forces';
import {allianceOf46} from './war46-alliance';
import {houseTitle47} from './civilization47-houses';
import {nationColor} from './politics';

/** Original ViewManager.ColorViewMode, switched with keys 1–6
 * (PlayerController.DebugViewModeSwitch): 1 国家视图, 2 联盟视图, 3 文化视图,
 * 4 家族视图, 5 宗教视图, 6 区域视图. Names are the original
 * StateView/AllianceView/... texts. Colors here are web palettes; the web has
 * no districts, and religion is held per state, not per province. */
export type ColorView47='state'|'alliance'|'culture'|'family'|'religion'|'district';
export const COLOR_VIEWS47:readonly {id:ColorView47;key:string;label:string;available:boolean}[]=[
  {id:'state',key:'1',label:'国家视图',available:true},
  {id:'alliance',key:'2',label:'联盟视图',available:true},
  {id:'culture',key:'3',label:'文化视图',available:true},
  {id:'family',key:'4',label:'家族视图',available:true},
  {id:'religion',key:'5',label:'宗教视图',available:true},
  {id:'district',key:'6',label:'区域视图',available:false},
];
const PALETTE=[0xc9574a,0x4f8fc0,0x7dab4f,0xd1a23c,0x8e63b0,0x3fa69a,0xc77aa8,0x8a7a52,0x5b6fb5,0xb0703a,0x6c9a3a,0xa64b6d];
function hash(s:string){let h=2166136261;for(const c of s)h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;}
const pick=(key:string)=>PALETTE[hash(key)%PALETTE.length];
const NEUTRAL=0xd8cfb8;
/** Province index → fill color for the current view (null: no fill). */
export function provinceColors47(r:FoundingForces47,view:ColorView47):(index:number)=>number|null{
  const nations=new Map(r.world.nations.map(n=>[n.id,Number.parseInt(nationColor(n).slice(1),16)]));
  const cityOf=new Map(r.world.cities.map(c=>[c.provinceId,c.id]));
  // Original-family worlds: Province.controllingFamilyId from the family ledger.
  const nobles=(r as {nobility?:{families:Record<string,{controlledProvinces:string[]}>}}).nobility,holder=new Map<string,string>();
  if(nobles)for(const [id,fam] of Object.entries(nobles.families))for(const p of fam.controlledProvinces)holder.set(p,id);
  return i=>{
    const p=r.world.provinces[i];if(!p)return null;
    if(view==='state'||view==='district')return nations.get(p.controller)??null;
    if(view==='alliance'){const a=allianceOf46(r,p.controller);return a?pick('alliance/'+a.id):nations.get(p.controller)??null;}
    if(view==='culture'){const city=cityOf.get(p.id),culture=city?r.civilization.cities[city]?.cultureId:undefined;return culture?pick('culture/'+culture):NEUTRAL;}
    if(view==='family'&&nobles){const id=holder.get(p.id);return id===undefined?NEUTRAL:pick('family/'+id);}
    if(view==='family'){const id=houseTitle47(r,p.id);return id===null?NEUTRAL:pick('family/'+id);}
    const religion=r.civilization.nations[p.controller]?.religionId;return religion?pick('religion/'+religion):NEUTRAL;
  };
}
/** Key fragment so the renderer recolors only when the view's inputs change. */
export function colorViewKey47(r:FoundingForces47,view:ColorView47):string{
  if(view==='alliance')return JSON.stringify(r.alliances.records.filter(a=>a.endedTick===null).map(a=>[a.id,a.members]));
  if(view==='family'&&(r as {nobility?:unknown}).nobility)return JSON.stringify(Object.entries((r as unknown as {nobility:{families:Record<string,{controlledProvinces:string[]}>}}).nobility.families).map(([id,f])=>[id,f.controlledProvinces]));
  if(view==='family')return JSON.stringify(r.houses?.grants.length??0)+'/'+JSON.stringify(r.houseGovernance?.returns.length??0);
  if(view==='religion')return r.world.nations.map(n=>r.civilization.nations[n.id]?.religionId).join(',');
  if(view==='culture')return String(r.civilization.revision);
  return '';
}
