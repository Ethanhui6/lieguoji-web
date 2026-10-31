import {it,expect} from 'vitest';
import {writeFile,mkdir} from 'node:fs/promises';
import {createNativeWorld} from './native-world';
import {evaluateDeclaration47} from '../fms/play/civilization47-declaration';
import {NATIVE_INITIAL_WAR_TIME} from '../fms/play/native-war/diplomatic-relations';
import type {PoliticalRun47} from '../fms/play/civilization47-diplomatic-world';

import {diplomacyStatic,diplomacySnapshot} from './diplomacy-state';
type Run=PoliticalRun47;
/** What one evaluation changed: pools, random stream, and the declared war if any. */
function outcome(before:Run,after:Run,nation:string){
  const index=new Map(after.world.nations.map((n,i)=>[n.id,i])),d=after.nativeDiplomacy,war=after.nativeWars.campaigns.length>before.nativeWars.campaigns.length?after.nativeWars.campaigns.at(-1)!:null;
  const decl=war?d.declarations.find(x=>x.warId===war.id)!:null;
  return {pools:{...d.nations[nation].pools},rng:d.rng,draws:d.draws,
    war:war&&decl?{casusBelli:decl.casusBelliId,attacker:index.get(war.attacker!)!,defender:index.get(war.defender!)!,goals:decl.goals.map(g=>({id:g.id,type:g.type,scope:g.scope?.provinceIds??[],requiredCount:g.scope?.requiredCount??0})),
      participants:war.coalition?.members.map(m=>({state:m.stateId,side:m.side,role:m.role}))??[],
      atWar:after.world.statecraft!.relations.filter(p=>p.status==='war').map(p=>[index.get(p.a)!,index.get(p.b)!])}:null};
}

/** Golden samples for the Swift declaration engine: a web world advanced in 30-day steps for four
 * years; at each step every nation's monthly declaration evaluation is run on a copy, both as the
 * world stands and with its declaration pool and cooldowns opened (so wars are declared). Inputs are
 * the snapshot above, outputs the pools, random stream and declared war. Run with EXPORT_NATIVE_WORLD=1. */
it.skipIf(process.env.EXPORT_NATIVE_WORLD!=='1')('exports diplomacy golden samples',async()=>{
  const {session,snapshot}=await createNativeWorld();
  let x=snapshot;
  const statics=diplomacyStatic(x.run as Run),samples:{nation:number;forced:boolean;input:ReturnType<typeof diplomacySnapshot>;output:ReturnType<typeof outcome>}[]=[];
  for(let step=0;step<48;step++){
    for(let d=0;d<30;d++)x=session.execute({kind:'advance',ticks:120} as never,x.journal.actions.length);
    const run=x.run as Run;
    run.world.nations.forEach((n,i)=>{
      if(!run.world.provinces.some(p=>p.controller===n.id))return;
      for(const forced of [false,true]){
        const copy=structuredClone(run);
        if(forced){const v=copy.nativeDiplomacy.nations[n.id];v.pools.startWar=Math.fround(150);v.activeTime=NATIVE_INITIAL_WAR_TIME;v.passiveTime=NATIVE_INITIAL_WAR_TIME;}
        const input=diplomacySnapshot(copy),before=structuredClone(copy);
        evaluateDeclaration47(copy,n.id);
        samples.push({nation:i,forced,input,output:outcome(before,copy,n.id)});
      }
    });
  }
  const wars=samples.filter(s=>s.output.war).length;
  expect(wars).toBeGreaterThan(5);
  await mkdir('ios-native/Core/Tests/LieguojiCoreTests/Golden',{recursive:true});
  await writeFile('ios-native/Core/Tests/LieguojiCoreTests/Golden/diplomacy.json',JSON.stringify({statics,samples}));
},3600000);
