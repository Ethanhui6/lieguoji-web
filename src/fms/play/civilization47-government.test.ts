import {beforeAll,describe,expect,it} from 'vitest';
import {grid} from './fixture.test-support';
import {createCivilizationWorld47} from './civilization47-world';
import {CULTURE_IDS47,POLITIES47} from './civilization47-catalog';
import {attachGovernment47,createGovernmentWorld47,editGovernmentIdentity47,type Government47} from './civilization47-government';
import {assertGovernmentOpening47} from './civilization47-government-validation';
import {editCivilization47} from './civilization47-names';
import {initialEconomy47,terrainLivelihood47,validateEconomySetup47,assertEconomy47,economicEthnic47,LIVELIHOODS47} from './civilization47-economy';
import {musterFoundingArmies47,emptyTactics47} from './civilization47-muster';
import {nativeGoldSettlement, nativeProvinceIncome} from './native-economy/settlement';
import {defaultPoliticalCombat,nativeGoldBattleModifier} from './native-combat/upper-efficiency';
import {buildArmyTravelGraph47} from './army-travel47-graph';
import {armyPresence47} from './army-presence47';

let draft:ReturnType<typeof createCivilizationWorld47>,government:Government47;
beforeAll(()=>{
  const d=grid((x,y)=>x>20&&x<230&&y>20&&y<230?45:0),enabled=CULTURE_IDS47.slice(0,6);
  draft=createCivilizationWorld47(d,6,36,'peace',{mode:'culture-generated',enabled,nations:Object.fromEntries(enabled.map((cultureId,i)=>['n-'+i,{cultureId,religionId:'none' as const,polity:POLITIES47[i]}]))});
  government=attachGovernment47(draft,{'n-0':'Commercial','n-1':'Other'});
},20000);

describe('selected real-culture government enters actual population, forces and treasury',()=>{
  it('creates a coherent actual-world candidate without an old six-culture layer',()=>{
    assertGovernmentOpening47(government);expect('culture' in government).toBe(false);expect('naming' in government).toBe(false);
    expect(government.world.armies.length).toBeGreaterThan(6);expect(draft.world.armies).toEqual([]);expect('finance' in draft).toBe(false);
    for(const [i,n] of government.world.nations.entries()){
      expect(government.upperCombat.nations[n.id].polity).toBe(POLITIES47[i]);expect(government.civilization.nations[n.id].polity).toBe(POLITIES47[i]);
      expect(government.governmentOpening.accounts[n.id].polity).toBe(POLITIES47[i]);expect(government.governmentOpening.accounts[n.id].destiny).toBe(0);
      expect(government.upperCombat.nations[n.id].destiny).toBe(government.destiny.nations[n.id].destiny);expect(government.destiny.nations[n.id].destiny).toBeGreaterThanOrEqual(10);
      const receipt=government.governmentOpening.accounts[n.id],ledger=government.finance.nations[n.id];
      expect(ledger.gold).toBe(nativeGoldSettlement(receipt.input).gold);expect(ledger.goldBattleModifier).toBe(nativeGoldSettlement(receipt.input).goldBattleModifier);
    }
    expect(government.kin).toEqual(draft.kin);expect(government.people).toEqual(draft.people);expect(government.life).toEqual(draft.life);
  });
  it('debits exactly the recruited internal population and keeps food unchanged',()=>{
    for(const p of government.world.statecraft!.provinces){const receipts=government.governmentOpening.recruitments.filter(a=>a.homeId===p.provinceId),opening=government.governmentOpening.population[p.provinceId];expect(p.population).toBe(opening-receipts.reduce((sum,a)=>sum+a.populationCost,0));expect(p.grain).toBe(opening*20);}
    for(const a of government.world.armies){const receipt=government.governmentOpening.recruitments.find(v=>v.armyId===a.id)!;expect(receipt.populationCost).toBe(Math.round(a.troops/10));expect(government.tactics.forces[a.id]).toMatchObject({homeId:a.provinceId,kind:'regular',fullStrength:a.troops});expect(a.morale).toBe(80);expect(a.supplies).toBe(100);expect(a.name).toContain(government.world.cities.find(c=>c.provinceId===a.provinceId)!.name);}
  });
  it('registers each actual force at a real clipped land position, ready for47 movement',()=>{
    const graph=buildArmyTravelGraph47(government.terrain,government.world),presence=armyPresence47(government.armyPositions,graph,government.world.armies);
    expect(presence.sea.size).toBe(0);expect(presence.points.size).toBe(government.world.armies.length);
    for(const a of government.world.armies){expect(presence.land.get(a.provinceId)).toContain(a);expect(presence.points.get(a.id)).toEqual(government.world.provinces.find(p=>p.id===a.provinceId)!.center);}
  });
  it('uses the selected polity in the economic combat factor without inventing a tax multiplier',()=>{
    const republic=attachGovernment47(editCivilization47(draft,{kind:'nation',id:'n-0',patch:{polity:'Republic'}},0),{'n-0':'Other'});
    const tribal=attachGovernment47(editCivilization47(draft,{kind:'nation',id:'n-0',patch:{polity:'Tribal'}},0),{'n-0':'Other'});
    const a=republic.finance.nations['n-0'],b=tribal.finance.nations['n-0'];expect(a.gold).toBe(b.gold);expect(a.goldPerMonth).toBe(b.goldPerMonth);expect(a.goldBattleModifier).not.toBe(b.goldBattleModifier);
    expect(a.goldBattleModifier).toBe(nativeGoldBattleModifier(a.gold,defaultPoliticalCombat('Republic').goldProduction,'Other'));
    expect(b.goldBattleModifier).toBe(nativeGoldBattleModifier(b.gold,defaultPoliticalCombat('Tribal').goldProduction,'Other'));
  });
  it('reforms labels and live polity atomically without recasting the original grant or recruiting twice',()=>{
    const before=structuredClone(government),next=editGovernmentIdentity47(government,{kind:'nation',id:'n-0',patch:{polity:'Republic',religionId:'islam'}},government.civilization.revision);
    expect(next.upperCombat.nations['n-0'].polity).toBe('Republic');expect(next.world.nations[0].name).toContain('共和国');expect(next.governmentOpening).toEqual(government.governmentOpening);
    expect(next.finance).toEqual(government.finance);expect(next.world.armies).toEqual(government.world.armies);expect(next.world.statecraft).toEqual(government.world.statecraft);expect(next.kin).toEqual(government.kin);expect(government).toEqual(before);
    expect(()=>editGovernmentIdentity47(next,{kind:'nation',id:'n-0',patch:{polity:'Empire'}},0)).toThrow(/变化/);
  });
  it('keeps existing military names and records when a player renames a city',()=>{
    const next=editGovernmentIdentity47(government,{kind:'city',id:'c-0',customName:'新港'},0);expect(next.world.cities[0].name).toBe('新港');expect(next.world.armies).toEqual(government.world.armies);expect(next.finance).toEqual(government.finance);
  });
  it('does not run one-time initialization twice or overwrite a progressed population candidate',()=>{
    const before=structuredClone(government);expect(()=>attachGovernment47(government)).toThrow(/一次/);expect(government).toEqual(before);
    const moved=structuredClone(draft);moved.clock.tick=1;const original=structuredClone(moved);expect(()=>attachGovernment47(moved)).toThrow();expect(moved).toEqual(original);
  });
  it('preserves typed terrain and the whole opening through structured clone, without claiming Store49 acceptance',()=>{
    const copy=structuredClone(government);assertGovernmentOpening47(copy);expect(copy).toEqual(government);expect(copy.terrain.elevations).toBeInstanceOf(Int32Array);expect(copy.terrain.triangles).toBeInstanceOf(Uint32Array);
  });
  it('exposes the complete creation owner for either historical or generated place mode',()=>{
    const source=structuredClone(draft.terrain),r=createGovernmentWorld47(source,2,24,'war',{mode:'historical-names',enabled:['chinese','japanese']},{'n-0':'Agriculture','n-1':'Maritime'});
    expect(r.civilization.mode).toBe('historical-names');expect(r.world.armies.length).toBeGreaterThan(3);expect(r.economy.nations['n-0'].ethnic).toBe('Agriculture');expect(r.economy.nations['n-1'].ethnic).toBe('Maritime');expect(source).toEqual(draft.terrain);assertGovernmentOpening47(r);
  });
});

describe('economic lifestyle is explicit, persistent, and independent of religion',()=>{
  it('allows every recovered economic attribute plus an explicit neutral choice',()=>{
    for(const choice of LIVELIHOODS47){const e=initialEconomy47(draft.world,government.finance.provinces,{'n-0':choice});expect(economicEthnic47(e,'n-0')).toBe(choice);expect(e.nations['n-0'].source).toBe('player-start');assertEconomy47(e,draft.world,government.finance.provinces);}
  });
  it('derives defaults from actual landscape without mapping real cultures to fantasy IDs',()=>{
    expect(terrainLivelihood47(['p'],{p:{cellBiomes:[4,4,4],seaNeighbor:false}})).toBe('Nomadic');
    expect(terrainLivelihood47(['p'],{p:{cellBiomes:[6,6,6],seaNeighbor:false}})).toBe('Agriculture');
    expect(terrainLivelihood47(['p'],{p:{cellBiomes:[9,9,9],seaNeighbor:false}})).toBe('FishAndHunting');
    expect(terrainLivelihood47(['p'],{p:{cellBiomes:[11,11,11],seaNeighbor:false}})).toBe('Other');
    expect(terrainLivelihood47(['p'],{p:{cellBiomes:[9,9,9],seaNeighbor:true}})).toBe('Maritime');
    expect(()=>terrainLivelihood47(['p'],{p:{cellBiomes:[0,0,0],seaNeighbor:true}})).toThrow(/陆地/);
  });
  it('feeds the persisted choice into native resource and treasury calculations',()=>{
    const n='n-0',input=government.governmentOpening.accounts[n].input,ids=government.upperCombat.nations[n].provinceOrder;
    expect(input.ethnic).toBe('Commercial');expect(input.provinceIncome).toEqual(ids.map(id=>{const p=government.finance.provinces[id];return nativeProvinceIncome({population:government.world.statecraft!.provinces.find(p=>p.provinceId===id)!.population,maxPopulation:p.maxPopulation,cellCount:p.cellBiomes.length,resources:p.resources,ethnic:'Commercial',destiny:0,nationProvinceCount:ids.length,worldProvinceCount:government.world.provinces.length,localIncomeMultiplier:1});}));
  });
  it('rejects unknown, inherited or malformed setup instead of defaulting to an old cultural pool',()=>{
    for(const setup of [{'n-0':'EasternFantasy'},{missing:'Commercial'},JSON.parse('{"__proto__":"Nomadic"}'),{'n-0':undefined},[],null])expect(()=>validateEconomySetup47(setup as never,draft.world.nations.map(n=>n.id))).toThrow();
    const before=structuredClone(draft);expect(()=>attachGovernment47(draft,{'n-0':'future'} as never)).toThrow();expect(draft).toEqual(before);expect(()=>economicEthnic47(government.economy,'constructor')).toThrow();
  });
});

describe('initial regular recruitment and strict first-settlement receipt',()=>{
  it('respects native displayed/internal strength conversion, ordered homes and no food debit',()=>{
    const world=structuredClone(draft.world);world.nations=world.nations.slice(0,2);world.provinces=world.provinces.slice(0,4);world.armies=[];
    world.provinces.forEach((p,i)=>{p.legalOwner=p.controller='n-'+Math.floor(i/2);});
    world.statecraft!.provinces=world.provinces.map((p,i)=>({provinceId:p.id,population:(i+1)*1000,grain:0}));
    const r={world,units:{},tactics:emptyTactics47(world)},receipts=musterFoundingArmies47(r);
    expect(receipts.map(p=>[p.homeId,p.troops,p.populationCost])).toEqual([[world.provinces[0].id,1000,100],[world.provinces[2].id,2400,240]]);
    expect(r.units).toEqual({'force-1':'Infantry','force-2':'Archer'});expect(world.statecraft!.provinces.map(p=>p.population)).toEqual([900,2000,2760,4000]);expect(world.statecraft!.provinces.every(p=>p.grain===0)).toBe(true);
    expect(world.events.slice(-2).every(e=>e.reason.includes('粮储未扣'))).toBe(true);expect(()=>musterFoundingArmies47(r)).toThrow(/一次/);
  });
  it('skips an underpopulated home and does not borrow from a different province',()=>{
    const world=structuredClone(draft.world);world.statecraft!.provinces.forEach(p=>{p.population=0;p.grain=0;});const r={world,units:{},tactics:emptyTactics47(world)},eventId=world.nextEventId;
    expect(musterFoundingArmies47(r)).toEqual([]);expect(world.armies).toEqual([]);expect(world.nextEventId).toBe(eventId);
  });
  it.each(['polity','futureEconomy','economicAlias','population','grain','resource','armySource','armyPosition','armyCount','governmentFuture','grant','grantInputs','missingAccount','destiny','scale','sparseRecruitments','sparseIncome','extraArrayField'] as const)('rejects %s corruption without partially applying identity changes',fault=>{
    const r=structuredClone(government),first=r.world.provinces[0].id,a=r.world.armies[0];
    if(fault==='polity')r.upperCombat.nations['n-0'].polity='Republic';if(fault==='futureEconomy')Object.assign(r.economy,{future:1});if(fault==='economicAlias')Object.assign(r.economy.nations['n-0'],{ethnic:'EasternFantasy'});
    if(fault==='population')r.world.statecraft!.provinces[0].population++;if(fault==='grain')r.world.statecraft!.provinces[0].grain++;if(fault==='resource')r.finance.provinces[first].maxPopulation++;
    if(fault==='armySource')r.tactics.forces[a.id].fullStrength++;if(fault==='armyPosition')r.armyPositions.binding+='x';if(fault==='armyCount')r.world.armies.pop();if(fault==='governmentFuture')Object.assign(r.governmentOpening,{future:1});
    if(fault==='grant')r.finance.nations['n-0'].gold++;if(fault==='grantInputs')r.governmentOpening.accounts['n-0'].input.gold=100;if(fault==='missingAccount')delete r.finance.nations['n-0'];if(fault==='destiny')r.destiny.nations['n-0'].seed++;if(fault==='scale')r.scale++;
    if(fault==='sparseRecruitments')r.governmentOpening.recruitments=Array(r.governmentOpening.recruitments.length);if(fault==='sparseIncome')r.governmentOpening.accounts['n-0'].input.provinceIncome=Array(r.governmentOpening.accounts['n-0'].input.provinceIncome.length);if(fault==='extraArrayField')Object.assign(r.governmentOpening.recruitments,{future:1});
    const before=structuredClone(r);expect(()=>assertGovernmentOpening47(r)).toThrow();expect(()=>editGovernmentIdentity47(r,{kind:'nation',id:'n-0',patch:{customName:'错误写入'}},0)).toThrow();expect(r).toEqual(before);
  });
});
