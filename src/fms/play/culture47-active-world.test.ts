import {describe,it,expect} from 'vitest';
import {Culture47Session,type Culture47Opening} from './culture47-session';
import {grid} from './fixture.test-support';

const opening:Culture47Opening={terrain:grid((x,y)=>x>20&&x<230&&y>20&&y<230?45:0),count:6,cityCount:60,relations:'peace',setup:{mode:'culture-generated',enabled:['chinese','japanese','english','arab','roman','german']}};
describe('unmodified default countries actually develop and deploy',()=>{
 it('peace opening evaluates every country during its first month and settles real resources through the Session',()=>{
  const session=new Culture47Session(),initial=session.create(opening);let out=initial;
  const initialGold=Object.fromEntries(Object.entries(initial.run.finance.nations).map(([id,n])=>[id,n.gold]));
  const started=performance.now();
  for(let day=0;day<30;day++)out=session.execute({kind:'advance',ticks:120},out.journal.actions.length);
  const decisionMonths=Object.values(out.run.nativeDiplomacy.nations).map(n=>n.updatedMonth);
  expect(out.run.world.day).toBe(30);expect(decisionMonths.every(month=>month===12)).toBe(true);
  expect(Object.entries(out.run.finance.nations).some(([id,n])=>n.gold!==initialGold[id])).toBe(true);
  expect(out.run.nativeDiplomacy.draws).toBeGreaterThan(initial.run.nativeDiplomacy.draws);
  expect(out.run.dailyEconomy.lastDay).toBe(30);
  expect(out.run.nativeWars.campaigns.length).toBeGreaterThan(initial.run.nativeWars.campaigns.length);
  expect(out.run.chronicle.entries.length).toBeGreaterThan(initial.run.chronicle.entries.length);
  expect(Object.values(out.run.armyAutonomy.armies).some(a=>a.decision==='attacking')).toBe(true);
  console.info('active-world-peace',JSON.stringify({days:30,elapsedMs:performance.now()-started,decisionMonths,wars:out.run.nativeWars.campaigns.length,historyEntries:out.run.chronicle.entries.length,armyDecisions:[...new Set(Object.values(out.run.armyAutonomy.armies).map(a=>a.decision))]}));
 },240000);
 it('war opening moves supplied armies and fleets at the recovered standard-map scale, then replays',()=>{
  const session=new Culture47Session(),initial=session.create({...opening,relations:'war'});let out=initial,maxArmy=0,maxFleet=0;
  const distance=(a:Map<string,{x:number;y:number}>,b:Map<string,{x:number;y:number}>)=>Math.max(0,...[...b].map(([id,p])=>{const q=a.get(id)??p;return Math.hypot(p.x-q.x,p.y-q.y);}));
  const started=performance.now();
  for(let day=0;day<8;day++){out=session.execute({kind:'advance',ticks:120},out.journal.actions.length);maxArmy=Math.max(maxArmy,distance(initial.frame.armies,out.frame.armies));maxFleet=Math.max(maxFleet,distance(initial.frame.fleets,out.frame.fleets));}
  // The unpublished 100x experiment required >15/>20 in eight days. Native
  // standard mapping is 24x smaller; retain physical motion AND an upper bound
  // so this test cannot pass by reintroducing the artificial speed multiplier.
  expect(maxArmy).toBeGreaterThan(1);expect(maxFleet).toBeGreaterThan(4);expect(maxFleet).toBeLessThanOrEqual(8*(11/12)+.001);
  expect(out.run.world.armies.some(a=>a.troops>0&&a.supplies>0&&distance(new Map([[a.id,initial.frame.armies.get(a.id)!]]),new Map([[a.id,out.frame.armies.get(a.id)!]]))>1)).toBe(true);
  expect(out.run.navy.fleets.some(f=>f.status!=='lost'&&f.food>0&&distance(new Map([[f.id,initial.frame.fleets.get(f.id)!]]),new Map([[f.id,out.frame.fleets.get(f.id)!]]))>4)).toBe(true);
  expect(new Culture47Session().load(out.journal)).toEqual(out);
  console.info('active-world-war',JSON.stringify({days:8,elapsedMs:performance.now()-started,maxArmy,maxFleet,contacts:out.run.forceContacts.pairs.length,sieges:out.run.occupation.sieges.length,fleetDecisions:[...new Set(Object.values(out.run.navalAutonomy.fleets).map(f=>f.decision))]}));
 },180000);
});
