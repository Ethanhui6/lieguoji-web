import {describe,it,expect} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {Chronicle2Session} from './chronicle2-session';
import type {Chronicle2Run} from './chronicle2-model';
import {grid} from './fixture.test-support';
import {queryHistory} from './chronicle-query';
import {ChroniclePanel} from './ChroniclePanel';
import type {HistoricalEntry} from './chronicle-records';
import {siegeInsight,armyReadiness} from './siege-insight';
import {advanceTacticsOccupation} from './tactics-occupation';
import {combatEfficiency} from './tactics-rules';
import {warSites,warSummary} from './war-view';
const make=()=>new Chronicle2Session().execute({type:'create',terrain:grid(),count:3,relations:'war'}).run as Chronicle2Run;
const entry=(id:number):HistoricalEntry=>({id,day:id,tick:id*120,kind:id===1?'accession':'capital',text:id===1?'旧国传位':'迁都旧城',reason:'储粮短缺时的旧史',nationIds:[id===1?'a':'b'],place:{id:'p',name:'旧城',x:1,y:2},people:[{id:'king',name:'林明',order:3,regnalName:'景明',regnalOrdinal:2}],sourceEventId:null});
describe('history inspection never rewrites saved history',()=>{
 it('searches captured names, reasons and independent regnal labels then filters stable identities',()=>{
  const entries=[entry(1),entry(2)],before=structuredClone(entries);
  expect(queryHistory(entries,{text:'景明二世 短缺',kind:'accession',nationId:'a'}).map(e=>e.id)).toEqual([1]);
  expect(queryHistory(entries,{text:'新城',kind:'',nationId:''})).toEqual([]);
  expect(queryHistory(entries,{text:'旧城',kind:'',nationId:'b'}).map(e=>e.id)).toEqual([2]);
  expect(queryHistory(entries,{text:'',kind:'',nationId:''}).map(e=>e.id)).toEqual([2,1]);expect(entries).toEqual(before);
 });
 it('directly exposes the exact requested old entry outside the latest 60 and expands its reason',()=>{
  const c=make().chronicle;c.entries=Array.from({length:85},(_,i)=>entry(i+1));
  const html=renderToStaticMarkup(createElement(ChroniclePanel,{chronicle:c,nations:[{id:'a',name:'新国'}],focusId:1,locate:()=>{}}));
  expect(html).toContain('data-history-id="1" data-focused="true"');expect(html).toContain('<details open="">');
  expect(html.match(/data-history-id="1"/g)).toHaveLength(1);expect(html).toContain('查看更早记录');expect(c.entries[0].text).toBe('旧国传位');
 });
 it('does not substitute a different item when a stale history id is requested',()=>{
  const c=make().chronicle;c.entries=[entry(1)];const html=renderToStaticMarkup(createElement(ChroniclePanel,{chronicle:c,nations:[],focusId:2,locate:()=>{}}));
  expect(html).toContain('此条要闻已不在当前世界');expect(html).not.toContain('data-focused="true"');
 });
});
describe('read-only live siege and supply reports',()=>{
 it('hides stale command timers after peace/retreat but keeps real damaged-defense repairs',()=>{
  const r=make(),w=r.world,a=w.armies[0];w.armies=[a];const rounds={[a.id]:30};
  expect(armyReadiness(w,a.id,r.units,rounds,20,r.battles)!.nextDays).toBeNull();
  const occupation={version:1 as const,sieges:[{provinceId:a.provinceId,controller:a.nationId,attacker:w.nations.find(n=>n.id!==a.nationId)!.id,maximum:400,resistance:300,started:0,pulse:0}]};
  expect(armyReadiness(w,a.id,r.units,rounds,20,r.battles,occupation)!.nextDays).toBe(10/120);
  a.status='retreating';expect(armyReadiness(w,a.id,r.units,rounds,20,r.battles,occupation)!.nextDays).toBeNull();expect(rounds[a.id]).toBe(30);
 });
 it('counts every hostile nation in a three-way siege without inventing an alliance',()=>{
  const r=make(),w=r.world,p=w.provinces[0];w.armies=w.nations.map(n=>w.armies.find(a=>a.nationId===n.id)!);for(const a of w.armies)Object.assign(a,{provinceId:p.id,progress:0,route:[],status:'idle'});
  const occupation={version:1 as const,sieges:[{provinceId:p.id,controller:p.controller,attacker:w.nations.find(n=>n.id!==p.controller)!.id,maximum:400,resistance:390,started:0,pulse:0}]};
  const sites=warSites(w,undefined,occupation),report=siegeInsight(w,p.id,r.units,{},0,occupation)!;
  expect(sites[0].nationIds).toHaveLength(3);expect(warSummary(w,sites).sides).toHaveLength(3);expect(sites[0].armyIds.sort()).toEqual(report.forces.map(a=>a.id).sort());expect(report.attack).toHaveLength(2);
 });
 it('matches actual full-resistance attack/defense pulses and excludes moving, retreating and dead forces',()=>{
  const r=make(),w=r.world,p=w.provinces[0],defender=w.armies.find(a=>a.nationId===p.controller)!,attacker=w.armies.find(a=>a.nationId!==p.controller)!;
  w.armies=[attacker,defender];for(const a of w.armies)Object.assign(a,{provinceId:p.id,route:[],progress:0,status:'idle'});
  const rounds={[attacker.id]:40,[defender.id]:60},before=structuredClone(w),report=siegeInsight(w,p.id,r.units,rounds,20)!;
  expect(report.attack[0].nextDays).toBe(20/120);expect(report.defense[0].nextDays).toBe(40/120);
  const first=advanceTacticsOccupation(w,{version:1,sieges:[]},r.units,40,new Set([attacker.id]),'resistance');
  const siege=first.occupation.sieges[0];expect(siege.maximum-siege.resistance).toBeCloseTo(report.attack[0].perPulse,10);
  const second=advanceTacticsOccupation(first.world,first.occupation,r.units,60,new Set([defender.id]),'resistance');
  expect(second.occupation.sieges[0]?.resistance??siege.maximum).toBeCloseTo(Math.min(siege.maximum,siege.resistance+report.defense[0].perPulse),10);expect(w).toEqual(before);
  attacker.progress=.5;expect(siegeInsight(w,p.id,r.units,rounds,20)!.attack).toHaveLength(0);attacker.progress=0;attacker.status='retreating';expect(siegeInsight(w,p.id,r.units,rounds,20)!.attack).toHaveLength(0);attacker.status='destroyed';attacker.troops=0;expect(siegeInsight(w,p.id,r.units,rounds,20)!.attack).toHaveLength(0);
 });
 it('exposes low supply, consumption and missing schedules without inventing a victory date',()=>{
  const r=make(),a=r.world.armies[0];a.status='fighting';a.supplies=9;
  const report=siegeInsight(r.world,a.provinceId,r.units,{},0)!.forces.find(v=>v.id===a.id)!;
  expect(report.consumption).toBe(8);expect(report.daysWithoutRefill).toBe(2);expect(report.nextDays).toBeNull();
  const before=report.perPulse;a.supplies=0;expect(siegeInsight(r.world,a.provinceId,r.units,{},0)!.forces.find(v=>v.id===a.id)!.perPulse).toBeLessThan(before);
 });
 it('does not apply endpoint mountain/fort bonuses or local resupply to road engagements',()=>{
  const r=make(),w=r.world,a=w.armies[0],p=w.provinces.find(p=>p.id===a.provinceId)!;p.terrain='mountain';w.cities.find(c=>c.provinceId===p.id)!.fort=5;a.status='fighting';a.progress=.5;a.route=[p.neighbors[0]];
  r.battles.engagements=[{id:'road',a:p.id,b:p.neighbors[0],t:.5,armies:[a.id],started:0,pulse:0,carry:{},losses:{}}];
  const report=armyReadiness(w,a.id,r.units,{[a.id]:50},20,r.battles)!;expect(report.atNode).toBe(false);expect(report.efficiency).toBe(combatEfficiency(w,a,r.units,p,false));expect(report.grain).toBeUndefined();expect(report.canRefill).toBe(false);expect(report.nextDays).toBe(.25);
 });
 it('only offers possible home resupply for idle, uncontested defenders and never promises full food',()=>{
  const r=make(),w=r.world,a=w.armies[0];w.armies=[a];a.status='idle';const report=armyReadiness(w,a.id,r.units,{},0,r.battles)!;expect(report.canRefill).toBe(true);expect(report.supplyReason).toContain('余粮');a.status='marching';expect(armyReadiness(w,a.id,r.units,{},0,r.battles)!.canRefill).toBe(false);
 });
});
