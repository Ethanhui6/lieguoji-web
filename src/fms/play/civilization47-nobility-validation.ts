import {NOBILITY_RULE47,type NobilityRun47} from './civilization47-nobility';
import {nobilityMonth47} from './civilization47-nobility-monthly';

export type {NobilityRun47} from './civilization47-nobility';

/** Structure of the original family ledger: every family is a kin family of a
 * living ledger nation, the ruling flag marks exactly the state family, and no
 * province is controlled by two families. */
export function assertNobility47(r:NobilityRun47){
  const n=r.nobility;if(n===undefined)return;
  const fail=(code=0)=>{throw Error(`原作家族记录无效，存档未载入。（${code}）`);};
  if(!n||typeof n!=='object'||n.version!==1||n.rule!==NOBILITY_RULE47||!n.families||typeof n.families!=='object'||r.houses||r.generations)return fail(1);
  const num=(v:unknown,min:number,max:number)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
  const ids=(v:unknown)=>Array.isArray(v)&&v.every(x=>Number.isSafeInteger(x)&&x>0)&&new Set(v).size===v.length;
  if(!Number.isSafeInteger(n.month)||n.month>nobilityMonth47(r)||!Number.isSafeInteger(n.year)||!Array.isArray(n.monthFamilies)||n.monthFamilies.some(id=>!Object.hasOwn(n.families,id))||new Set(n.monthFamilies).size!==n.monthFamilies.length)return fail(20);
  if(!n.random||!Number.isSafeInteger(n.random.state)||!Number.isSafeInteger(n.random.draws)||n.random.draws<0||!Array.isArray(n.collaterals)||!ids(n.collaterals.map(c=>c?.personId))||n.collaterals.some(c=>!Object.hasOwn(n.families,String(c.familyId))&&!(n.extinct??[]).includes(c.familyId)||!Number.isSafeInteger(c.day))||!ids(n.detached)||!n.redistribution||typeof n.redistribution!=='object'||Object.entries(n.redistribution).some(([id,v])=>!Object.hasOwn(r.people.nations,id)||!Number.isInteger(v)||v<-1||v>24))return fail(21);
  if(!Array.isArray(n.births)||!ids(n.births.map(b=>b?.personId))||n.births.some(b=>!Number.isSafeInteger(b.familyId)||!Number.isSafeInteger(b.fatherId)||!Number.isSafeInteger(b.motherId)||!Number.isSafeInteger(b.day)))return fail(22);
  if(!Array.isArray(n.marriages)||n.marriages.some(m=>!m||!Number.isSafeInteger(m.aId)||!Number.isSafeInteger(m.bId)||!Number.isSafeInteger(m.moverId)||m.moverId!==0&&m.moverId!==m.aId&&m.moverId!==m.bId||typeof m.matrilineal!=='boolean'||!Number.isSafeInteger(m.day)))return fail(23);
  if(!n.rulingFamilies||typeof n.rulingFamilies!=='object'||Object.entries(n.rulingFamilies).some(([id,v])=>!Object.hasOwn(r.people.nations,id)||v!==0&&n.families[String(v)]?.nationId!==id))return fail(24);
  if(!ids(n.extinct)||n.extinct.some(id=>Object.hasOwn(n.families,String(id))||!r.kin.families[String(id)]))return fail(25);
  if(!n.relations||typeof n.relations!=='object'||Object.values(n.relations).some(v=>!v||typeof v!=='object'||Object.values(v).some(x=>!num(x,-1000,1000))))return fail(26);
  if(!n.armies||typeof n.armies!=='object'||Object.entries(n.armies).some(([id,v])=>typeof id!=='string'||!v||!Number.isSafeInteger(v.familyId)||v.familyId<0||typeof v.central!=='boolean'))return fail(27);
  if(!Array.isArray(n.aliveStates)||n.aliveStates.some(id=>!r.world.nations.some(v=>v.id===id))||new Set(n.aliveStates).size!==n.aliveStates.length)return fail(28);
  if(!n.warContributions||typeof n.warContributions!=='object'||Object.entries(n.warContributions).some(([id,v])=>!Object.hasOwn(r.people.nations,id)||!v||typeof v!=='object'||Object.entries(v).some(([fid,x])=>!Object.hasOwn(n.families,fid)||!num(x,-Number.MAX_VALUE,Number.MAX_VALUE))))return fail(29);
  const st=n.settings;if(!st||typeof st.allowFamilyRebellion!=='boolean'||typeof st.allowCivilWar!=='boolean'||!Number.isInteger(st.familyRebelMinMonths)||!num(st.familyRebelMinMonths,0,240)||!Number.isInteger(st.civilWarMinMonths)||!num(st.civilWarMinMonths,0,240)||!n.lastFamilyRebellion||typeof n.lastFamilyRebellion!=='object'||Object.entries(n.lastFamilyRebellion).some(([id,v])=>!Object.hasOwn(r.people.nations,id)||!num(v,-Number.MAX_VALUE,r.life.gameTime)))return fail(40);
  if(!n.lastCivilWar||typeof n.lastCivilWar!=='object'||Object.entries(n.lastCivilWar).some(([id,x])=>!Object.hasOwn(r.people.nations,id)||!num(x,-Number.MAX_VALUE,r.life.gameTime)))return fail(41);
  if(!n.civilWars||typeof n.civilWars!=='object'||Object.entries(n.civilWars).some(([id,w])=>!Object.hasOwn(r.people.nations,id)||!w||!Object.hasOwn(r.people.nations,w.motherId)||![8,9,10,11].includes(w.type)||typeof w.cause!=='string'||!Number.isSafeInteger(w.familyId)||!ids(w.familyIds)||!w.familyIds.includes(w.familyId)||typeof w.rebelName!=='string'||typeof w.motherName!=='string'))return fail(42);
  const provinces=new Set(r.world.provinces.map(p=>p.id)),seen=new Set<string>();
  for(const [id,f] of Object.entries(n.families)){
    const k=r.kin.families[id],state=r.people.nations[f?.nationId];
    if(!k||!state||k.id!==Number(id)||k.nationId!==f.nationId||f.ruling!==(k.id===(n.rulingFamilies[f.nationId]??state.id)))return fail(3);
    if(!provinces.has(f.homeProvinceId)||!provinces.has(f.originalHomeProvinceId)||!Array.isArray(f.controlledProvinces))return fail(4);
    for(const p of f.controlledProvinces){if(!provinces.has(p)||seen.has(p))return fail(5);seen.add(p);}
    const record=(v:unknown,min:number)=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.values(v).every(x=>num(x,min,Number.MAX_VALUE));
    if(!record(f.historicalClaims,0)||Object.keys(f.historicalClaims).some(p=>!provinces.has(p))||!record(f.rulingDuration,0)||!record(f.stateResidenceMonths,0)||!record(f.lastRulingTime,-Number.MAX_VALUE)||!Array.isArray(f.historicalStateIds)||f.historicalStateIds.some(id=>typeof id!=='string'))return fail(6);
    if(!num(f.rallyCooldown,0,1e6))return fail(9);
    if(!num(f.totalEnemyDestroyed,0,Number.MAX_VALUE)||!Number.isSafeInteger(f.totalProvincesConquered)||f.totalProvincesConquered<0)return fail(7);
    if(!num(f.influence,0,1000)||!num(f.wealth,-1e9,1e12)||!num(f.extendedMembers,0,1e6)||typeof f.religionId!=='string'||!num(f.foundingTime,0,Number.MAX_VALUE)||!Number.isInteger(f.updateDay)||!num(f.updateDay,1,28))return fail(8);
  }
}
