import {describe,it,expect} from 'vitest';
import {combatMarkers47} from './combat-map47';
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
   {a:'["army","a"]',b:'["fleet","b"]',pointA:{x:100,y:200},pointB:{x:120,y:200},area:'sea/4'},
   {a:'["army","a"]',b:'["fleet","c"]',pointA:{x:100,y:200},pointB:{x:80,y:200},area:'sea/4'}
  ]},occupation:{sieges:[{provinceId:'p-1',resistance:75,maximum:100}]}} as unknown as FoundingForces47;
  expect(combatMarkers47(r,new Set(['p-1']))).toEqual([{id:'sea/4',kind:'contact',point:{x:100,y:200},participants:3,progress:null},{id:'siege/p-1',kind:'siege',point:{x:90,y:60},participants:0,progress:.25}]);
  r.forceContacts.pairs=[];expect(combatMarkers47(r,new Set())).toEqual([]); // Damaged defenses alone do not imply an ongoing siege.
 });
});
