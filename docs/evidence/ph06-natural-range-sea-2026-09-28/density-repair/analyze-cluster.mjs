import fs from 'node:fs';
const dir = '.autopilot/ph06/natural-range-sea-density-repair', raw = JSON.parse(fs.readFileSync(`${dir}/cluster-before.json`, 'utf8'));
const nodes = raw.nodes;
function index(step, oriented) {
  const q = step * 256, count = 4096 / step, buckets = new Map(); let references = 0;
  for (const [id, n] of nodes.entries()) {
    const width = Math.max(n.section.leftReachQ, n.section.rightReachQ, n.crestQ);
    const rx = Math.abs(n.tx) * n.alongQ + Math.abs(n.ty) * width, ry = Math.abs(n.ty) * n.alongQ + Math.abs(n.tx) * width;
    const left = Math.max(0, Math.floor((n.xQ - rx) / q)), right = Math.min(count - 1, Math.floor((n.xQ + rx) / q));
    const top = Math.max(0, Math.floor((n.yQ - ry) / q)), bottom = Math.min(count - 1, Math.floor((n.yQ + ry) / q));
    for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
      if (oriented) {
        const dx = (x + .5) * q - n.xQ, dy = (y + .5) * q - n.yQ, radius = (Math.abs(n.tx) + Math.abs(n.ty)) * q / 2;
        const along = dx * n.tx + dy * n.ty, across = -dx * n.ty + dy * n.tx;
        if (Math.abs(along) > n.alongQ + radius || across + radius < -Math.max(n.section.leftReachQ, n.crestQ)
          || across - radius > Math.max(n.section.rightReachQ, n.crestQ)) continue;
      }
      const key = y * count + x, bucket = buckets.get(key) ?? []; bucket.push(id); buckets.set(key, bucket); references++;
    }
  }
  const [key, ids] = [...buckets].reduce((a, b) => b[1].length > a[1].length ? b : a);
  return { stepWorld: step, oriented, references, nonEmptyBuckets: buckets.size, maximumCandidates: ids.length,
    maximumBucket: { x: key % count, y: Math.floor(key / count), perRun: Object.fromEntries([...new Set(nodes.map(n=>n.run))].map(run=>[run,ids.filter(id=>nodes[id].run===run).length])) } };
}
const report = { totalNodes: nodes.length, originalFailure: { supportId: raw.id, bucketX: raw.x, bucketY: raw.y, references: raw.references,
  candidates: raw.bucket.length, perRun: Object.fromEntries([...new Set(nodes.map(n=>n.run))].map(run=>[run,raw.bucket.filter(id=>nodes[id].run===run).length])) },
  chains: raw.chains.map(c=>({group:c.group,parentGroup:c.parentGroup,anchors:c.anchors.map(a=>({x:a.xQ/256,y:a.yQ/256,width:a.widthQ/256}))})),
  alternatives: [index(32,false),index(16,false),index(32,true),index(16,true)] };
fs.writeFileSync(`${dir}/cluster-analysis.json`, JSON.stringify(report,null,2)); console.log(JSON.stringify(report));
