import {loadRun as oldLoad,saveRun as oldSave,runStore as oldStore,type StoreKey as OldStore} from './war39-stores';
import {loadWar40,saveWar40} from './war40-storage';
import type {GameRun} from './war40-model';
export type StoreKey=OldStore|42;
export type SavedRun={run:GameRun;revision:number;recovered:boolean};
export const runStore=(r:GameRun):StoreKey=>r.version===40?42:oldStore(r);
export const loadRun=(factory:IDBFactory=indexedDB,store:StoreKey=42):Promise<SavedRun|null>=>store===42?loadWar40(factory):oldLoad(factory,store);
export const saveRun=(r:GameRun,expected:number|null,factory:IDBFactory=indexedDB)=>r.version===40?saveWar40(r,expected,factory):oldSave(r,expected,factory);
