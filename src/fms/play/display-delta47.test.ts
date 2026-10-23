import {describe,it,expect} from 'vitest';
import {applyDisplayDelta47,displayDelta47,sameDisplayValue47} from './display-delta47';
import {grid} from './fixture.test-support';
import {Culture47Session} from './culture47-session';
import {Culture47DisplayDecoder} from './culture47-display';
import {SETTLEMENT47_ALGORITHM} from './settlement47-regions';

const random=(seed:number)=>()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/4294967296;};
function value(r:()=>number,depth:number):unknown{
 const k=r();
 if(depth<=0||k<.35)return k<.1?null:k<.2?Math.floor(r()*100):k<.28?`s${Math.floor(r()*9)}`:r()<.5;
 if(k<.6)return Array.from({length:Math.floor(r()*5)},()=>value(r,depth-1));
 if(k<.65)return new Map([[`m${Math.floor(r()*3)}`,value(r,depth-1)]]);
 return Object.fromEntries(Array.from({length:Math.floor(r()*5)},(_,i)=>[`k${Math.floor(r()*6)}${i}`,value(r,depth-1)]));
}
function mutate(r:()=>number,v:unknown,depth:number):unknown{
 if(r()<.25||depth<=0)return r()<.5?v:value(r,2);
 if(Array.isArray(v)){const out=v.map(x=>mutate(r,x,depth-1));if(r()<.3)out.push(value(r,2));if(r()<.2)out.splice(Math.floor(r()*out.length),1);return out;}
 if(v&&typeof v==='object'&&Object.getPrototypeOf(v)===Object.prototype){const out:Record<string,unknown>={};for(const [k,x] of Object.entries(v))if(r()>.15)out[k]=mutate(r,x,depth-1);if(r()<.3)out[`n${Math.floor(r()*9)}`]=value(r,2);return out;}
 return v;
}
describe('display delta',()=>{
 it('rebuilds exactly the next value, key order included, and shares unchanged parts',()=>{
  const r=random(421730);
  for(let i=0;i<3000;i++){
   const prev=value(r,5),next=mutate(r,structuredClone(prev),5),depth=Math.floor(r()*6),rebuilt=applyDisplayDelta47(structuredClone(prev),structuredClone(displayDelta47(prev,next,depth)));
   expect(sameDisplayValue47(rebuilt,next)).toBe(true);expect(JSON.stringify(rebuilt)).toBe(JSON.stringify(next));
  }
  const prev={a:{big:[1,2,3]},b:1},next={a:prev.a,b:2},rebuilt=applyDisplayDelta47(prev,displayDelta47(prev,next,3));
  expect(rebuilt).toEqual(next);expect(rebuilt.a).toBe(prev.a);expect(displayDelta47(prev,structuredClone(prev),3)).toEqual({'\u0000':'same'});
 });
 it('treats key order and typed array bytes as part of the value',()=>{
  expect(sameDisplayValue47({a:1,b:2},{b:2,a:1})).toBe(false);
  expect(sameDisplayValue47(new Int32Array([1,2]),new Int32Array([1,2]))).toBe(true);expect(sameDisplayValue47(new Int32Array([1,2]),new Int32Array([1,3]))).toBe(false);
  expect(applyDisplayDelta47({a:1,b:2},displayDelta47({a:1,b:2},{b:2,a:1},2))).toStrictEqual({b:2,a:1});
 });
 it('keeps the decoded live world equal to the session across many batches',()=>{
  const owner=new Culture47Session(),decoder=new Culture47DisplayDecoder();
  owner.create({terrain:grid((x,y)=>x>20&&x<230&&y>20&&y<230?45:0),count:3,cityCount:24,relations:'war',settlementAlgorithm:SETTLEMENT47_ALGORITHM,setup:{mode:'culture-generated',enabled:['chinese','japanese']},families:'original'});
  const engine=owner.snapshot().journal.engine;let seq=owner.snapshot().journal.actions.length;
  decoder.decode(owner.executeDisplay([{kind:'advance',ticks:1}],seq) as never,{engine});seq++;
  for(let i=0;i<30;i++){const {motion:_m,...state}=decoder.decode(owner.executeDisplay([{kind:'advance',ticks:120},{kind:'advance',ticks:120}],seq),{engine,sequence:seq,actions:2});void _m;seq+=2;expect(state).toEqual(owner.snapshot());}
 },120000);
});
