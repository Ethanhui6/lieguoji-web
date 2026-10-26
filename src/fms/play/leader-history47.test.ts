import {describe,expect,it} from 'vitest';
import {grid} from './fixture.test-support';
import {Culture47Session} from './culture47-session';
import {SETTLEMENT47_ALGORITHM} from './settlement47-regions';
import {campaignCard47} from './campaign-card47';
import {leaderAchievements47,leaderRecord47,type LeaderRun47} from './leader-history47';

describe('领导人历史 and 战争类型 (original StateInfoUI)',()=>{
  it('a player war reads 强制战争, reigns keep snapshots, and the achievements text counts the war',()=>{
    const s=new Culture47Session();
    let x=s.create({terrain:grid((x,y)=>x>10&&x<245&&y>10&&y<245?45:0),count:3,cityCount:30,relations:'peace',settlementAlgorithm:SETTLEMENT47_ALGORITHM,families:'original',setup:{mode:'culture-generated',enabled:['chinese','japanese','arab']}});
    for(let i=0;i<2;i++)x=s.execute({kind:'advance',ticks:120},x.journal.actions.length);
    const r0=x.run as unknown as LeaderRun47;
    expect(r0.reigns47).toBeDefined();
    const reign=r0.chronicle.leaders['n-0'].at(-1)!;
    expect(r0.reigns47![reign.id].start[0]).toBe(r0.world.provinces.filter(p=>p.controller==='n-0').length);
    const action={type:'declare-war' as const,nationId:'n-0',targetNationId:'n-1'},preview=s.preview(action);
    expect(preview.valid,preview.reason).toBe(true);
    x=s.execute({kind:'politics',action,expected:preview.expected},preview.sequence);
    x=s.execute({kind:'advance',ticks:120},x.journal.actions.length);
    const r=x.run as unknown as LeaderRun47;
    const war=r.nativeWars.campaigns.find(c=>c.attacker==='n-0'&&c.defender==='n-1'&&c.endedTick===null)!;
    expect(r.forcedWars47).toContain(war.id);
    expect(campaignCard47(r,war)!.warType).toBe('强制战争');
    const now=r.chronicle.leaders['n-0'].at(-1)!;
    expect(leaderRecord47(r,'n-0',now).rec.initiated).toBeGreaterThanOrEqual(1);
    const lines=leaderAchievements47(r,'n-0',now,'国王');
    expect(lines[0]).toMatch(/第\d+任国王$/);
    expect(lines[2]).toMatch(/^在位时期: \d+ - 现在 \(\d+年\)$/);
    expect(lines.some(l=>/^军事功绩: 主动征战\d+次/.test(l))).toBe(true);
    const defender=r.chronicle.leaders['n-1'].at(-1)!;
    expect(leaderAchievements47(r,'n-1',defender,'国王').some(l=>l.includes('御敌卫国1次'))).toBe(true);
    const replay=new Culture47Session().load(x.journal).run as unknown as LeaderRun47;
    expect(replay.reigns47).toEqual(r.reigns47);expect(replay.forcedWars47).toEqual(r.forcedWars47);
  },300000);
});
