import { describe, expect, it } from 'vitest';
import { createWorld } from '../../sim/demo';
import type { GameEvent } from '../../sim/types';
import { eventLocation, isClash, visibleEvents } from './observation';
import { armiesAt, armyMarkerPoint, armyPosition, focusAnchor, focusMapPoint } from './navigation';
import { worldToScreen } from '../../world/camera';

const event = (kind: GameEvent['kind'], text: string, id = 1): GameEvent => ({ id, day: 1, kind, text, reason: '测试原因' });
describe('watching retained events without inventing historical locations', () => {
  it('does not call a starvation destruction event an actual clash',()=>{
    const w=createWorld();expect(isClash(w,event('battle',`${w.armies[0].name}失去作战能力`))).toBe(false);
    expect(isClash(w,event('battle',`${w.provinces[0].name}交战：伤亡`))).toBe(true);
  });
  it('filters the entire retained window, including an older battle behind daily entries', () => {
    const entries = [event('battle', 'old battle'), ...Array.from({length:80},(_,i)=>event('economy','ledger',i+2))];
    expect(visibleEvents(entries,'important').map(e=>e.id)).toEqual([1]);
    expect(visibleEvents(entries,'all')).toHaveLength(81);
    expect(visibleEvents(entries,'economy')[0].id).toBe(81);
  });
  it('distinguishes battle sites, arrival sites and command destinations', () => {
    const w=createWorld(), p=w.provinces[0], a=w.armies[0];
    expect(eventLocation(w,event('battle',`${p.name}交战：双方接敌`))).toEqual({kind:'province',id:p.id,label:'查看交战辖区'});
    expect(eventLocation(w,event('march',`${a.name}抵达${p.name}`))?.label).toBe('查看抵达地点');
    expect(eventLocation(w,event('order',`${a.name}自主向${p.name}行军`))?.label).toBe('查看命令目标');
    expect(eventLocation(w,event('economy',`${w.nations[0].name}日结账`))).toBeNull();
    expect(eventLocation(w,event('battle',`未识别记录：${p.name}`))).toBeNull();
  });
  it('refuses ambiguous names and labels living army locations as current', () => {
    const w=createWorld(), p=w.provinces[0], a=w.armies[0];
    w.provinces[1].name=p.name;
    expect(eventLocation(w,event('battle',`${p.name}交战：记录`))).toBeNull();
    expect(eventLocation(w,event('supply',`${a.name}断粮减员 30`))).toEqual({kind:'army-current',id:a.id,label:'查看军队当前位置'});
    a.status='destroyed';a.troops=0;
    expect(eventLocation(w,event('supply',`${a.name}断粮减员 30`))).toBeNull();
  });
});
describe('army markers and camera focus share CSS pixel coordinates', () => {
  it('picks the moving marker at different zooms and ignores destroyed armies', () => {
    const w=createWorld(),a=w.armies[0],origin=w.provinces.find(p=>p.id===a.provinceId)!.center,target=w.provinces[1];
    a.route=[target.id];a.progress=.4;
    expect(armyPosition(w,a).x).toBeCloseTo(origin.x+(target.center.x-origin.x)*.4);
    w.armies.slice(1).forEach(a=>{a.status='destroyed';a.troops=0;});
    for(const zoom of [.1,1,9]){const camera={x:32,y:-80,scale:zoom},p=armyMarkerPoint(w,a,2,camera);expect(armiesAt(w,2,camera,{x:p.x+21,y:p.y})).toEqual([a.id]);expect(armiesAt(w,2,camera,{x:p.x+23,y:p.y})).toEqual([]);}
  });
  it('returns all overlapping armies rather than silently choosing a side', () => {
    const w=createWorld(),a=w.armies[0];w.armies[1].provinceId=a.provinceId;
    const camera={x:0,y:0,scale:1}, p=armyMarkerPoint(w,a,1,camera);
    expect(armiesAt(w,1,camera,p)).toContain(a.id);expect(armiesAt(w,1,camera,p)).toContain(w.armies[1].id);
  });
  it('places a focus above the mobile sheet and to the left of the desktop panel', () => {
    for(const viewport of [{width:428,height:926},{width:1280,height:720}]){
      const point={x:250,y:450},camera=focusMapPoint({x:0,y:0,scale:.1},point,{width:2000,height:1000},viewport);
      expect(worldToScreen(camera,point)).toEqual(focusAnchor(viewport,true));
      expect(focusAnchor(viewport,true).y).toBeGreaterThan(130);
      if(viewport.width===428)expect(focusAnchor(viewport,true).y).toBeLessThan(350);
      else expect(focusAnchor(viewport,true).x).toBeLessThan(900);
    }
  });
});
