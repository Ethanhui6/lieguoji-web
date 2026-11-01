import {it} from 'vitest';
import {writeFile,mkdir} from 'node:fs/promises';
import {createNativeWorld} from './native-world';
import {nativeStatics} from '../native-bridge/native-statics';
import type {Run} from './run-view';

const SKIP=new Set(['terrain','terrainContext','portControl','harbors','navalAutonomy','navalOpening','governmentOpening','diplomaticGeography']);
function compared(r:Run){const v:Record<string,unknown>={};for(const [k,x] of Object.entries(r))if(!SKIP.has(k))v[k]=x;return structuredClone(v);}

/** The hand-over golden: the whole run as the bridge's nativeWorld() gives it (no terrain), after 40
 * days of web play, and the web run 20 days later. The Swift engine opens it, saves and reopens it,
 * advances 20 days and must reach the same run. */
it.skipIf(process.env.EXPORT_NATIVE_WORLD!=='1')('exports the bridge hand-over golden',async()=>{
  const {session,snapshot}=await createNativeWorld();
  let x=snapshot;
  for(let d=0;d<40;d++)x=session.execute({kind:'advance',ticks:120} as never,x.journal.actions.length);
  const r=x.run as unknown as Record<string,unknown>,run:Record<string,unknown>={};
  for(const [k,v] of Object.entries(r))if(k!=='terrain')run[k]=v;
  const world=JSON.stringify({run,statics:{...nativeStatics(r),labelGrid:null,map:null}});
  for(let d=0;d<20;d++)x=session.execute({kind:'advance',ticks:120} as never,x.journal.actions.length);
  await mkdir('ios-native/Core/Tests/LieguojiCoreTests/Golden',{recursive:true});
  await writeFile('ios-native/Core/Tests/LieguojiCoreTests/Golden/bridge-world.json',world);
  await writeFile('ios-native/Core/Tests/LieguojiCoreTests/Golden/bridge-after.json',JSON.stringify(compared(x.run as unknown as Run)));
},3600000);
