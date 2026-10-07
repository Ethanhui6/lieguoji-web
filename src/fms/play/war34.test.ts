import {beforeAll,it,expect} from 'vitest';
import {IDBFactory} from 'fake-indexeddb';
import {coalitionFixture34,stamp34} from './war34.test-support';
import {War34Session} from './war34-session';
import {War33Session} from './war33-session';
import {rebellionFixture33} from './war33.test-support';
import {assertWar34Run,type War34Run} from './war34-model';
import {declareWar34,previewDeclaration34} from './war34-declaration';
import {settleWar34,leaveWars34} from './war34-settlement';
import {releaseVassal34,makeVassal34} from './war34-vassals';
import {reconcileNativeDiplomacy34} from './war34-state';
import {buildParticipants34,opposedPairs34} from './war34-coalition';
import {registerWar34,war28DamageSink,importUnknownWars28,reconcileParticipants28} from './war34-wars';
import {saveRun,loadRun} from './war34-stores';
import {verifyWar33Compatibility,FROZEN_WAR33_ENGINE} from '../../../scripts/fms-war34-compat';
let seed:War34Run;beforeAll(()=>{seed=coalitionFixture34();assertWar34Run(seed);});
function world(){return structuredClone(seed);}
function opened(){const r=world();declareWar34(r,'n-0','n-3');assertWar34Run(r);return r;}
it('freezes v33 execution and keeps existing saves on their actual engine',()=>{expect(verifyWar33Compatibility()).toBe(FROZEN_WAR33_ENGINE);const r=rebellionFixture33(),s=new War34Session(),old=new War33Session();s.execute({type:'load',run:r});old.execute({type:'load',run:r});expect(s.execute({type:'step',days:1})).toEqual(old.execute({type:'step',days:1}));},30000);
it('copies prior independent war history without replaying or losing rebellion records',()=>{const old=new War33Session();old.execute({type:'load',run:rebellionFixture33()});const r=old.execute({type:'step',days:1}).run,s=new War34Session(),copy=s.execute({type:'copy',run:r}).run as War34Run;expect(copy.rebellion).toEqual((r as Extract<typeof r,{version:33}>).rebellion);expect(copy.nativeWars).toEqual((r as Extract<typeof r,{version:33}>).nativeWars);expect(copy.id).not.toBe(r.id);assertWar34Run(copy);});
it('registers five real participants, six hostile pairs and a single campaign with actual province snapshots',()=>{const r=opened(),c=r.nativeWars.campaigns[0];expect(c.participants).toHaveLength(5);expect(c.coalition?.members.map(m=>[m.side,m.role])).toEqual([[0,0],[0,2],[0,2],[1,1],[1,2]]);expect(opposedPairs34(r.nativeWars,c)).toHaveLength(6);expect(r.world.statecraft!.relations.filter(p=>p.status==='war')).toHaveLength(6);expect(c.initialOwners).toHaveLength(r.world.provinces.length);importUnknownWars28(r.nativeWars,r);expect(r.nativeWars.campaigns).toHaveLength(1);expect(r.warfare.campaigns.filter(c=>c.endedTick===null)).toHaveLength(6);});
it('preview does not mutate caller and confirms against actual Worker-compatible session stamp',()=>{const r=world(),before=structuredClone(r);expect(previewDeclaration34(r,'n-0','n-3').valid).toBe(true);expect(r).toEqual(before);const s=new War34Session();s.execute({type:'load',run:r});const c={type:'declare-cb' as const,nationId:'n-0',targetNationId:'n-3',casusBelliId:1 as const,expected:stamp34(r)};const n=s.execute(c).run as War34Run;expect(n.nativeWars.campaigns[0].participants).toHaveLength(5);expect(()=>s.execute(c)).toThrow();const moved=s.execute({type:'step',days:1}).run as War34Run;expect(moved.nativeWars.campaigns).toHaveLength(1);assertWar34Run(moved);});
it('records supporting-country raw combat damage in the shared campaign, not a phantom bilateral history',()=>{const r=opened();war28DamageSink(r.nativeWars,r)('n-1','n-4',Math.fround(17.3));expect(r.nativeWars.campaigns[0].kills).toEqual([[r.people.nations['n-1'].id,Math.fround(17.3)]]);expect(r.nativeWars.campaigns[0].deaths).toEqual([[r.people.nations['n-4'].id,Math.fround(17.3)]]);assertWar34Run(r);});
it('manual end settles the whole coalition once and records every opposite diplomatic pair',()=>{const r=opened(),c=r.nativeWars.campaigns[0];settleWar34(r,c,11);reconcileNativeDiplomacy34(r.nativeDiplomacy,r);expect(r.world.statecraft!.relations.every(p=>p.status==='peace')).toBe(true);expect(r.nativeDiplomacy.relations.filter(p=>p.warCount===1)).toHaveLength(6);reconcileNativeDiplomacy34(r.nativeDiplomacy,r);expect(r.nativeDiplomacy.relations.filter(p=>p.warCount===1)).toHaveLength(6);expect(c.settlement?.transfers).toEqual([]);assertWar34Run(r);});
it('ending a coalition preserves hostility and history owned by another active campaign',()=>{const r=opened(),first=r.nativeWars.campaigns[0];registerWar34(r.nativeWars,r,'n-1','n-4',[]);expect(r.nativeWars.campaigns).toHaveLength(2);settleWar34(r,first,11);reconcileNativeDiplomacy34(r.nativeDiplomacy,r);expect(r.world.statecraft!.relations.filter(p=>p.status==='war').map(p=>[p.a,p.b])).toEqual([['n-1','n-4']]);expect(r.nativeWars.campaigns[1].endedTick).toBeNull();assertWar34Run(r);});
it('internal rebellion isolates the rebel but draws surviving sibling vassals to the mother side',()=>{const r=world(),a=r.people.nations['n-1'].id,b=r.people.nations['n-0'].id;const members=buildParticipants34(r,'n-1','n-0',{casusBelliId:16,legacyType:10,rebelStateId:a,motherStateId:b});expect(members.map(m=>[m.stateId,m.side])).toEqual([[a,0],[b,1],[r.people.nations['n-2'].id,1]]);});
it('save/reload and concurrent writes preserve exact coalition membership and source v33 save',async()=>{const r=opened(),db=new IDBFactory(),old=rebellionFixture33();await saveRun(old,null,db);await saveRun(r,null,db);expect((await loadRun(db))!.run).toEqual(r);const raced=await Promise.allSettled([saveRun(r,1,db),saveRun(r,1,db)]);expect(raced.filter(x=>x.status==='fulfilled')).toHaveLength(1);expect((await loadRun(db,35))!.run).toEqual(old);});
it('rejects changed sides, unknown metadata, missing opponents and duplicate members',()=>{const r=opened();for(const change of [(n:War34Run)=>n.nativeWars.campaigns[0].coalition!.members[1].side=1,(n:War34Run)=>Object.assign(n.nativeWars.campaigns[0].coalition!,{future:1}),(n:War34Run)=>n.nativeWars.campaigns[0].coalition!.members.push(n.nativeWars.campaigns[0].coalition!.members[0]),(n:War34Run)=>{n.world.statecraft!.relations.find(p=>p.a==='n-1'&&p.b==='n-4')!.status='peace';}]){const copy=structuredClone(r);change(copy);expect(()=>assertWar34Run(copy)).toThrow();}});
it('destroyed supporting participant retains its side and damage history',()=>{const r=opened(),c=r.nativeWars.campaigns[0],member=r.people.nations['n-2'].id;for(const p of r.world.provinces)if(p.controller==='n-2')p.controller='n-3';reconcileParticipants28(r.nativeWars,r);expect(c.destroyedParticipants).toContainEqual({stateId:member,side:0});expect(c.coalition!.members.some(p=>p.stateId===member)).toBe(true);});
it('actual supporting armies fight and contribute to the single shared war in simulation ticks',()=>{
 const r=opened(),a=r.world.armies.find(a=>a.nationId==='n-1')!,b=r.world.armies.find(a=>a.nationId==='n-4')!;
 for(const army of [a,b])Object.assign(army,{provinceId:a.provinceId,status:'idle',route:[],progress:0,troops:10000,morale:100,supplies:100});
 const s=new War34Session();s.execute({type:'load',run:r});const n=s.execute({type:'tick',ticks:100,expected:stamp34(r)}).run as War34Run;
 for(const id of ['n-1','n-4']){expect(n.losses.nations[id].total.combat).toBeGreaterThan(0);expect(n.nativeWars.campaigns[0].kills.find(p=>p[0]===n.people.nations[id].id)![1]).toBeGreaterThan(0);}
 expect(n.nativeWars.campaigns).toHaveLength(1);assertWar34Run(n);
});
it('support becoming another lord vassal leaves its own participation without ending its former side war',async()=>{
 const r=opened(),c=r.nativeWars.campaigns[0],before=structuredClone(c.initialOwners);war28DamageSink(r.nativeWars,r)('n-1','n-4',Math.fround(17.3));releaseVassal34(r,'n-1');
 expect(makeVassal34(r,'n-1','n-3',id=>leaveWars34(r,id)).success).toBe(true);
 expect(c.endedTick).toBeNull();expect(c.participants).toHaveLength(4);expect(c.destroyedParticipants).toHaveLength(0);expect(c.coalition!.departures).toEqual([{stateId:r.people.nations['n-1'].id,side:0,tick:0}]);expect(c.initialOwners).toEqual(before);expect(c.kills[0][1]).toBe(Math.fround(17.3));
 expect(r.world.statecraft!.relations.filter(p=>p.status==='war')).toHaveLength(4);assertWar34Run(r);
 const db=new IDBFactory();await saveRun(r,null,db);expect((await loadRun(db))!.run).toEqual(r);
 settleWar34(r,c,11);reconcileNativeDiplomacy34(r.nativeDiplomacy,r);expect(r.nativeDiplomacy.relations.filter(p=>p.warCount===1)).toHaveLength(4);assertWar34Run(r);
});
it('leaving as the principal ends the campaign while ordinary departure is idempotent',()=>{
 const r=opened(),c=r.nativeWars.campaigns[0];leaveWars34(r,'n-1');const before=structuredClone(r);leaveWars34(r,'n-1');expect(r).toEqual(before);
 leaveWars34(r,'n-0');reconcileNativeDiplomacy34(r.nativeDiplomacy,r);expect(c.endedTick).not.toBeNull();expect(c.settlement!.reason).toBe(2);assertWar34Run(r);
});
it('actual quarterly rebellion registers a surviving sibling on the mother side',()=>{
 const s=new War34Session(),r=s.execute({type:'copy',run:rebellionFixture33()}).run as War34Run,first=r.vassals.records[0],sibling=r.world.nations.find(n=>![first.vassalId,first.overlordId].includes(n.id))!.id;
 expect(makeVassal34(r,sibling,first.overlordId,()=>{}).success).toBe(true);s.execute({type:'load',run:r});const n=s.execute({type:'step',days:1}).run as War34Run,war=n.nativeWars.campaigns.find(c=>c.internal)!;
 expect(war.participants).toHaveLength(3);expect(war.participants.find(p=>p.stateId===n.people.nations[sibling].id)?.side).toBe(1);expect(n.rebellion.records).toHaveLength(1);assertWar34Run(n);
});
