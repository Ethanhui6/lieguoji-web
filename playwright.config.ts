import {defineConfig,devices} from '@playwright/test';
export default defineConfig({
 testDir:'./tests',fullyParallel:false,workers:1,retries:process.env.CI?1:0,timeout:45000,
 reporter:[['list'],['html',{open:'never'}],['json',{outputFile:'test-results/results.json'}]],
 use:{baseURL:process.env.GAME_BASE_URL||'http://127.0.0.1:4173',trace:'retain-on-failure',screenshot:'only-on-failure'},
 projects:[{name:'desktop-chromium',use:{...devices['Desktop Chrome'],viewport:{width:1440,height:960}}},{name:'mobile-chromium',use:{...devices['Pixel 7']}},{name:'tablet-chromium',use:{...devices['iPad (gen 7)'],defaultBrowserType:'chromium'}}],
 webServer:process.env.GAME_BASE_URL?undefined:{command:'npm run preview',url:'http://127.0.0.1:4173',reuseExistingServer:!process.env.CI,timeout:180000}
});
