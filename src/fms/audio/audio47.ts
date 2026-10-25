import deplasaPe from './music/deplasa-pe.m4a';
import finalStance from './music/final-stance.m4a';
import guildOfAdventurers from './music/guild-of-adventurers.m4a';
import landOfHeroes from './music/land-of-heroes.m4a';
import wondersAndMysteriesAlt from './music/wonders-and-mysteries-alt.m4a';
import {BGM_VOLUME47,MusicPlan47,type MusicStep47,type MusicTrack47} from './music-plan47';
import {useSyncExternalStore} from 'react';
import {playCue47,type Cue47} from './sfx47';

const URLS47:Record<MusicTrack47,string>={'deplasa-pe':deplasaPe,'final-stance':finalStance,'guild-of-adventurers':guildOfAdventurers,'land-of-heroes':landOfHeroes,'wonders-and-mysteries-alt':wondersAndMysteriesAlt};

/** Per-browser audio settings: music volume is the original SettingsUIInfo.volumeSlider
 * (RandomMusicPlayer.SetVolume, 0–1, default bgmVolume 1); sound effects and vibration
 * are web additions. */
export type AudioSettings47={music:number;sfx:number;haptics:boolean};
export const DEFAULT_AUDIO47:AudioSettings47={music:BGM_VOLUME47,sfx:.6,haptics:true};
const KEY='lieguoji-audio-v1';
const unit=(n:unknown,fallback:number)=>typeof n==='number'&&Number.isFinite(n)?Math.min(1,Math.max(0,n)):fallback;
export function readAudio47():AudioSettings47{
  try{const v=JSON.parse(localStorage.getItem(KEY)??'null') as Partial<AudioSettings47>|null;if(!v||typeof v!=='object')return {...DEFAULT_AUDIO47};
    return {music:unit(v.music,DEFAULT_AUDIO47.music),sfx:unit(v.sfx,DEFAULT_AUDIO47.sfx),haptics:typeof v.haptics==='boolean'?v.haptics:DEFAULT_AUDIO47.haptics};
  }catch{return {...DEFAULT_AUDIO47};}
}

type Ctor=typeof AudioContext;
/** One audio engine for the page. The browser allows sound only after a user gesture, so
 * the music starts on the first tap or key press (the original starts it at launch). The
 * music is streamed through an <audio> element, routed into Web Audio so its volume also
 * works on iOS, and paused while the page is hidden. */
class GameAudio47{
  settings=readAudio47();
  private ctx:AudioContext|null=null;private musicGain:GainNode|null=null;private sfxGain:GainNode|null=null;
  private el:HTMLAudioElement|null=null;private plan=new MusicPlan47();
  private pending:MusicStep47|null=null;private timer=0;private started=false;private wantPlaying=false;
  private last=new Map<Cue47,number>();
  private listeners=new Set<(s:AudioSettings47)=>void>();

  unlock(){
    if(!this.ctx){
      const C=(window.AudioContext??(window as unknown as {webkitAudioContext?:Ctor}).webkitAudioContext) as Ctor|undefined;if(!C)return;
      try{this.ctx=new C();}catch{return;}
      this.sfxGain=this.ctx.createGain();this.sfxGain.gain.value=this.settings.sfx;this.sfxGain.connect(this.ctx.destination);
      this.musicGain=this.ctx.createGain();this.musicGain.gain.value=this.settings.music;this.musicGain.connect(this.ctx.destination);
      const el=new Audio();el.preload='auto';this.el=el;
      try{this.ctx.createMediaElementSource(el).connect(this.musicGain);}catch{/* plays at element volume */}
      el.addEventListener('ended',()=>this.step());
      el.addEventListener('error',()=>{if(!this.el?.src)return;window.clearTimeout(this.timer);this.timer=window.setTimeout(()=>this.step(),10000);});
      document.addEventListener('visibilitychange',()=>this.visibility());
    }
    if(this.ctx.state==='suspended')void this.ctx.resume().catch(()=>{});
    if(!this.started&&this.settings.music>0){this.started=true;this.step();}
    else if(this.wantPlaying&&this.el?.paused&&!document.hidden&&this.settings.music>0)void this.el.play().catch(()=>{});
  }
  private step(){
    const s=this.plan.next();this.pending=s;this.wantPlaying=false;
    window.clearTimeout(this.timer);this.timer=window.setTimeout(()=>this.play(),s.waitSeconds*1000);
  }
  private play(){
    const s=this.pending,el=this.el;if(!s||!el)return;
    if(document.hidden||this.settings.music<=0)return;
    this.pending=null;this.wantPlaying=true;el.src=URLS47[s.track];void el.play().catch(()=>{});
  }
  private visibility(){
    if(!this.el)return;
    if(document.hidden){window.clearTimeout(this.timer);if(!this.el.paused)this.el.pause();return;}
    if(this.ctx?.state==='suspended')void this.ctx.resume().catch(()=>{});
    if(this.settings.music<=0)return;
    if(this.wantPlaying)void this.el.play().catch(()=>{});
    else if(this.pending){window.clearTimeout(this.timer);this.timer=window.setTimeout(()=>this.play(),1000);}
  }
  update(next:Partial<AudioSettings47>){
    const before=this.settings;this.settings={...before,...next,music:unit(next.music??before.music,before.music),sfx:unit(next.sfx??before.sfx,before.sfx)};
    try{localStorage.setItem(KEY,JSON.stringify(this.settings));}catch{/* per-browser convenience only */}
    if(this.musicGain)this.musicGain.gain.value=this.settings.music;
    if(this.sfxGain)this.sfxGain.gain.value=this.settings.sfx;
    if(this.el&&this.settings.music<=0&&!this.el.paused)this.el.pause();
    if(this.settings.music>0&&before.music<=0&&this.ctx){
      if(!this.started){this.started=true;this.step();}
      else if(this.wantPlaying)void this.el?.play().catch(()=>{});
      else if(this.pending)this.play();
    }
    for(const l of this.listeners)l(this.settings);
  }
  subscribe(l:(s:AudioSettings47)=>void){this.listeners.add(l);return()=>{this.listeners.delete(l);};}
  /** `gap`: the least milliseconds between two plays of the same cue. */
  cue(cue:Cue47,gap=60){
    const ctx=this.ctx,out=this.sfxGain;if(!ctx||!out||this.settings.sfx<=0||document.hidden||ctx.state!=='running')return;
    const now=performance.now();if(now-(this.last.get(cue)??-Infinity)<gap)return;this.last.set(cue,now);
    try{playCue47(ctx,out,cue);}catch{/* sound is optional */}
  }
  haptic(ms=8){if(this.settings.haptics)try{navigator.vibrate?.(ms);}catch{/* unsupported */}}
  /** Test evidence only. */
  state(){return {context:this.ctx?.state??null,started:this.started,track:this.el?.src?this.el.src.split('/').pop():null,playing:!!this.el&&!this.el.paused,pending:this.pending,settings:this.settings};}
}
export const gameAudio47=new GameAudio47();
export const useAudio47=()=>useSyncExternalStore(l=>gameAudio47.subscribe(l),()=>gameAudio47.settings);

const SHEETS='.c47-map-menu,.c47-menu,.c47-ai-global,.c47-territory,.c47-panel,.c47-confirm,.c47-setup';
/** Page-wide control feedback: a tap for buttons, a two-tone tick for switches, a soft tick
 * while dragging sliders, and a paper swish when a sheet opens or closes (in place of the
 * tap). Installed once at startup. */
export function installGameAudio47(){
  const unlock=()=>gameAudio47.unlock();
  for(const type of ['pointerdown','keydown'])document.addEventListener(type,unlock,{capture:true,passive:true});
  let pendingTap=0,lastSlider=0;
  document.addEventListener('click',e=>{
    const t=e.target as Element|null,control=t?.closest?.('button,[role=button],summary,a[href],select');
    if(!control||(control as HTMLButtonElement).disabled||control.getAttribute('aria-disabled')==='true')return;
    gameAudio47.haptic();window.clearTimeout(pendingTap);pendingTap=window.setTimeout(()=>gameAudio47.cue('tap'),0);
  },{capture:true});
  document.addEventListener('change',e=>{
    const t=e.target as HTMLInputElement|null;if(t?.type!=='checkbox'&&t?.type!=='radio')return;
    window.clearTimeout(pendingTap);gameAudio47.haptic();gameAudio47.cue(t.checked?'toggle-on':'toggle-off');
  },{capture:true});
  document.addEventListener('input',e=>{
    const t=e.target as HTMLInputElement|null;if(t?.type!=='range')return;
    const now=performance.now();if(now-lastSlider<70)return;lastSlider=now;gameAudio47.cue('tick',0);
  },{capture:true});
  // React inserts the sheet element itself (or a thin wrapper); deep searches would cost on every render.
  const sheet=(nodes:NodeList)=>[...nodes].some(n=>n instanceof Element&&(n.matches(SHEETS)||[...n.children].some(c=>c.matches(SHEETS))));
  new MutationObserver(records=>{
    let open=false,close=false;for(const r of records){if(sheet(r.addedNodes))open=true;if(sheet(r.removedNodes))close=true;}
    if(open||close){window.clearTimeout(pendingTap);gameAudio47.cue(open?'open':'close',120);}
  }).observe(document.body,{childList:true,subtree:true});
  (window as unknown as {__audio47?:GameAudio47}).__audio47=gameAudio47;
}
