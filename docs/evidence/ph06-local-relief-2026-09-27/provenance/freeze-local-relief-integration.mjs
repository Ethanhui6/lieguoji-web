import fs from 'node:fs';import crypto from 'node:crypto';
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const stage='.autopilot/ph06/v4-local-relief-integration-staging';
const baseline=JSON.parse(fs.readFileSync(`${stage}/baseline-manifest.json`,'utf8'));
const paths=[...baseline.files.map(x=>x.path),'src/world/generation/local-detail-relief-adapter.ts','src/world/detail-local-relief-session.test.ts'];
const files=paths.map(path=>({path,stagedPath:`${stage}/${path}`,sha256:hash(`${stage}/${path}`)}));
const review='.autopilot/ph06/local-relief-integration-review.md';
fs.writeFileSync('.autopilot/ph06/local-relief-root-ready.json',JSON.stringify({recordedAt:new Date().toISOString(),status:'ready-for-integration-checks',checksRun:false,files,independentIntegrationReview:{path:review,sha256:hash(review)},scope:'Root static review completed. Kernel independent review still proceeding; this permits local checks, not acceptance or cloud publication.'},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({files:files.length,status:'ready-for-integration-checks'}));
