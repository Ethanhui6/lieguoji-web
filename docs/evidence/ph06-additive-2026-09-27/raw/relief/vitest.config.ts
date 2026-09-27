import { defineConfig } from 'vitest/config';
import { existsSync } from 'node:fs';
import path from 'node:path';
const staging=path.resolve('.autopilot/ph06/v4-relief-staging/src/world');
export default defineConfig({
  plugins:[{name:'relief-staging-local-dependencies',enforce:'pre',resolveId(source,importer){
    if(!importer||!path.resolve(importer).startsWith(staging)||!source.startsWith('.'))return;
    const local=path.resolve(path.dirname(importer),source)+'.ts';
    if(existsSync(local))return local;
    const existing=path.resolve('src/world',source)+'.ts';
    if(existsSync(existing))return existing;
  }}],
  test:{include:['.autopilot/ph06/v4-relief-staging/src/world/*.test.ts'],maxWorkers:1},
});
