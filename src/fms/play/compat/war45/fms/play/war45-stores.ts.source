import {loadRun as oldLoad,saveRun as oldSave,runStore as oldStore,type StoreKey as OldStore} from './war44-stores';
import {loadWar45,saveWar45} from './war45-storage';
import type {GameRun} from './war45-model';
export type StoreKey=OldStore|47;
export type SavedRun={run:GameRun;revision:number;recovered:boolean};
export const runStore=(r:GameRun):StoreKey=>r.version===45?47:oldStore(r);
export const loadRun=(factory:IDBFactory=indexedDB,store:StoreKey=47):Promise<SavedRun|null>=>store===47?loadWar45(factory):oldLoad(factory,store);
export const saveRun=(r:GameRun,expected:number|null,factory:IDBFactory=indexedDB)=>r.version===45?saveWar45(r,expected,factory):oldSave(r,expected,factory);
