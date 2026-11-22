import {readFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';

export const requiredShots = [
  '01-title','01b-settings','01c-new-world','01d-archive',
  '02-founding','02a-sea','02b-rise','02c-ink','02d-states','02e-borders',
  '03-world','03b-colors-dense','04-war-0','04-war-1','04-war-2','04c-capital-spotlight','04d-map-unrolled','07-views',
  '10-nations','11-nation','12-military','14-diplomacy','15-chronicle',
  '16-statistics','17-edicts','18-menu','19-province','30-landscape','31-landscape-nation',
  '41e-herald-house','41f-herald-marriage',
];

/** A screenshot job must finish its actual in-app tour; a title shot after a timeout is not a pass. */
export function checkNativeTour(directory) {
  const status = JSON.parse(readFileSync(join(directory,'tour-status.json'),'utf8'));
  if(status.finished !== true) throw Error('原生试玩巡览未到达 done；可能在创建世界、推演或面板中卡住。');
  // 原生建世界：CI 世界须由 Swift 建成（不退回网页引擎），耗时另有网页引擎的对照。
  const founding = JSON.parse(readFileSync(join(directory,'founding-time.json'),'utf8'));
  if(!founding.swift || founding.swift.error || !(founding.swift.seconds > 0) || founding.web) throw Error('新世界没有由 Swift 建成：' + JSON.stringify(founding));
  const ownership = JSON.parse(readFileSync(join(directory,'advance-ownership.json'),'utf8'));
  if(ownership.version !== 2 || ownership.passed !== true || ownership.manualDrain !== true || ownership.controls < 20 || ownership.samples < 1
    || ownership.backwards !== 0 || !(ownership.endDay > ownership.startDay) || ownership.endDay !== ownership.authoritativeDay) {
    throw Error('暂停恢复回归失败：时间回退、单步尾批次丢失、推演未前进或暂停后的显示与引擎不一致。');
  }
  const profile = JSON.parse(readFileSync(join(directory,'panel-profile.json'),'utf8'));
  if(profile.version !== 1 || profile.frozen !== true || profile.day < 0 || profile.day !== profile.endDay
    || !/^[a-f0-9]{64}$/.test(profile.worldSHA256) || !Array.isArray(profile.panels)
    || !['nation','province','ranking'].every(scene => profile.panels.some(row => row.scene === scene))
    || profile.panels.some(row => !(row.samples > 0) || row.cycles !== 3
      || !['averageMs','p95Ms','maxMs','hitches'].every(key => Number.isFinite(row[key]) && row[key] >= 0))) {
    throw Error('面板性能记录无效：世界未保持冻结、场景不完整或没有有效采样。');
  }
  const colors = JSON.parse(readFileSync(join(directory,'color-contrast.json'),'utf8'));
  if(colors.version !== 1 || colors.passed !== true || !(colors.states >= 2) || !(colors.leastDifference >= 15)) {
    throw Error('国色区分回归失败：相邻国家最小色差 ΔE ' + Number(colors.leastDifference).toFixed(1) + '（' + colors.closestPair + '），低于 15。');
  }
  const unrolled = JSON.parse(readFileSync(join(directory,'map-unrolled.json'),'utf8'));
  if(unrolled.version !== 1 || unrolled.passed !== true || !(unrolled.fit > 0) || !(unrolled.scale <= unrolled.fit * 1.02)) {
    throw Error('地图展开回归失败：镜头缩放 ' + unrolled.scale + ' 没有退到整图可见的 ' + unrolled.fit + '。');
  }
  const names = JSON.parse(readFileSync(join(directory,'name-stability.json'),'utf8'));
  if(names.version !== 1 || names.passed !== true || !(names.frames >= 300) || !(names.names >= 1) || !(names.blinks <= 4)) {
    throw Error(`国名稳定回归失败：镜头静止推演 ${names.frames} 帧里国名闪烁 ${names.blinks} 次（易主 ${names.provincesChanged} 州，新建 ${names.created}，移位 ${names.moved}）。`);
  }
  let wash;
  try {
    wash = JSON.parse(readFileSync(join(directory,'wash-demo.json'),'utf8'));
  } catch { throw Error('战争晕染巡览缺失或无法读取。'); }
  const measured = wash.after, peace = measured?.ceasefire;
  if (wash.version !== 3 || !(measured?.encodeMs?.samples > 0)) throw Error('战争晕染巡览没有实际 Metal 绘制帧。');
  if (peace?.passed !== true || !(peace.before > peace.during && peace.during > 0 && peace.after === 0)) {
    throw Error('停战退墨回归失败，未采到连续退场的墨量。');
  }
  const gap = measured.callbackGapMs || {}, stress = measured.stress || {}, stressGap = stress.callbackGapMs || {};
  console.log(`战争晕染：${measured.encodeMs.samples} 帧，回调 P95 ${Number(gap.p95).toFixed(1)} ms，`
    + `压力 ${stress.provinces} 州 P95 ${Number(stressGap.p95).toFixed(1)} ms，退墨 ${peace.before.toFixed(2)} → ${peace.during.toFixed(2)} → ${peace.after}。`);
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
