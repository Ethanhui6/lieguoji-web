import fs from 'node:fs';
import crypto from 'node:crypto';
const label = process.argv[2] ?? 'first';
if (!/^[a-z0-9-]+$/.test(label)) throw Error('Bad label');
const before = '.autopilot/ph06/v4-natural-visual-repair-staging/checks/continuous-type-guard-fix/actual-256-height-field.json';
const after = `.autopilot/ph06/v4-natural-visual-repair-staging/checks/coast-scale-${label}/actual-256-height-field.json`;
const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
function inspect(file) {
  const data = read(file), original = data.recipe.pointsQ.map(p => [p.xQ / 256, p.yQ / 256]);
  const points = [...new Map(Array.from({length:data.targetCoast.length / 2}, (_,i) => [data.targetCoast[i*2] / 256, data.targetCoast[i*2+1] / 256]).map(p => [p.join(','), p])).values()];
  let perimeter = 0;
  const edges = original.map((a, i) => {const b=original[(i+1)%original.length], length=Math.hypot(b[0]-a[0],b[1]-a[1]), arc=perimeter;perimeter+=length;return {a,b,length,arc};});
  const bins = Array.from({length:Math.ceil(perimeter/16)},()=>[]); let inward=0,outward=0;
  for (const [x,y] of points) {
    let inside=false,nearest=Infinity,arc=0;
    for(const e of edges) {
      const dx=e.b[0]-e.a[0],dy=e.b[1]-e.a[1],t=Math.max(0,Math.min(1,((x-e.a[0])*dx+(y-e.a[1])*dy)/e.length**2)),d=Math.hypot(x-e.a[0]-t*dx,y-e.a[1]-t*dy);
      if(d<nearest){nearest=d;arc=e.arc+t*e.length;}
      if((e.a[1]>y)!==(e.b[1]>y)&&x<e.a[0]+(y-e.a[1])*dx/dy)inside=!inside;
    }
    if(inside)inward=Math.max(inward,nearest);else outward=Math.max(outward,nearest);
    bins[Math.min(bins.length-1,Math.floor(arc/perimeter*bins.length))].push((inside?-1:1)*nearest);
  }
  const runs=[];
  for(const bin of bins){const mean=bin.length?bin.reduce((a,b)=>a+b,0)/bin.length:0, sign=Math.abs(mean)>24?Math.sign(mean):0; if(runs.at(-1)?.sign===sign)runs.at(-1).bins++;else runs.push({sign,bins:1});}
  if(runs.length>1&&runs[0].sign===runs.at(-1).sign)runs[0].bins+=runs.pop().bins;
  const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  points.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  const half = sequence => {const h=[];for(const p of sequence){while(h.length>1&&cross(h.at(-2),h.at(-1),p)<=0)h.pop();h.push(p);}return h.slice(0,-1);};
  const hull=[...half(points),...half([...points].reverse())];
  const hullArea=Math.abs(hull.reduce((s,p,i)=>{const q=hull[(i+1)%hull.length];return s+p[0]*q[1]-p[1]*q[0];},0))/2;
  const landArea=data.summary.landAreaTwiceQ2/(2*256**2);
  return {file,sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),maximumInwardWorld:inward,maximumOutwardWorld:outward,landArea,hullArea,landToHull:landArea/hullArea,structuralRuns:runs.filter(r=>r.sign&&r.bins*perimeter/bins.length>=32).map(r=>({kind:r.sign<0?'bay':'cape',widthWorld:r.bins*perimeter/bins.length})),targetSegments:data.targetCoast.length/4};
}
const a=read(before),b=read(after);
if(JSON.stringify(a.recipe)!==JSON.stringify(b.recipe))throw Error('Not same input recipe');
const result={recordedAt:new Date().toISOString(),scope:'Existing same-input numerical output analysis only; not a new generation, product screenshot or visual acceptance',before:inspect(before),after:inspect(after),naturalVisualAccepted:false};
fs.writeFileSync(`.autopilot/ph06/coast-scale-checks/shape-comparison-${label}.json`,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(result));
