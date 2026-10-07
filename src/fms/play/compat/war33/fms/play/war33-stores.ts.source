import {loadRun as oldLoad,saveRun as oldSave,runStore as oldStore,type StoreKey as OldStore} from './war32-stores';
import {loadWar33,saveWar33} from './war33-storage';
import type {GameRun} from './war33-model';
export type StoreKey=OldStore|35;
export type SavedRun={run:GameRun;revision:number;recovered:boolean};
export const runStore=(r:GameRun):StoreKey=>r.version===33?35:oldStore(r);
export const loadRun=(factory:IDBFactory=indexedDB,store:StoreKey=35):Promise<SavedRun|null>=>store===35?loadWar33(factory):oldLoad(factory,store);
export const saveRun=(r:GameRun,expected:number|null,factory:IDBFactory=indexedDB)=>r.version===33?saveWar33(r,expected,factory):oldSave(r,expected,factory);
