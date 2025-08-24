import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    target: 'es2019',
    lib: {
      entry: 'src/main.ts',
      name: 'TampermonkeyExample',
      formats: ['iife'],
      fileName: () => 'bundle.user.js'
    },
    rollupOptions: {
      output: {
        banner: `// ==UserScript==\n// @name        Tampermonkey Example\n// @namespace   https://github.com/yourname/tampermonkey-example\n// @version     0.1.0\n// @author      You\n// @description Example userscript built with Vite + TS\n// @match       *://*/*\n// @grant       none\n// @run-at      document-end\n// ==/UserScript==`
      }
    },
    outDir: 'dist',
    emptyOutDir: true
  }
})

