import {beforeAll,describe,expect,it} from 'vitest';
import {grid} from './fixture.test-support';
import {Culture47Session} from './culture47-session';
import {SETTLEMENT47_ALGORITHM} from './settlement47-regions';
import {populationStamp47} from './civilization47-population-types';
import {politicalStamp47} from './civilization47-political-owner';
import {FOUNDING_RULE47,type FoundingRun47} from './civilization47-founding';
import type {NobilityRun47} from './civilization47-nobility';
import {civilWarBlocker47} from './civilization47-rebellion';
import {applyCivilWarEffect47,determineCivilWarType47} from './civilization47-nobility-civil-war';
import {rulingFamilyId47} from './civilization47-nobility-succession';
import {civilWarCb47,civilWarGoal47} from './civil-war47-types';

type Run=NobilityRun47&FoundingRun47&{nativeWars:{campaigns:{endedTick:number|null;attacker:string;defender:string;goals:{type:number}[];internal?:{casusBelliId:number;legacyType:number}}[]}};
let journal:ReturnType<Culture47Session['create']>['journal'];
beforeAll(()=>{
  const s=new Culture47Session();let x=s.create({terrain:grid((x,y)=>x>10&&x<245&&y>10&&y<245?45:0),count:3,cityCount:60,relations:'peace',settlementAlgorithm:SETTLEMENT47_ALGORITHM,setup:{mode:'culture-generated',enabled:['chinese','japanese','arab']},families:'original'});
  x=s.execute({kind:'enable-foundings',rule:FOUNDING_RULE47,expected:populationStamp47(x.run)},x.journal.actions.length);
  for(let i=0;i<40;i++)x=s.execute({kind:'advance',ticks:120},x.journal.actions.length);
  journal=x.journal;
},300000);
describe('original civil war (StartCivilWar)',()=>{
  it('the two most influential landed families found the rebel state and the CB10–13 war starts, advances and replays',()=>{
    const s=new Culture47Session();let x=s.load(journal);
    const r0=x.run as Run,n0=r0.nobility!;
    const mother=r0.world.nations.map(v=>v.id).find(v=>civilWarBlocker47(r0,v)===null)!;expect(mother).toBeDefined();
    const top=Object.keys(n0.families).filter(v=>n0.families[v].nationId===mother&&!n0.families[v].ruling&&n0.families[v].controlledProvinces.length>0).sort((a,b)=>n0.families[b].influence-n0.families[a].influence).slice(0,2);
    const type=determineCivilWarType47(structuredClone(r0),mother,top),before=r0.world.nations.length,motherName=r0.world.nations.find(v=>v.id===mother)!.name;
    x=s.execute({kind:'civil-war',nationId:mother,expected:politicalStamp47(x.run)},x.journal.actions.length);
    const r=x.run as Run,n=r.nobility!,rebel=r.world.nations.at(-1)!.id;
    expect(r.world.nations.length).toBe(before+1);
    const record=n.civilWars[rebel];expect(record.motherId).toBe(mother);expect(record.type).toBe(type);expect(record.motherName).toBe(motherName);
    expect(n.families[String(record.familyId)].nationId).toBe(rebel);expect(rulingFamilyId47(r,rebel)).toBe(record.familyId);
    for(const id of top)expect(n.families[id].nationId).toBe(rebel);
    expect(n.lastCivilWar[mother]).toBe(r.life.gameTime);
    const war=r.nativeWars.campaigns.find(c=>c.endedTick===null&&(c.internal?.casusBelliId as number|undefined)===civilWarCb47(type))!;
    expect(war.attacker).toBe(mother);expect(war.defender).toBe(rebel);expect(war.internal!.legacyType).toBe(type);expect(war.goals[0].type).toBe(civilWarGoal47(type));
    expect(r.chronicle.entries.some(e=>e.text.startsWith(motherName+'爆发'))).toBe(true);
    expect(civilWarBlocker47(r,mother)).not.toBeNull();
    for(let i=0;i<120;i++)x=s.execute({kind:'advance',ticks:120},x.journal.actions.length);
    expect(new Culture47Session().load(x.journal)).toEqual(x);
  },600000);
  it('ClaimThrone / Reform / Overthrow: the winner inherits the loser identity; overthrow adds 100 influence',()=>{
    const r=structuredClone(new Culture47Session().load(journal).run) as Run;
    const [a,b]=r.world.nations.map(v=>v.id),fam=r.nobility!.families[String(rulingFamilyId47(r,a))],influence=fam.influence,name=r.civilization.nations[b].name.custom??r.civilization.nations[b].name.value;
    applyCivilWarEffect47(r,8,a,b);
    expect(fam.influence).toBeCloseTo(influence+100,3);
    const after=r.civilization.nations[a].name;
    expect(r.civilization.nations[a].cultureId===r.civilization.nations[b].cultureId?after.value:after.custom).toContain(name.slice(0,1));
    expect(r.world.nations.find(v=>v.id===a)!.name).toBeTruthy();
  },300000);
});
