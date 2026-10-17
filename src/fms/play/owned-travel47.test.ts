import {describe,it,expect,vi} from 'vitest';
import type {TravelGraph47} from './army-travel47-graph';
import {unrestrictedTravel47} from './army-travel47-graph';
import {assertArmyTravel47,beginArmyTravelToPoint47,advanceArmyTravel47,armyTravelSegment47,armyTravelLocation47,redirectArmyTravelToPoint47} from './army-travel47-state';
import {withOwnedTravel47,cloneTravel47,hasOwnedTravelProof47,ownedTravelAllSea47} from './owned-travel47';

const graph=():TravelGraph47=>({scale:1,polygonWork:0,byProvince:new Map(),cells:new Map([[0,{id:0,face:0,surface:'sea',provinceId:null,center:{x:5,y:5},polygon:[{x:0,y:0},{x:10,y:0},{x:10,y:10},{x:0,y:10}],links:[]}]])});
const route=(g:TravelGraph47)=>beginArmyTravelToPoint47('a',[0],g,{x:1,y:2},{x:9,y:2});
const corridor=():TravelGraph47=>({scale:1,polygonWork:0,byProvince:new Map(),cells:new Map([0,1,2].map(id=>[id,{id,face:id,surface:'sea',provinceId:null,center:{x:id*10+5,y:5},polygon:[{x:id*10,y:0},{x:id*10+10,y:0},{x:id*10+10,y:10},{x:id*10,y:10}],links:[...(id>0?[{to:id-1,gate:{x:id*10,y:5},distance:10,toGate:5}]:[]),...(id<2?[{to:id+1,gate:{x:id*10+10,y:5},distance:10,toGate:5}]:[])]}]))});
const corridorRoute=(g:TravelGraph47)=>beginArmyTravelToPoint47('a',[0,1,2],g,{x:1,y:2},{x:29,y:8});
describe('private synchronous travel proof window',()=>{
  it.each(['sea','land'] as const)('keeps an explicit %s surface result only on certified routes and their private clones',surface=>{
    const g=graph();g.cells.get(0)!.surface=surface;
    const s=route(g),uncertified=cloneTravel47(s);
    expect(ownedTravelAllSea47(s,g)).toBeUndefined();
    const copy=withOwnedTravel47(()=>{
      expect(ownedTravelAllSea47(s,g)).toBeUndefined();
      assertArmyTravel47(s,g);
      expect(ownedTravelAllSea47(s,g)).toBe(surface==='sea');
      expect(ownedTravelAllSea47(uncertified,g)).toBeUndefined();
      const clone=cloneTravel47(s);
      expect(ownedTravelAllSea47(clone,g)).toBe(surface==='sea');
      expect(clone.nodes).toBe(s.nodes);expect(clone.origin).toBe(s.origin);
      clone.offset=2;expect(s.offset).toBe(0);assertArmyTravel47(clone,g);
      return clone;
    });
    expect(ownedTravelAllSea47(s,g)).toBeUndefined();expect(ownedTravelAllSea47(copy,g)).toBeUndefined();
    withOwnedTravel47(()=>{
      expect(ownedTravelAllSea47(copy,g)).toBeUndefined();
      assertArmyTravel47(copy,g);expect(ownedTravelAllSea47(copy,g)).toBe(surface==='sea');
    });
  });
  it('retains every dynamic progress guard after certifying geometry',()=>{
    const g=graph(),s=route(g);
    withOwnedTravel47(()=>{
      assertArmyTravel47(s,g);expect(hasOwnedTravelProof47(s,g)).toBe(true);
      for(const change of [{offset:NaN},{offset:9},{status:'arrived' as const},{crossed:true},{leg:1}]){
        const bad=cloneTravel47(s);Object.assign(bad,change);expect(hasOwnedTravelProof47(bad,g)).toBe(true);expect(ownedTravelAllSea47(bad,g)).toBe(true);expect(()=>assertArmyTravel47(bad,g)).toThrow();
      }
    });
  });
  it('calculates each certified local or gate leg once while clone progress remains independent',()=>{
    const localGraph=graph(),local=route(localGraph),g=corridor(),s=corridorRoute(g);
    const secondExpected=armyTravelLocation47({...s,leg:1,offset:2},g),hypot=vi.spyOn(Math,'hypot');
    try{
      withOwnedTravel47(()=>{
        assertArmyTravel47(local,localGraph);expect(hypot).toHaveBeenCalledTimes(1);
        for(let i=0;i<4;i++){armyTravelSegment47(local,localGraph);armyTravelLocation47(local,localGraph);assertArmyTravel47(local,localGraph);}
        const localClone=cloneTravel47(local);localClone.offset=2;assertArmyTravel47(localClone,localGraph);
        expect(armyTravelLocation47(localClone,localGraph).point).toEqual({x:3,y:2});expect(local.offset).toBe(0);
        expect(hypot).toHaveBeenCalledTimes(1);
        assertArmyTravel47(s,g);expect(hypot).toHaveBeenCalledTimes(3);
        for(let i=0;i<4;i++){armyTravelSegment47(s,g);armyTravelLocation47(s,g);assertArmyTravel47(s,g);}
        const clone=cloneTravel47(s);clone.leg=1;clone.offset=2;assertArmyTravel47(clone,g);
        expect(armyTravelLocation47(clone,g)).toEqual(secondExpected);expect(s.leg).toBe(0);expect(s.offset).toBe(0);
        expect(hypot).toHaveBeenCalledTimes(5);
        armyTravelSegment47(s,g);armyTravelSegment47(clone,g);expect(hypot).toHaveBeenCalledTimes(5);
      });
      armyTravelSegment47(local,localGraph);armyTravelSegment47(s,g);expect(hypot).toHaveBeenCalledTimes(8);
      withOwnedTravel47(()=>{assertArmyTravel47(s,g);armyTravelLocation47(s,g);expect(hypot).toHaveBeenCalledTimes(10);});
    }finally{hypot.mockRestore();}
  });
  it('keeps both first and repeated segment wrappers private while public graph reads stay live',()=>{
    const g=corridor(),s=corridorRoute(g),expected=armyTravelSegment47(s,g),secondExpected=armyTravelSegment47({...s,leg:1},g);
    withOwnedTravel47(()=>{
      assertArmyTravel47(s,g);
      const cached=armyTravelSegment47(s,g)!;cached.distance=-1;cached.start={x:99,y:99};if(cached.kind==='gate')cached.toGate=-1;
      const fresh=armyTravelSegment47(s,g);expect(fresh).toEqual(expected);expect(fresh).not.toBe(cached);
      const clone=cloneTravel47(s);clone.leg=1;
      const first=armyTravelSegment47(clone,g)!;first.distance=-1;first.endPoint={x:99,y:99};if(first.kind==='gate')first.gate={x:99,y:99};
      expect(armyTravelSegment47(clone,g)).toEqual(secondExpected);expect(armyTravelSegment47(s,g)).toEqual(expected);
    });
    g.cells.get(0)!.links[0].gate.y=7;
    const changed=armyTravelSegment47(s,g);expect(changed).not.toEqual(expected);
    expect(changed?.kind==='gate'&&changed.toGate).toBe(Math.hypot(9,5));
    changed!.distance=-1;expect(armyTravelSegment47(s,g)?.distance).toBeGreaterThan(0);
  });
  it('gives redirected endpoints their own geometry instead of inheriting a source leg',()=>{
    const g=corridor(),s=corridorRoute(g);s.offset=2;
    const expected=redirectArmyTravelToPoint47(s,g,2,{x:28,y:7},unrestrictedTravel47)!;
    withOwnedTravel47(()=>{
      assertArmyTravel47(s,g);
      const clone=cloneTravel47(s);
      if(clone.version===2)clone.destination={x:27,y:1};
      expect(hasOwnedTravelProof47(clone,g)).toBe(false);assertArmyTravel47(clone,g);
      const source=armyTravelSegment47(s,g);clone.leg=1;
      expect(armyTravelSegment47(clone,g)?.endPoint).toEqual({x:27,y:1});expect(armyTravelSegment47(s,g)).toEqual(source);
      const redirected=redirectArmyTravelToPoint47(s,g,2,{x:28,y:7},unrestrictedTravel47)!;
      expect(redirected).toEqual(expected);expect(armyTravelSegment47(redirected,g)).toEqual(armyTravelSegment47(expected,g));
      expect(armyTravelSegment47(redirected,g)?.start).toEqual(armyTravelLocation47(s,g).point);
    });
  });
  it('still rejects a cached gate mutation at commit and recomputes after failure',()=>{
    const g=corridor(),s=corridorRoute(g),expected=armyTravelSegment47(s,g);
    expect(()=>withOwnedTravel47(()=>{
      assertArmyTravel47(s,g);const clone=cloneTravel47(s);
      expect(armyTravelSegment47(clone,g)).toEqual(expected);
      g.cells.get(0)!.links[0].gate.y=7;
      armyTravelSegment47(clone,g);
    })).toThrow(/行军几何.*未提交/);
    expect(hasOwnedTravelProof47(s,g)).toBe(false);expect(armyTravelSegment47(s,g)).not.toEqual(expected);
    expect(withOwnedTravel47(()=>{assertArmyTravel47(s,g);return armyTravelSegment47(s,g);})).toEqual(armyTravelSegment47(s,g));
  });
  it('matches public gate movement across cloned legs, repeated reads and JSON reload',()=>{
    const g=corridor(),s=corridorRoute(g),before=structuredClone(s);
    const first=advanceArmyTravel47(s,g,9,()=>1,()=>true),second=advanceArmyTravel47(first.travel,g,13,()=>1,()=>true);
    const actual=withOwnedTravel47(()=>{
      const a=advanceArmyTravel47(s,g,9,()=>1,()=>true);
      for(let i=0;i<3;i++){assertArmyTravel47(a.travel,g);armyTravelSegment47(a.travel,g);armyTravelLocation47(a.travel,g);}
      const b=advanceArmyTravel47(a.travel,g,13,()=>1,()=>true);return[a,b];
    });
    expect(actual).toEqual([first,second]);expect(s).toEqual(before);expect(actual[1].travel.leg).toBe(1);
    const restored=JSON.parse(JSON.stringify(actual[1].travel)),expected=advanceArmyTravel47(second.travel,g,10,()=>1,()=>true);
    expect(withOwnedTravel47(()=>advanceArmyTravel47(restored,g,10,()=>1,()=>true))).toEqual(expected);
  });
  it('replacement static data or graph loses its proof and must pass full validation',()=>{
    const g=graph(),s=route(g);
    withOwnedTravel47(()=>{
      assertArmyTravel47(s,g);
      const freshNodes=cloneTravel47(s);freshNodes.nodes=[...s.nodes];expect(ownedTravelAllSea47(freshNodes,g)).toBeUndefined();assertArmyTravel47(freshNodes,g);expect(ownedTravelAllSea47(freshNodes,g)).toBe(true);
      const nodes=cloneTravel47(s);nodes.nodes=[1];expect(hasOwnedTravelProof47(nodes,g)).toBe(false);expect(ownedTravelAllSea47(nodes,g)).toBeUndefined();expect(()=>assertArmyTravel47(nodes,g)).toThrow();
      const origin=cloneTravel47(s);origin.origin={x:-1,y:2};expect(ownedTravelAllSea47(origin,g)).toBeUndefined();expect(()=>assertArmyTravel47(origin,g)).toThrow();
      const destination=cloneTravel47(s);if(destination.version===2)destination.destination={x:11,y:2};expect(ownedTravelAllSea47(destination,g)).toBeUndefined();expect(()=>assertArmyTravel47(destination,g)).toThrow();
      const other=graph();other.cells.get(0)!.surface='land';expect(hasOwnedTravelProof47(s,other)).toBe(false);expect(ownedTravelAllSea47(s,other)).toBeUndefined();assertArmyTravel47(s,other);expect(ownedTravelAllSea47(s,other)).toBe(false);expect(ownedTravelAllSea47(s,g)).toBeUndefined();
      const missing=graph();missing.cells.clear();expect(()=>assertArmyTravel47(s,missing)).toThrow();
      expect(Object.isFrozen(s.nodes)).toBe(true);expect(Object.isFrozen(s.origin)).toBe(true);expect(s.version===2&&Object.isFrozen(s.destination)).toBe(true);
    });
    expect(hasOwnedTravelProof47(s,g)).toBe(false);
  });
  it('rejects a changed route surface at commit even after an all-sea result was inherited by a clone',()=>{
    const g=graph(),s=route(g);
    expect(()=>withOwnedTravel47(()=>{
      assertArmyTravel47(s,g);const clone=cloneTravel47(s);
      expect(ownedTravelAllSea47(clone,g)).toBe(true);
      g.cells.get(0)!.surface='land';
      expect(ownedTravelAllSea47(clone,g)).toBe(true);
      return clone;
    })).toThrow(/行军几何.*未提交/);
    expect(ownedTravelAllSea47(s,g)).toBeUndefined();
    withOwnedTravel47(()=>{assertArmyTravel47(s,g);expect(ownedTravelAllSea47(s,g)).toBe(false);});
  });
  it('rejects graph changes before returning and clears the window after both success and failure',()=>{
    for(const change of ['content','identity','size']){
      const g=graph(),s=route(g);
      expect(()=>withOwnedTravel47(()=>{assertArmyTravel47(s,g);if(change==='content')g.cells.get(0)!.center.x=6;else if(change==='identity')g.cells.set(0,structuredClone(g.cells.get(0)!));else g.cells.clear();})).toThrow(/行军/);
      expect(hasOwnedTravelProof47(s,g)).toBe(false);expect(withOwnedTravel47(()=>42)).toBe(42);
    }
    expect(()=>withOwnedTravel47(()=>{throw Error('late failure');})).toThrow('late failure');expect(withOwnedTravel47(()=>42)).toBe(42);
  });
  it('matches uncached motion exactly and preserves independent public leaves and progress',()=>{
    const g=graph(),start=route(g),before=structuredClone(start);
    const publicResult=advanceArmyTravel47(start,g,3,()=>1,()=>true);
    const owned=withOwnedTravel47(()=>advanceArmyTravel47(start,g,3,()=>1,()=>true));expect(owned).toEqual(publicResult);expect(start).toEqual(before);expect(owned.travel).not.toBe(start);
    const copy=cloneTravel47(owned.travel);copy.nodes[0]=7;copy.origin.x=2;if(copy.version===2)copy.destination.x=8;
    expect(owned.travel.nodes).toEqual([0]);expect(owned.travel.origin.x).toBe(1);expect(owned.travel.version===2&&owned.travel.destination.x).toBe(9);
    const half=withOwnedTravel47(()=>advanceArmyTravel47(owned.travel,g,2,()=>1,()=>true));expect(half.travel.offset).toBe(5);expect(owned.travel.offset).toBe(3);
  });
});
