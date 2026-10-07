import {loadRun as oldLoad,saveRun as oldSave,runStore as oldStore,type StoreKey as OldStore} from './war33-stores';
import {loadWar34,saveWar34} from './war34-storage';
import type {GameRun} from './war34-model';
export type StoreKey=OldStore|36;
export type SavedRun={run:GameRun;revision:number;recovered:boolean};
export const runStore=(r:GameRun):StoreKey=>r.version===34?36:oldStore(r);
export const loadRun=(factory:IDBFactory=indexedDB,store:StoreKey=36):Promise<SavedRun|null>=>store===36?loadWar34(factory):oldLoad(factory,store);
export const saveRun=(r:GameRun,expected:number|null,factory:IDBFactory=indexedDB)=>r.version===34?saveWar34(r,expected,factory):oldSave(r,expected,factory);
