import type {Culture47Session,Culture47Journal} from './culture47-session';

type Snapshot=ReturnType<Culture47Session['snapshot']>;
type Static={terrain:Snapshot['run']['terrain'];geography:Snapshot['run']['diplomaticGeography'];opening:Culture47Journal['opening']};
type DynamicRun=Omit<Snapshot['run'],'terrain'|'diplomaticGeography'>;
const fixedPlain=new WeakMap<object,boolean>(),equalFixed=new WeakMap<object,WeakSet<object>>();
function freezeDisplayPlain(value:unknown):boolean {
 if(!value||typeof value!=='object')return true;
 if(ArrayBuffer.isView(value))return false;
 const known=fixedPlain.get(value);if(known!==undefined)return known;
 let immutable=true;for(const item of Object.values(value))if(!freezeDisplayPlain(item))immutable=false;
 Object.freeze(value);fixedPlain.set(value,immutable);return immutable;
}
export type Culture47DisplayPacket=
 |{kind:'full';base:string;snapshot:Snapshot}
 |{kind:'update';base:string;from:number;run:DynamicRun;journal:Omit<Culture47Journal,'opening'>;frame:Snapshot['frame']};

/** Exact structured data, including every terrain neighbor and lock sample.
 * Typed arrays are compared as bytes rather than allocating a property
 * descriptor for each numeric element. These values came through structured
 * clone / the validated session; this is not a replacement import validator. */
export function sameDisplayStatic47(a:unknown,b:unknown):boolean {
 if(Object.is(a,b))return true;
 if(!a||!b||typeof a!=='object'||typeof b!=='object'||Object.getPrototypeOf(a)!==Object.getPrototypeOf(b))return false;
 const immutable=fixedPlain.get(a)===true&&fixedPlain.get(b)===true;
 if(immutable&&equalFixed.get(a)?.has(b))return true;
 if(Array.isArray(a)&&(!Array.isArray(b)||a.length!==b.length))return false;
 if(ArrayBuffer.isView(a)||ArrayBuffer.isView(b)){
  if(!ArrayBuffer.isView(a)||!ArrayBuffer.isView(b)||a.constructor!==b.constructor||a.byteLength!==b.byteLength)return false;
  const x=new Uint8Array(a.buffer,a.byteOffset,a.byteLength),y=new Uint8Array(b.buffer,b.byteOffset,b.byteLength);
  for(let i=0;i<x.length;i++)if(x[i]!==y[i])return false;
  return true;
 }
 const keys=Object.keys(a),other=Object.keys(b);
 const same=keys.length===other.length&&keys.every(k=>Object.hasOwn(b,k)&&sameDisplayStatic47((a as Record<string,unknown>)[k],(b as Record<string,unknown>)[k]));
 if(same&&immutable){const entries=equalFixed.get(a)??new WeakSet<object>();entries.add(b);equalFixed.set(a,entries);}return same;
}
const fixed=(s:Snapshot):Static=>({terrain:s.run.terrain,geography:s.run.diplomaticGeography,opening:s.journal.opening});

/** Called synchronously by the private Session. No internal run/buffer is
 * returned: even the small update is cloned before it leaves the owner. */
export class Culture47DisplayEncoder {
 private witness?:Static;
 private base=crypto.randomUUID();
 private sequence=0;
 encode(s:Snapshot):Culture47DisplayPacket {
  if(!this.witness){freezeDisplayPlain(fixed(s));this.witness=structuredClone(fixed(s));freezeDisplayPlain(this.witness);this.sequence=s.journal.actions.length;return {kind:'full',base:this.base,snapshot:structuredClone(s)};}
  if(!sameDisplayStatic47(fixed(s),this.witness))throw Error('显示基图发生变化，保留最后确认的进度。');
  const {terrain:_terrain,diplomaticGeography:_geography,...run}=s.run;
  const {opening:_opening,...journal}=s.journal;
  void _terrain;void _geography;void _opening;
  const packet=structuredClone({kind:'update' as const,base:this.base,from:this.sequence,run,journal,frame:s.frame});
  this.sequence=s.journal.actions.length;return packet;
 }
}

/** A Worker epoch owns one full baseline. Later replies contain all dynamic
 * state but never resend the two full maps or sea partition. The exposed
 * baseline has a separate private witness; UI mutations cannot silently
 * contaminate a later snapshot or a save. */
export class Culture47DisplayDecoder {
 private baseline?:Static;
 private witness?:Static;
 private base='';
 private world='';
 private engine='';
 private sequence=0;
 decode(packet:Culture47DisplayPacket,expected:{engine:string;sequence?:number;actions?:number}):Snapshot {
  if(packet.kind==='full'){
   const s=packet.snapshot;
   if(expected.sequence!==undefined||s.journal.engine!==expected.engine||s.run.id!==s.journal.id||!packet.base)throw Error('显示基线不匹配。');
   this.baseline=fixed(s);freezeDisplayPlain(this.baseline);this.witness=structuredClone(this.baseline);freezeDisplayPlain(this.witness);this.base=packet.base;
   this.world=s.journal.id;this.engine=s.journal.engine;this.sequence=s.journal.actions.length;return s;
  }
  if(!this.baseline||!this.witness||packet.base!==this.base||packet.from!==this.sequence||expected.sequence!==this.sequence||packet.journal.actions.length!==this.sequence+(expected.actions??1)||packet.journal.id!==this.world||packet.journal.engine!==this.engine||packet.journal.engine!==expected.engine||packet.run.id!==this.world||'terrain'in packet.run||'diplomaticGeography'in packet.run||'opening'in packet.journal)throw Error('显示增量不匹配，保留最后确认的进度。');
  if(!sameDisplayStatic47(this.baseline,this.witness))throw Error('显示基图被修改，保留最后确认的进度。');
  const s:Snapshot={run:{...packet.run,terrain:this.baseline.terrain,diplomaticGeography:this.baseline.geography},journal:{...packet.journal,opening:this.baseline.opening},frame:packet.frame};
  this.sequence=s.journal.actions.length;return s;
 }
}
