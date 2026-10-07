import {loadRun as oldLoad,saveRun as oldSave,runStore as oldStore,type StoreKey as OldStore} from './war29-stores';
import {loadWar30,saveWar30} from './war30-storage';
import type {GameRun} from './war30-model';
export type StoreKey=OldStore|32;
export type SavedRun={run:GameRun;revision:number;recovered:boolean};
export const runStore=(r:GameRun):StoreKey=>r.version===30?32:oldStore(r);
export const loadRun=(factory:IDBFactory=indexedDB,store:StoreKey=32):Promise<SavedRun|null>=>store===32?loadWar30(factory):oldLoad(factory,store);
export const saveRun=(r:GameRun,expected:number|null,factory:IDBFactory=indexedDB)=>r.version===30?saveWar30(r,expected,factory):oldSave(r,expected,factory);
