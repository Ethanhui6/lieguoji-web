import {describe,it,expect} from 'vitest';
import {grid} from './fixture.test-support';
import {Culture47Session} from './culture47-session';
import {SETTLEMENT47_ALGORITHM} from './settlement47-regions';
import {territoryLabels} from './territory-labels';

describe('territory labels',()=>{
 it('reuses untouched components and equals a full recomputation after a conquest',()=>{
  const world=new Culture47Session().create({terrain:grid((x,y)=>x>20&&x<230&&y>20&&y<230?45:0),count:4,cityCount:24,relations:'peace',settlementAlgorithm:SETTLEMENT47_ALGORITHM,setup:{mode:'culture-generated',enabled:['chinese','japanese']}}).run.world;
  const before=territoryLabels(world);
  const conquered=structuredClone(world),p=conquered.provinces.find(p=>p.controller!==conquered.provinces[0].controller)!;p.controller=conquered.provinces[0].controller;
  const cached=territoryLabels(conquered);
  // A different world id clears the cache: the same provinces from scratch.
  const fresh=territoryLabels({...conquered,custom:{...conquered.custom!,id:conquered.custom!.id+'-fresh'}});
  expect(cached).toEqual(fresh);expect(cached).not.toEqual(before);
  const untouched=before.filter(l=>!l.provinceIds.includes(p.id)&&l.nationId!==p.controller);
  for(const label of untouched)expect(cached).toContain(label);
 });
});
