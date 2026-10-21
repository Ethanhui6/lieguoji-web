import {expect,it} from 'vitest';
import {createFmsOriginalDocument} from './original-document';
import {pickOriginalProvince} from './original-picking';

it('picks the painted Voronoi owner at cell sites and nearby points, rejecting sea and off-map clicks',async()=>{
 const doc=await createFmsOriginalDocument('20k'),owners=new Int32Array(doc.points.length);
 doc.elevations.fill(45);
 for(let i=0;i<owners.length;i++)owners[i]=i%60;
 for(let i=0;i<doc.points.length;i+=97){const [x,y]=doc.points[i];expect(pickOriginalProvince(doc,owners,x,y)).toBe(owners[i]);expect(pickOriginalProvince(doc,owners,x+.01,y+.01)).toBe(owners[i]);}
 const [x,y]=doc.points[100];doc.elevations[100]=0;expect(pickOriginalProvince(doc,owners,x,y)).toBeNull();doc.elevations[100]=45;owners[100]=-1;expect(pickOriginalProvince(doc,owners,x,y)).toBeNull();
 expect(pickOriginalProvince(doc,owners,-1,100)).toBeNull();
 expect(()=>pickOriginalProvince(doc,new Int32Array(1),100,100)).toThrow();
});
