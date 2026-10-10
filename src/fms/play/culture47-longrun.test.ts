import {it,expect} from 'vitest';
import {IDBFactory} from 'fake-indexeddb';
import {Culture47Session} from './culture47-session';
import {grid} from './fixture.test-support';
import {CULTURE47_NEW_DATABASE,saveCulture47,loadCulture47} from './culture47-storage';

it('actually simulates beyond both old cutoffs, cold restores all state, then continues',async()=>{
 const s=new Culture47Session();s.create({terrain:grid((x,y)=>x>20&&x<230&&y>20&&y<230?45:0),count:2,cityCount:6,relations:'war',setup:{mode:'culture-generated',enabled:['chinese','japanese']}});
 let sequence=0;
 for(let day=0;day<2004;day+=4){s.executeDisplay(Array.from({length:4},()=>({kind:'advance' as const,ticks:120})),sequence);sequence+=4;if(day%200===0)console.log('Actual long world day',day+4);}
 const before=s.snapshot();expect(before.run.clock.tick).toBe(2004*120);expect(before.run.world.day).toBe(2004);expect(before.run.chronicle.entries.length).toBeGreaterThan(2);
 const f=new IDBFactory();await saveCulture47(before.journal,null,f,undefined,j=>{s.verify(j);},CULTURE47_NEW_DATABASE);
 const restored=new Culture47Session(),slot=await loadCulture47(f,j=>{restored.load(j);},undefined,CULTURE47_NEW_DATABASE);expect(slot?.journal).toEqual(before.journal);expect(restored.snapshot()).toEqual(before);
 const next=restored.execute({kind:'advance',ticks:120},sequence);expect(next.run.world.day).toBe(2005);await saveCulture47(next.journal,1,f,undefined,j=>{restored.verify(j);},CULTURE47_NEW_DATABASE);
 console.log(JSON.stringify({day:next.run.world.day,tick:next.run.clock.tick,actions:next.journal.actions.length,events:next.run.chronicle.entries.length,coldRestoreExact:true}));
},1200000);
