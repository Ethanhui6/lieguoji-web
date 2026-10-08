import {readdirSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
/** Conservative local replay contract. All runtime TS/JSON and the exact
 * dependency lock are covered; tests, UI styles and evidence are not rules. */
export function culture47Files(){
  const files:string[]=[];
  function visit(dir:string){for(const e of readdirSync(dir,{withFileTypes:true})){const p=dir+'/'+e.name;if(e.isDirectory())visit(p);else if(/\.(ts|json)$/.test(p)&&!p.endsWith('.d.ts')&&!p.includes('.test.')&&!p.includes('.test-support.'))files.push(p);}}
  visit('src');files.push('package-lock.json');return files.sort();
}
export function fingerprintCulture47(){
  const files=culture47Files(),hash=createHash('sha256');
  for(const f of files)hash.update(f+'\0').update(readFileSync(f,'utf8').replace(/\r\n/g,'\n')).update('\0');
  return hash.digest('hex');
}
