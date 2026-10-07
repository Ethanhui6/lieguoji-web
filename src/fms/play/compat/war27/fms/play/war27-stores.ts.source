import {loadRun as oldLoad,saveRun as oldSave,runStore as oldStore,type StoreKey as OldStore} from './war26-stores';
import {loadWar27,saveWar27} from './war27-storage';
import type {GameRun} from './war27-model';
export type StoreKey=OldStore|29;
export type SavedRun={run:GameRun;revision:number;recovered:boolean};
export const runStore=(r:GameRun):StoreKey=>r.version===27?29:oldStore(r);
export const loadRun=(factory:IDBFactory=indexedDB,store:StoreKey=29):Promise<SavedRun|null>=>store===29?loadWar27(factory):oldLoad(factory,store);
export const saveRun=(r:GameRun,expected:number|null,factory:IDBFactory=indexedDB)=>r.version===27?saveWar27(r,expected,factory):oldSave(r,expected,factory);
