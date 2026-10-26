import type {PoliticalRun47} from './civilization47-diplomatic-world';
import {warHistoryDetails47} from './civilization47-war-history';
import {relationIdentity,type War46Campaign} from './war47-wars';
import {CASUS_BELLI_NAMES47,warGoalDesc47} from './casus-labels47';
import {warTypeName47,type LeaderRun47} from './leader-history47';

export type CampaignCardSide47={side:0|1;label:string;nationIds:string[];nationNames:string[];recordedLoss:number};
export type CampaignCard47={
 id:number;
 history:'complete'|'unknown';
 /** Original legacy WarType name (StateInfoUI.BuildOldWarInfo 战争类型). */
 warType:string;
 currentNationIds:string[];
 departedNationIds:string[];
 sides:[CampaignCardSide47,CampaignCardSide47];
 openedTick:number;
 elapsedTicks:number;
 elapsedDays:number;
 durationLabel:string;
 declarationReason:string|null;
 goalCount:number;
 /** WarV2EventText.GoalDesc of each goal, original StateInfoUI war panel. */
 goalTexts:string[];
 months:number;
 details:string;
 globalActiveSieges:number;
 territoryLedgerNote:string;
};

const unique=<T>(items:readonly T[])=>[...new Set(items)];

function nationIdForState47(run:PoliticalRun47,stateId:number){return run.nativeWars.nationIds.find(row=>row[0]===stateId)?.[1]??null;}
function nationNameForState47(run:PoliticalRun47,stateId:number){const id=nationIdForState47(run,stateId);return id?run.world.nations.find(nation=>nation.id===id)?.name??'未记录国家':'未记录国家';}
function cardSide47(run:PoliticalRun47,campaign:War46Campaign,side:0|1):CampaignCardSide47{
 const current=campaign.participants.filter(member=>member.side===side),all=[...campaign.participants,...campaign.destroyedParticipants].filter(member=>member.side===side);
 const nationIds=current.flatMap(member=>{const id=nationIdForState47(run,member.stateId);return id?[id]:[];});
 const recordedLoss=campaign.deaths.filter(([stateId])=>all.some(member=>member.stateId===stateId)).reduce((sum,[,amount])=>sum+amount,0);
 return {side,label:campaign.history==='complete'?(side===0?'进攻方':'防守方'):(side===0?'记录方一':'记录方二'),nationIds,nationNames:current.map(member=>nationNameForState47(run,member.stateId)),recordedLoss};
}

/** Pure view model for an already committed native war. It never derives a
 * province transfer from colour/animation: one campaign has no universal
 * ownership of every concurrent occupation record, so that ledger stays in
 * the complete history view. */
export function campaignCard47(run:PoliticalRun47,campaign:War46Campaign,activeSiegeIds:readonly string[]=[]):CampaignCard47|null{
 const relation=run.world.statecraft!.relations.find(item=>relationIdentity(item.a,item.b,item.sinceDay)===campaign.relationId);
 if(campaign.endedTick!==null||relation?.status!=='war')return null;
 const sides=[cardSide47(run,campaign,0),cardSide47(run,campaign,1)] as [CampaignCardSide47,CampaignCardSide47];
 const currentNationIds=unique(sides.flatMap(side=>side.nationIds)),departedNationIds=unique(campaign.destroyedParticipants.flatMap(member=>{const id=nationIdForState47(run,member.stateId);return id?[id]:[]}));
 const declaration=campaign.history==='complete'?run.nativeDiplomacy.declarations.find(item=>item.warId===campaign.id):undefined;
 const elapsedTicks=Math.max(0,run.clock.tick-campaign.openedTick),elapsedDays=Math.round(elapsedTicks/120*10)/10;
 return {id:campaign.id,history:campaign.history,currentNationIds,departedNationIds,sides,openedTick:campaign.openedTick,elapsedTicks,elapsedDays,durationLabel:`${campaign.history==='complete'?'宣战至今':'本局记录'} ${elapsedDays} 日`,declarationReason:declaration?CASUS_BELLI_NAMES47[declaration.casusBelliId]??`理由类型 ${declaration.casusBelliId}`:null,warType:warTypeName47(run as LeaderRun47,campaign),goalCount:campaign.goals.length,goalTexts:campaign.goals.map(g=>warGoalDesc47(g.type,g.scope?.provinceIds?.length??0)),months:Math.floor(elapsedDays/30),details:warHistoryDetails47(run,campaign),globalActiveSieges:new Set(activeSiegeIds).size,territoryLedgerNote:'逐场逐笔易手没有可靠的战役归属字段；请在“全部记录”史书查看实际控制转移。'};
}

export const campaignCardsForNation47=(run:PoliticalRun47,nationId:string,activeSiegeIds:readonly string[]=[]):CampaignCard47[]=>run.nativeWars.campaigns.flatMap(campaign=>{
 const card=campaignCard47(run,campaign,activeSiegeIds);return card&&(card.currentNationIds.includes(nationId)||card.departedNationIds.includes(nationId))?[card]:[];
});
