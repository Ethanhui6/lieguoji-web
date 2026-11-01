import {it,expect} from 'vitest';
import {writeFile,mkdir} from 'node:fs/promises';
import {createNativeWorld} from './native-world';
import {patch,type Run} from './run-view';
import {diplomacyStatic} from './diplomacy-state';
import {actualForces47} from '../fms/play/force-runtime47';
import {locateTravelCell47} from '../fms/play/army-travel47-graph';
import {originalCellProvinces} from '../fms/original/original-politics';
import {nativeFilterProvinceCells53} from '../fms/play/native-combat/province-cells53';
import {previewMilitary47,applyMilitary47} from '../fms/play/culture47-orders';
import {previewPoliticalCommand47,applyPoliticalCommand47} from '../fms/play/civilization47-political-owner';
import type {PoliticalRun47} from '../fms/play/civilization47-diplomatic-world';
import type {FoundingForces47} from '../fms/play/civilization47-forces';

const SKIP=new Set(['terrain','terrainContext','portControl','navalAutonomy','navalOpening','governmentOpening']);
function runView(r:Run){
  const v:Record<string,unknown>={};for(const [k,x] of Object.entries(r))if(!SKIP.has(k))v[k]=x;
  const q=r as unknown as FoundingForces47&PoliticalRun47;
  v.diplomaticGeography={water:q.diplomaticGeography.water.map(p=>({id:p.id,faces:p.faces}))};
  v.terrainContext={provinces:q.terrainContext.provinces};v.portControl={ports:q.portControl.ports};
  const c=r.chronicle;v.chronicle={...c,entries:c.entries.slice(-4)};
  return structuredClone(v);
}

/** Golden player commands for the Swift engine: every fifth day for 200 days, on copies of the web
 * state, a march order (to the army's farthest own province, or the first foreign province), a halt,
 * a declaration of war between a pair of states in turn, and peace for the first active war, with
 * the web's validity and reason text. Inputs are chained. */
it.skipIf(process.env.EXPORT_NATIVE_WORLD!=='1')('exports player command golden samples',async()=>{
  const {session,snapshot}=await createNativeWorld();
  let x=snapshot,previous:unknown=null,homeCells:Record<string,number>|null=null,borders:number[][]|null=null,statics:unknown=null,turn=0;
  const samples:unknown[]=[];
  for(let day=0;day<200;day++){
    x=session.execute({kind:'advance',ticks:120} as never,x.journal.actions.length);
    if(day%5!==2)continue;
    const base=x.run as unknown as FoundingForces47&PoliticalRun47;
    statics??=diplomacyStatic(base);
    if(!homeCells){const g=actualForces47(base).spatial.graph;homeCells=Object.fromEntries(base.world.provinces.map(p=>[p.id,locateTravelCell47(g,p.center,p.id)!.id]));
      const q=base as unknown as {terrain:Parameters<typeof originalCellProvinces>[0];scale:number},owners=originalCellProvinces(q.terrain,base.world.provinces,q.scale);
      const rows=nativeFilterProvinceCells53({province:Array.from(owners,i=>i+1),neighbor:q.terrain.neighbors,height:Array.from(q.terrain.elevations),feature:Array.from(owners,()=>0)},Array(base.world.provinces.length+1).fill(true));
      borders=base.world.provinces.map((_,i)=>rows[i+1]!.borderNeighborCells.map(c=>owners[c]));}
    const w=base.world,live=w.armies.filter(a=>a.troops>0&&a.status!=='destroyed'),n=w.nations.length;
    const commands:{kind:string;army?:string;province?:number;a?:number;b?:number}[]=[];
    const army=live[turn%Math.max(1,live.length)];
    if(army){const own=w.provinces.map((p,i)=>[p,i] as const).filter(([p])=>p.controller===army.nationId);
      const target=(turn%3===0?w.provinces.map((p,i)=>[p,i] as const).find(([p])=>p.controller!==army.nationId):own.at(-1))??own[0];
      if(target)commands.push({kind:'order',army:army.id,province:target[1]});commands.push({kind:'order',army:army.id,province:-1});}
    commands.push({kind:'declare',a:turn%n,b:(turn*7+3)%n});
    const war=base.nativeWars.campaigns.find(c=>c.endedTick===null&&c.attacker&&c.defender);
    if(war)commands.push({kind:'peace',a:w.nations.findIndex(m=>m.id===war.attacker),b:w.nations.findIndex(m=>m.id===war.defender)});
    turn++;
    for(const c of commands){
      const r=structuredClone(base),input=runView(r as unknown as Run);let ok:boolean,reason:string;let out=r;
      if(c.kind==='order'){const p=r.world.provinces[c.province!];const command=c.province!<0?{type:'army-halt' as const,armyId:c.army!}:{type:'army-move' as const,armyId:c.army!,target:{kind:'province' as const,id:p.id},kind:'march' as const};
        const intent={force:'army' as const,command},preview=previewMilitary47(r,intent) as unknown as {valid:boolean;reason:string;basedOn:never};ok=preview.valid;reason=preview.reason;if(ok)out=applyMilitary47(r,intent,preview.basedOn) as typeof r;}
      else{const action={type:c.kind==='declare'?'declare-war' as const:'make-peace' as const,nationId:r.world.nations[c.a!].id,targetNationId:r.world.nations[c.b!].id};
        if(c.a===c.b)continue;
        const preview=previewPoliticalCommand47(r,action);ok=preview.valid;reason=preview.reason;if(ok)out=applyPoliticalCommand47(r,action,preview.expected) as typeof r;}
      samples.push({command:c,ok,reason,inputPatch:previous===null?null:patch(previous,input),input:previous===null?input:undefined,patch:patch(input,runView(out as unknown as Run))});previous=input;
    }
  }
  expect(samples.length).toBeGreaterThan(60);
  await mkdir('ios-native/Core/Tests/LieguojiCoreTests/Golden',{recursive:true});
  await writeFile('ios-native/Core/Tests/LieguojiCoreTests/Golden/commands.json',JSON.stringify({homeCells,borders,statics,samples:samples.slice(0,140)}));
},3600000);
