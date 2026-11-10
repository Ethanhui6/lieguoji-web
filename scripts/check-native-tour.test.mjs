import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Buffer} from 'node:buffer';
import {mkdtempSync,writeFileSync,rmdirSync,unlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {checkNativeTour,requiredShots} from './check-native-tour.mjs';

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(),'lieguoji-tour-'));
  t.after(() => {
    for(const name of ['tour-status.json','advance-ownership.json','panel-profile.json',...requiredShots.map(name => `${name}.png`)]) {
      try { unlinkSync(join(directory,name)); } catch(error) { if(error.code !== 'ENOENT') throw error; }
    }
    rmdirSync(directory);
  });
  // A real tiny PNG; the checker only checks the header, not the visual content.
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jVf8AAAAASUVORK5CYII=','base64');
  for(const name of requiredShots) writeFileSync(join(directory,`${name}.png`),png);
  writeFileSync(join(directory,'tour-status.json'),JSON.stringify({finished:true}));
  writeFileSync(join(directory,'advance-ownership.json'),JSON.stringify({version:2,passed:true,manualDrain:true,controls:40,samples:12,startDay:0,endDay:10,authoritativeDay:10,backwards:0}));
  writeFileSync(join(directory,'panel-profile.json'),JSON.stringify({version:1,frozen:true,day:10,endDay:10,worldSHA256:'a'.repeat(64),
    panels:['nation','province','ranking'].map(scene => ({scene,cycles:3,samples:100,averageMs:20,p95Ms:40,maxMs:60,hitches:2}))}));
  return directory;
}

test('a completed tour with every required screen passes',t => {
  assert.equal(checkNativeTour(fixture(t)),requiredShots.length);
});
test('a timeout fails even when screenshots exist',t => {
  const d = fixture(t);
  writeFileSync(join(d,'tour-status.json'),JSON.stringify({finished:false}));
  assert.throws(() => checkNativeTour(d),/未到达 done/);
});
test('a missing military screen fails even after done',t => {
  const d = fixture(t); unlinkSync(join(d,'12-military.png'));
  assert.throws(() => checkNativeTour(d),/12-military/);
});
test('a corrupt image fails instead of counting its filename',t => {
  const d = fixture(t); writeFileSync(join(d,'03-world.png'),'not a screenshot');
  assert.throws(() => checkNativeTour(d),/截图损坏/);
});
test('a finished tour still fails when pause leaves the display behind the engine',t => {
  const d = fixture(t);
  writeFileSync(join(d,'advance-ownership.json'),JSON.stringify({version:2,passed:true,manualDrain:true,controls:40,samples:12,startDay:0,endDay:10,authoritativeDay:11,backwards:0}));
  assert.throws(() => checkNativeTour(d),/显示与引擎不一致/);
});
test('a finished tour fails when a stale reply moved the clock back',t => {
  const d = fixture(t);
  writeFileSync(join(d,'advance-ownership.json'),JSON.stringify({version:2,passed:true,manualDrain:true,controls:40,samples:12,startDay:0,endDay:10,authoritativeDay:10,backwards:1}));
  assert.throws(() => checkNativeTour(d),/时间回退/);
});
test('a cancelled play must leave the queued single step able to finish',t => {
  const d = fixture(t);
  writeFileSync(join(d,'advance-ownership.json'),JSON.stringify({version:2,passed:true,manualDrain:false,controls:40,samples:12,startDay:0,endDay:10,authoritativeDay:10,backwards:0}));
  assert.throws(() => checkNativeTour(d),/单步尾批次丢失/);
});
test('a panel profile fails when the world changed during measurement',t => {
  const d = fixture(t);
  writeFileSync(join(d,'panel-profile.json'),JSON.stringify({version:1,frozen:false,day:10,endDay:11}));
  assert.throws(() => checkNativeTour(d),/世界未保持冻结/);
});
test('a frozen profile without samples fails',t => {
  const d = fixture(t);
  writeFileSync(join(d,'panel-profile.json'),JSON.stringify({version:1,frozen:true,day:10,endDay:10,worldSHA256:'a'.repeat(64),panels:[]}));
  assert.throws(() => checkNativeTour(d),/没有有效采样/);
});
