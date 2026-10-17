// Usage: node freeze-engine.mjs <checkedDir> <fullFingerprint> <prevFile> <prevBytes> <prevAlias> <evidenceDir>
import fs from 'node:fs';
import crypto from 'node:crypto';
const [dir,engine,prevFile,prevBytes,prevAlias,outDir]=process.argv.slice(2);
const meta=JSON.parse(fs.readFileSync(dir+'/build.json')),short=engine.slice(0,4),file=`engine-${short}.js`,alias='old'+short[0].toUpperCase()+short.slice(1);
const manifest='src/fms/play/culture47-frozen.json',entries=JSON.parse(fs.readFileSync(manifest));
if(meta.culture47Fingerprint!==engine)throw Error('wrong original engine');
if(entries.some(e=>e.engine===engine||e.file===file))throw Error('already frozen');
const last=entries[entries.length-1];
const src=dir+'/assets/'+fs.readdirSync(dir+'/assets').find(f=>/^culture47.worker-.*\.js$/.test(f)),bytes=fs.readFileSync(src),target='compat/culture47/'+file;
fs.writeFileSync(target,bytes,{flag:'wx'});
const entry={engine,file,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),rule:last.rule,protocol:last.protocol,source:`culture47-${dir.split('/').pop()}-original-bytes`,journalVersion:last.journalVersion};
entries.push(entry);fs.writeFileSync(manifest,JSON.stringify(entries,null,2)+'\n');
const test='src/fms/play/culture47-verification.test.ts';let t=fs.readFileSync(test,'utf8');const old=`{file:'${prevFile}',bytes:${prevBytes}}`;
if(!t.includes(old))throw Error('test insertion not found');fs.writeFileSync(test,t.replace(old,old+`,{file:'${file}',bytes:${bytes.length}}`));
const f='src/fms/play/culture47-client.ts';let s=fs.readFileSync(f,'utf8');const anchor=`'${prevFile}':${prevAlias}`,imp=`import ${prevAlias} from '../../../compat/culture47/${prevFile}?url';`;
if(!s.includes(anchor)||!s.includes(imp))throw Error('client insertion not found');
s=s.replace(imp,imp+`\nimport ${alias} from '../../../compat/culture47/${file}?url';`).replace(anchor,anchor+`,'${file}':${alias}`);fs.writeFileSync(f,s);
fs.mkdirSync(outDir,{recursive:true});fs.writeFileSync(outDir+'/frozen.json',JSON.stringify({...entry,byteEqual:fs.readFileSync(target).equals(bytes),registered:entries.length},null,2)+'\n');console.log(JSON.stringify(entry));
