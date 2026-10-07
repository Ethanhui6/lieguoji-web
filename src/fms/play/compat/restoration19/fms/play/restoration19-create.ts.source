import {createNaming18} from './naming18-create';
import {court16View,type Naming18Run} from './naming18-model';
import {initialSovereignty} from './restoration19-sovereignty';
import {restoration19Wrap} from './restoration19-model';
import type {FmsDocument} from '../model';
export function copyNaming18(r:Naming18Run,copy=true){const n=structuredClone(r),s=initialSovereignty(n,copy);if(copy){n.id='fms-'+crypto.randomUUID();n.world.custom!.id=n.id;}return restoration19Wrap(court16View(n),n.culture,n.naming,s);}
export const createRestoration19=(terrain:FmsDocument,count:number,relations:'peace'|'war',enabled?:readonly string[])=>copyNaming18(createNaming18(terrain,count,relations,enabled),false);
