import {loadRun as oldLoad,saveRun as oldSave,runStore as oldStore,type StoreKey as OldStore} from './war31-stores';
import {loadWar32,saveWar32} from './war32-storage';
import type {GameRun} from './war32-model';
export type StoreKey=OldStore|34;
export type SavedRun={run:GameRun;revision:number;recovered:boolean};
export const runStore=(r:GameRun):StoreKey=>r.version===32?34:oldStore(r);
export const loadRun=(factory:IDBFactory=indexedDB,store:StoreKey=34):Promise<SavedRun|null>=>store===34?loadWar32(factory):oldLoad(factory,store);
export const saveRun=(r:GameRun,expected:number|null,factory:IDBFactory=indexedDB)=>r.version===32?saveWar32(r,expected,factory):oldSave(r,expected,factory);
