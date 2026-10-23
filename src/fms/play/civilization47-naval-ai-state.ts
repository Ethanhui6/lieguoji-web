import {fastChecks47} from './checks47';
import type {FoundingForces47} from './civilization47-forces';
export type NavalDecision47={homePortId:string|null;assignedPortId:string|null;nextTick:number;issuedTick:number|null;decision:'waiting'|'attacking'|'guarding'|'resupply'|'manual'|'busy'|'lost'|'no-route';reason:string};
export type NavalAutonomy47={version:1;rule:'native-roles-actual-space-v1';timing:'unscaled40-web-ticks-v1';revision:number;rng:number;lastTick:number;nextRoleTick:number;fleets:Record<string,NavalDecision47>};
/** Preserved WEB scheduling bridge: 40 saved simulation ticks per desktop
 * unscaled second. Pause freezes it. Not native wall/scaled-time equivalence. */
export const NAVAL_SCHEDULE_TICKS47=40;
export function initialNavalAutonomy47(r:Pick<FoundingForces47,'world'|'clock'|'navy'|'harbors'|'navalOpening'>):NavalAutonomy47{
 let h=2166136261;for(const c of `${r.world.custom!.seed}/naval-autonomy47`)h=Math.imul(h^c.charCodeAt(0),16777619);
 return {version:1,rule:'native-roles-actual-space-v1',timing:'unscaled40-web-ticks-v1',revision:0,rng:(h>>>0)||1,lastTick:r.clock.tick,nextRoleTick:r.clock.tick,fleets:Object.fromEntries(r.navy.fleets.map(f=>[f.id,{homePortId:r.harbors.sites.find(p=>p.provinceId===r.navalOpening.charges.find(v=>v.fleetId===f.id)?.homeId)?.id??null,assignedPortId:null,nextTick:r.clock.tick,issuedTick:null,decision:'waiting',reason:'等待海军自主部署。'}]))};
}
export function drawNaval47(s:NavalAutonomy47){let x=s.rng;x^=x<<13;x^=x>>>17;x^=x<<5;s.rng=x>>>0;return s.rng/4294967296;}
const exact=(v:unknown,keys:readonly string[])=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join('/')===[...keys].sort().join('/');
/** Running ledger only; full live47/Store49 validation is still separate. */
export function assertNavalAutonomy47(r:Pick<FoundingForces47,'clock'|'navy'|'harbors'|'navalAutonomy'>){if(fastChecks47())return;
 const s=r.navalAutonomy,int=(v:number,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&v>=0&&v<=max,fail=()=>{throw Error('海军自主部署记录无效。');};
 if(!exact(s,['version','rule','timing','revision','rng','lastTick','nextRoleTick','fleets'])||s.version!==1||s.rule!=='native-roles-actual-space-v1'||s.timing!=='unscaled40-web-ticks-v1'||!int(s.revision)||!int(s.rng,4294967295)||s.rng===0||!int(s.lastTick,r.clock.tick)||!int(s.nextRoleTick,r.clock.tick+40)||!exact(s.fleets,r.navy.fleets.map(f=>f.id)))return fail();
 for(const p of Object.values(s.fleets)){
  if(!exact(p,['homePortId','assignedPortId','nextTick','issuedTick','decision','reason'])||!int(p.nextTick,r.clock.tick+1280)||p.issuedTick!==null&&!int(p.issuedTick,r.clock.tick)||!['waiting','attacking','guarding','resupply','manual','busy','lost','no-route'].includes(p.decision)||typeof p.reason!=='string'||p.reason.length>400)return fail();
  for(const id of [p.homePortId,p.assignedPortId])if(id!==null&&(typeof id!=='string'||!r.harbors.sites.some(p=>p.id===id)))return fail();
 }
}
