import { defineConfig } from '@playwright/test';
import path from 'node:path';
import base from '../../../playwright.config';
const run=process.env.CURVED_BROWSER_RUN??'desktop-first';
if(!/^[a-z0-9-]+$/.test(run))throw new Error('Invalid evidence name');
const dir=path.resolve('.autopilot/ph06/continuous-relief-checks',run);
export default defineConfig({...base,testDir:path.resolve('tests'),testMatch:'atlas-detail-lock-relief.spec.ts',workers:1,retries:0,
  reporter:[['list'],['json',{outputFile:path.join(dir,'results.json')}]],outputDir:path.join(dir,'artifacts')});
