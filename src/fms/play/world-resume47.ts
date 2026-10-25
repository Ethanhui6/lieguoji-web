/** Per-tab memory that a world is open. Phone browsers reload a tab they evicted for memory
 * (iOS does this while the page is visible, with no hide event); the reloaded tab returns to
 * that world and continues its newest save instead of stopping in the map editor, where
 * creating a new world could replace it. sessionStorage survives such a reload but not a
 * closed tab. */
const OPEN='lieguoji-world-open',RESUME='lieguoji-world-resume';
const store=()=>{try{return window.sessionStorage;}catch{return null;}};
export function markWorldOpen47(open:boolean){try{if(open)store()?.setItem(OPEN,'1');else{store()?.removeItem(OPEN);store()?.removeItem(RESUME);}}catch{/* convenience only */}}
export const worldWasOpen47=()=>{try{return store()?.getItem(OPEN)==='1';}catch{return false;}};
export function resumeWorld47(){try{store()?.setItem(RESUME,'1');}catch{/* convenience only */}}
/** True once for the world screen opened by an automatic return. */
export function takeWorldResume47(){try{const s=store();if(s?.getItem(RESUME)!=='1')return false;s.removeItem(RESUME);return true;}catch{return false;}}
