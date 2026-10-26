import {useSyncExternalStore} from 'react';

/** Original DisplaySettings (显示设置) that only change how the map is drawn, per viewer:
 * 国名缩放 StateNameScaleSlider, 国名颜色 StateNameColorImage, 显示完整国名 DisplayFullNameToggle,
 * 城市缩放 BurgCityLabelScaleSlider, 军队图标缩放 ArmyLabelScaleSlider, 时间显示 / 事件显示
 * (IsDisplayTime / IsDisplayMajorEvent). Defaults draw the map exactly as before. */
export type DisplaySettings47={stateNameScale:number;stateNameColor:string;fullName:boolean;cityScale:number;armyScale:number;timeDisplay:boolean;eventDisplay:boolean;provinceBorderColor:string;provinceBorders:boolean;cityNames:boolean;biomeIcons:boolean;stateOpacity:number|null};
export const DISPLAY_DEFAULTS47:DisplaySettings47={stateNameScale:1,stateNameColor:'#000000',fullName:true,cityScale:1,armyScale:1,timeDisplay:true,eventDisplay:true,provinceBorderColor:'#303e37',provinceBorders:true,cityNames:true,biomeIcons:true,stateOpacity:null};
export const DISPLAY_SCALE_RANGE47={min:.5,max:2,step:.05};
const KEY='lieguoji-display-v1';
const clamp=(n:unknown)=>typeof n==='number'&&Number.isFinite(n)?Math.min(DISPLAY_SCALE_RANGE47.max,Math.max(DISPLAY_SCALE_RANGE47.min,n)):1;
const color=(v:unknown,fallback:string)=>typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v)?v:fallback;
/** Missing fields from older preferences retain the previous appearance; invalid storage never reaches Pixi. */
export function normalizeDisplaySettings47(value:unknown):DisplaySettings47{
  const v=(value&&typeof value==='object'?value:{}) as Partial<DisplaySettings47>;
  return {stateNameScale:clamp(v.stateNameScale),stateNameColor:color(v.stateNameColor,'#000000'),fullName:v.fullName!==false,cityScale:clamp(v.cityScale),armyScale:clamp(v.armyScale),timeDisplay:v.timeDisplay!==false,eventDisplay:v.eventDisplay!==false,provinceBorderColor:color(v.provinceBorderColor,'#303e37'),provinceBorders:v.provinceBorders!==false,cityNames:v.cityNames!==false,biomeIcons:v.biomeIcons!==false,stateOpacity:typeof v.stateOpacity==='number'&&Number.isFinite(v.stateOpacity)?Math.max(0,Math.min(1,v.stateOpacity)):null};
}
function read():DisplaySettings47{
  try{
    return normalizeDisplaySettings47(JSON.parse(localStorage.getItem(KEY)??'null'));
  }catch{return DISPLAY_DEFAULTS47;}
}
let current=read();const listeners=new Set<()=>void>();
export const displaySettings47=()=>current;
export function setDisplaySettings47(patch:Partial<DisplaySettings47>){
  current=normalizeDisplaySettings47({...current,...patch});try{localStorage.setItem(KEY,JSON.stringify(current));}catch{/* private mode: keep for this visit */}
  for(const l of listeners)l();
}
const subscribe=(l:()=>void)=>{listeners.add(l);return ()=>{listeners.delete(l);};};
export const useDisplaySettings47=()=>useSyncExternalStore(subscribe,displaySettings47,displaySettings47);
