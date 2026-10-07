import {loadRun as oldLoad,saveRun as oldSave,runStore as oldStore,type StoreKey as OldStore} from './war35-stores';
import {loadWar36,saveWar36} from './war36-storage';
import type {GameRun} from './war36-model';
export type StoreKey=OldStore|38;
export type SavedRun={run:GameRun;revision:number;recovered:boolean};
export const runStore=(r:GameRun):StoreKey=>r.version===36?38:oldStore(r);
export const loadRun=(factory:IDBFactory=indexedDB,store:StoreKey=38):Promise<SavedRun|null>=>store===38?loadWar36(factory):oldLoad(factory,store);
export const saveRun=(r:GameRun,expected:number|null,factory:IDBFactory=indexedDB)=>r.version===36?saveWar36(r,expected,factory):oldSave(r,expected,factory);
