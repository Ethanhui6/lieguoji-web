import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import entries from '../src/fms/play/culture47-frozen.json' with {type:'json'};
export function verifyFrozenCulture47(){
  const seen=new Set<string>();
  for(const e of entries){
    if(seen.has(e.engine)||!/^[a-f0-9]{64}$/.test(e.engine)||!/^engine-[a-f0-9]{4}\.js$/.test(e.file)||e.rule!=='real-culture-zh-politics-journal-2'||![1,2].includes(e.protocol))throw Error('Invalid frozen culture engine registry');
    seen.add(e.engine);const b=readFileSync('compat/culture47/'+e.file);
    if(b.length!==e.bytes||createHash('sha256').update(b).digest('hex')!==e.sha256)throw Error('Frozen culture engine bytes changed: '+e.file);
  }
  return entries;
}
