import type {MilitaryAccess43} from './war43-access';
import type {GameCommand} from './restoration19-session';
import {chronicleView,campaignView,type Restoration19Run} from './restoration19-model';
import {chronicleWrap,type ChronicleRun} from './chronicle-model';
import {tacticsView,campaignWrap} from './campaign-model';
import {maritimeView} from './tactics-model';
import {applyMuster} from './tactics-muster';
import {applyBattle,reconcileCombat} from './war43-battle';
import {createMilitaryCore} from './war43-core';
import {applyMilitaryAction} from './restoration19-military';
import {customizeRun} from './restoration19-customization';
import {applyTransport,recruitmentLimit} from './transport';
import {reconcileOccupation} from './occupation';
import {applyMaritime,reconcileMaritime,transportBase} from './maritime';
import type {SeaGraph} from './sea-path';
type Command=Extract<GameCommand,{type:'muster'|'battle'|'transport'|'maritime'|'customize'|'military'|'order'|'action'}>;
/** Execute over a private v19 candidate. Old session validators are not used
 * with new capital semantics; the owner installs the fully checked result. */
export function applyRestorationCommand(r:Restoration19Run,c:Command,access:MilitaryAccess43,g:SeaGraph):ChronicleRun{
 let n=structuredClone(chronicleView(r));
 const m=maritimeView(tacticsView(campaignView(n))),expected={day:r.world.day,nextEventId:r.world.nextEventId};
 if(c.type==='muster')return chronicleWrap(campaignWrap(applyMuster(tacticsView(campaignView(n)),c.action),n.reorganization),n.chronicle);
 if(c.type==='battle')Object.assign(n,applyBattle(n.world,n.battles,n.units,c.action,undefined,access));
 else if(c.type==='customize')n.world=customizeRun(m,c).world;
 else if(c.type==='maritime'){const moved=applyMaritime(m,g,c.action,c.expected);n.world=moved.world;n.navy=moved.navy;n.maritime=moved.maritime;n.transports=moved.transports;}
 else if(c.type==='transport'){
  if('armyId'in c.action&&n.reorganization.active[c.action.armyId])throw Error('这支军团正在重编，补员完成后才能登船。');
  if(n.maritime.contacts.some(p=>p.a===c.action.fleetId||p.b===c.action.fleetId))throw Error('舰队正在交战，请先用撤离航线脱离，再登船或登陆。');
  const moved=applyTransport(transportBase(m),g,c.action,c.expected);n.world=moved.world;n.units=moved.units;n.navy=moved.navy;n.transports=moved.transports;n.battles=moved.battles;delete n.maritime.retreating[c.action.fleetId];
 }else if(c.type==='military'){
  if(c.action.type==='recruit'){const reason=recruitmentLimit(transportBase(m),c.action.nationId);if(reason)throw Error(reason);}
  Object.assign(n,applyMilitaryAction(n.world,n.units,c.action,expected));
 }else{
  const core=createMilitaryCore(n.units,true,true,{...r.terrainContext,upper:r.upperCombat,finance:r.finance,people:r.people,culture:r.culture},undefined,undefined,undefined,undefined,undefined,access);
  if(c.type==='order'){
   const p=core.previewOrder(n.world,c.order);if(!p.valid)throw Error(p.reason);n.world=core.issueOrder(n.world,c.order);delete n.battles.plans[c.order.armyId];
   if(c.order.kind==='march'){const a=n.world.armies.find(a=>a.id===c.order.armyId)!,path=[a.provinceId,...a.route];if(path.length>1&&new Set(path).size===path.length)n.battles.plans[a.id]={path,targets:[c.order.targetId]};}
  }else n.world=core.applyStateAction(n.world,c.action,expected);
 }
 for(const a of [...n.world.armies,...n.transports.cargo.map(c=>c.army)])if(!n.tactics.forces[a.id])n.tactics.forces[a.id]={homeId:a.originId,kind:'manual',fullStrength:a.troops};
 n={...n,...reconcileCombat(n.world,n.battles,n.clock.tick,access),...{maritime:reconcileMaritime({...maritimeView(tacticsView(campaignView(n)))}).maritime}};
 return {...n,...reconcileOccupation(n.world,n.occupation)};
}
