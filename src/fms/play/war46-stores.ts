import {loadRun as oldLoad,saveRun as oldSave,runStore as oldStore,type StoreKey as OldStore} from './war45-stores';
import {loadWar46,saveWar46} from './war46-storage';
import type {GameRun} from './war46-model';
export type StoreKey=OldStore|48;
export type SavedRun={run:GameRun;revision:number;recovered:boolean};
export const runStore=(r:GameRun):StoreKey=>r.version===46?48:oldStore(r);
export const loadRun=(factory:IDBFactory=indexedDB,store:StoreKey=48):Promise<SavedRun|null>=>store===48?loadWar46(factory):oldLoad(factory,store);
export const saveRun=(r:GameRun,expected:number|null,factory:IDBFactory=indexedDB)=>r.version===46?saveWar46(r,expected,factory):oldSave(r,expected,factory);
