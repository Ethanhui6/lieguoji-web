import {NOBILITY_RULE47,type NobilityRun47} from './civilization47-nobility';

export type {NobilityRun47} from './civilization47-nobility';

/** Structure of the original family ledger: every family is a kin family of a
 * living ledger nation, the ruling flag marks exactly the state family, and no
 * province is controlled by two families. */
export function assertNobility47(r:NobilityRun47){
  const n=r.nobility;if(n===undefined)return;
  const fail=()=>{throw Error('原作家族记录无效，存档未载入。');};
  if(!n||typeof n!=='object'||n.version!==1||n.rule!==NOBILITY_RULE47||!n.families||typeof n.families!=='object'||r.houses||r.generations)return fail();
  const provinces=new Set(r.world.provinces.map(p=>p.id)),seen=new Set<string>(),num=(v:unknown,min:number,max:number)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
  for(const [id,f] of Object.entries(n.families)){
    const k=r.kin.families[id],state=r.people.nations[f?.nationId];
    if(!k||!state||k.id!==Number(id)||k.nationId!==f.nationId||f.ruling!==(k.id===state.id))return fail();
    if(!provinces.has(f.homeProvinceId)||!provinces.has(f.originalHomeProvinceId)||!Array.isArray(f.controlledProvinces))return fail();
    for(const p of f.controlledProvinces){if(!provinces.has(p)||seen.has(p))return fail();seen.add(p);}
    if(!num(f.influence,0,1000)||!num(f.wealth,-1e9,1e12)||!num(f.extendedMembers,0,1e6)||typeof f.religionId!=='string'||!num(f.foundingTime,0,Number.MAX_VALUE)||!Number.isInteger(f.updateDay)||!num(f.updateDay,1,28))return fail();
  }
}
