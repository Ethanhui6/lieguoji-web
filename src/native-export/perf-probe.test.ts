import {it} from 'vitest';
import {createNativeWorld} from './native-world';
import {withFastChecks47} from '../fms/play/checks47';

/** Long-run cost probe: time per 50 days of play and the size of the growing ledgers. */
it.skipIf(process.env.PERF_PROBE!=='1')('measures long-run day cost',async()=>{
  const {session,snapshot}=await createNativeWorld();
  let x=snapshot;
  for(let block=0;block<40;block++){
    const t=performance.now();
    for(let d=0;d<50;d++)x=withFastChecks47(()=>session.execute({kind:'advance',ticks:120} as never,x.journal.actions.length));
    const r=x.run as unknown as {world:{day:number;armies:unknown[]};kin:{persons:object};chronicle:{entries:unknown[]}}&Record<string,unknown>,ms=(performance.now()-t)/50;
    const size=(v:unknown)=>JSON.stringify(v)?.length??0;
    const big=Object.entries(r).filter(([k])=>k!=='terrain').map(([k,v])=>[k,size(v)] as const).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([k,n])=>`${k}=${(n/1e6).toFixed(2)}M`).join(' ');
    (await import('node:fs')).appendFileSync('.autopilot/perf.log',`day ${r.world.day} ${ms.toFixed(1)}ms/day persons=${Object.keys(r.kin.persons).length} armies=${r.world.armies.length} chronicle=${r.chronicle.entries.length} journal=${x.journal.actions.length} | ${big}
`);
  }
},3600000);
