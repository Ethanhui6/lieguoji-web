import {loadRun as oldLoad,saveRun as oldSave,runStore as oldStore,type StoreKey as OldStore} from './war27-stores';
import {loadWar28,saveWar28} from './war28-storage';
import type {GameRun} from './war28-model';
export type StoreKey=OldStore|30;
export type SavedRun={run:GameRun;revision:number;recovered:boolean};
export const runStore=(r:GameRun):StoreKey=>r.version===28?30:oldStore(r);
export const loadRun=(factory:IDBFactory=indexedDB,store:StoreKey=30):Promise<SavedRun|null>=>store===30?loadWar28(factory):oldLoad(factory,store);
export const saveRun=(r:GameRun,expected:number|null,factory:IDBFactory=indexedDB)=>r.version===28?saveWar28(r,expected,factory):oldSave(r,expected,factory);
