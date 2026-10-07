import {loadRun as oldLoad,saveRun as oldSave,runStore as oldStore,type StoreKey as OldStore} from './war28-stores';
import {loadWar29,saveWar29} from './war29-storage';
import type {GameRun} from './war29-model';
export type StoreKey=OldStore|31;
export type SavedRun={run:GameRun;revision:number;recovered:boolean};
export const runStore=(r:GameRun):StoreKey=>r.version===29?31:oldStore(r);
export const loadRun=(factory:IDBFactory=indexedDB,store:StoreKey=31):Promise<SavedRun|null>=>store===31?loadWar29(factory):oldLoad(factory,store);
export const saveRun=(r:GameRun,expected:number|null,factory:IDBFactory=indexedDB)=>r.version===29?saveWar29(r,expected,factory):oldSave(r,expected,factory);
