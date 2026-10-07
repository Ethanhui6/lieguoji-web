import {loadRun as oldLoad,saveRun as oldSave,runStore as oldStore,type StoreKey as OldStore} from './war30-stores';
import {loadWar31,saveWar31} from './war31-storage';
import type {GameRun} from './war31-model';
export type StoreKey=OldStore|33;
export type SavedRun={run:GameRun;revision:number;recovered:boolean};
export const runStore=(r:GameRun):StoreKey=>r.version===31?33:oldStore(r);
export const loadRun=(factory:IDBFactory=indexedDB,store:StoreKey=33):Promise<SavedRun|null>=>store===33?loadWar31(factory):oldLoad(factory,store);
export const saveRun=(r:GameRun,expected:number|null,factory:IDBFactory=indexedDB)=>r.version===31?saveWar31(r,expected,factory):oldSave(r,expected,factory);
