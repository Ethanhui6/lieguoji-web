import fs from 'node:fs';
const dir = '.autopilot/ph06/natural-range-sea-density-repair', raw = JSON.parse(fs.readFileSync(`${dir}/cluster-before.json`, 'utf8'));
function actual(x, y) {
  let count = 0;
  for (const n of raw.nodes) {
    const dx = x - n.xQ, dy = y - n.yQ, across = -dx * n.ty + dy * n.tx, e = raw.ends[n.run];
    if (Math.abs(dx * n.tx + dy * n.ty) >= n.alongQ) continue;
    if (Math.abs(across) >= n.crestQ && (across < 0 ? -across >= n.section.leftReachQ : across >= n.section.rightReachQ)) continue;
    const start = ((x - e.first.xQ) * e.first.tx + (y - e.first.yQ) * e.first.ty) / e.fadeQ + Number(e.branch);
    const finish = ((e.last.xQ - x) * e.last.tx + (e.last.yQ - y) * e.last.ty) / e.fadeQ;
    if (n.peakQ > 0 && start > 0 && finish > 0) count++;
  }
  return count;
}
let local = { count: 0, xQ: 0, yQ: 0 }, samples = 0;
for (let y = raw.y * raw.bucketQ; y <= (raw.y + 1) * raw.bucketQ; y += 512) for (let x = raw.x * raw.bucketQ; x <= (raw.x + 1) * raw.bucketQ; x += 512) {
  const count = actual(x, y); samples++; if (count > local.count) local = { count, xQ: x, yQ: y };
}
const report = { originalCandidates: raw.bucket.length, sampleGridWorld: 2, sampledPoints: samples, maximumObservedNonzeroInFailedBucket: local,
  scope: 'Observed sample maximum only, not a global continuous maximum proof. Conservative rotated-bucket maximum 116 bounds actual contributions anywhere.' };
fs.writeFileSync(`${dir}/actual-contributions.json`, JSON.stringify(report,null,2)); console.log(JSON.stringify(report));
