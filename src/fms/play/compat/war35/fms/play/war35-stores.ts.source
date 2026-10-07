import {loadRun as oldLoad,saveRun as oldSave,runStore as oldStore,type StoreKey as OldStore} from './war34-stores';
import {loadWar35,saveWar35} from './war35-storage';
import type {GameRun} from './war35-model';
export type StoreKey=OldStore|37;
export type SavedRun={run:GameRun;revision:number;recovered:boolean};
export const runStore=(r:GameRun):StoreKey=>r.version===35?37:oldStore(r);
export const loadRun=(factory:IDBFactory=indexedDB,store:StoreKey=37):Promise<SavedRun|null>=>store===37?loadWar35(factory):oldLoad(factory,store);
export const saveRun=(r:GameRun,expected:number|null,factory:IDBFactory=indexedDB)=>r.version===35?saveWar35(r,expected,factory):oldSave(r,expected,factory);
