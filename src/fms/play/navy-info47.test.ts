import {describe,expect,it} from 'vitest';
import {grid} from './fixture.test-support';
import {Culture47Session} from './culture47-session';
import {SETTLEMENT47_ALGORITHM} from './settlement47-regions';
import {navyInfo47} from './navy-info47';

const STATUS=['海战','进攻（夺回港口）','进攻（攻击港口）','进攻（搜索目标）','待命（前沿待命）','待命（港口巡逻）','待命（前往驻扎）','待命（母港巡逻）','玩家指挥'];
describe('舰队信息 (original NavyInfoUI)',()=>{
  it('every fleet reads one of the original statuses, with a matching mission line and its home port',()=>{
    // Two land masses split by sea so that states keep fleets.
    const seen=new Set<string>();
    for(const relations of ['war','peace'] as const){
    const s=new Culture47Session();
    let x=s.create({terrain:grid((x,y)=>x>20&&x<230&&y>20&&y<230?45:0),count:5,cityCount:60,relations,settlementAlgorithm:SETTLEMENT47_ALGORITHM,families:'original',setup:{mode:'culture-generated',enabled:['chinese','japanese','english','arab','roman']}});
    for(let i=0;i<30;i++){x=s.execute({kind:'advance',ticks:120},x.journal.actions.length);
      for(const f of x.run.navy.fleets){const v=navyInfo47(x.run,f.id);if(!v)continue;seen.add(v.status);
        expect(STATUS).toContain(v.status);
        if(v.status.startsWith('进攻（攻击'))expect(v.mission).toBe(`进攻态：攻击港口 ${v.destination}`);
        if(v.status==='进攻（搜索目标）')expect(v.destination).toBe('等待分配进攻目标');
        if(v.status==='待命（港口巡逻）')expect(v.mission).toBe(`待命驻扎：${v.destination}（港口巡逻）`);
        if(v.status==='待命（母港巡逻）')expect(v.mission).toBe('待命：母港附近巡逻');
      }}
    expect(x.run.navy.fleets.length).toBeGreaterThan(0);
    }
    expect([...seen].some(v=>v.startsWith('进攻'))).toBe(true);expect([...seen].some(v=>v.startsWith('待命'))).toBe(true);
    expect(seen.size).toBeGreaterThan(0);
    console.log([...seen].join(' / '));
  },300000);
});
