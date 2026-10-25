import type {FoundingForces47} from './civilization47-forces';
import {actualForces47} from './force-runtime47';
import {forceKey47} from './force-motion47';
import {armyTravelLocation47} from './army-travel47-state';
import {activeSiegesFromSpace47} from './siege-display47';

/**
 * Read-only explanation of the already committed military state. This is not
 * a second planner: location comes from the validated travel ledgers, intent
 * comes from the persisted autonomy ledgers, and a siege is shown only while
 * the current spatial view still proves hostile troops are present.
 */
export type ForceActivity47={
  kind:'army'|'fleet';
  id:string;
  nationId:string;
  name:string;
  location:{kind:'land';provinceId:string;label:string}|{kind:'sea';face:number;label:'海上'};
  target:{kind:'province'|'port';id:string;label:string}|null;
  decision:string;
  decisionLabel:string;
  reason:string;
  issuedTick:number|null;
  nextTick:number;
  provisions:{label:'军粮'|'舰队口粮';current:number};
  contact:boolean;
  siege:{provinceId:string;provinceName:string;role:'attacker'|'defender'|'present';progress:number;remaining:number;maximum:number;startedTick:number}|null;
  active:boolean;
};

const armyDecisionLabel=(decision:string)=>({
  waiting:'待命',attacking:'进攻中',supporting:'支援中',staging:'集结中',garrison:'驻防中',returning:'返程中',resting:'整补中',manual:'玩家指挥',busy:'交锋中',lost:'已损失','no-route':'路线受阻',
}[decision]??'待命');
const navalDecisionLabel=(decision:string)=>({
  waiting:'待命',attacking:'争夺港口',guarding:'海域警戒',resupply:'补给中',manual:'玩家指挥',busy:'海上交锋',lost:'已损失','no-route':'航线受阻',
}[decision]??'待命');

/** The active flag intentionally excludes routine waiting/garrison rows so a
 * country sheet can stay compact. The full military sheet still receives all
 * living forces through this same selector. */
const activeArmyDecision=new Set(['attacking','supporting','staging','returning','resting','manual','busy','no-route']);
const activeFleetDecision=new Set(['attacking','guarding','resupply','manual','busy','no-route']);

export function forceActivities47(run:FoundingForces47,activeSiegeIds?:readonly string[]):ForceActivity47[]{
  const {spatial}=actualForces47(run),provinces=new Map(run.world.provinces.map(p=>[p.id,p]));
  const activeSieges=new Set(activeSiegeIds??activeSiegesFromSpace47(run,spatial.space));
  const contactKeys=new Set(run.forceContacts.pairs.flatMap(pair=>[pair.a,pair.b]));
  const output:ForceActivity47[]=[];
  for(const army of run.world.armies){
    if(army.troops<=0||army.status==='destroyed')continue;
    const located=spatial.space.byArmy.get(army.id);
    // actualForces47 has already validated that every living Army has a
    // committed position record. Retain this guard for typed consumers of old
    // read-only snapshots instead of guessing from army.provinceId.
    if(!located)continue;
    const row=run.armyAutonomy.armies[army.id],targetId=row.targetId??row.garrisonId,province=targetId?provinces.get(targetId):undefined;
    const siegeProvince=located.province&&activeSieges.has(located.province.id)?located.province:undefined;
    const siegeRow=siegeProvince?run.occupation.sieges.find(s=>s.provinceId===siegeProvince.id):undefined;
    const siege=siegeRow?{provinceId:siegeProvince!.id,provinceName:siegeProvince!.name,role:army.nationId===siegeRow.attacker?'attacker' as const:army.nationId===siegeRow.controller?'defender' as const:'present' as const,progress:Math.max(0,Math.min(1,1-siegeRow.resistance/siegeRow.maximum)),remaining:siegeRow.resistance,maximum:siegeRow.maximum,startedTick:siegeRow.started}:null;
    const sea=located.seaFace!==null,contact=contactKeys.has(forceKey47({kind:'army',id:army.id}));
    const decisionLabel=siege?(siege.role==='attacker'?'围城中':siege.role==='defender'?'防守中':'战场附近'):armyDecisionLabel(row.decision);
    output.push({kind:'army',id:army.id,nationId:army.nationId,name:army.name,location:sea?{kind:'sea',face:located.seaFace!,label:'海上'}:{kind:'land',provinceId:located.province!.id,label:located.province!.name},target:province?{kind:'province',id:province.id,label:province.name}:null,decision:row.decision,decisionLabel,reason:row.reason,issuedTick:row.issuedTick,nextTick:row.nextTick,provisions:{label:'军粮',current:army.supplies},contact,siege,active:sea||located.travel.status==='moving'||located.travel.status==='blocked'||contact||!!siege||activeArmyDecision.has(row.decision)});
  }
  for(const fleet of run.navy.fleets){
    if(fleet.status==='lost'||run.maritime.hulls[fleet.id]<=0)continue;
    const travel=run.fleetPositions.records[fleet.id],located=armyTravelLocation47(travel,spatial.graph),row=run.navalAutonomy.fleets[fleet.id];
    // A player order clears the AI booking. Its committed destination is on
    // the fleet itself; the founding home is not a current sailing order.
    const manual=run.voyages.manualFleets.includes(fleet.id)||!fleet.patrol;
    const harborId=manual?fleet.targetId:row.assignedPortId,harbor=harborId?run.harbors.sites.find(site=>site.id===harborId):undefined,province=harbor?provinces.get(harbor.provinceId):undefined,city=harbor?run.world.cities.find(candidate=>candidate.id===harbor.capitalId):undefined;
    const contact=contactKeys.has(forceKey47({kind:'fleet',id:fleet.id}));
    output.push({kind:'fleet',id:fleet.id,nationId:fleet.nationId,name:fleet.name,location:{kind:'sea',face:located.cell.face,label:'海上'},target:harbor&&province?{kind:'port',id:harbor.id,label:city?`${city.name}港`:province.name}:null,decision:row.decision,decisionLabel:navalDecisionLabel(row.decision),reason:row.reason,issuedTick:row.issuedTick,nextTick:row.nextTick,provisions:{label:'舰队口粮',current:fleet.food},contact,siege:null,active:travel.status==='moving'||travel.status==='blocked'||contact||activeFleetDecision.has(row.decision)});
  }
  return output;
}

export const nationForceActivities47=(run:FoundingForces47,nationId:string,activeSiegeIds?:readonly string[])=>forceActivities47(run,activeSiegeIds).filter(activity=>activity.nationId===nationId);
export const forceActivity47=(run:FoundingForces47,kind:ForceActivity47['kind'],id:string,activeSiegeIds?:readonly string[])=>forceActivities47(run,activeSiegeIds).find(activity=>activity.kind===kind&&activity.id===id)??null;
