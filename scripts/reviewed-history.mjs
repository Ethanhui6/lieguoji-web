import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {safeProjectFile} from './check-plan.mjs';
// Extended through the fixed, scanned 2026-10-08 head; see
// fms-chinese-culture-release-2026-10-08/history-review.json and MEDIA_REVIEW.md.
// Later hidden/deleted versions still fail the exact-tip check below.
const BASE='90cdabc6fa1c0cd0d3f8d4037b93870b63421db5',HEAD='339c2e181a0737cf285ac8f7dcd642c92eabd5d2';
const SUMMARY='d37739b4d8bec71ee32eefe63a3f16b9f9599f5f7288094036397f666c9c9c41';
const hash=b=>createHash('sha256').update(b).digest('hex');
const git=(root,args)=>execFileSync('git',args,{cwd:root,maxBuffer:100*1024*1024,stdio:['ignore','pipe','pipe']});
export function reviewedHistory(root){
 const m=JSON.parse(fs.readFileSync(safeProjectFile(root,'plan/reviewed-history-2026-10-06.json',false),'utf8'));
 if(Object.keys(m).sort().join()!=='base,files,reviewedHead,version'||m.version!==1||m.base!==BASE||m.reviewedHead!==HEAD||m.files?.length!==610)throw Error('Unexpected reviewed history manifest');
 const h=createHash('sha256').update('lieguoji-reviewed-history-v1\0'),seen=new Set();
 for(const f of m.files){if(Object.keys(f).sort().join()!=='bytes,gitBlob,kind,path,sha256'||!['diagnostic-log','playwright-trace','archived-project-source'].includes(f.kind)||!f.path.startsWith('docs/evidence/')||!/^[a-f0-9]{40}$/.test(f.gitBlob)||!/^[a-f0-9]{64}$/.test(f.sha256)||!Number.isSafeInteger(f.bytes)||f.bytes<0||seen.has(f.path))throw Error('Invalid reviewed history entry');seen.add(f.path);h.update(f.path+'\0'+f.gitBlob+'\0'+f.bytes+'\0'+f.sha256+'\0');}
 if(h.digest('hex')!==SUMMARY)throw Error('Reviewed history content list changed');return m;
}
let cachedRoot,cached;
export function reviewedHistoricalPath(root,relative){
 if(!relative.startsWith('docs/evidence/'))return false;
 try{if(cachedRoot!==root){cached=reviewedHistory(root);cachedRoot=root;}const f=cached.files.find(f=>f.path===relative);if(!f)return false;const bytes=fs.readFileSync(safeProjectFile(root,relative,false));return bytes.length===f.bytes&&hash(bytes)===f.sha256;}catch{return false;}
}
export function verifyReviewedHistory(root,isUnsafe,isPreviouslyReviewed){
 const m=reviewedHistory(root);git(root,['merge-base','--is-ancestor',BASE,'HEAD']);git(root,['merge-base','--is-ancestor',HEAD,'HEAD']);
 const raw=git(root,['log','--format=','--raw','--no-abbrev','--no-renames','-m','-z',BASE+'..HEAD']).toString('utf8').split('\0'),known=new Map(m.files.map(f=>[f.path+'\0'+f.gitBlob,f])),checked=new Set();
 for(let i=0;i<raw.length;i++){const header=raw[i].trim();if(!header.startsWith(':'))continue;const parts=header.split(' '),blob=parts[3],status=parts[4],file=raw[++i];if(status==='D'||!isUnsafe(file))continue;const f=known.get(file+'\0'+blob);if(!f){if(isPreviouslyReviewed(file)&&git(root,['rev-parse',`HEAD:${file}`]).toString().trim()===blob)continue;throw Error('Unreviewed historical content: '+file);}if(!checked.has(blob)){const bytes=git(root,['cat-file','blob',blob]);if(bytes.length!==f.bytes||hash(bytes)!==f.sha256)throw Error('Historical blob checksum mismatch: '+file);checked.add(blob);}}
 // Ordinary history through reviewedHead has a separate completed content
 // audit. Any subsequent historical version must still exist byte-for-byte
 // in this final, fingerprinted and reviewed candidate; hidden/deleted
 // intermediate versions need another explicit history review.
 const delta=git(root,['log','--format=','--raw','--no-abbrev','--no-renames','-m','-z',HEAD+'..HEAD']).toString('utf8').split('\0'),tips=new Map();
 for(let i=0;i<delta.length;i++){const header=delta[i].trim();if(!header.startsWith(':'))continue;const parts=header.split(' '),blob=parts[3],status=parts[4],file=delta[++i];if(status==='D'||isUnsafe(file))continue;if(!tips.has(file)){let tip='';try{tip=git(root,['rev-parse',`HEAD:${file}`]).toString().trim();}catch{/* deleted at tip */}tips.set(file,tip);}if(tips.get(file)!==blob)throw Error('Additional ordinary historical version needs review: '+file);}
 return true;
}
