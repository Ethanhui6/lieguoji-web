import {readFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';

export const requiredShots = [
  '01-title','01b-settings','01c-new-world','01d-archive',
  '02-founding','02a-sea','02b-rise','02c-ink','02d-states','02e-borders',
  '03-world','04-war-0','04-war-1','04-war-2','07-views',
  '10-nations','11-nation','12-military','14-diplomacy','15-chronicle',
  '16-statistics','17-edicts','18-menu','19-province','30-landscape','31-landscape-nation',
];

/** A screenshot job must finish its actual in-app tour; a title shot after a timeout is not a pass. */
export function checkNativeTour(directory) {
  const status = JSON.parse(readFileSync(join(directory,'tour-status.json'),'utf8'));
  if(status.finished !== true) throw Error('原生试玩巡览未到达 done；可能在创建世界、推演或面板中卡住。');
  const ownership = JSON.parse(readFileSync(join(directory,'advance-ownership.json'),'utf8'));
  if(ownership.version !== 1 || ownership.passed !== true || ownership.controls < 20 || ownership.samples < 1
    || ownership.backwards !== 0 || !(ownership.endDay > ownership.startDay) || ownership.endDay !== ownership.authoritativeDay) {
    throw Error('暂停恢复回归失败：时间回退、推演未前进或暂停后的显示与引擎不一致。');
  }
  for(const name of requiredShots) {
    let bytes;
    try { bytes = readFileSync(join(directory,`${name}.png`)); }
    catch { throw Error(`原生试玩缺少必需截图：${name}`); }
    if(bytes.length < 33 || bytes.subarray(0,8).toString('hex') !== '89504e470d0a1a0a'
      || bytes.subarray(12,16).toString('ascii') !== 'IHDR' || bytes.readUInt32BE(16) === 0 || bytes.readUInt32BE(20) === 0) {
      throw Error(`原生试玩截图损坏：${name}`);
    }
  }
  return requiredShots.length;
}

if(process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(`原生试玩巡览完成，${checkNativeTour(process.argv[2])} 个必需画面已核对。`); }
  catch(error) { console.error(error.message); process.exitCode = 1; }
}
