import {war26Strength} from './war26-strength';
import {beforeAll,it,expect} from 'vitest';
import {IDBFactory} from 'fake-indexeddb';
import {grid} from './fixture.test-support';
import {War31Session} from './war31-session';
import {War30Session} from './war30-session';
import {assertWar31Run,type War31Run} from './war31-model';
import type {War30Run} from './war30-model';
import {previewDeclaration31,declareWar31,evaluateDeclaration31} from './war31-declaration';
import {settleWar31} from './war31-settlement';
import {overlord31,makeVassal31,releaseVassal31,reconcileVassals31,assertVassals31} from './war31-vassals';
import {reconcileNativeDiplomacy31} from './war31-state';
import {saveRun,loadRun} from './war31-stores';
import {FROZEN_WAR30_ENGINE,verifyWar30Compatibility} from '../../../scripts/fms-war31-compat';
let seed:War31Run;
const stamp=(r:War31Run|War30Run)=>({day:r.world.day,nextEventId:r.world.nextEventId,tick:r.clock.tick});
beforeAll(()=>{seed=new War31Session().execute({type:'create',terrain:grid((x,y)=>x>20&&x<230&&y>20&&y<230?45:0),count:3,cityCount:24,relations:'peace'}).run as War31Run;});
const world=()=>structuredClone(seed);
function subjugate(extraWar=false){const r=world(),[a,b,c]=r.world.nations.map(n=>n.id);if(extraWar)declareWar31(r,b,c);declareWar31(r,a,b,3);const war=r.nativeWars.campaigns.at(-1)!;settleWar31(r,war,0);reconcileNativeDiplomacy31(r.nativeDiplomacy,r);return {r,a,b,c,war};}

it('uses an independent version and DB; exact v30 rule fingerprint is frozen',()=>{expect(seed.version).toBe(31);expect(seed.rules).toBe('fms-war-31');assertWar31Run(seed);expect(verifyWar30Compatibility()).toBe(FROZEN_WAR30_ENGINE);},30000);
it('previews CB3 without touching RNG/land/save, and confirms through session with real type4 goals',()=>{
 const r=world(),[a,b]=r.world.nations.map(n=>n.id),before=structuredClone(r);expect(previewDeclaration31(r,a,b,3)).toMatchObject({valid:true});expect(r).toEqual(before);
 const s=new War31Session();s.execute({type:'load',run:r});const n=s.execute({type:'declare-cb',nationId:a,targetNationId:b,casusBelliId:3,expected:stamp(r)}).run as War31Run;
 expect(n.nativeDiplomacy.declarations[0]).toMatchObject({casusBelliId:3,goals:[{type:4,scopeType:3,scope:{provinceIds:[],requiredCount:0}}]});expect(n.warfare.campaigns[0].goals[0].provinceIds.length).toBeGreaterThan(0);expect(n.world.provinces).toEqual(r.world.provinces);assertWar31Run(n);
 expect(()=>s.execute({type:'declare-cb',nationId:a,targetNationId:b,casusBelliId:3,expected:stamp(r)})).toThrow(/时刻/);
});
it('applies a winning vassal treaty without annexing the country and records one chronicle event',()=>{
 const {r,a,b,war}=subjugate();expect(overlord31(r,b)).toBe(a);expect(war.settlement!.effects).toMatchObject([{type:4,status:0}]);expect(r.world.provinces).toEqual(seed.world.provinces);expect(r.world.cities).toEqual(seed.world.cities);expect(r.chronicle.entries.filter(e=>e.text.includes('成为')&&e.text.includes('附庸'))).toHaveLength(1);expect(r.vassals.records[0]).toMatchObject({tributeRate:Math.fround(.3),armyCapMultiplier:.5,endedTick:null});assertWar31Run(r);
});
it('returns temporary occupation of the vassal without taking a third party occupied province',()=>{
 const r=world(),[a,b,c]=r.world.nations.map(n=>n.id);declareWar31(r,a,b,3);const places=r.world.provinces.filter(p=>p.controller===b);expect(places.length).toBeGreaterThan(3);places[0].controller=a;places[1].controller=c;
 settleWar31(r,r.nativeWars.campaigns[0],0);expect(overlord31(r,b)).toBe(a);expect(places[0].controller).toBe(b);expect(places[1].controller).toBe(c);
});
it('the actual autonomous pipeline selects CB3 at its native strength/land priority',()=>{
 const r=world(),a=r.world.nations[0].id;for(const army of r.world.armies)army.troops=0;for(const nation of r.world.nations){const armies=r.world.armies.filter(v=>v.nationId===nation.id),total=((nation.id===a?700:300)-war26Strength(r.world,r,nation.id))*1000;for(const army of armies)army.troops=Math.floor(total/armies.length);}r.nativeDiplomacy.nations[a].pools.startWar=120;r.nativeDiplomacy.nations[a].expansionism=6;
 const war=evaluateDeclaration31(r,a);expect(war).not.toBeNull();expect(r.nativeDiplomacy.declarations[0].casusBelliId).toBe(3);expect(r.nativeDiplomacy.nations[a].pools.startWar).toBe(0);assertWar31Run(r);
});
it('leaves all other known two-party wars with native primary-participant reason2; no duplicate current settlement',()=>{
 const {r,b}=subjugate(true);expect(r.nativeWars.campaigns.every(w=>w.endedTick!==null)).toBe(true);expect(r.nativeWars.campaigns[0].settlement!.reason).toBe(2);expect(r.nativeWars.campaigns[1].settlement!.reason).toBe(0);expect(r.world.statecraft!.relations.filter(p=>[p.a,p.b].includes(b)).every(p=>p.status==='peace')).toBe(true);expect(r.vassals.records).toHaveLength(1);assertWar31Run(r);
});
it('does not create a vassal on god-ceasefire, losing/draw settlements, or already extinct target',()=>{
 for(const reason of [11,3] as const){const r=world(),[a,b]=r.world.nations.map(n=>n.id);declareWar31(r,a,b,3);settleWar31(r,r.nativeWars.campaigns[0],reason);expect(r.vassals.records).toHaveLength(0);}
 const r=world(),[a,b]=r.world.nations.map(n=>n.id);for(const p of r.world.provinces)if(p.controller===b)p.controller=a;expect(makeVassal31(r,b,a,()=>{}).success).toBe(false);
});
it('blocks autonomous declaration before spending vassal points and also blocks manual wars with its lord',()=>{
 const {r,a,b,c}=subjugate();r.nativeDiplomacy.nations[b].pools.startWar=120;expect(evaluateDeclaration31(r,b)).toBeNull();expect(r.nativeDiplomacy.nations[b].pools.startWar).toBe(120);expect(previewDeclaration31(r,b,c).valid).toBe(false);expect(previewDeclaration31(r,a,b).valid).toBe(false);
});
it('registers before nested callbacks and rejects self, double vassal, vassal as overlord',()=>{
 const r=world(),[a,b,c]=r.world.nations.map(n=>n.id);let saw=false;expect(makeVassal31(r,b,a,()=>{saw=overlord31(r,b)===a;}).success).toBe(true);expect(saw).toBe(true);expect(makeVassal31(r,c,b,()=>{}).success).toBe(false);expect(makeVassal31(r,b,c,()=>{}).success).toBe(false);expect(makeVassal31(r,a,a,()=>{}).success).toBe(false);
});
it('release requires a fresh Worker preview and persists history while restoring independent diplomacy',()=>{
 const {r,b}=subjugate(),s=new War31Session();s.execute({type:'load',run:r});expect(()=>s.execute({type:'release-vassal',nationId:b,expected:{...stamp(r),nextEventId:0}})).toThrow(/时刻/);
 const n=s.execute({type:'release-vassal',nationId:b,expected:stamp(r)}).run as War31Run;expect(overlord31(n,b)).toBeNull();expect(n.vassals.records[0].endReason).toBe('released');expect(n.world.provinces).toEqual(r.world.provinces);expect(()=>s.execute({type:'release-vassal',nationId:b,expected:stamp(n)})).toThrow(/关系/);assertWar31Run(n);
});
it('cleans extinct relationships once, without resurrecting old relationships on later territorial changes',()=>{
 const {r,a,b,c}=subjugate();for(const p of r.world.provinces)if(p.controller===a)p.controller=c;reconcileVassals31(r);expect(overlord31(r,b)).toBeNull();expect(r.vassals.records[0].endReason).toBe('overlord-destroyed');const n=r.chronicle.entries.length;reconcileVassals31(r);expect(r.chronicle.entries).toHaveLength(n);
});
it('refuses malformed, future and cyclic relationship data',()=>{
 const {r,a,b}=subjugate();for(const mutate of [(s:War31Run)=>s.vassals.records[0].updateDay=28,(s:War31Run)=>Object.assign(s.vassals.records[0],{future:1}),(s:War31Run)=>s.vassals.records.push({...s.vassals.records[0],vassalId:a,overlordId:b})]){const bad=structuredClone(r);mutate(bad);expect(()=>assertVassals31(bad.vassals,bad)).toThrow();}
});
it('saves and resumes actual relationships/RNG through two saves and rejects concurrent stale writers',async()=>{
 const {r}=subjugate(),db=new IDBFactory();await saveRun(r,null,db);await saveRun(r,1,db);expect((await loadRun(db))!.run).toEqual(r);const writes=await Promise.allSettled([saveRun(r,2,db),saveRun(r,2,db)]);expect(writes.filter(v=>v.status==='fulfilled')).toHaveLength(1);
 const s=new War31Session();s.execute({type:'load',run:(await loadRun(db))!.run});const n=s.execute({type:'tick',ticks:2,expected:stamp(r)}).run as War31Run;expect(n.vassals).toEqual(r.vassals);assertWar31Run(n);
});
it('copies v30 explicitly keeping all known native history, while continuing old rules and old DB unchanged',async()=>{
 const old=new War30Session().execute({type:'create',terrain:seed.terrain,count:3,cityCount:24,relations:'peace'}).run as War30Run,db=new IDBFactory();await saveRun(old,null,db);const before=structuredClone(old),s=new War31Session(),copy=s.execute({type:'copy',run:old}).run as War31Run;expect(copy.id).not.toBe(old.id);expect(copy.nativeDiplomacy).toEqual(old.nativeDiplomacy);expect(old).toEqual(before);await saveRun(copy,null,db);expect((await loadRun(db,32))!.run).toEqual(old);
 const a=new War31Session(),b=new War30Session();a.execute({type:'load',run:old});b.execute({type:'load',run:old});const command={type:'tick' as const,ticks:1,expected:stamp(old)};expect(a.execute(command)).toEqual(b.execute(command));
});
it('direct release of an absent relationship has no effect',()=>{const r=world(),before=structuredClone(r);expect(releaseVassal31(r,r.world.nations[0].id)).toBe(false);expect(r).toEqual(before);});
