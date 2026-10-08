import type {War45Run} from './war45-model';
import {buildHarbors45,graphFor45} from './war45-geography';
import {seaGraph} from './sea-path';
import {initialNavy} from './navy';
import {initialDeployment45} from './war45-deployment';
import {initialPorts45} from './war45-ports';
/** Only the not-yet-presented day-zero CREATE draft. Never runs for load/copy.
 * Replace the inherited coastal starter fleet allocation with qualified city
 * harbors; reverse its exact crew/food debit first. Land/army generation stays
 * unchanged. No existing ship, history or player order is relocated. */
export function initializeHarborWorld45(r:War45Run){
 if(r.clock.tick!==0||r.world.day!==0||r.transports.cargo.length||Object.keys(r.voyages.missions).length)throw Error('仅新世界可初始化首府港湾。');
 const old=seaGraph(r.terrain,r.world),initialEvents=new Set<number>();
 for(const f of r.navy.fleets){const p=old.ports.find(p=>p.id===f.dockId),match=/^fleet-(\d+)-\d+$/.exec(f.id);if(!p||!match||f.status!=='docked'||f.route.length||f.progress||f.crew!==f.ships*40||f.food!==f.crew*60)throw Error('初始舰队已有变化，取消港湾初始化。');const stock=r.world.statecraft!.provinces.find(s=>s.provinceId===p.provinceId)!;stock.population+=f.crew;stock.grain+=f.food;initialEvents.add(Number(match[1]));}
 r.world.events=r.world.events.filter(e=>!initialEvents.has(e.id));r.chronicle.entries=r.chronicle.entries.filter(e=>e.sourceEventId===null||!initialEvents.has(e.sourceEventId));
 r.harbors=buildHarbors45(r);const g=graphFor45(r),next=initialNavy(r.world,g);r.world=next.world;r.navy=next.navy;
 // Existing maritime identities are reconciled against the actual new fleet.
 r.maritime.hulls=Object.fromEntries(r.navy.fleets.map(f=>[f.id,f.ships*100]));r.maritime.contacts=[];r.maritime.retreating={};
 r.navalDeployment=initialDeployment45(r,false);r.portControl=initialPorts45(r,g);
}
