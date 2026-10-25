import type {GameCue47} from './event-sounds47';

/** Web addition: the original ships no sound effects (its 396 ButtonManager buttons carry no
 * clips). Short cues synthesized with Web Audio, so no extra files are downloaded: wooden
 * taps for controls, paper swishes for sheets, drums, horns and bells for world events. */
export type UiCue47='tap'|'toggle-on'|'toggle-off'|'open'|'close'|'tick';
export type Cue47=UiCue47|GameCue47;

type Voice={ctx:AudioContext;out:AudioNode;t:number};
function tone({ctx,out,t}:Voice,type:OscillatorType,from:number,to:number,start:number,attack:number,decay:number,gain:number){
  const o=ctx.createOscillator(),g=ctx.createGain();o.type=type;
  o.frequency.setValueAtTime(from,t+start);if(to!==from)o.frequency.exponentialRampToValueAtTime(to,t+start+attack+decay);
  g.gain.setValueAtTime(0.0001,t+start);g.gain.exponentialRampToValueAtTime(gain,t+start+attack);g.gain.exponentialRampToValueAtTime(0.0001,t+start+attack+decay);
  o.connect(g).connect(out);o.start(t+start);o.stop(t+start+attack+decay+.02);
}
let noiseBuffer:AudioBuffer|null=null;
function noise({ctx,out,t}:Voice,filter:BiquadFilterType,from:number,to:number,q:number,start:number,attack:number,decay:number,gain:number){
  if(!noiseBuffer||noiseBuffer.sampleRate!==ctx.sampleRate){noiseBuffer=ctx.createBuffer(1,ctx.sampleRate,ctx.sampleRate);const d=noiseBuffer.getChannelData(0);let seed=1;for(let i=0;i<d.length;i++){seed=(seed*16807)%2147483647;d[i]=seed/1073741823.5-1;}}
  const s=ctx.createBufferSource(),f=ctx.createBiquadFilter(),g=ctx.createGain();s.buffer=noiseBuffer;
  f.type=filter;f.Q.value=q;f.frequency.setValueAtTime(from,t+start);if(to!==from)f.frequency.exponentialRampToValueAtTime(to,t+start+attack+decay);
  g.gain.setValueAtTime(0.0001,t+start);g.gain.exponentialRampToValueAtTime(gain,t+start+attack);g.gain.exponentialRampToValueAtTime(0.0001,t+start+attack+decay);
  s.connect(f).connect(g).connect(out);s.start(t+start);s.stop(t+start+attack+decay+.02);
}
const drum=(v:Voice,start:number,gain=.9)=>{tone(v,'sine',120,46,start,.004,.42,gain);noise(v,'lowpass',900,200,.7,start,.002,.16,gain*.35);};
const bell=(v:Voice,f:number,start:number,gain=.22,decay=1.4)=>{tone(v,'sine',f,f,start,.006,decay,gain);tone(v,'sine',f*2.76,f*2.76,start,.004,decay*.45,gain*.28);tone(v,'sine',f*5.4,f*5.4,start,.003,decay*.2,gain*.1);};

export function playCue47(ctx:AudioContext,out:AudioNode,cue:Cue47){
  const v={ctx,out,t:ctx.currentTime+.005};
  switch(cue){
    case 'tap':tone(v,'triangle',660,420,0,.002,.05,.22);noise(v,'bandpass',2600,1800,3,0,.001,.025,.12);break;
    case 'tick':tone(v,'triangle',900,900,0,.001,.025,.06);break;
    case 'toggle-on':tone(v,'triangle',520,520,0,.002,.05,.16);tone(v,'triangle',780,780,.055,.002,.07,.16);break;
    case 'toggle-off':tone(v,'triangle',780,780,0,.002,.05,.14);tone(v,'triangle',520,520,.055,.002,.07,.14);break;
    case 'open':noise(v,'bandpass',700,2600,1.4,0,.05,.13,.16);tone(v,'sine',180,240,0,.01,.09,.08);break;
    case 'close':noise(v,'bandpass',2400,700,1.4,0,.03,.12,.13);tone(v,'sine',240,170,0,.01,.08,.07);break;
    case 'war':drum(v,0);drum(v,.24,.8);drum(v,.48,1);tone(v,'sawtooth',110,110,.48,.08,.9,.07);tone(v,'sawtooth',165,165,.48,.08,.9,.05);break;
    case 'fall':for(const [f,g] of [[98,.3],[147,.16],[233,.1],[311,.06]] as const)tone(v,'sine',f,f*.98,0,.01,2.6,g);noise(v,'lowpass',400,120,.5,0,.005,.6,.15);break;
    case 'capture':drum(v,0,.85);noise(v,'highpass',3200,3200,.8,.02,.002,.18,.18);tone(v,'square',1460,1380,.02,.002,.22,.03);bell(v,392,.12,.12,.8);break;
    case 'annex':drum(v,0,.55);break;
    case 'peace':bell(v,784,0);bell(v,1047,.32);break;
    case 'alliance':bell(v,523,0,.18);bell(v,659,.18,.18);bell(v,784,.36,.2);break;
    case 'mobilize':tone(v,'sawtooth',196,220,0,.12,.55,.08);tone(v,'sawtooth',294,330,.02,.12,.55,.05);noise(v,'lowpass',600,600,.5,0,.1,.5,.04);break;
    case 'siege':noise(v,'highpass',2800,2800,.9,0,.002,.12,.12);tone(v,'square',2350,2200,0,.001,.1,.02);tone(v,'square',3130,2950,.01,.001,.09,.015);break;
  }
}
