#!/usr/bin/env node
const { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync } = require('node:fs')
const { resolve } = require('node:path')

const dist = resolve('dist')
const out = resolve(dist, 'bundle.user.js')

if (!existsSync(out)) {
  console.warn(`Output not found: ${out}. Did the build succeed?`)
  process.exit(0)
}

// Add Tampermonkey banner if it's missing
const content = readFileSync(out, 'utf-8')
const banner = `// ==UserScript==
// @name        Tampermonkey Example
// @namespace   https://github.com/yourname/tampermonkey-example
// @version     0.1.0
// @author      You
// @description Example userscript built with Vite + TS
// @match       *://*/*
// @grant       none
// @run-at      document-end
// ==/UserScript==

`

if (!content.startsWith('// ==UserScript==')) {
  writeFileSync(out, banner + content)
  console.log('Added Tampermonkey metadata banner')
}

const TARGET = process.env.USERSCRIPT_OUT_DIR // e.g., /home/archangel/Userscripts
if (TARGET) {
  mkdirSync(TARGET, { recursive: true })
  const targetPath = resolve(TARGET, 'tampermonkey-example.user.js')
  copyFileSync(out, targetPath)
  console.log(`Copied userscript to ${targetPath}`)
}
