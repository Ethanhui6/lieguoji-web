import {loadRun as oldLoad,saveRun as oldSave,runStore as oldStore,type StoreKey as OldStore} from './settlement25-stores';
import {loadWar26,saveWar26} from './war26-storage';
import type {GameRun} from './war26-model';
export type StoreKey=OldStore|28;
export type SavedRun={run:GameRun;revision:number;recovered:boolean};
export const runStore=(r:GameRun):StoreKey=>r.version===26?28:oldStore(r);
export const loadRun=(factory:IDBFactory=indexedDB,store:StoreKey=28):Promise<SavedRun|null>=>store===28?loadWar26(factory):oldLoad(factory,store);
export const saveRun=(r:GameRun,expected:number|null,factory:IDBFactory=indexedDB)=>r.version===26?saveWar26(r,expected,factory):oldSave(r,expected,factory);
