import fs from 'node:fs';
const out='.autopilot/ph06/continuous-relief-checks',old='.autopilot/ph06/lock-snapshot-checks';
for(const name of ['browser.mjs','playwright.config.ts']){const code=fs.readFileSync(old+'/'+name,'utf8').replaceAll('lock-snapshot-checks','continuous-relief-checks').replaceAll('LOCK_BROWSER','CURVED_BROWSER');fs.writeFileSync(out+'/'+name,code,{flag:'wx'});}
console.log('Prepared actual unchanged lock/relief workflow, 450000 ms and zero retries retained.');
