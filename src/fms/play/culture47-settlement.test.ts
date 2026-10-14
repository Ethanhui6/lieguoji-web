import {beforeAll,describe,expect,it} from 'vitest';
import {createFmsDocument,type FmsDocument} from '../model';
import {generateFmsFullMap} from '../full-map-terrain';
import {Culture47Session,assertCulture47Journal,type Culture47Opening} from './culture47-session';
import {SETTLEMENT47_ALGORITHM} from './settlement47-regions';
import {grid} from './fixture.test-support';

let fullMap:FmsDocument;
const setup={mode:'culture-generated' as const,enabled:['chinese','japanese'] as ('chinese'|'japanese')[]};
beforeAll(async()=>{
  fullMap=await createFmsDocument({yieldTask:async()=>{}});
  const generated=await generateFmsFullMap(fullMap,{seed:'1337',template:'continents'},{yieldTask:async()=>{}});
  fullMap.elevations=generated.elevations;
},30000);

describe('explicit current47 creation partition and journal replay',()=>{
  it('creates the formerly blocked default full map, advances and cold-replays the exact chosen partition',()=>{
    const opening:Culture47Opening={terrain:fullMap,count:6,cityCount:60,relations:'war',setup,settlementAlgorithm:SETTLEMENT47_ALGORITHM};
    const session=new Culture47Session(),initial=session.create(opening);
    expect(initial.run.world.provinces).toHaveLength(60);
    expect(initial.run.world.cities).toHaveLength(60);
    expect(initial.run.world.nations).toHaveLength(6);
    expect(initial.journal.opening.settlementAlgorithm).toBe(SETTLEMENT47_ALGORITHM);
    const advanced=session.execute({kind:'advance',ticks:120},0);
    expect(advanced.run.clock.tick).toBe(120);
    const restored=new Culture47Session().load(advanced.journal);
    expect(restored).toEqual(advanced);
    expect(fullMap.elevations.some(h=>h>20)).toBe(true);
  // This full 36,864-point correctness/replay fixture remains slow. The bound
  // permits measuring it separately; passing does not accept startup performance.
  },180000);

  it('retains the five-field opening and rejects unknown or extra creation contracts',()=>{
    const opening:Culture47Opening={terrain:grid((x,y)=>x>0&&x<250&&y>0&&y<250?45:0),count:2,cityCount:24,relations:'peace',setup};
    const original=new Culture47Session().create(opening);
    expect(Object.hasOwn(original.journal.opening,'settlementAlgorithm')).toBe(false);
    expect(new Culture47Session().load(original.journal)).toEqual(original);
    expect(()=>assertCulture47Journal({...original.journal,opening:{...opening,settlementAlgorithm:'future-partition'}})).toThrow('创建记录');
    expect(()=>assertCulture47Journal({...original.journal,opening:{...opening,settlementAlgorithm:SETTLEMENT47_ALGORITHM,extra:true}})).toThrow('创建记录');
    expect(()=>assertCulture47Journal({...original.journal,opening:{...opening,settlementAlgorithm:undefined}})).toThrow('创建记录');
  },30000);
});
