import {beforeAll,describe,expect,it} from 'vitest';
import {grid} from './fixture.test-support';
import {Culture47Session,type Culture47Journal,type Culture47Opening} from './culture47-session';
import {attachPolitics47} from './civilization47-political-owner';
import {createFoundingForces47} from './civilization47-forces';
import {campaignCard47,campaignCardsForNation47} from './campaign-card47';

const opening:Culture47Opening={terrain:grid((x,y)=>x>20&&x<230&&y>20&&y<230?45:0),count:3,cityCount:24,relations:'peace',setup:{mode:'culture-generated',enabled:['chinese','japanese','arab']}};
let journal:Culture47Journal;
beforeAll(()=>{journal=new Culture47Session().create(opening).journal;},30000);
function declared(){const session=new Culture47Session();session.load(journal);const action={type:'declare-war' as const,nationId:'n-0',targetNationId:'n-1'},preview=session.preview(action);expect(preview.valid,preview.reason).toBe(true);return session.execute({kind:'politics',action,expected:preview.expected},preview.sequence).run;}

describe('committed campaign card projection',()=>{
 it('uses the live relation, exact declaration record and only current participants without mutating the run',()=>{
  const run=declared(),campaign=run.nativeWars.campaigns[0],before=structuredClone(run),card=campaignCard47(run,campaign,['verified-siege'])!;
  expect(card.history).toBe('complete');expect(card.declarationReason).toBe('领土争夺');expect(card.goalCount).toBeGreaterThan(0);expect(card.sides[0].label).toBe('进攻方');expect(card.sides[0].nationIds).toContain('n-0');expect(card.sides[1].nationIds).toContain('n-1');expect(card.globalActiveSieges).toBe(1);expect(card.territoryLedgerNote).toMatch(/可靠的战役归属字段/);expect(campaignCardsForNation47(run,'n-0',['verified-siege']).map(item=>item.id)).toEqual([campaign.id]);expect(run).toEqual(before);
 });
 it('does not invent an initiator, reason or original goals for an unknown opening war',()=>{
  const run=attachPolitics47(createFoundingForces47(opening.terrain,opening.count,opening.cityCount,'war',opening.setup)),campaign=run.nativeWars.campaigns[0],card=campaignCard47(run,campaign)!;
  expect(card.history).toBe('unknown');expect(card.declarationReason).toBeNull();expect(card.goalCount).toBe(0);expect(card.sides.map(side=>side.label)).toEqual(['记录方一','记录方二']);expect(card.durationLabel).toMatch(/^本局记录/);expect(card.details).toContain('原始目标未记录');
 });
 it('hides a campaign as soon as its bound relation is no longer an active war',()=>{
  const run=declared(),campaign=run.nativeWars.campaigns[0],relation=run.world.statecraft!.relations.find(item=>[item.a,item.b].includes('n-0')&&[item.a,item.b].includes('n-1'))!;
  relation.status='peace';expect(campaignCard47(run,campaign)).toBeNull();
 });
});
