import {spawn} from 'node:child_process';
for(const [name,project] of [['desktop','desktop-chromium'],['mobile','mobile-chromium'],['tablet','tablet-chromium']]){
 const child=spawn(process.execPath,['.autopilot/ph06/fine-world-browser/run.mjs',name,project,'density-repair'],{stdio:'inherit'});
 const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve)});
 if(code!==0){process.exitCode=1;break;}
}
