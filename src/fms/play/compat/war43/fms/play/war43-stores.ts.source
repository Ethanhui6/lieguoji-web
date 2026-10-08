import {loadRun as oldLoad,saveRun as oldSave,runStore as oldStore,type StoreKey as OldStore} from './war42-stores';
import {loadWar43,saveWar43} from './war43-storage';
import type {GameRun} from './war43-model';
export type StoreKey=OldStore|45;
export type SavedRun={run:GameRun;revision:number;recovered:boolean};
export const runStore=(r:GameRun):StoreKey=>r.version===43?45:oldStore(r);
export const loadRun=(factory:IDBFactory=indexedDB,store:StoreKey=45):Promise<SavedRun|null>=>store===45?loadWar43(factory):oldLoad(factory,store);
export const saveRun=(r:GameRun,expected:number|null,factory:IDBFactory=indexedDB)=>r.version===43?saveWar43(r,expected,factory):oldSave(r,expected,factory);
