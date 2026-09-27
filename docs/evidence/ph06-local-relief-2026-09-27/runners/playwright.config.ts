import { defineConfig } from '@playwright/test';
import path from 'node:path';
import base from '../../../playwright.config';
const run=process.env.RELIEF_BROWSER_RUN??'desktop-first';
if(!/^[a-z0-9-]+$/.test(run))throw new Error('Invalid evidence name');
const dir=path.resolve('.autopilot/ph06/local-relief-checks',run);
export default defineConfig({...base,testDir:path.resolve('tests'),testMatch:process.env.RELIEF_BROWSER_MODE==='legacy'?'atlas-detail-coast.spec.ts':process.env.RELIEF_BROWSER_MODE==='entry'?'atlas-natural-entry.spec.ts':process.env.RELIEF_BROWSER_MODE==='additive'?'atlas-add-detail-coast.spec.ts':'atlas-local-relief.spec.ts',workers:1,retries:0,
  reporter:[['list'],['json',{outputFile:path.join(dir,'results.json')}]],outputDir:path.join(dir,'artifacts')});
