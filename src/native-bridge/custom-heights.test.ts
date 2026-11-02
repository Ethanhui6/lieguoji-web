import {describe,expect,it} from 'vitest';
import {generate} from './engine';
import {createFmsOriginalDocument} from '../fms/original/original-document';

// 自绘地图: the app sends one height per cell of the original grid; the world opens on that terrain.
describe('native bridge custom heights',()=>{
  it('opens a world on drawn terrain and keeps the heights',async()=>{
    const doc=await createFmsOriginalDocument('20k');
    const n=doc.points.length;
    // A drawn island: land inside an ellipse in the middle of the map, sea elsewhere.
    const heights=new Uint8Array(n);
    for(let i=0;i<n;i++){
      const [x,y]=doc.points[i],dx=(x-doc.width/2)/(doc.width*0.32),dy=(y-doc.height/2)/(doc.height*0.3),d=dx*dx+dy*dy;
      heights[i]=d<1?Math.round(30+40*(1-d)):8;
    }
    const b64=btoa(String.fromCharCode(...heights));
    const out=JSON.parse(await generate(JSON.stringify({seed:'7',template:'continents',count:4,cityCount:40,heights:b64})));
    expect(out.state.nations.length).toBe(4);
    expect(out.meta.provinces.length).toBe(40);
    await expect(generate(JSON.stringify({seed:'7',template:'continents',count:4,cityCount:40,heights:btoa('x')}))).rejects.toThrow('自绘地图');
  },180_000);
});
