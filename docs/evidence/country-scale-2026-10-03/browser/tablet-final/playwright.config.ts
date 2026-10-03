import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
import base from '../../playwright.config';
const label=process.env.COUNTRY_BROWSER_LABEL;
if(!label||!/^[a-z0-9-]+$/.test(label))throw Error('Missing evidence label');
export default defineConfig({...base,testDir:'../../tests',testMatch:'country-world.spec.ts',timeout:450000,retries:0,workers:1,webServer:undefined,
  use:{...base.use,baseURL:'http://127.0.0.1:4173'},outputDir:`browser/${label}/artifacts`,reporter:[['list'],['json',{outputFile:resolve(`.autopilot/country-scale/browser/${label}/results.json`)}]]});
