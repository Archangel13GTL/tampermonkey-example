#!/usr/bin/env node
const { existsSync, mkdirSync, copyFileSync } = require('node:fs')
const { resolve } = require('node:path')

const dist = resolve('dist')
const out = resolve(dist, 'bundle.user.js')

if (!existsSync(out)) {
  console.warn(`Output not found: ${out}. Did the build succeed?`)
  process.exit(0)
}

const TARGET = process.env.USERSCRIPT_OUT_DIR // e.g., /home/archangel/Userscripts
if (TARGET) {
  mkdirSync(TARGET, { recursive: true })
  const targetPath = resolve(TARGET, 'tampermonkey-example.user.js')
  copyFileSync(out, targetPath)
  console.log(`Copied userscript to ${targetPath}`)
}

