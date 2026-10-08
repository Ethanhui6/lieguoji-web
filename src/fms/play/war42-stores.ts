import {loadRun as oldLoad,saveRun as oldSave,runStore as oldStore,type StoreKey as OldStore} from './war41-stores';
import {loadWar42,saveWar42} from './war42-storage';
import type {GameRun} from './war42-model';
export type StoreKey=OldStore|44;
export type SavedRun={run:GameRun;revision:number;recovered:boolean};
export const runStore=(r:GameRun):StoreKey=>r.version===42?44:oldStore(r);
export const loadRun=(factory:IDBFactory=indexedDB,store:StoreKey=44):Promise<SavedRun|null>=>store===44?loadWar42(factory):oldLoad(factory,store);
export const saveRun=(r:GameRun,expected:number|null,factory:IDBFactory=indexedDB)=>r.version===42?saveWar42(r,expected,factory):oldSave(r,expected,factory);
