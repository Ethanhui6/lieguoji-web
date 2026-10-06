import {loadRun as oldLoad,saveRun as oldSave,runStore as oldStore,type StoreKey as OldStore} from './upper14-stores';
import {loadFiscal15,saveFiscal15} from './fiscal15-storage';
import type {GameRun} from './fiscal15-model';
export type StoreKey=OldStore|17;
export type SavedRun={run:GameRun;revision:number;recovered:boolean};
export const runStore=(r:GameRun):StoreKey=>r.version===15?17:oldStore(r);
export const loadRun=(factory:IDBFactory=indexedDB,store:StoreKey=17):Promise<SavedRun|null>=>store===17?loadFiscal15(factory):oldLoad(factory,store);
export const saveRun=(r:GameRun,expected:number|null,factory:IDBFactory=indexedDB)=>r.version===15?saveFiscal15(r,expected,factory):oldSave(r,expected,factory);
