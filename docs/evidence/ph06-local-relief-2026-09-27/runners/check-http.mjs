import fs from 'node:fs';import crypto from 'node:crypto';
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
const response=await fetch('http://127.0.0.1:4173/build.json'),body=Buffer.from(await response.arrayBuffer()),local=fs.readFileSync('dist/build.json');
const same=body.equals(local),build=JSON.parse(body.toString()),passed=response.status===200&&same&&build.version==='0.5.0-preview.12';
const result={checkedAt:new Date().toISOString(),url:'http://127.0.0.1:4173/build.json',status:response.status,version:build.version,buildJsonSha256:digest(body),distMatches:same,passed};
fs.writeFileSync('.autopilot/ph06/local-relief-checks/http-before.json',JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result));if(!passed)process.exitCode=1;
