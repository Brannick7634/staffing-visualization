// Entry point so `node --test tests/` works on Node 22+, where a directory
// argument is resolved as a module (tests/index.js) instead of being scanned.
// `npm test` uses the glob "tests/**/*.test.mjs" directly and never loads this
// file, so suites are not run twice.
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = fileURLToPath(new URL('.', import.meta.url))

function findSuites (dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return findSuites(full)
    return entry.name.endsWith('.test.mjs') ? [full] : []
  })
}

for (const file of findSuites(ROOT).sort()) {
  await import(pathToFileURL(file).href)
}
