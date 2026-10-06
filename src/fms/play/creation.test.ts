import {describe,it,expect,beforeAll} from 'vitest';
import {createFmsDocument,FmsEditHistory,prepareFmsOutlineEdit,type FmsDocument} from '../model';
import {createFmsRun,polygonArea,assertFmsRun} from './world';
import {EditorSession} from './editor-session';

let ocean:FmsDocument;
beforeAll(async()=>{ocean=await createFmsDocument();});
describe('drawn land to playable countries',()=>{
  it.each([16,40,60,100])('opens %s-unit islands without swallowing all faces into one province',size=>{
    const history=new FmsEditHistory(structuredClone(ocean)),a=600,b=a+size;
    const doc=history.commit(prepareFmsOutlineEdit(history.document,[[a,a],[b,a],[b,b],[a,b]],45)),before=structuredClone(doc);
    const run=new EditorSession().execute({type:'create',terrain:doc,count:6,relations:'peace'}).run!;
    assertFmsRun(run);expect(run.world.nations).toHaveLength(6);expect(doc).toEqual(before);
    const two=createFmsRun(doc,2),area=(r:typeof two|typeof run)=>r.world.provinces.reduce((s,p)=>s+polygonArea(p.polygon),0);
    expect(area(run)).toBeCloseTo(area(two),7);
    for(const p of run.world.provinces)for(const id of p.neighbors)expect(run.world.provinces.find(q=>q.id===id)!.neighbors).toContain(p.id);
  },30000); // Two full worlds per island; browser interaction budgets are separate.
  it('rejects an empty sea without writing or substituting a premade world',()=>{const before=structuredClone(ocean);expect(()=>new EditorSession().execute({type:'create',terrain:ocean,count:6,relations:'peace'})).toThrow('陆地');expect(ocean).toEqual(before);});
});
