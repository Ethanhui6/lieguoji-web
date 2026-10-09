import {describe,it,expect} from 'vitest';
import {copyGeographyContent47,sameGeographyContent47,retainGeographyWitness47,withOwnedNumericGeography47} from './geography-content47';
import {grid} from './fixture.test-support';
describe('exact private geography witnesses',()=>{
 it('owns all nested data and notices in-place changes, including typed samples',()=>{
  const data={points:[[1,2],[3,4]],triangles:new Uint32Array([0,1,2]),elevations:new Int32Array([0,45,50]),water:{center:{x:2,y:3}}};
  const saved=copyGeographyContent47(data)!;expect(saved).not.toBeNull();expect(sameGeographyContent47(structuredClone(data),saved.value)).toBe(true);
  data.points[0][0]=8;expect(sameGeographyContent47(data,saved.value)).toBe(false);data.points[0][0]=1;
  data.elevations[1]=44;expect(sameGeographyContent47(data,saved.value)).toBe(false);data.elevations[1]=45;
  data.water.center.x=5;expect(sameGeographyContent47(data,saved.value)).toBe(false);expect(saved.value.water.center.x).toBe(2);
 });
 it('cannot borrow a plain witness via serialization, prototypes, missing or exotic data',()=>{
  const v={x:1,y:2},s=copyGeographyContent47(v)!;const getter=Object.defineProperty({y:2},'x',{enumerable:true,get(){throw Error('must not read');}});
  for(const a of [{x:Object(1),y:2},{x:'1',y:2},{x:NaN,y:2},{x:undefined,y:2},{y:2},{x:null,y:2},{...v,toJSON:()=>v},Object.assign(Object.create(v),v),{...v,future:undefined},Object.assign({...v},{[Symbol('future')]:3}),getter])expect(sameGeographyContent47(a,s.value)).toBe(false);
  const sparse=Array<number>(2);sparse[1]=2;expect(sameGeographyContent47(sparse,[1,2])).toBe(false);expect(sameGeographyContent47([-0],[0])).toBe(false);
  expect(sameGeographyContent47(new Int32Array([1]),new Uint32Array([1]))).toBe(false);
  expect(sameGeographyContent47(Object.assign(new Int32Array([1]),{future:undefined}),new Int32Array([1]))).toBe(false);
  expect(copyGeographyContent47({x:()=>1})).toBeNull();
  const alias=Object.defineProperty(new Int32Array([1]),'slice',{value(){return this;}});
  expect(copyGeographyContent47(alias)).toBeNull();expect(sameGeographyContent47(alias,new Int32Array([1]))).toBe(false);
 });
 it('bounds retained worlds and total comparison slots without evicting on lookup failure',()=>{
  const cache:{value:number;cost:number}[]=[];for(let i=0;i<5;i++)retainGeographyWitness47(cache,{value:i,cost:10});expect(cache.map(x=>x.value)).toEqual([1,2,3,4]);
  retainGeographyWitness47(cache,{value:5,cost:1_999_999});expect(cache).toEqual([{value:5,cost:1_999_999}]);
  retainGeographyWitness47(cache,{value:6,cost:2_000_001});expect(cache[0].value).toBe(5);
 });
 it('rejects an owned numeric mutation before commit, preserves input and closes its comparison window',()=>{
  const input={terrain:grid(()=>45)},before=structuredClone(input),witness=copyGeographyContent47(input.terrain.elevations)!;
  let leaked=input.terrain.elevations;
  expect(()=>withOwnedNumericGeography47(input,r=>{
   leaked=r.terrain.elevations;expect(leaked).not.toBe(input.terrain.elevations);
   expect(sameGeographyContent47(leaked,witness.value)).toBe(true);
   new Int32Array(leaked.buffer)[leaked.length-1]=0;return r;
  })).toThrow(/地形发生变化/);
  expect(input).toEqual(before);expect(sameGeographyContent47(leaked,witness.value)).toBe(false);
  const accepted=withOwnedNumericGeography47(input,r=>{expect(sameGeographyContent47(r.terrain.elevations,witness.value)).toBe(true);return r;});
  expect(accepted).toEqual(input);accepted.terrain.elevations[0]=0;
  expect(sameGeographyContent47(accepted.terrain.elevations,witness.value)).toBe(false);expect(input).toEqual(before);
 });
 it('rejects detached owned buffers and propagates action failures without retaining a trust window',()=>{
  const input={terrain:grid(()=>45)},before=structuredClone(input);
  expect(()=>withOwnedNumericGeography47(input,r=>{structuredClone(r.terrain.elevations,{transfer:[r.terrain.elevations.buffer]});return r;})).toThrow(/地形发生变化/);
  expect(()=>withOwnedNumericGeography47(input,r=>{r.terrain.elevations=new Int32Array(r.terrain.elevations.length);return r;})).toThrow(/地形发生变化/);
  expect(()=>withOwnedNumericGeography47(input,()=>{throw Error('action failure');})).toThrow('action failure');
  expect(input).toEqual(before);
 });
});
