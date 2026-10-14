import {describe,it,expect} from 'vitest';
import {combatMarkers47,displayCombatMarkers47} from './combat-map47';
import type {FoundingForces47} from './civilization47-forces';
import {activeSiegesFromSpace47} from './siege-display47';
import type {ArmySpace47} from './army-space47';
describe('actual 47 battle display',()=>{
 it('uses actual hostile land holders and excludes retreaters or empty damaged cities',()=>{
  const r={world:{provinces:[{id:'p-1',controller:'n-1'},{id:'p-2',controller:'n-1'}],statecraft:{relations:[{a:'n-0',b:'n-1',status:'war'}]}},occupation:{sieges:[{provinceId:'p-1'},{provinceId:'p-2'}]}} as unknown as FoundingForces47;
  const holder={army:{nationId:'n-0',status:'idle'}},space={land:new Map([['p-1',[holder]]])} as unknown as ArmySpace47;
  expect(activeSiegesFromSpace47(r,space)).toEqual(['p-1']);
  holder.army.status='retreating';expect(activeSiegesFromSpace47(r,space)).toEqual([]);
  holder.army.status='idle';r.world.statecraft!.relations=[];expect(activeSiegesFromSpace47(r,space)).toEqual([]);
 });
 it('groups real land and mixed sea contacts and never uses legacy anchors or invented damage',()=>{
  const r={world:{provinces:[{id:'p-1',center:{x:90,y:60}}]},forceContacts:{version:1,pairs:[
   {a:'["army","a"]',b:'["fleet","b"]',cellA:9,cellB:9,pointA:{x:100,y:200},pointB:{x:120,y:200},area:'sea/4'},
   {a:'["army","a"]',b:'["fleet","c"]',cellA:9,cellB:9,pointA:{x:100,y:200},pointB:{x:80,y:200},area:'sea/4'}
  ]},occupation:{sieges:[{provinceId:'p-1',resistance:75,maximum:100}]}} as unknown as FoundingForces47;
  const markers=combatMarkers47(r,new Set(['p-1']));expect(markers[0]).toMatchObject({id:'sea/4/9:9',kind:'contact',point:{x:100,y:200},participants:3,progress:null});expect(markers[1]).toEqual({id:'siege/p-1',kind:'siege',point:{x:90,y:60},participants:0,progress:.25});
  const points=new Map([['["army","a"]',{x:50,y:100}],['["fleet","b"]',{x:70,y:100}],['["fleet","c"]',{x:30,y:100}]]);
  expect(displayCombatMarkers47(markers,points)[0].point).toEqual({x:50,y:100}); // Buffered icon frame, not the newer ledger endpoints.
  points.delete('["army","a"]');expect(displayCombatMarkers47(markers,points)).toEqual([markers[1]]);
  r.forceContacts.pairs=[];expect(combatMarkers47(r,new Set())).toEqual([]); // Damaged defenses alone do not imply an ongoing siege.
 });
 it('keeps unrelated distant battles in one province at separate actual sites',()=>{
  const r={world:{provinces:[]},occupation:{sieges:[]},forceContacts:{pairs:[{area:'land/p',a:'a',b:'b',cellA:2,cellB:4,pointA:{x:10,y:20},pointB:{x:12,y:20}},{area:'land/p',a:'c',b:'d',cellA:200,cellB:202,pointA:{x:800,y:900},pointB:{x:802,y:900}}]}} as unknown as FoundingForces47;
  const markers=combatMarkers47(r,new Set());expect(markers.map(m=>m.point)).toEqual([{x:11,y:20},{x:801,y:900}]);
  expect(displayCombatMarkers47(markers,new Map([['a',{x:5,y:6}],['b',{x:9,y:6}],['c',{x:80,y:90}],['d',{x:82,y:90}]] )).map(m=>m.point)).toEqual([{x:7,y:6},{x:81,y:90}]);
 });
});
