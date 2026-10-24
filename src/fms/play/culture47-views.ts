import type {FoundingForces47} from './civilization47-forces';
import {allianceOf46} from './war46-alliance';
import {houseTitle47} from './civilization47-houses';
import {nationColor} from './politics';
import {CULTURE_IDS47,CULTURES47,RELIGIONS47,type CultureId47,type ReligionId47} from './civilization47-catalog';
import {DotNetRandom} from './native-economy/dotnet-random';

/** Original ViewManager.ColorViewMode, switched with keys 1–6
 * (PlayerController.DebugViewModeSwitch): 1 国家视图, 2 联盟视图, 3 文化视图,
 * 4 家族视图, 5 宗教视图, 6 区域视图. Names are the original StateView/AllianceView/... texts.
 * Province colours follow MaterialManager.GetColorForViewMode 0x3EC240:
 * - Normal: the state colour;
 * - Alliance: the alliance colour (AssignInitialColorFromStrongestState: the colour of its
 *   strongest member), the state colour outside alliances;
 * - Culture / Religion: the colour of the province's culture / main religion, white without;
 * - Family: the controlling family's colour, white without;
 * - District: not restored (the web has no districts yet).
 * Labels and borders follow ViewManager.Update*LabelsAndBorderVisibility: state names and
 * state borders only in the state view and, in the alliance view, for states outside an
 * alliance (State.SetStateLabelTriggerCheck); every other view shows the names and borders
 * of its own groups instead.
 * Colours: families use FamilyManager's palette (cctor 0x873680) with GetNextFamilyColor's
 * HSV jitter; the web's cultures and religions are its own real-world set, not the original's
 * data files, so they take the same palette in catalogue order. */
export type ColorView47='state'|'alliance'|'culture'|'family'|'religion'|'district';
export const COLOR_VIEWS47:readonly {id:ColorView47;key:string;label:string;available:boolean}[]=[
  {id:'state',key:'1',label:'国家视图',available:true},
  {id:'alliance',key:'2',label:'联盟视图',available:true},
  {id:'culture',key:'3',label:'文化视图',available:true},
  {id:'family',key:'4',label:'家族视图',available:true},
  {id:'religion',key:'5',label:'宗教视图',available:true},
  {id:'district',key:'6',label:'区域视图',available:false},
];
export const FAMILY_PALETTE47=['#dababf','#fb8072','#80b1d3','#fdb462','#b3de69','#fccde5','#c6b9c1','#bc80bd','#ccebc5','#ffed6f','#8dd3c7','#eb8de7','#FF9FAF','#68C3DB','#F7C3C7','#F5E14D','#FC61B3','#A7A7FF','#70DB8E','#E6B03F','#8AB821','#C19D83','#ACDEC4','#E3CDA5','#BA7AE2','#66c2a5','#fc8d62','#8da0cb','#e78ac3','#a6d854','#ffd92f','#e5c494','#b3b3b3'] as const;
const WHITE=0xffffff;
const hex=(s:string)=>Number.parseInt(s.replace('#',''),16);
/** GetNextFamilyColor: palette[index] with hue ±0.03, saturation ±0.05 and value ±0.05
 * drawn from System.Random (the web seeds it with the family id). */
export function familyColor47(familyId:number){
  const c=hex(FAMILY_PALETTE47[((familyId%FAMILY_PALETTE47.length)+FAMILY_PALETTE47.length)%FAMILY_PALETTE47.length]);
  const r=(c>>16&255)/255,g=(c>>8&255)/255,b=(c&255)/255,max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;
  let h=0;if(d>0)h=(max===r?((g-b)/d)%6:max===g?(b-r)/d+2:(r-g)/d+4)/6;if(h<0)h+=1;
  const random=new DotNetRandom(familyId);
  const hh=((h+random.nextDouble()*.06-.03)%1+1)%1,s=Math.min(1,Math.max(0,(max?d/max:0)+random.nextDouble()*.1-.05)),v=Math.min(1,Math.max(0,max+random.nextDouble()*.1-.05));
  const i=Math.floor(hh*6),f=hh*6-i,p=v*(1-s),q=v*(1-s*f),t=v*(1-s*(1-f));
  const [R,G,B]=[[v,t,p],[q,v,p],[p,v,t],[p,q,v],[t,p,v],[v,p,q]][i%6];
  return Math.round(R*255)<<16|Math.round(G*255)<<8|Math.round(B*255);
}
export const cultureColor47=(id:CultureId47)=>hex(FAMILY_PALETTE47[CULTURE_IDS47.indexOf(id)%FAMILY_PALETTE47.length]);
export const religionColor47=(id:string)=>{const keys=Object.keys(RELIGIONS47);const i=keys.indexOf(id);return id==='none'||i<0?WHITE:hex(FAMILY_PALETTE47[(i-1)%FAMILY_PALETTE47.length]);};

type Families={families:Record<string,{surname?:string}>};
/** Province → its group in the current view: the group key, display name and colour. The
 * state view returns null (state labels and borders as usual). */
export type ViewGroups47={key:(index:number)=>string|null;name:(key:string)=>string;color:(key:string)=>number;state:(key:string)=>boolean};
export function viewGroups47(r:FoundingForces47,view:ColorView47):ViewGroups47|null{
  if(view==='state'||view==='district')return null;
  const nations=new Map(r.world.nations.map(n=>[n.id,n])),cityOf=new Map(r.world.cities.map(c=>[c.provinceId,c.id]));
  const kin=(r as unknown as {kin?:Families}).kin;
  const nobles=(r as {nobility?:{families:Record<string,{controlledProvinces:string[];nationId:string}>}}).nobility,holder=new Map<string,string>();
  if(nobles)for(const [id,fam] of Object.entries(nobles.families))for(const p of fam.controlledProvinces)holder.set(p,id);
  const alliances=new Map<string,{id:number;name:string;members:string[]}>();
  const province=(i:number)=>r.world.provinces[i];
  if(view==='alliance')return {
    key:i=>{const p=province(i);if(!p)return null;const a=allianceOf46(r,p.controller);if(!a)return 'state:'+p.controller;alliances.set('alliance:'+a.id,a);return 'alliance:'+a.id;},
    name:k=>k.startsWith('state:')?nations.get(k.slice(6))?.name??'':alliances.get(k)?.name??'',
    color:k=>{
      if(k.startsWith('state:'))return hex(nationColor(nations.get(k.slice(6))!));
      const a=alliances.get(k)!,owned=(id:string)=>r.world.provinces.filter(p=>p.controller===id).length;
      const strongest=[...a.members].sort((x,y)=>owned(y)-owned(x))[0];return hex(nationColor(nations.get(strongest)!));
    },
    state:k=>k.startsWith('state:'),
  };
  if(view==='culture')return {
    key:i=>{const p=province(i);if(!p)return null;const city=cityOf.get(p.id),c=city?r.civilization.cities[city]?.cultureId:r.civilization.nations[p.controller]?.cultureId;return c?'culture:'+c:null;},
    name:k=>CULTURES47[k.slice(8) as CultureId47]?.label??'',color:k=>cultureColor47(k.slice(8) as CultureId47),state:()=>false,
  };
  if(view==='religion')return {
    key:i=>{const p=province(i);if(!p)return null;const id=r.civilization.nations[p.controller]?.religionId;return id&&id!=='none'?'religion:'+id:null;},
    name:k=>RELIGIONS47[k.slice(9) as ReligionId47]??'',color:k=>religionColor47(k.slice(9)),state:()=>false,
  };
  const familyName=(id:string)=>{const surname=kin?.families[id]?.surname;return surname?`${surname}家族`:'';};
  return {
    key:i=>{const p=province(i);if(!p)return null;if(nobles){const id=holder.get(p.id);return id===undefined?null:'family:'+id;}const id=houseTitle47(r,p.id);return id===null?null:'family:'+id;},
    name:k=>familyName(k.slice(7)),color:k=>familyColor47(Number(k.slice(7))),state:()=>false,
  };
}
/** Province index → fill colour for the current view (MaterialManager.GetColorForViewMode). */
export function provinceColors47(r:FoundingForces47,view:ColorView47):(index:number)=>number|null{
  const nations=new Map(r.world.nations.map(n=>[n.id,hex(nationColor(n))]));
  const groups=viewGroups47(r,view);
  return i=>{
    const p=r.world.provinces[i];if(!p)return null;
    if(!groups)return nations.get(p.controller)??null;
    const k=groups.key(i);return k===null?WHITE:groups.color(k);
  };
}
/** Key fragment so the renderer recolors only when the view's inputs change. */
export function colorViewKey47(r:FoundingForces47,view:ColorView47):string{
  if(view==='alliance')return JSON.stringify(r.alliances.records.filter(a=>a.endedTick===null).map(a=>[a.id,a.members]));
  if(view==='family'&&(r as {nobility?:unknown}).nobility)return JSON.stringify(Object.entries((r as unknown as {nobility:{families:Record<string,{controlledProvinces:string[]}>}}).nobility.families).map(([id,f])=>[id,f.controlledProvinces]));
  if(view==='family')return JSON.stringify(r.houses?.grants.length??0)+'/'+JSON.stringify(r.houseGovernance?.returns.length??0);
  if(view==='religion')return r.world.nations.map(n=>r.civilization.nations[n.id]?.religionId).join(',');
  if(view==='culture')return String(r.civilization.revision)+'/'+r.world.nations.map(n=>r.civilization.nations[n.id]?.cultureId).join(',');
  return '';
}
