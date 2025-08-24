/*
  Build helper to ensure the output file keeps the .user.js suffix and
  optionally copy the built userscript to a local folder for testing.
*/
import { existsSync, mkdirSync, copyFileSync } from 'node:fs'
import { resolve } from 'node:path'

const dist = resolve('dist')
const out = resolve(dist, 'bundle.user.js')

if (!existsSync(dist)) {
  mkdirSync(dist, { recursive: true })
}

// Optional: copy to a testing directory (disabled by default)
const TARGET = process.env.USERSCRIPT_OUT_DIR // e.g., /home/archangel/Userscripts
if (TARGET) {
  const targetPath = resolve(TARGET, 'tampermonkey-example.user.js')
  copyFileSync(out, targetPath)
  console.log(`Copied userscript to ${targetPath}`)
}
