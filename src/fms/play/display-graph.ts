import type {FmsRun} from './world';
import {graphFor} from './naval-rules';
import type {SeaGraph} from './sea-path';

const graphs=new WeakMap<FmsRun['terrain'],Map<string,SeaGraph>>();
/** Main-thread PlayClient snapshots only. Versions 3–8 never edit province or
 * terrain geometry during ticks. All non-tick replies are structured-cloned
 * complete runs, so load/create/copy/commands invalidate this terrain identity.
 * Do not use this cache in the mutable simulation or the terrain editor. */
export function displayGraphFor(run:FmsRun):SeaGraph {
  if(run.version<3||run.version>8)return graphFor(run);
  let byRun=graphs.get(run.terrain);
  if(!byRun){byRun=new Map();graphs.set(run.terrain,byRun);}
  const key=`${run.id}/${run.version}`;
  let graph=byRun.get(key);
  if(!graph){graph=graphFor(run);byRun.set(key,graph);}
  return graph;
}
