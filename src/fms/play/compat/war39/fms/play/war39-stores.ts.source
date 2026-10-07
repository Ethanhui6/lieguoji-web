import {loadRun as oldLoad,saveRun as oldSave,runStore as oldStore,type StoreKey as OldStore} from './war38-stores';
import {loadWar39,saveWar39} from './war39-storage';
import type {GameRun} from './war39-model';
export type StoreKey=OldStore|41;
export type SavedRun={run:GameRun;revision:number;recovered:boolean};
export const runStore=(r:GameRun):StoreKey=>r.version===39?41:oldStore(r);
export const loadRun=(factory:IDBFactory=indexedDB,store:StoreKey=41):Promise<SavedRun|null>=>store===41?loadWar39(factory):oldLoad(factory,store);
export const saveRun=(r:GameRun,expected:number|null,factory:IDBFactory=indexedDB)=>r.version===39?saveWar39(r,expected,factory):oldSave(r,expected,factory);
