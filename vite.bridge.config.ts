import {defineConfig} from 'vite';
import {readFileSync} from 'node:fs';
import {fingerprintCulture47} from './scripts/fms-culture47-fingerprint';
const stamps=JSON.parse(readFileSync('scripts/rule-stamps.json','utf8')) as Record<string,string>;
/** The web engine bundle the native app hosts (src/native-bridge/engine.ts → ios-native/Resources/Engine/engine.js). */
export default defineConfig({
  define:Object.fromEntries(Object.entries({...stamps,__CULTURE47_ENGINE__:fingerprintCulture47()}).map(([k,v])=>[k,JSON.stringify(v)])),
  publicDir:false,
  build:{outDir:'ios-native/Resources/Engine',emptyOutDir:false,minify:true,target:'safari16',
    lib:{entry:'src/native-bridge/engine.ts',name:'NativeGame',formats:['iife'],fileName:()=>'engine.js'}},
  worker:{format:'iife'},
});
