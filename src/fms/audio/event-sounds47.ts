/** Web addition (the original has no sound effects): which cue a batch of new world events
 * plays. One cue per batch, the most important one; frequent siege fights are throttled by
 * the player. Classified from the event kind and the engine's own wording. */
export type GameCue47='war'|'peace'|'alliance'|'capture'|'annex'|'siege'|'mobilize'|'fall';
const PRIORITY47:readonly GameCue47[]=['war','fall','capture','peace','alliance','mobilize','annex','siege'];
/** Least real milliseconds between two plays of a cue. Minor cues (frequent at high speed)
 * also share one gap so a busy war stays a background texture, not a din. */
export const CUE_GAP47:Record<GameCue47,number>={war:600,fall:600,peace:600,alliance:600,capture:1500,mobilize:5000,annex:5000,siege:8000};
export const MINOR_CUES47:ReadonlySet<GameCue47>=new Set(['mobilize','annex','siege']);
export const MINOR_GAP47=3000;
type Event={kind:string;text:string};
export function cueOf47(e:Event):GameCue47|null{
  const t=e.text;
  if(e.kind==='diplomacy'&&t.includes('宣战'))return 'war';
  if(t.includes('灭亡'))return 'fall';
  if(e.kind==='occupation')return t.includes('攻下')?'capture':'annex';
  if(/停战|战胜|议和|和约/.test(t))return 'peace';
  if(t.includes('结成联盟'))return 'alliance';
  if(t.includes('紧急动员'))return 'mobilize';
  if(e.kind==='battle'&&t.includes('争夺城防'))return 'siege';
  return null;
}
export function batchCue47(events:readonly Event[]):GameCue47|null{
  let best:GameCue47|null=null;
  for(const e of events){const c=cueOf47(e);if(c&&(best===null||PRIORITY47.indexOf(c)<PRIORITY47.indexOf(best)))best=c;}
  return best;
}
