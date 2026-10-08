import {describe,it,expect} from 'vitest';
import {nativeNavyQuota,nativeNavyBuildMonths,nativeNavyQueueMonth} from './native-war/naval-construction';
import {advanceShipbuilding45,shipbuildingQuote45} from './war45-shipbuilding';
import {portFixture45,graph45,stamp45,shipyardFixture45} from './war45.test-support';
import {War45Session} from './war45-session';
import {assertWar45Run,type War45Run} from './war45-model';
import {War44Session} from './war44-session';
import {portFixture44} from './war44.test-support';
describe('native construction arithmetic',()=>{
 it('retains the installed build’s single-port exception and unusual two-port zero quota',()=>expect(Array.from({length:10},(_,n)=>nativeNavyQuota(n))).toEqual([0,1,0,1,1,1,2,2,2,3]));
 it('uses ethnic attribute, living ruler traits, float32 multiplication and ceiling',()=>{
  expect(nativeNavyBuildMonths('Agriculture',[],false)).toBe(6);expect(nativeNavyBuildMonths('Maritime',[],false)).toBe(3);expect(nativeNavyBuildMonths('Commercial',[],false)).toBe(4);
  expect(nativeNavyBuildMonths('Maritime',[.5],false)).toBe(2);expect(nativeNavyBuildMonths('Commercial',[.5],true)).toBe(4);expect(nativeNavyBuildMonths('Agriculture',[0,-1],true)).toBe(12);expect(nativeNavyBuildMonths('Agriculture',[.01],false)).toBe(1);
 });
 it('starts and consumes the first month together; freezes the chosen duration while in progress',()=>{
  const q={queued:0,remaining:0,totalMonths:0};expect(nativeNavyQueueMonth(q,6,0,6)).toBe(false);expect(q).toEqual({queued:1,remaining:5,totalMonths:6});
  for(let i=0;i<4;i++)expect(nativeNavyQueueMonth(q,6,0,2)).toBe(false);expect(nativeNavyQueueMonth(q,6,0,2)).toBe(true);expect(q.remaining).toBe(0);
  expect(nativeNavyQueueMonth(q,6,1,2)).toBe(false);expect(q).toEqual({queued:0,remaining:1,totalMonths:2});expect(nativeNavyQueueMonth(q,6,1,2)).toBe(true);
 });
 it('cancels waiting hulls after quota loss, never completes above quota, and zero ports cancels current hull',()=>{
  const q={queued:2,remaining:2,totalMonths:6};expect(nativeNavyQueueMonth(q,2,2,6)).toBe(false);expect(q.queued).toBe(0);expect(nativeNavyQueueMonth(q,2,2,6)).toBe(false);expect(q.remaining).toBe(0);q.remaining=3;nativeNavyQueueMonth(q,0,0,6);expect(q).toEqual({queued:0,remaining:0,totalMonths:0});
 });
});
function ready(){
 const r=portFixture45(),g=graph45(r),id='n-0';
 // Fixed fixture: one genuine controlled harbor, no live fleet blocking launch.
 const port=g.ports.find(p=>r.portControl.ports[p.provinceId].landOwnerId===id)!;
 for(const [pid,p]of Object.entries(r.portControl.ports))if(p.occupierId===id&&pid!==port.provinceId)p.occupierId='n-3';
 for(const f of r.navy.fleets)if(f.nationId===id){f.status='lost';f.crew=0;r.maritime.hulls[f.id]=0;}
 const l=r.world.statecraft!.provinces.find(v=>v.provinceId===port.provinceId)!;l.population=10000;l.grain=1000000;
 const q=r.shipbuilding.nations[id];q.remaining=1;q.totalMonths=6;q.lastMonth--;
 return {r,g,id,port,q,l};
}
it('creates a real crewed fleet at a real harbor, debits reserves once, survives duplicate monthly calls and copy isolation',()=>{
 const {r,g,id,port,q,l}=ready(),before=structuredClone(r);advanceShipbuilding45(r,r.shipbuilding,id,g);const f=r.navy.fleets.at(-1)!;
 expect([f.nationId,f.dockId,f.node,f.crew,f.food]).toEqual([id,port.id,port.node,40,2400]);expect(r.maritime.hulls[f.id]).toBe(100);expect(q.completed).toBe(1);
 const after=r.world.statecraft!.provinces.find(v=>v.provinceId===port.provinceId)!;expect(after.population).toBe(l.population-40);expect(after.grain).toBe(l.grain-2400);const snapshot=structuredClone(r);advanceShipbuilding45(r,r.shipbuilding,id,g);expect(r).toEqual(snapshot);expect(before.navy.fleets).toHaveLength(r.navy.fleets.length-1);
});
it('a foreign ship occupying the harbor blocks launch; completion waits without losing construction or spending grain',()=>{
 const {r,g,id,port,q}=ready(),enemy=r.navy.fleets.find(f=>f.nationId!==id)!;enemy.node=port.node;enemy.route=[];enemy.progress=0;enemy.status='anchored';enemy.dockId=null;enemy.targetId=null;
 const w=structuredClone(r.world);advanceShipbuilding45(r,r.shipbuilding,id,g);expect(q.remaining).toBe(1);expect(q.blocked).toMatch(/泊位/);expect(q.completed).toBe(0);expect(r.world).toEqual(w);
});
it('keeps completed work when crew or grain are insufficient and reports the concrete reason',()=>{
 const {r,g,id,q,l}=ready();l.grain=0;const count=r.navy.fleets.length;advanceShipbuilding45(r,r.shipbuilding,id,g);expect(q.remaining).toBe(1);expect(q.blocked).toMatch(/兵员或配粮/);expect(r.navy.fleets).toHaveLength(count);
});
it('the living current ruler and any captured home port affect new duration without mutating in-progress construction',()=>{
 const {r,g,id,q}=ready(),leader=r.people.persons[r.people.nations[id].leaderId!]!;r.culture.nations[id].ethnic='Maritime';leader.traits=['ShipMaster'];
 for(const p of Object.values(r.portControl.ports))if(p.landOwnerId===id)p.occupierId=id;
 expect(shipbuildingQuote45(r,id,g).months).toBe(2);Object.values(r.portControl.ports).find(p=>p.landOwnerId===id)!.occupierId='n-3';expect(shipbuildingQuote45(r,id,g).months).toBe(3);
 leader.alive=false;expect(shipbuildingQuote45(r,id,g).months).toBe(6);expect(q.totalMonths).toBe(6);
});
it('preserves excess fleets including cargo and manual orders, while stopping automatic replenishment',()=>{
 const r=portFixture45(),g=graph45(r),id='n-0',q=r.shipbuilding.nations[id];for(const p of Object.values(r.portControl.ports))if(p.occupierId===id)p.occupierId='n-3';q.lastMonth--;const fleets=structuredClone(r.navy.fleets),cargo=structuredClone(r.transports);advanceShipbuilding45(r,r.shipbuilding,id,g);expect(r.navy.fleets).toEqual(fleets);expect(r.transports).toEqual(cargo);expect(q.remaining).toBe(0);
});
it('new v45 queue is isolated from old v44 execution and invalid future queue cannot replace session state',()=>{
 const old=portFixture44(),snapshot=structuredClone(old),s=new War45Session(),r=s.execute({type:'copy',run:old}).run as War45Run;expect(old).toEqual(snapshot);expect(r.id).not.toBe(old.id);assertWar45Run(r);
 const invalid=structuredClone(r);Object.assign(invalid.shipbuilding,{future:true});expect(()=>s.execute({type:'load',run:invalid})).toThrow(/未来/);expect((s.execute({type:'tick',ticks:1,expected:stamp45(r)}).run as War45Run).shipbuilding).toEqual(r.shipbuilding);
 const oldSession=new War44Session(),compat=new War45Session();oldSession.execute({type:'load',run:old});compat.execute({type:'load',run:old});expect(compat.execute({type:'step',days:1})).toEqual(oldSession.execute({type:'step',days:1}));
});
it('real session crosses the assigned monthly date once, creates the hull and keeps it on subsequent ticks',()=>{
 const fixture=shipyardFixture45(),s=new War45Session();s.execute({type:'load',run:fixture.run});const r=s.execute({type:'step',days:1}).run as War45Run;
 expect(r.shipbuilding.nations[fixture.nationId].completed).toBe(1);expect(r.navy.fleets.at(-1)!.dockId).toBe(fixture.portId);assertWar45Run(r);
 const next=s.execute({type:'tick',ticks:1,expected:stamp45(r)}).run as War45Run;expect(next.shipbuilding.nations[fixture.nationId].completed).toBe(1);expect(next.navy.fleets).toHaveLength(r.navy.fleets.length);
});
