// Scans every file version a push would add (or, without arguments, every
// tracked file) for secrets and private paths. Usage:
//   node scripts/secret-scan.mjs [<base-commit> <head-commit>]
import {execFileSync} from 'node:child_process';
import {Buffer} from 'node:buffer';
const git=(args,enc='utf8')=>execFileSync('git',args,{maxBuffer:1024*1024*1024,encoding:enc});
const rules=[
 ['private key',/-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/],
 ['GitHub token',/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,255}\b|\bgithub_pat_[A-Za-z0-9_]{50,255}\b/],
 ['AWS key',/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
 ['OpenAI/Anthropic key',/\bsk-(?:proj-|svcacct-|ant-)?[A-Za-z0-9_-]{32,255}\b/],
 ['Slack token',/\bxox[baprs]-[A-Za-z0-9-]{24,255}\b/],
 ['Google API key',/\bAIza[0-9A-Za-z_-]{35}\b/],
 ['Stripe live key',/\b[rs]k_live_[A-Za-z0-9]{20,255}\b/],
 ['npm token',/\bnpm_[A-Za-z0-9]{30,255}\b/],
 ['GitLab token',/\bglpat-[A-Za-z0-9_-]{20,255}\b/],
 ['credential in URL',/[a-z][a-z0-9+.-]{1,15}:\/\/[^\s/:@]{2,80}:[A-Za-z0-9_!%+.-]{8,128}@[^\s/]{3,128}/i],
 ['secret assignment',/["']?\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|password)["']?\s*[:=]\s*["'][A-Za-z0-9_+/.=-]{24,255}["']/i],
 ['bearer token',/\bBearer [A-Za-z0-9._~+/-]{40,255}\b/],
 ['Cloudflare token',/\b(?:CF|CLOUDFLARE)_API_(?:TOKEN|KEY)\s*[:=]\s*["']?[A-Za-z0-9_-]{30,}/i],
];
// Private or generated paths that never belong in the repository.
const badPath=/(^|\/)(?:\.env(?:\.|$)|\.dev\.vars|\.wrangler\/|\.ssh\/|\.aws\/|\.autopilot\/|node_modules\/|dist\/|saves\/)|\.(?:pem|key|p12|pfx|save\.json|world\.json|protected\.json)$/i;
const [base,head]=process.argv.slice(2);
const blobs=new Map();
if(base&&head){
 // Content already on the remote was scanned when it was pushed; check only what is new to it.
 const range=[head,'--not','--remotes=origin',...(/^0+$/.test(base)?[]:[base])];
 const raw=git(['log','--format=','--raw','--no-abbrev','--no-renames','-m','-z',...range]).split('\0');
 for(let i=0;i<raw.length;i++){const m=/:\d+ \d+ [0-9a-f]{40} ([0-9a-f]{40}) (\w)/.exec(raw[i]);if(!m)continue;const file=raw[++i];if(m[2]!=='D')blobs.set(m[1],file);}
 for(const c of git(['rev-list',...range]).trim().split('\n').filter(Boolean))blobs.set('commit:'+c,'(commit message '+c.slice(0,8)+')');
}else for(const line of git(['ls-files','-s']).trim().split('\n')){const [,blob,,]=line.split(/\s+/);blobs.set(blob,line.slice(line.indexOf('\t')+1));}
const findings=[];
for(const [blob,file] of blobs){
 if(!blob.startsWith('commit:')&&badPath.test(file)){findings.push(`${file}: private or generated path`);continue;}
 const bytes=blob.startsWith('commit:')?Buffer.from(git(['cat-file','commit',blob.slice(7)])):execFileSync('git',['cat-file','blob',blob],{maxBuffer:1024*1024*1024});
 if(bytes.subarray(0,8192).includes(0))continue;
 const text=bytes.toString('utf8');for(const [name,re] of rules)if(re.test(text))findings.push(`${file}: ${name}`);
}
if(findings.length){console.error('Secret scan failed:\n'+findings.join('\n'));process.exit(1);}
console.log(`Secret scan passed: ${blobs.size} file versions/commits checked.`);
