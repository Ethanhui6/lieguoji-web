import type {NobilityRun47,Nobility47} from './civilization47-nobility';
import {f} from './native-economy/numeric';

/** Family armies and war merit of the original:
 * ArmyManager.DetermineArmyFamilyAndType 35A5D0 (an army belongs to the family
 * holding its home province; central when raised in core land or with no
 * family), Army.RecordBattleMerit 34E9C0 and Army.RecordConquestMerit 34EF90
 * (merit to the army's family or the leader's family by polity,
 * Family.AddEnemyDestroyed 8494D0 / AddConqueredProvince 8493E0, and the
 * state's familyWarContributions used by territory redistribution). */
type Run=NobilityRun47&{upperCombat?:{provinces:Record<string,{distance:number}>;nations:Record<string,{coreThreshold:number}>}};
const POLITIES=['Kingdom','Empire','Federation','Republic','Tribal','Theocracy'];
const isCore=(r:Run,provinceId:string,nationId:string)=>{const p=r.upperCombat?.provinces[provinceId],n=r.upperCombat?.nations[nationId];return !!p&&!!n&&p.distance<=n.coreThreshold;};
const holder=(n:Nobility47,provinceId:string)=>Object.keys(n.families).find(id=>n.families[id].controlledProvinces.includes(provinceId));
/** DetermineArmyFamilyAndType for an army first seen (its origin province is its home). */
export function nobleArmy47(r:Run,armyId:string){
  const n=r.nobility!;let row=n.armies[armyId];if(row)return row;
  const a=r.world.armies.find(v=>v.id===armyId);if(!a)return null;
  const family=holder(n,a.originId);
  row=family?{familyId:Number(family),central:isCore(r,a.originId,a.nationId)}:{familyId:0,central:true};
  n.armies[armyId]=row;return row;
}
export function reconcileNobleArmies47(r:Run){
  const n=r.nobility;if(!n)return;
  // Armies removed since the last day leave the ledger here.
  const live=new Set(r.world.armies.filter(a=>a.status!=='destroyed').map(a=>a.id));
  for(const id of Object.keys(n.armies))if(!live.has(id))delete n.armies[id];
  for(const a of r.world.armies)if(a.status!=='destroyed')nobleArmy47(r,a.id);
}
const leaderFamily=(r:Run,nationId:string)=>{const id=r.people.nations[nationId]?.leaderId;const p=id==null?null:r.kin.persons[id];return p?p.familyId:null;};
function contribute(n:Nobility47,nationId:string,familyId:number,v:number){
  if(!n.families[String(familyId)])return;
  const s=n.warContributions[nationId]??(n.warContributions[nationId]={});s[String(familyId)]=f((s[String(familyId)]??0)+v);
}
function destroyed(n:Nobility47,familyId:number,v:number){
  const fam=n.families[String(familyId)];if(!fam)return;
  let t=f(v+fam.totalEnemyDestroyed);if(!Number.isFinite(t)||0>t)t=0;fam.totalEnemyDestroyed=t;
}
function conquered(n:Nobility47,familyId:number,count:number){const fam=n.families[String(familyId)];if(fam)fam.totalProvincesConquered+=count;}
/** RecordBattleMerit(enemyDestroyed) of an attacking army. */
export function recordBattleMerit47(r:Run,armyId:string,amount:number){
  const n=r.nobility;if(!n||!(amount>0))return;
  const a=r.world.armies.find(v=>v.id===armyId),row=nobleArmy47(r,armyId);if(!a||!row)return;
  const leader=leaderFamily(r,a.nationId);if(leader===null)return;
  const p=POLITIES.indexOf(r.civilization.nations[a.nationId].polity),share=f(amount*f(.1));
  const whole=(id:number)=>{if(id<=0)return;destroyed(n,id,amount);contribute(n,a.nationId,id,share);};
  if(p<=1){if(row.central&&leader>0)whole(leader);else if(row.familyId>0)whole(row.familyId);else whole(leader);}
  else if(p<=3){
    if(row.familyId>0){if(leader<=0)return;const half=f(amount*f(.5));destroyed(n,row.familyId,half);destroyed(n,leader,half);contribute(n,a.nationId,row.familyId,f(share*f(.5)));contribute(n,a.nationId,leader,f(share*f(.5)));}
    else whole(leader);
  }else if(row.familyId>0)whole(row.familyId);else whole(leader);
}
/** RecordConquestMerit(count) of the army taking a province. */
export function recordConquestMerit47(r:Run,armyId:string,count=1){
  const n=r.nobility;if(!n||count<=0)return;
  const a=r.world.armies.find(v=>v.id===armyId),row=nobleArmy47(r,armyId);if(!a||!row)return;
  const leader=leaderFamily(r,a.nationId);if(leader===null)return;
  const p=POLITIES.indexOf(r.civilization.nations[a.nationId].polity),share=f(count*5);
  const whole=(id:number)=>{if(id<=0)return;conquered(n,id,count);contribute(n,a.nationId,id,share);};
  if(p<=1){if(row.central&&leader>0)whole(leader);else if(row.familyId>0)whole(row.familyId);else whole(leader);}
  else if(p<=3){
    if(row.familyId>0){conquered(n,row.familyId,count);contribute(n,a.nationId,row.familyId,f(share*f(.5)));if(leader>0)contribute(n,a.nationId,leader,f(share*f(.5)));}
    else whole(leader);
  }else if(row.familyId>0)whole(row.familyId);else whole(leader);
}
