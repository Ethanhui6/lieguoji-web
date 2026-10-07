import {loadRun as oldLoad,saveRun as oldSave,runStore as oldStore,type StoreKey as OldStore} from './muster21-stores';
import {loadLife22,saveLife22} from './life22-storage';
import type {GameRun} from './life22-model';
export type StoreKey=OldStore|24;
export type SavedRun={run:GameRun;revision:number;recovered:boolean};
export const runStore=(r:GameRun):StoreKey=>r.version===22?24:oldStore(r);
export const loadRun=(factory:IDBFactory=indexedDB,store:StoreKey=24):Promise<SavedRun|null>=>store===24?loadLife22(factory):oldLoad(factory,store);
export const saveRun=(r:GameRun,expected:number|null,factory:IDBFactory=indexedDB)=>r.version===22?saveLife22(r,expected,factory):oldSave(r,expected,factory);
