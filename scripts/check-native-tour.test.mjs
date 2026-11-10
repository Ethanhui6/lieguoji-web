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
    for(const name of ['tour-status.json',...requiredShots.map(name => `${name}.png`)]) {
      try { unlinkSync(join(directory,name)); } catch(error) { if(error.code !== 'ENOENT') throw error; }
    }
    rmdirSync(directory);
  });
  // A real tiny PNG; the checker only checks the header, not the visual content.
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jVf8AAAAASUVORK5CYII=','base64');
  for(const name of requiredShots) writeFileSync(join(directory,`${name}.png`),png);
  writeFileSync(join(directory,'tour-status.json'),JSON.stringify({finished:true}));
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
