import type {World,StateAction,StateActionPreview,StateVersion} from '../../sim/types';
import type {SeaGraph} from './sea-path';
import type {ChronicleRun} from './chronicle-model';
import {previewManagementAction as oldPreview} from './tactics-statecraft';
import {setDecision} from './realtime-statecraft';
import {coastalContact} from './voyage24-geography';
/** The web world has actual wet-triangle ports. This adds maritime contact to
 * the existing web diplomacy contract; it is not the full native diplomacy AI. */
export function previewVoyageDiplomacy(w:World,g:SeaGraph,a:StateAction):StateActionPreview{
 const p=oldPreview(w,a);if(a.type!=='declare-war'||p.valid)return p;
 if(!a||Object.keys(a).sort().join()!=='nationId,targetNationId,type'||!w.statecraft||a.nationId===a.targetNationId||![a.nationId,a.targetNationId].every(id=>w.nations.some(n=>n.id===id)&&w.provinces.some(p=>p.controller===id)))return p;
 const r=w.statecraft.relations.find(r=>[r.a,r.b].includes(a.nationId)&&[r.a,r.b].includes(a.targetNationId));
 if(!r||r.status==='war'||w.day<r.truceUntilDay||!coastalContact(w,g,a.nationId,a.targetNationId))return p;
 return {...p,valid:true,reason:`${w.nations.find(n=>n.id===a.nationId)!.name}将向${w.nations.find(n=>n.id===a.targetNationId)!.name}宣战。`,changes:['两国沿岸通向同一片可航海域，建立跨海战争关系。','部队仍须集结、装船、航行和登陆；运力与粮食不足时等待。'],warnings:['不会因此获得和平第三国的陆地通行，也不会直接转移领土。']};
}
export function applyVoyageDiplomacy(r:ChronicleRun,g:SeaGraph,a:Exclude<StateAction,{type:'policy'}>,expected:StateVersion&{tick?:number}):ChronicleRun{
 if(a.type!=='declare-war')throw Error('此路径只接受宣战。');
 if(expected.day!==r.world.day||expected.nextEventId!==r.world.nextEventId||expected.tick!==r.clock.tick)throw Error('模拟时刻已变化，请重新预览外交。');
 const p=previewVoyageDiplomacy(r.world,g,a);if(!p.valid)throw Error(p.reason);const n=structuredClone(r),relation=n.world.statecraft!.relations.find(v=>[v.a,v.b].includes(a.nationId)&&[v.a,v.b].includes(a.targetNationId))!;
 relation.status='war';relation.sinceDay=n.world.day;relation.truceUntilDay=0;const reason=[p.reason,...p.changes,...p.warnings].join(' ');
 n.world.events.push({id:n.world.nextEventId++,day:n.world.day,kind:'diplomacy',text:`${n.world.nations.find(v=>v.id===a.nationId)!.name}向${n.world.nations.find(v=>v.id===a.targetNationId)!.name}宣战`,reason});n.world.events=n.world.events.slice(-160);
 setDecision(n.world,a.nationId,'宣战',reason);setDecision(n.world,a.targetNationId,'应战',reason);return n;
}
