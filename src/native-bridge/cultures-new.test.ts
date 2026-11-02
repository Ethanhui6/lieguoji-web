import {describe,expect,it} from 'vitest';
import {generate} from './engine';

// The cultures added in the app (朝鲜、蒙古、突厥、埃及、西班牙、意大利) found worlds with real names.
describe('native bridge new cultures',()=>{
  it('opens a world with only the new cultures',async()=>{
    const out=JSON.parse(await generate(JSON.stringify({seed:'11',template:'continents',count:6,cityCount:60,cultures:['korean','mongol','turkic','egyptian','spanish','italian']})));
    const names=out.meta.nations.map((n:{name:string})=>n.name);
    expect(names.length).toBe(6);
    expect(names.every((n:string)=>n.length>1)).toBe(true);
    expect(out.meta.cities.filter((c:{name:string})=>c.name).length).toBeGreaterThan(50);
  },180_000);
});
