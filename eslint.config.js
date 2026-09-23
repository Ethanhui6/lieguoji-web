import js from '@eslint/js';
import ts from 'typescript-eslint';
export default ts.config(
 { ignores:['dist/**','node_modules/**','playwright-report/**','test-results/**'] },
 js.configs.recommended, ...ts.configs.recommended,
 { files:['**/*.{ts,tsx,js,mjs}'], languageOptions:{globals:{console:'readonly',process:'readonly',URL:'readonly',setTimeout:'readonly',clearTimeout:'readonly',setInterval:'readonly',clearInterval:'readonly',self:'readonly',indexedDB:'readonly',crypto:'readonly',document:'readonly',window:'readonly',Worker:'readonly',Blob:'readonly',FileReader:'readonly',ResizeObserver:'readonly',requestAnimationFrame:'readonly',cancelAnimationFrame:'readonly',fetch:'readonly',performance:'readonly',structuredClone:'readonly',TextEncoder:'readonly'}}, rules:{'@typescript-eslint/no-unused-vars':['error',{argsIgnorePattern:'^_'}]} }
);
