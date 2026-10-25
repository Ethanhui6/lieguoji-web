import {describe,expect,it} from 'vitest';
import {FIRST_TRACK47,MAX_INTERVAL47,MIN_INTERVAL47,MUSIC_LIST47,MusicPlan47} from './music-plan47';
import {batchCue47,cueOf47} from './event-sounds47';

const seq=(values:number[])=>{let i=0;return ()=>values[i++%values.length];};

describe('original RandomMusicPlayer',()=>{
  it('first track at once, the first pick right after it, then 4–10 s gaps',()=>{
    const plan=new MusicPlan47(seq([0,.5]));
    expect(plan.next()).toEqual({track:FIRST_TRACK47,waitSeconds:0});
    expect(plan.next().waitSeconds).toBe(0);
    const w=plan.next().waitSeconds;expect(w).toBeGreaterThanOrEqual(MIN_INTERVAL47);expect(w).toBeLessThanOrEqual(MAX_INTERVAL47);
  });
  it('plays every track once per shuffle, then refills without the last three',()=>{
    const plan=new MusicPlan47(()=>0);plan.next();
    const first=Array.from({length:5},()=>plan.next().track);
    expect(new Set(first).size).toBe(5);
    // Refill: all five minus the three most recent (the last three of the shuffle).
    const refill=[plan.next().track,plan.next().track];
    expect(new Set(refill)).toEqual(new Set(MUSIC_LIST47.filter(t=>!first.slice(2).includes(t))));
  });
  it('never repeats a track within three picks over a long run',()=>{
    let s=7;const plan=new MusicPlan47(()=>{s=(s*48271)%2147483647;return s/2147483647;});plan.next();
    const picks=Array.from({length:400},()=>plan.next().track);
    for(let i=1;i<picks.length;i++)for(let j=Math.max(0,i-3);j<i;j++)expect(picks[i]).not.toBe(picks[j]);
  });
});

describe('event cues (web addition)',()=>{
  it('classifies the engine wording and keeps the most important cue of a batch',()=>{
    expect(cueOf47({kind:'diplomacy',text:'元平帝国以领土征服为由对杰拜勒卡比尔王国宣战，目标：占领3省'})).toBe('war');
    expect(cueOf47({kind:'occupation',text:'元平帝国攻下泽伊通杰努比'})).toBe('capture');
    expect(cueOf47({kind:'occupation',text:'元平帝国接管山崎'})).toBe('annex');
    expect(cueOf47({kind:'system',text:'平德帝国与杰拜勒卡比尔王国停战，达成目标：占领2省，历时1年'})).toBe('peace');
    expect(cueOf47({kind:'system',text:'丰滨帝国与杰拜勒卡比尔王国结成联盟'})).toBe('alliance');
    expect(cueOf47({kind:'battle',text:'云城争夺城防'})).toBe('siege');
    expect(cueOf47({kind:'order',text:'松城步兵前往平安'})).toBeNull();
    expect(batchCue47([{kind:'battle',text:'云城争夺城防'},{kind:'diplomacy',text:'甲国对乙国宣战'},{kind:'occupation',text:'甲国攻下丙'}])).toBe('war');
    expect(batchCue47([])).toBeNull();
  });
});
