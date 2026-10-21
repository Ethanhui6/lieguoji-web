import {beforeAll,describe,it,expect} from 'vitest';
import {Culture47Session,type Culture47Journal,type Culture47Progress} from './culture47-session';
import {grid} from './fixture.test-support';
import {sameCulture47Value} from './culture47-equal';
import {verifyFrozenCulture47} from '../../../scripts/fms-culture47-frozen';
import frozen from './culture47-frozen.json';
import {assertStoredCulture47,culture47JournalVersion} from './culture47-contract';
let initial:Culture47Journal;
beforeAll(()=>{initial=new Culture47Session().create({terrain:grid((x,y)=>x>20&&x<230&&y>20&&y<230?45:0),count:2,cityCount:24,relations:'peace',setup:{mode:'culture-generated',enabled:['chinese','japanese']}}).journal;},30000);
describe('private executed journal witness',()=>{
  it('recognizes a registered frozen v2 envelope by its capability, not current-engine identity',()=>{
    // Envelope regression only: this does not claim a synthetic engine executes.
    const entry={...frozen[0],engine:'e'.repeat(64),journalVersion:2};frozen.push(entry);
    try{
      expect(culture47JournalVersion(entry.engine)).toBe(2);
      expect(()=>assertStoredCulture47({...initial,engine:entry.engine,version:2,fork:null})).not.toThrow();
      const {fork:_,...withoutFork}=initial;void _;
      expect(()=>assertStoredCulture47({...withoutFork,engine:entry.engine,version:2})).toThrow();
    }finally{frozen.pop();}
  });
  it('recognizes only complete accepted prefixes without replay or snapshot mutation',()=>{
    const s=new Culture47Session();s.load(initial);const first=s.execute({kind:'advance',ticks:2},0);const last=s.execute({kind:'identity',edit:{kind:'city',id:'c-0',customName:'试验城'}},1);
    const progress:Culture47Progress[]=[];
    for(const j of [initial,first.journal,last.journal])expect(s.verify(structuredClone(j),p=>progress.push(p))).toBe('witness');
    expect(progress).toEqual([]);expect(s.snapshot()).toEqual(last);
    const alternate=structuredClone(first.journal);alternate.actions[0]={kind:'advance',ticks:1};
    expect(s.verify(alternate,p=>progress.push(p))).toBe('replay');expect(progress.at(-1)).toEqual({stage:'replay',completed:1,total:1,ticks:1});expect(s.snapshot()).toEqual(last);
  },30000);
  it('opening changes, another world and not-yet-executed actions must replay; failed replay never installs',()=>{
    const s=new Culture47Session(),saved=s.load(initial),progress:Culture47Progress[]=[];
    const altered=structuredClone(initial);altered.opening.terrain.elevations[300]++;
    expect(s.verify(altered,p=>progress.push(p))).toBe('replay');expect(progress[0].stage).toBe('opening');
    const another=structuredClone(initial);another.id='fms-'+crypto.randomUUID();expect(s.verify(another)).toBe('replay');
    const future=structuredClone(initial);future.actions.push({kind:'identity',edit:{kind:'city',id:'missing',customName:'坏引用'}});
    expect(()=>s.verify(future)).toThrow();expect(s.snapshot()).toEqual(saved);
  },30000);
  it('does not merge advance boundaries, ignore stamps or equate typed arrays to lists',()=>{
    const s=new Culture47Session();s.load(initial);s.execute({kind:'advance',ticks:1},0);const full=s.execute({kind:'advance',ticks:1},1);
    const merged=structuredClone(full.journal);merged.actions=[{kind:'advance',ticks:2}];expect(s.verify(merged)).toBe('replay');
    expect(sameCulture47Value({expected:{tick:1}},{expected:{tick:2}})).toBe(false);
    expect(sameCulture47Value(new Int32Array([1]),[1])).toBe(false);
    expect(sameCulture47Value(new Int32Array([1]),new Uint32Array([1]))).toBe(false);
    const malicious={get field(){throw Error('getter should never run');}};
    expect(sameCulture47Value(malicious,{field:1})).toBe(false);
  },30000);
  it('keeps all delivered original and source-rebuilt compatibility artifacts byte exact',()=>{expect(verifyFrozenCulture47().map(e=>({file:e.file,bytes:e.bytes}))).toEqual([{file:'engine-42a3.js',bytes:1322000},{file:'engine-ce32.js',bytes:1325561},{file:'engine-b365.js',bytes:1326866},{file:'engine-9e23.js',bytes:1333678},{file:'engine-6f84.js',bytes:1336719},{file:'engine-f212.js',bytes:1337837},{file:'engine-30fe.js',bytes:1338079},{file:'engine-49f7.js',bytes:1338516},{file:'engine-8d16.js',bytes:1345177},{file:'engine-3d08.js',bytes:1348086},{file:'engine-4c48.js',bytes:1349394},{file:'engine-d01d.js',bytes:1349640},{file:'engine-bbff.js',bytes:1351385},{file:'engine-dbb1.js',bytes:1369201},{file:'engine-3c14.js',bytes:1369958},{file:'engine-f940.js',bytes:1379231},{file:'engine-a78e.js',bytes:1379345},{file:'engine-dfd9.js',bytes:1385130},{file:'engine-9c93.js',bytes:1387102},{file:'engine-fe7a.js',bytes:1391304},{file:'engine-c35e.js',bytes:1403543},{file:'engine-2af7.js',bytes:1405707},{file:'engine-5718.js',bytes:1405707},{file:'engine-d736.js',bytes:1410350},{file:'engine-3a65.js',bytes:1410350},{file:'engine-b489.js',bytes:1411371},{file:'engine-b40d.js',bytes:1411371},{file:'engine-22db.js',bytes:1411956},{file:'engine-1c7d.js',bytes:1413079},{file:'engine-02c7.js',bytes:1413398},{file:'engine-d06f.js',bytes:1413398},{file:'engine-96c3.js',bytes:1413669},{file:'engine-d4f0.js',bytes:1413669},{file:'engine-f2b7.js',bytes:1413669},{file:'engine-6c81.js',bytes:1413669},{file:'engine-f8e2.js',bytes:1413669},{file:'engine-417e.js',bytes:1413747},{file:'engine-d7e7.js',bytes:1413747},{file:'engine-2db0.js',bytes:1413747},{file:'engine-6c6f.js',bytes:1413747},{file:'engine-96d2.js',bytes:1413747},{file:'engine-65b5.js',bytes:1415060},{file:'engine-b283.js',bytes:1416705},{file:'engine-c7ca.js',bytes:1418396},{file:'engine-10b0.js',bytes:1419905},{file:'engine-4ba5.js',bytes:1423790},{file:'engine-f98b.js',bytes:1424323},{file:'engine-d270.js',bytes:1424323},{file:'engine-b0d1.js',bytes:1424323},{file:'engine-9d1d.js',bytes:1424323},{file:'engine-486d.js',bytes:1424323},{file:'engine-ac46.js',bytes:1424323},{file:'engine-3d97.js',bytes:1424819},{file:'engine-8a8a.js',bytes:1424819},{file:'engine-11a9.js',bytes:1425675},{file:'engine-a0a0.js',bytes:1427699}]);});
});
