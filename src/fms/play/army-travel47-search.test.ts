import {describe,it,expect} from 'vitest';
import {grid} from './fixture.test-support';
import {Culture47Session} from './culture47-session';
import {SETTLEMENT47_ALGORITHM} from './settlement47-regions';
import {armySpatialFor47} from './army-geography47';
import {createArmyTravelSearch47,type TravelCell47,type TravelGraph47,type TravelPolicy47} from './army-travel47-graph';
import {nativeArmyCellDistance,nativeArmyRouteCost} from './native-war/army-path';

// The 0.5.3 Map-based search, kept verbatim as the reference the typed search must equal.
const permitted=(n:TravelCell47,p:TravelPolicy47)=>n.surface==='sea'?p.allowSea:p.allowLand&&p.canEnter(n.provinceId!);
function referenceSearch(g:TravelGraph47,start:number,p:TravelPolicy47){
 const first=g.cells.get(start),allowed=new Map<string,boolean>();
 const enter=(n:TravelCell47)=>{if(n.surface==='sea')return p.allowSea;if(!p.allowLand)return false;const id=n.provinceId!;if(!allowed.has(id))allowed.set(id,p.canEnter(id));return allowed.get(id)!;};
 const valid=!!first&&permitted(first,{...p,canEnter:()=>true});
 const cost=new Map([[start,0]]),prev=new Map<number,number>(),heap:{id:number;cost:number}[]=[];
 const settled=new Set<number>();
 const before=(a:{id:number;cost:number},b:{id:number;cost:number})=>a.cost<b.cost||a.cost===b.cost&&a.id<b.id;
 const push=(v:{id:number;cost:number})=>{let i=heap.length;heap.push(v);while(i){const j=(i-1)>>1;if(!before(v,heap[j]))break;heap[i]=heap[j];i=j;}heap[i]=v;};
 const pop=()=>{const v=heap[0],tail=heap.pop()!;if(heap.length){let i=0;while(i*2+1<heap.length){let j=i*2+1;if(j+1<heap.length&&before(heap[j+1],heap[j]))j++;if(!before(heap[j],tail))break;heap[i]=heap[j];i=j;}heap[i]=tail;}return v;};
 if(valid)push({id:start,cost:0});
 return(end:number):{nodes:number[];cost:number}|null=>{
 const last=g.cells.get(end);if(!valid||!last||!enter(last))return null;
 while(!settled.has(end)&&heap.length){const current=pop();if(cost.get(current.id)!==current.cost||settled.has(current.id))continue;settled.add(current.id);
  // Expand even the requested target so a later query can continue from it.
  const a=g.cells.get(current.id)!;for(const link of a.links){const b=g.cells.get(link.to)!;if(!enter(b)||settled.has(b.id))continue;
   // Native weights use cell-coordinate distance, while web movement follows
   // both sides of the real gate. Keep cost units in source terrain space.
   const from={x:a.center.x/g.scale,y:a.center.y/g.scale},to={x:b.center.x/g.scale,y:b.center.y/g.scale};
   const value=nativeArmyRouteCost(nativeArmyCellDistance(from,to),b.surface==='sea'&&p.oceanRouteFaces.has(b.face),p.preferPorts,a.surface!==b.surface,p.portSeaFaces.has((a.surface==='sea'?a:b).face));
   const next=Math.fround(current.cost+value);if(!Number.isFinite(next))throw Error('行军路径代价溢出。');if(next<(cost.get(b.id)??Infinity)){cost.set(b.id,next);prev.set(b.id,a.id);push({id:b.id,cost:next});}
  }
 }
 if(!settled.has(end))return null;
 const nodes=[end];while(nodes.at(-1)!==start)nodes.push(prev.get(nodes.at(-1)!)!);nodes.reverse();return{nodes,cost:cost.get(end)!};
 };
}

const random=(seed:number)=>()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/4294967296;};
describe('typed army travel search',()=>{
 it('returns exactly the reference routes, costs and continuation order',()=>{
  const run=new Culture47Session().create({terrain:grid((x,y)=>x>20&&x<230&&y>20&&y<230&&!(x>110&&x<140)?45:0),count:3,cityCount:24,relations:'war',settlementAlgorithm:SETTLEMENT47_ALGORITHM,setup:{mode:'culture-generated',enabled:['chinese','japanese']},families:'original'}).run;
  const g=armySpatialFor47(run).graph,ids=[...g.cells.keys()],sea=ids.filter(id=>g.cells.get(id)!.surface==='sea').map(id=>g.cells.get(id)!.face);
  const provinces=[...g.byProvince.keys()],rand=random(421730);
  expect(sea.length).toBeGreaterThan(0);
  const policies:TravelPolicy47[]=[
   {allowLand:true,allowSea:true,preferPorts:false,portSeaFaces:new Set(),oceanRouteFaces:new Set(),canEnter:()=>true},
   {allowLand:true,allowSea:false,preferPorts:false,portSeaFaces:new Set(),oceanRouteFaces:new Set(),canEnter:id=>provinces.indexOf(id)%3!==1},
   {allowLand:true,allowSea:true,preferPorts:true,portSeaFaces:new Set(sea.filter((_,i)=>i%4===0)),oceanRouteFaces:new Set(sea.filter((_,i)=>i%3===0)),canEnter:id=>provinces.indexOf(id)%5!==2},
   {allowLand:false,allowSea:true,preferPorts:false,portSeaFaces:new Set(),oceanRouteFaces:new Set(sea),canEnter:()=>true},
  ];
  let found=0;
  for(const policy of policies)for(let trial=0;trial<12;trial++){
   const start=ids[Math.floor(rand()*ids.length)],typed=createArmyTravelSearch47(g,start,policy),reference=referenceSearch(g,start,policy);
   // Successive targets continue one frontier, as the army AI does.
   for(let q=0;q<6;q++){const end=ids[Math.floor(rand()*ids.length)],a=typed(end),b=reference(end);expect(a).toEqual(b);if(a)found++;}
  }
  expect(found).toBeGreaterThan(100);
 },120000);
 it('sees edits to an unsealed graph',()=>{
  const cell=(id:number):TravelCell47=>({id,face:id,surface:'land',provinceId:'p',center:{x:id*10+5,y:5},polygon:[],links:[]});
  const g:TravelGraph47={scale:1,polygonWork:0,byProvince:new Map([['p',[0,1,2]]]),cells:new Map([0,1,2].map(id=>[id,cell(id)]))};
  const link=(a:number,b:number)=>({to:b,gate:{x:a*10+10,y:5},distance:10,toGate:5});
  g.cells.get(0)!.links=[link(0,1)];g.cells.get(1)!.links=[{...link(1,0),gate:{x:10,y:5}},link(1,2)];g.cells.get(2)!.links=[{...link(2,1),gate:{x:20,y:5}}];
  const p:TravelPolicy47={allowLand:true,allowSea:true,preferPorts:false,portSeaFaces:new Set(),oceanRouteFaces:new Set(),canEnter:()=>true};
  expect(createArmyTravelSearch47(g,0,p)(2)?.nodes).toEqual([0,1,2]);
  g.cells.get(1)!.links=g.cells.get(1)!.links.filter(l=>l.to!==2);
  expect(createArmyTravelSearch47(g,0,p)(2)).toBeNull();
 });
});
