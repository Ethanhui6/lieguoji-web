import {beforeAll,it,expect} from 'vitest';
import {IDBFactory} from 'fake-indexeddb';
import {War33Session} from './war33-session';
import {War32Session} from './war32-session';
import {tributeFixture32} from './war32.test-support';
import {assertWar33Run,type War33Run} from './war33-model';
import {rebellionFixture33,fixtureDate33,fixtureDay33} from './war33.test-support';
import {advanceRebellion33} from './war33-rebellion';
import {advanceWar33Peace} from './war33-peace';
import {settleWar33} from './war33-settlement';
import {reconcileNativeDiplomacy33} from './war33-state';
import {overlord33} from './war33-vassals';
import {saveRun,loadRun} from './war33-stores';
import {verifyWar32Compatibility,FROZEN_WAR32_ENGINE} from '../../../scripts/fms-war33-compat';
let seed:War33Run;
beforeAll(()=>{seed=rebellionFixture33();assertWar33Run(seed);});
const world=()=>structuredClone(seed),stamp=(r:War33Run)=>({day:r.world.day,nextEventId:r.world.nextEventId,tick:r.clock.tick});
function step(r:War33Run){const s=new War33Session();s.execute({type:'load',run:r});return s.execute({type:'step',days:1}).run as War33Run;}
it('preserves actual v32 executable fingerprint',()=>expect(verifyWar32Compatibility()).toBe(FROZEN_WAR32_ENGINE),30000);
it('real session crosses assigned quarter date into a CB16 internal war without immediate independence',()=>{
 const r=step(world()),v=r.vassals.records[0],war=r.nativeWars.campaigns.find(w=>w.internal)!;
 expect(r.rebellion.records).toHaveLength(1);expect(r.rebellion.records[0].reason).toBe('powerful');expect(war.internal).toEqual({casusBelliId:16,legacyType:10,rebelStateId:r.people.nations[v.vassalId].id,motherStateId:r.people.nations[v.overlordId].id});expect(overlord33(r,v.vassalId)).toBe(v.overlordId);expect(war.goals[0].type).toBe(7);expect(r.warfare.campaigns.some(c=>c.endedTick===null)).toBe(true);expect(r.chronicle.entries.some(e=>JSON.stringify(e).includes('独立战争'))).toBe(true);assertWar33Run(r);
 const same=structuredClone(r);advanceRebellion33(r);expect(r).toEqual(same);expect(step(r).rebellion.records).toHaveLength(1);
});
it.each([[12,3],[13,2]])('does not start before 12 years or outside quarter (%s/%s)',(year,month)=>{const r=world();fixtureDate33(r,fixtureDay33(r,year,month,9));expect(step(r).rebellion.records).toHaveLength(0);});
it('pause/confirm is stamped, cancelling does nothing, enabling does not replay missed date',()=>{
 const r=world(),s=new War33Session();s.execute({type:'load',run:r});const c={type:'rebellion-settings' as const,runId:r.id,enabled:false,revision:r.rebellion.revision,expected:stamp(r)},off=s.execute(c).run as War33Run;expect(off.world).toEqual(r.world);expect(()=>s.execute(c)).toThrow(/过期|变化/);const n=s.execute({type:'step',days:1}).run as War33Run;expect(n.rebellion.records).toHaveLength(0);const on=s.execute({...c,enabled:true,revision:n.rebellion.revision,expected:stamp(n)}).run as War33Run;expect(step(on).rebellion.records).toHaveLength(0);
});
it('surviving 36 months on own land releases vassal by actual peace effect, preserves third party and prior tribute',()=>{
 const r=step(world()),v=r.vassals.records[0],owners=r.world.provinces.map(p=>p.controller),ledger=structuredClone(r.tribute);
 fixtureDate33(r,fixtureDay33(r,16,4,1));r.diplomacy.worldAuto=true;advanceWar33Peace(r);reconcileNativeDiplomacy33(r.nativeDiplomacy,r);
 const war=r.nativeWars.campaigns.find(w=>w.internal)!;expect(war.settlement!.effects).toMatchObject([{type:7,status:0}]);expect(war.settlement!.transfers).toEqual([]);expect(overlord33(r,v.vassalId)).toBeNull();expect(v.endReason).toBe('independence');expect(r.world.provinces.map(p=>p.controller)).toEqual(owners);expect(r.tribute.receipts).toEqual(ledger.receipts);assertWar33Run(r);
});
it('manual ceasefire ends war but never awards automatic independence or annexation',()=>{const r=step(world()),v=r.vassals.records[0],c=r.nativeWars.campaigns.find(w=>w.internal)!;settleWar33(r,c,11);reconcileNativeDiplomacy33(r.nativeDiplomacy,r);expect(c.settlement!.effects).toEqual([]);expect(overlord33(r,v.vassalId)).toBe(v.overlordId);assertWar33Run(r);});
it('save/reload and CAS preserve internal metadata and forbid duplicate replay',async()=>{const r=step(world()),db=new IDBFactory();await saveRun(r,null,db);const n=(await loadRun(db))!.run as War33Run;expect(n).toEqual(r);expect(step(n).rebellion.records).toEqual(r.rebellion.records);const raced=await Promise.allSettled([saveRun(n,1,db),saveRun(r,1,db)]);expect(raced.filter(x=>x.status==='fulfilled')).toHaveLength(1);});
it('explicit v32 copy preserves history and finance, runs old saves on the frozen engine',async()=>{const old=tributeFixture32(),saved=structuredClone(old),db=new IDBFactory();await saveRun(old,null,db);const s=new War33Session(),prior=new War32Session();s.execute({type:'load',run:old});prior.execute({type:'load',run:old});expect(s.execute({type:'step',days:1})).toEqual(prior.execute({type:'step',days:1}));const n=s.execute({type:'copy',run:old}).run as War33Run;expect(n.id).not.toBe(old.id);expect(n.tribute).toEqual(old.tribute);expect(n.vassals).toEqual(old.vassals);expect(n.rebellion.originDay).toBe(old.world.day);await saveRun(n,null,db);expect((await loadRun(db,34))!.run).toEqual(saved);});
it('invalid tick arguments cannot install a partially advanced rebellion',()=>{const r=world(),s=new War33Session();s.execute({type:'load',run:r});expect(()=>s.execute({type:'tick',ticks:121,expected:stamp(r)})).toThrow();const off=s.execute({type:'rebellion-settings',runId:r.id,revision:r.rebellion.revision,enabled:false,expected:stamp(r)}).run as War33Run;expect(off.clock).toEqual(r.clock);expect(off.nativeWars).toEqual(r.nativeWars);});
it('failure late in the daily schedule leaves the installed clock, treasury and war history untouched',()=>{const r=world(),s=new War33Session();r.tribute.enabled=true;fixtureDate33(r,fixtureDay33(r,13,12,9));const v=r.vassals.records[0];r.finance.nations[v.vassalId].goldPerMonth=2147483647;s.execute({type:'load',run:r});expect(()=>s.execute({type:'step',days:1})).toThrow(/int32/);const safe=s.execute({type:'tribute-settings',runId:r.id,revision:r.tribute.revision,enabled:false,expected:stamp(r)}).run as War33Run;expect(safe.clock).toEqual(r.clock);expect(safe.finance).toEqual(r.finance);expect(safe.nativeWars).toEqual(r.nativeWars);expect(safe.rebellion).toEqual(r.rebellion);});
it('rejects altered internal identities and unknown future outcome types',()=>{const r=step(world());for(const edit of [(n:War33Run)=>n.nativeWars.campaigns[0].internal!.motherStateId++,(n:War33Run)=>Object.assign(n.rebellion.records[0],{futureTactic:1}),(n:War33Run)=>Object.assign(n.rebellion.records[0],{reason:'future'}),(n:War33Run)=>n.rebellion.records[0].tick--]){const n=structuredClone(r);edit(n);expect(()=>assertWar33Run(n)).toThrow();}});
