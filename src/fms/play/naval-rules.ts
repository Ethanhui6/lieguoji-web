import * as current from './navy';
import * as frozen from './compat/naval1/fms/play/navy';
import {seaGraph} from './sea-path';
import {seaGraph as frozenGraph} from './compat/naval1/fms/play/sea-path';
import type {FmsRun} from './world';
export function navalRules(run:FmsRun){return run.version===3?frozen:{...current,previewNaval:current.previewRealtimeNaval,applyNaval:current.applyRealtimeNaval};}
export function graphFor(run:FmsRun){return (run.version===3?frozenGraph:seaGraph)(run.terrain,run.world);}
