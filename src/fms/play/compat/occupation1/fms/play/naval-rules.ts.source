import * as current from './navy';
import * as frozen from './compat/naval1/fms/play/navy';
import {seaGraph} from './sea-path';
import {seaGraph as frozenGraph} from './compat/naval1/fms/play/sea-path';
import type {FmsRun} from './world';
import * as realtime from './compat/realtime1/fms/play/navy';
import {seaGraph as realtimeGraph} from './compat/realtime1/fms/play/sea-path';
import * as battle from './compat/battle1/fms/play/navy';
import {seaGraph as battleGraph} from './compat/battle1/fms/play/sea-path';
export function navalRules(run:FmsRun){const r=run.version===4?realtime:run.version===5?battle:current;return run.version===3?frozen:{...r,previewNaval:r.previewRealtimeNaval,applyNaval:r.applyRealtimeNaval};}
export function graphFor(run:FmsRun){return (run.version===3?frozenGraph:run.version===4?realtimeGraph:run.version===5?battleGraph:seaGraph)(run.terrain,run.world);}
