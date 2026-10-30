import {defineConfig} from 'vitest/config';
export default defineConfig({test:{include:['ios-native/Tools/export.test.ts'],testTimeout:120000}});
