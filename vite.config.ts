import { defineConfig } from 'vite'

const userscriptBanner = `// ==UserScript==
// @name        Tampermonkey Example
// @namespace   https://github.com/yourname/tampermonkey-example
// @version     0.1.0
// @author      You
// @description Example userscript built with Vite + TS
// @match       *://*/*
// @grant       none
// @run-at      document-end
// ==/UserScript==`

export default defineConfig({
  build: {
    target: 'es2019',
    rollupOptions: {
      input: 'src/main.ts',
      output: {
        dir: 'dist',
        entryFileNames: 'bundle.user.js',
        format: 'iife',
        banner: userscriptBanner,
      },
    },
    outDir: 'dist',
    emptyOutDir: true,
  },
})
