import {describe,expect,it} from 'vitest';
import {DotNetRandom} from './dotnet-random';
describe('System.Random port',()=>{
  it('matches the .NET reference sequence',()=>{
    const r=new DotNetRandom(0);
    expect(r.nextDouble()).toBeCloseTo(0.7262432699679598,15);
    expect(r.nextDouble()).toBeCloseTo(0.8173253595909687,15);
    expect(new DotNetRandom(-2147483648).nextDouble()).toBeGreaterThanOrEqual(0);
  });
});
