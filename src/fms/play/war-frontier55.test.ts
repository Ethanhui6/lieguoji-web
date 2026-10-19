import {beforeAll,describe,it,expect} from 'vitest';
import {grid} from './fixture.test-support';
import {campaignGoalLabel55,contiguousWarTargets55,routeSkipsCell55,warGoalAdvanceReason55,webProvinceNeighbors55} from './war-frontier55';
import {Culture47Session,type Culture47Opening} from './culture47-session';
import {settleWar47} from './civilization47-war-settlement';
import {issueAutonomousArmyOrders47} from './civilization47-army-ai';
import {actualForces47} from './force-runtime47';
import type {PoliticalRun47} from './civilization47-diplomatic-world';

const border=webProvinceNeighbors55([{id:'a',neighbors:['b']},{id:'b',neighbors:['a','c']},{id:'c',neighbors:['b']}]);
const provinces=[{id:'a',controller:'us'},{id:'b',controller:'them'},{id:'c',controller:'them'}];
describe('contiguous war frontier',()=>{
  it('keeps the next enemy province and refuses the coast behind it',()=>{
    const coasts=new Set(['c']);
    expect(contiguousWarTargets55({ownedIds:['a'],assistIds:[],invadedIds:[],reliefIds:[],provinces,enemies:new Set(['them']),coasts,border}).map(v=>v.id)).toEqual(['b']);
  });
  it('uses a coastal entry only when no land border exists, and still names the goal',()=>{
    const split=webProvinceNeighbors55([{id:'a',neighbors:[]},{id:'c',neighbors:[]}]);
    const targets=contiguousWarTargets55({ownedIds:['a'],assistIds:[],invadedIds:[],reliefIds:[],provinces:[{id:'a',controller:'us'},{id:'c',controller:'them'}],enemies:new Set(['them']),coasts:new Set(['c']),border:split});
    expect(targets).toEqual([{id:'c',kind:'sea-entry'}]);
    const reason=warGoalAdvanceReason55({kind:'sea-entry',provinceName:'岸城',goal:campaignGoalLabel55([{id:1,type:1,scope:{provinceIds:[2],requiredCount:0}}],2),protruding:false});
    expect(reason).toContain('战争目标');expect(reason).toContain('割让');expect(reason).toContain('网页适配');expect(reason).not.toContain('跳过尚未接壤');
  });
  it('rejects a route that skips a cell',()=>{
    const linked=(from:number,to:number)=>Math.abs(from-to)===1;
    expect(routeSkipsCell55(linked,[1,2,3])).toBe(false);expect(routeSkipsCell55(linked,[1,3])).toBe(true);
  });
});

const opening:Culture47Opening={terrain:grid((x,y)=>x>20&&x<230&&y>20&&y<230?45:0),count:2,cityCount:24,relations:'peace',setup:{mode:'culture-generated',enabled:['chinese','japanese']}};
let session:Culture47Session;
beforeAll(()=>{session=new Culture47Session();session.create(opening);},30000);
describe('war goal reasons, peace ledger and preview cancellation',()=>{
  it('explains the selected goal and does not order a non-adjacent enemy province',()=>{
    const s=new Culture47Session();s.load(structuredClone(session.snapshot().journal));
    const command={type:'declare-war' as const,nationId:'n-0',targetNationId:'n-1'},preview=s.preview(command);
    expect(preview.valid,preview.reason).toBe(true);expect(s.snapshot().journal.actions).toEqual(session.snapshot().journal.actions);
    const declared=s.execute({kind:'politics',action:command,expected:preview.expected},preview.sequence).run;
    declared.clock.tick=120;declared.world.day=1;declared.armyAutonomy.lastDay=0;
    issueAutonomousArmyOrders47(declared,{preferPorts:false,portSeaFaces:new Set(),oceanRouteFaces:new Set()});
    const places=new Map(declared.world.provinces.map(p=>[p.id,p])),g=actualForces47(declared).spatial.graph;
    const attacking=declared.world.armies.filter(a=>['attacking','supporting'].includes(declared.armyAutonomy.armies[a.id].decision));
    expect(attacking.length).toBeGreaterThan(0);
    for(const a of attacking){const row=declared.armyAutonomy.armies[a.id],target=places.get(row.targetId!)!,owned=declared.world.provinces.filter(p=>p.controller===a.nationId);
      expect(row.reason).toMatch(/战争目标|没有逐省战争目标/);expect(row.reason).toMatch(/沿相连边境|沿可登陆海岸|沿本国边境回援|友方土地/);
      const landBorder=owned.some(p=>p.neighbors.some(id=>declared.world.nations.some(()=>places.get(id)?.controller!==a.nationId)));
      if(row.reason.includes('沿相连边境'))expect(owned.some(p=>p.neighbors.includes(target.id))||target.controller===a.nationId).toBe(true);
      if(landBorder)expect(target.controller===a.nationId||owned.some(p=>p.neighbors.includes(target.id))).toBe(true);
      const nodes=declared.armyPositions.records[a.id].nodes;expect(routeSkipsCell55((from,to)=>g.cells.get(from)!.links.some(l=>l.to===to),nodes)).toBe(false);
    }
  },30000);
  it('records peace territory and capital ownership with the chronicle event id',()=>{
    const s=new Culture47Session();s.load(structuredClone(session.snapshot().journal));
    const command={type:'declare-war' as const,nationId:'n-0',targetNationId:'n-1'},preview=s.preview(command);
    const r=s.execute({kind:'politics',action:command,expected:preview.expected},preview.sequence).run as PoliticalRun47;
    const defender=r.world.nations.find(n=>n.id==='n-1')!,city=r.world.cities.find(c=>c.id===defender.capitalId)!,home=r.world.provinces.find(p=>p.id===city.provinceId)!;
    expect(r.world.provinces.filter(p=>p.controller==='n-1').length).toBeGreaterThan(1);
    home.controller='n-0';const war=r.nativeWars.campaigns.find(c=>c.endedTick===null)!;settleWar47(r,war,11);
    const moved=r.world.cities.find(c=>c.id===defender.capitalId)!;expect(moved.id).not.toBe(city.id);
    expect(r.world.provinces.find(p=>p.id===moved.provinceId)!.controller).toBe('n-1');
    const peace=r.chronicle.entries.find(e=>e.text.includes('战争结束'))!;
    expect(peace.sourceEventId).toBeTypeOf('number');expect(peace.reason).toContain(`大事记事件 ${peace.sourceEventId}`);
    expect(peace.reason).toContain('首都');expect(peace.reason).toContain(moved.name);expect(peace.reason).toContain('无和约转地');
    expect(r.world.provinces.filter(p=>p.id!==home.id&&p.legalOwner==='n-1').every(p=>p.controller==='n-1')).toBe(true);
    expect(r.chronicle.entries.find(e=>e.kind==='capital')?.sourceEventId).toBeTypeOf('number');
  },30000);
  it('cancels a diplomatic preview and makes the worker reject the old stamp',()=>{
    const s=new Culture47Session();s.load(structuredClone(session.snapshot().journal));
    const before=s.snapshot(),command={type:'declare-war' as const,nationId:'n-0',targetNationId:'n-1'},preview=s.preview(command);
    expect(s.snapshot()).toEqual(before);
    const moved=s.execute({kind:'advance',ticks:120},0);
    expect(()=>s.execute({kind:'politics',action:command,expected:preview.expected},1)).toThrow(/过期|重新预览/);
    expect(s.snapshot()).toEqual(moved);
    const again=s.preview(command);expect(again.valid,again.reason).toBe(true);
    const out=s.execute({kind:'politics',action:command,expected:again.expected},again.sequence);
    expect(out.run.nativeWars.campaigns.some(c=>c.endedTick===null&&c.history==='complete')).toBe(true);
  },30000);
});
