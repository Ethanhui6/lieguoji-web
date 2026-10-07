import {War34Session} from './war34-session';
import type {War34Run} from './war34-model';
import {grid} from './fixture.test-support';
import {makeVassal34} from './war34-vassals';
export function coalitionFixture34(){
 const r=new War34Session().execute({type:'create',terrain:grid((x,y)=>x>20&&x<230&&y>20&&y<230?45:0),count:5,cityCount:60,relations:'peace'}).run as War34Run;
 const ids=r.world.nations.map(n=>n.id);for(const [v,l]of [[1,0],[2,0],[4,3]]){const result=makeVassal34(r,ids[v],ids[l],()=>{});if(!result.success)throw Error(result.reason??"附庸测试关系创建失败");}
 r.diplomacy.worldAuto=false;return r;
}
export const stamp34=(r:War34Run)=>({day:r.world.day,nextEventId:r.world.nextEventId,tick:r.clock.tick});
