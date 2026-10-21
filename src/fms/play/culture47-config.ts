/** Original ConfigManager values that live outside a world: the autosave
 * switch (off by default, GameConfig.isEnableAutoSave) and interval
 * (AutoSaveManager: default 10, 5–60 minutes). Kept per browser. */
export type Culture47Config={autoSave:boolean;autoSaveMinutes:number};
export const AUTOSAVE_MIN_MINUTES=5,AUTOSAVE_MAX_MINUTES=60,AUTOSAVE_DEFAULT_MINUTES=10;
const KEY='lieguoji-fms-config-v1';
export const DEFAULT_CULTURE47_CONFIG:Culture47Config={autoSave:false,autoSaveMinutes:AUTOSAVE_DEFAULT_MINUTES};
export const clampAutoSaveMinutes=(n:number)=>Math.min(AUTOSAVE_MAX_MINUTES,Math.max(AUTOSAVE_MIN_MINUTES,Math.round(Number.isFinite(n)?n:AUTOSAVE_DEFAULT_MINUTES)));
export function readCulture47Config():Culture47Config{
  try{const v=JSON.parse(localStorage.getItem(KEY)??'null') as Partial<Culture47Config>|null;
    if(!v||typeof v!=='object')return {...DEFAULT_CULTURE47_CONFIG};
    return {autoSave:v.autoSave===true,autoSaveMinutes:clampAutoSaveMinutes(Number(v.autoSaveMinutes))};
  }catch{return {...DEFAULT_CULTURE47_CONFIG};}
}
export function writeCulture47Config(c:Culture47Config){try{localStorage.setItem(KEY,JSON.stringify({autoSave:c.autoSave,autoSaveMinutes:clampAutoSaveMinutes(c.autoSaveMinutes)}));}catch{/* per-browser convenience only */}}

/** AutoSaveManager.Update: real seconds count only while the game has
 * started; in the last 5 seconds a cancelable countdown is shown once per
 * second; ESC restarts the full interval; at the interval the save runs. */
export const AUTOSAVE_COUNTDOWN_SECONDS=5;
export type AutoSaveTick47={elapsed:number;countdown:number|null;due:boolean};
export function advanceAutoSave47(elapsed:number,deltaSeconds:number,minutes:number):AutoSaveTick47{
  const interval=Math.max(clampAutoSaveMinutes(minutes)*60,1),next=elapsed+Math.max(0,deltaSeconds);
  if(next>=interval)return {elapsed:0,countdown:null,due:true};
  const remaining=Math.ceil(interval-next);
  return {elapsed:next,countdown:remaining>=1&&remaining<=AUTOSAVE_COUNTDOWN_SECONDS?remaining:null,due:false};
}
