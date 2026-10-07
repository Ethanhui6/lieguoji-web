import {loadRun as oldLoad,saveRun as oldSave,runStore as oldStore,type StoreKey as OldStore} from './war37-stores';
import {loadWar38,saveWar38} from './war38-storage';
import type {GameRun} from './war38-model';
export type StoreKey=OldStore|40;
export type SavedRun={run:GameRun;revision:number;recovered:boolean};
export const runStore=(r:GameRun):StoreKey=>r.version===38?40:oldStore(r);
export const loadRun=(factory:IDBFactory=indexedDB,store:StoreKey=40):Promise<SavedRun|null>=>store===40?loadWar38(factory):oldLoad(factory,store);
export const saveRun=(r:GameRun,expected:number|null,factory:IDBFactory=indexedDB)=>r.version===38?saveWar38(r,expected,factory):oldSave(r,expected,factory);
