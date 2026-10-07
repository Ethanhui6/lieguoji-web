import {loadRun as oldLoad,saveRun as oldSave,runStore as oldStore,type StoreKey as OldStore} from './life22-stores';
import {loadDynasty23,saveDynasty23} from './dynasty23-storage';
import type {GameRun} from './dynasty23-model';
export type StoreKey=OldStore|25;
export type SavedRun={run:GameRun;revision:number;recovered:boolean};
export const runStore=(r:GameRun):StoreKey=>r.version===23?25:oldStore(r);
export const loadRun=(factory:IDBFactory=indexedDB,store:StoreKey=25):Promise<SavedRun|null>=>store===25?loadDynasty23(factory):oldLoad(factory,store);
export const saveRun=(r:GameRun,expected:number|null,factory:IDBFactory=indexedDB)=>r.version===23?saveDynasty23(r,expected,factory):oldSave(r,expected,factory);
