import {describe,it,expect} from 'vitest';
import {grid} from './fixture.test-support';
import {Culture47Session} from './culture47-session';
import {fastChecks47,withFastChecks47} from './checks47';
import {SETTLEMENT47_ALGORITHM} from './settlement47-regions';
const action=(ticks:number)=>({kind:'advance' as const,ticks});
describe('fast live checks',()=>{
 it('is scoped and restored after a throw',()=>{
  expect(fastChecks47()).toBe(false);
  expect(()=>withFastChecks47(()=>{expect(fastChecks47()).toBe(true);throw Error('x');})).toThrow('x');
  expect(fastChecks47()).toBe(false);
 });
 it('fast live advance and batched load equal strict one-by-one execution',()=>{
  const live=new Culture47Session();
  live.create({terrain:grid((x,y)=>x>20&&x<230&&y>20&&y<230?45:0),count:3,cityCount:24,relations:'war',settlementAlgorithm:SETTLEMENT47_ALGORITHM,setup:{mode:'culture-generated',enabled:['chinese','japanese']},families:'original'});
  let seq=live.snapshot().journal.actions.length;
  for(let i=0;i<20;i++){live.executeDisplay([action(120),action(120),action(120)],seq);seq+=3;}
  const fast=live.snapshot();expect(fastChecks47()).toBe(false);
  // Every action again, one at a time under the strict validators.
  const strict=new Culture47Session();strict.load({...fast.journal,actions:[]});
  fast.journal.actions.forEach((action,i)=>strict.execute(action,i));
  expect(strict.snapshot()).toEqual(fast);
  // load() batches the advances under the fast checks and validates the end.
  expect(new Culture47Session().load(fast.journal)).toEqual(fast);
 },300000);
});
