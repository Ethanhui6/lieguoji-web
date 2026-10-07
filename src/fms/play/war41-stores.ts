import {loadRun as oldLoad,saveRun as oldSave,runStore as oldStore,type StoreKey as OldStore} from './war40-stores';
import {loadWar41,saveWar41} from './war41-storage';
import type {GameRun} from './war41-model';
export type StoreKey=OldStore|43;
export type SavedRun={run:GameRun;revision:number;recovered:boolean};
export const runStore=(r:GameRun):StoreKey=>r.version===41?43:oldStore(r);
export const loadRun=(factory:IDBFactory=indexedDB,store:StoreKey=43):Promise<SavedRun|null>=>store===43?loadWar41(factory):oldLoad(factory,store);
export const saveRun=(r:GameRun,expected:number|null,factory:IDBFactory=indexedDB)=>r.version===41?saveWar41(r,expected,factory):oldSave(r,expected,factory);
