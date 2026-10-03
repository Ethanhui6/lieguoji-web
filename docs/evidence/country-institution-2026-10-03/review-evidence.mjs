import fs from 'node:fs';
const base='.autopilot/country-institution';
const walk=p=>fs.readdirSync(p,{withFileTypes:true}).flatMap(e=>{if(e.isSymbolicLink())throw Error('Unexpected evidence link');return e.isDirectory()?walk(`${p}/${e.name}`):[`${p}/${e.name}`];});
const files=walk(base),unexpectedSensitiveFiles=files.filter(p=>/(?:^|\/)(?:\.env(?:\.|$)|storageState|credentials|id_rsa|id_ed25519)|\.(?:pem|p12|key)$/i.test(p));
const signatures=[/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,/\bgh[pousr]_[A-Za-z0-9]{30,}\b/,/\bgithub_pat_[A-Za-z0-9_]{40,}\b/];
const secretSignatureFiles=files.filter(p=>/\.(json|mjs|ts|tsx|css|txt|log)$/.test(p)&&!p.endsWith('review-evidence.mjs')&&signatures.some(r=>r.test(fs.readFileSync(p,'utf8'))));
const unreviewedTraces=files.filter(p=>/\.zip$|\.network$|\.trace$|\/traces\//.test(p));
const result={at:new Date().toISOString(),files:files.length,unexpectedSensitiveFiles,secretSignatureFiles,unreviewedTraces,passed:!unexpectedSensitiveFiles.length&&!secretSignatureFiles.length&&!unreviewedTraces.length,originalSaveExported:false,nativeEvidence:'Named local game identity/count/checksum and institution summaries, geometry hashes, screenshots; no original full territory save or credentials.',browserEvidence:'Independent hand-drawn generated fixtures; no import of original player data.',physicalDevice:false,cloudWrites:false};
if(fs.existsSync(`${base}/privacy-review.json`))throw Error('Never overwrite review');fs.writeFileSync(`${base}/privacy-review.json`,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));if(!result.passed)process.exitCode=1;
