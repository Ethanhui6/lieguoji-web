import {loadRun as oldLoad,saveRun as oldSave,runStore as oldStore,type StoreKey as OldStore} from './war36-stores';
import {loadWar37,saveWar37} from './war37-storage';
import type {GameRun} from './war37-model';
export type StoreKey=OldStore|39;
export type SavedRun={run:GameRun;revision:number;recovered:boolean};
export const runStore=(r:GameRun):StoreKey=>r.version===37?39:oldStore(r);
export const loadRun=(factory:IDBFactory=indexedDB,store:StoreKey=39):Promise<SavedRun|null>=>store===39?loadWar37(factory):oldLoad(factory,store);
export const saveRun=(r:GameRun,expected:number|null,factory:IDBFactory=indexedDB)=>r.version===37?saveWar37(r,expected,factory):oldSave(r,expected,factory);
