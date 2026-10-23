import {beforeAll,describe,expect,it} from 'vitest';
import {grid} from './fixture.test-support';
import {Culture47Session} from './culture47-session';
import {SETTLEMENT47_ALGORITHM} from './settlement47-regions';
import {populationStamp47} from './civilization47-population-types';
import {politicalStamp47,assertPolitics47} from './civilization47-political-owner';
import {FOUNDING_RULE47,assertFoundings47,type FoundingRun47} from './civilization47-founding';
import type {NobilityRun47} from './civilization47-nobility';
import {launchNobleRevolt47,restorationWeight47,rallyProbability47} from './civilization47-nobility-rebellion';
import {rulingFamilyId47} from './civilization47-nobility-succession';

type Run=NobilityRun47&FoundingRun47&{nativeWars:{campaigns:{endedTick:number|null;attacker:string;defender:string;internal?:{casusBelliId:number}}[]}};
let journal:ReturnType<Culture47Session['create']>['journal'];
beforeAll(()=>{
  const s=new Culture47Session();let x=s.create({terrain:grid((x,y)=>x>10&&x<245&&y>10&&y<245?45:0),count:3,cityCount:60,relations:'peace',settlementAlgorithm:SETTLEMENT47_ALGORITHM,setup:{mode:'culture-generated',enabled:['chinese','japanese','arab']},families:'original'});
  x=s.execute({kind:'enable-foundings',rule:FOUNDING_RULE47,expected:populationStamp47(x.run)},x.journal.actions.length);
  for(let i=0;i<20;i++)x=s.execute({kind:'advance',ticks:120},x.journal.actions.length);
  // n-2 falls: all of its land goes to n-0.
  const land=x.run.world.provinces.filter(p=>p.controller==='n-2').map(p=>p.id);
  x=s.execute({kind:'territory',edit:{nationId:'n-0',provinceIds:land},expected:politicalStamp47(x.run)},x.journal.actions.length);
  x=s.execute({kind:'advance',ticks:120},x.journal.actions.length);
  journal=x.journal;
},300000);
describe('original family restoration (TryFamilyRestoration)',()=>{
  it('CalculateRestorationWeight follows the original pieces and caps at 95',()=>{
    const r=structuredClone(new Culture47Session().load(journal).run) as Run,n=r.nobility!;
    const id=Object.keys(n.families).find(v=>n.families[v].nationId==='n-0'&&!n.families[v].ruling)!,fam=n.families[id];
    fam.rulingDuration={'n-2':10};expect(restorationWeight47(r,id,'n-2')).toBe(0);
    fam.rulingDuration={'n-2':24};fam.lastRulingTime={};fam.influence=500;fam.controlledProvinces=fam.controlledProvinces.slice(0,2);
    const nation=r.civilization.nations['n-2'],polity=nation.polity==='Empire'?1.5:nation.polity==='Kingdom'?1.3:nation.polity==='Republic'?.7:1,culture=r.kin.families[id].cultureName===nation.cultureId?1.2:1;
    expect(restorationWeight47(r,id,'n-2')).toBeCloseTo(Math.min(95,(12+20+10+fam.controlledProvinces.length*3)*polity*culture),3);
    fam.rulingDuration={'n-2':2000};expect(restorationWeight47(r,id,'n-2')).toBe(95);
  },300000);
  it('the family restores the fallen state on its land, takes the throne and wars the mother state',()=>{
    const r=structuredClone(new Culture47Session().load(journal).run) as Run,n=r.nobility!;
    expect(r.world.provinces.some(p=>p.controller==='n-2')).toBe(false);
    const id=Object.keys(n.families).find(v=>n.families[v].nationId==='n-0'&&!n.families[v].ruling&&n.families[v].controlledProvinces.length>0&&r.kin.persons[r.kin.families[v].headId]?.isAlive)!;
    const fam=n.families[id],head=r.kin.families[id].headId,land=[...fam.controlledProvinces],nations=r.world.nations.length;
    fam.historicalStateIds=['n-2'];fam.rulingDuration={'n-2':400};fam.lastRulingTime={'n-2':r.life.gameTime};
    expect(rallyProbability47(r,id,id,'n-2')).toBeGreaterThanOrEqual(0);
    expect(launchNobleRevolt47(r,id,[id],'测试复国。',{cb:15,legacy:4,goal:7},()=>{},'n-2')).toBe('n-2');
    expect(r.world.nations.length).toBe(nations);
    for(const p of land)expect(r.world.provinces.find(v=>v.id===p)!.controller).toBe('n-2');
    expect(n.families[id].nationId).toBe('n-2');expect(rulingFamilyId47(r,'n-2')).toBe(Number(id));
    expect(r.people.nations['n-2'].leaderId).toBe(head);expect(r.sovereignty.restorations['n-2']).toBe(1);
    expect(Object.hasOwn(r.chronicle.ended,'n-2')).toBe(false);
    expect(r.chronicle.entries.some(e=>e.kind==='restoration'&&e.text.includes('家族复国'))).toBe(true);
    expect(r.nativeWars.campaigns.some(c=>c.endedTick===null&&(c.internal?.casusBelliId as number|undefined)===15&&c.defender==='n-2'&&c.attacker==='n-0')).toBe(true);
    assertFoundings47(r);assertPolitics47(r);
  },300000);
});
