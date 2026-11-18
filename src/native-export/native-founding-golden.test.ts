import {it,expect,vi} from 'vitest';
import {writeFile,mkdir} from 'node:fs/promises';
import {createFmsOriginalDocument,originalGridFor} from '../fms/original/original-document';
import {generateRecoveredHeights} from '../world/recovered-terrain/engine';
import {SETTLEMENT47_ALGORITHM} from '../fms/play/settlement47-regions';
import {createGovernmentWorld47} from '../fms/play/civilization47-government';
import {attachFoundingForces47} from '../fms/play/civilization47-forces';
import {attachPolitics47,initializeOpeningWars47} from '../fms/play/civilization47-political-owner';
import {populationStamp47} from '../fms/play/civilization47-population-types';
import {enableArmyRetirement47} from '../fms/play/army-retirement47';
import {enableArmyRecovery47} from '../fms/play/army-recovery47';
import {enableFrameLoop47} from '../fms/play/frame-loop47';
import {enableArmyBatch47} from '../fms/play/army-batch47';
import {enableRebellion47} from '../fms/play/civilization47-rebellion';
import {enableOffices47} from '../fms/play/civilization47-offices';
import {enableOriginalArmy47} from '../fms/play/civilization47-original-army';
import type {FmsDocument} from '../fms/model';

/** 原生建世界分段黄金数据（Culture47Session.build 的开局段，与 App 建世界同序）：
 * input 为政府段完成后的整局（attachGovernment47 输出，无 terrain）；之后每一段只记改变了的顶层键
 * （world 按子键记），依次为 forces（attachFoundingForces47，capital-neighbor-v2）、politics（attachPolitics47
 * 后换上局号）、wars（开战开局的 initializeOpeningWars47）、enable（engine.ts ENABLE 七个规则启用动作，逐个记录）。
 * 世界编号固定。用 EXPORT_NATIVE_WORLD=1 运行。 */
type Run=Record<string,unknown>&{world:Record<string,unknown>};
function changes(before:Run,after:Run){
  const out:Record<string,unknown>={},world:Record<string,unknown>={};
  for(const [k,v] of Object.entries(after)){if(k==='terrain'||k==='world')continue;if(JSON.stringify(v)!==JSON.stringify(before[k]))out[k]=structuredClone(v);}
  for(const [k,v] of Object.entries(after.world))if(JSON.stringify(v)!==JSON.stringify(before.world[k]))world[k]=structuredClone(v);
  return {keys:Object.keys(after).filter(k=>k!=='terrain'),worldKeys:Object.keys(after.world),changed:out,world};
}
const strip=(r:unknown)=>{const o={...r as Run};delete o.terrain;return structuredClone(o);};

it.skipIf(process.env.EXPORT_NATIVE_WORLD!=='1')('exports native founding stage golden samples',async()=>{
  vi.spyOn(crypto,'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000047');
  const doc=await createFmsOriginalDocument('20k'),grid=(await originalGridFor(doc))!;
  const setup={mode:'culture-generated' as const,enabled:['chinese','japanese','english','arab','roman','german'] as never};
  const samples:unknown[]=[];
  for(const [seed,template,cities,count,relations] of [['421730','continents',80,8,'peace'],['777','pangea',120,12,'war'],['421730','highIsland',40,5,'peace'],['777','archipelago',80,24,'war']] as const){
    const heights=await generateRecoveredHeights(grid,seed,template);
    const d:FmsDocument={...doc,worldId:'42173000-0000-4000-8000-000000000000',elevations:Int32Array.from(heights)} as FmsDocument;
    const g=createGovernmentWorld47(d,count,cities,'peace',setup,{},SETTLEMENT47_ALGORITHM,undefined,'original');
    const input=strip(g);
    const forces=attachFoundingForces47(g,'capital-neighbor-v2');
    const f=changes(g as never,forces as never);
    const politics=attachPolitics47(forces);
    politics.id='fms-00000000-0000-4000-8000-000000000047';politics.world.custom!.id=politics.id;
    const p=changes(forces as never,politics as never);
    let run=structuredClone(politics);
    let w:unknown=null;
    if(relations==='war'){initializeOpeningWars47(run);w=changes(politics as never,run as never);}
    const enable:unknown[]=[];
    for(const action of [enableArmyRetirement47,enableArmyRecovery47,enableFrameLoop47,enableArmyBatch47,enableRebellion47,enableOffices47,enableOriginalArmy47] as ((r:never,e:unknown)=>unknown)[]){
      const next=action(run as never,populationStamp47(run as never)) as typeof run;
      enable.push(changes(run as never,next as never));run=next;
    }
    samples.push({seed,template,cities,count,relations,heights:Buffer.from(heights).toString('base64'),input,forces:f,politics:p,wars:w,enable});
  }
  expect(samples.length).toBe(4);
  await mkdir('ios-native/Core/Tests/LieguojiCoreTests/Golden',{recursive:true});
  await writeFile('ios-native/Core/Tests/LieguojiCoreTests/Golden/native-founding.json',JSON.stringify({samples}));
},1800000);
