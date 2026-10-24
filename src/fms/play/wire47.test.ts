import {describe,expect,it} from 'vitest';
import {grid} from './fixture.test-support';
import {Culture47Session} from './culture47-session';
import {encodeWire47,decodeWire47} from './wire47';

describe('remote host wire format',()=>{
  it('round-trips typed arrays, Map, Set, undefined and special numbers',()=>{
    const value={a:new Int32Array([1,-2,3]),f:new Float32Array([.5,NaN]),u:new Uint8Array(70000).fill(7),m:new Map<unknown,unknown>([['x',{y:new Set([1,'2'])}],[3,undefined]]),n:[NaN,Infinity,-Infinity,-0,0,1.5],o:{k:undefined,nested:[[new Uint16Array([9])]]}};
    const back=decodeWire47(encodeWire47(value)) as typeof value;
    expect(back).toEqual(value);expect(Object.is(back.n[3],-0)).toBe(true);expect(back.a).toBeInstanceOf(Int32Array);expect(back.m).toBeInstanceOf(Map);
  });
  it('carries a real create snapshot and display batch unchanged',()=>{
    const s=new Culture47Session(),created=s.create({terrain:grid((x,y)=>x>20&&x<230&&y>20&&y<230?45:0),count:3,cityCount:24,relations:'war',setup:{mode:'culture-generated',enabled:['chinese','japanese']}});
    expect(decodeWire47(encodeWire47(created))).toEqual(created);
    const packet=s.executeDisplay([{kind:'advance',ticks:120},{kind:'advance',ticks:120}],created.journal.actions.length);
    expect(decodeWire47(encodeWire47(packet))).toEqual(structuredClone(packet));
  },300000);
});
