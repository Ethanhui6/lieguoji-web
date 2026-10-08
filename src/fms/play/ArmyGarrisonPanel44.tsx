import type {War44Run} from './war44-model';
const labels={waiting:'等待部署',assigned:'自主驻防',manual:'玩家接管',busy:'执行战斗或运输任务',lost:'部队已失去',rest:'补给与休整', 'no-route':'驻地暂不可达'};
export function ArmyGarrisonPanel44({run,armyId,busy,resume}:{run:War44Run;armyId:string;busy:boolean;resume:(id:string)=>void}){
 const a=run.world.armies.find(a=>a.id===armyId),p=run.garrison.armies[armyId];if(!a||!p)return null;
 const reserved=!!run.battles.plans[armyId]||!!run.reorganization.active[armyId]||run.transports.cargo.some(c=>c.army.id===armyId)||Object.values(run.voyages.missions).some(m=>m.armyId===armyId);
 return <section data-testid="army-garrison" className="play-army-list"><h3>驻地安排</h3><p>{labels[p.decision]}{p.provinceId&&` · ${run.world.provinces.find(n=>n.id===p.provinceId)?.name}`}</p><p className="play-muted">首都周边与陆地边境优先，按目标部队数量分散驻防。路线受实际国境与通行关系限制。</p>{run.voyages.manualArmies.includes(armyId)&&<button disabled={busy||a.status!=='idle'||!!a.route.length||reserved} onClick={()=>resume(armyId)}>交回自主驻防</button>}</section>;
}
