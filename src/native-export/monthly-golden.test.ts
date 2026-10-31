import {it,expect} from 'vitest';
import {writeFile,mkdir} from 'node:fs/promises';
import {createNativeWorld} from './native-world';
import {settleFiscalMonth47} from '../fms/play/civilization47-fiscal';
import {monthlyInputs} from './native-state';
import {settleDestinyMonth} from '../fms/play/destiny20-state';

/** Golden samples: the real web engine runs a year; before each month boundary the state is copied,
 * advanced to the boundary day and settled with the web's own functions. Run with EXPORT_NATIVE_WORLD=1. */
it.skipIf(process.env.EXPORT_NATIVE_WORLD!=='1')('exports monthly treasury and destiny golden samples',async()=>{
  const {session,snapshot}=await createNativeWorld();
  let x=snapshot;
  const months:unknown[]=[];
  for(let m=1;m<=12;m++){
    while(x.run.world.day<m*30-1)x=session.execute({kind:'advance',ticks:120},x.journal.actions.length);
    const r=structuredClone(x.run);r.world.day=m*30;r.clock.tick=r.world.day*120;
    const inputs=monthlyInputs(r),worldProvinces=r.world.provinces.length;
    settleFiscalMonth47(r);settleDestinyMonth(r,r.destiny);
    months.push({day:r.world.day,worldProvinces,inputs,results:r.world.nations.map(n=>({gold:r.finance.nations[n.id].gold,goldPerMonth:r.finance.nations[n.id].goldPerMonth,goldBattleModifier:r.finance.nations[n.id].goldBattleModifier,
      destiny:r.destiny.nations[n.id].destiny,decrease:r.destiny.nations[n.id].decrease,manifestCount:r.destiny.nations[n.id].manifestCount,seed:r.destiny.nations[n.id].seed}))});
  }
  expect(months).toHaveLength(12);
  await mkdir('ios-native/Core/Tests/LieguojiCoreTests/Golden',{recursive:true});
  await writeFile('ios-native/Core/Tests/LieguojiCoreTests/Golden/monthly.json',JSON.stringify({months}));
},600000);
