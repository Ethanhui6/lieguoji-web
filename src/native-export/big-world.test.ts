import {it} from 'vitest';
import {writeFile,mkdir} from 'node:fs/promises';
import {createNativeWorld} from './native-world';
import {nativeStatics} from '../native-bridge/native-statics';

/** A large world for the Swift profile (240 provinces, 16 states, 10 days of web play), so the app's
 * per-day cost is measured on the map sizes players choose, not only on the 80-province golden. */
it.skipIf(process.env.EXPORT_BIG_WORLD!=='1')('exports the large profile world',async()=>{
  const {session,snapshot}=await createNativeWorld(undefined,'peace',{count:16,cityCount:240});
  let x=snapshot;
  for(let d=0;d<10;d++)x=session.execute({kind:'advance',ticks:120} as never,x.journal.actions.length);
  const r=x.run as unknown as Record<string,unknown>,run:Record<string,unknown>={};
  for(const [k,v] of Object.entries(r))if(k!=='terrain')run[k]=v;
  await mkdir('ios-native/Core/Tests/LieguojiCoreTests/Golden',{recursive:true});
  await writeFile('ios-native/Core/Tests/LieguojiCoreTests/Golden/big-world.json',JSON.stringify({run,statics:{...nativeStatics(r),labelGrid:null,map:null}}));
},3600000);
