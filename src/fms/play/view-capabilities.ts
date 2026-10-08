import type {GameRun} from './war44-model';

// View dispatch only. Runs are validated by their own frozen session/storage
// contracts before reaching the UI; these guards do not authorize a new schema.
export const hasRestorationView=(run:GameRun|null|undefined):run is Extract<GameRun,{sovereignty:unknown}>=>!!run&&'sovereignty'in run;
export const hasChronicleView=(run:GameRun|null|undefined):run is Extract<GameRun,{chronicle:unknown}>=>!!run&&'chronicle'in run;
export const hasNativeMusterView=(run:GameRun|null|undefined):run is Exclude<Extract<GameRun,{destiny:unknown}>,{version:20}>=>!!run&&'destiny'in run&&run.version!==20;
