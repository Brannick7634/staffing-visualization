// Dev-server file isolation: the Vite dev server must never serve the
// development fixture or server-only source (direct URL, ?raw / ?import /
// ?url, or /@fs/), while the app's own modules keep loading.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isFileLoadingAllowed, normalizePath, resolveConfig } from 'vite'
import viteConfig from '../../vite.config.js'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const abs = (rel) => normalizePath(join(ROOT, rel))

test('vite.config.js server.fs.deny lists the fixture and server-only folders', () => {
  const deny = viteConfig.server?.fs?.deny
  assert.ok(Array.isArray(deny), 'server.fs.deny must be set')
  for (const pattern of ['**/dev-fixtures/**', '**/dev/signal/**', '**/api/**', '**/tests/**']) {
    assert.ok(deny.includes(pattern), `server.fs.deny is missing ${pattern}`)
  }
  // Setting deny replaces Vite's defaults, so they must be restated.
  for (const pattern of ['.env', '.env.*', '*.{crt,pem}', '**/.git/**']) {
    assert.ok(deny.includes(pattern), `server.fs.deny is missing default ${pattern}`)
  }
  // The repo lives under a folder named "dev"; '**/dev/**' would block every module.
  assert.ok(!deny.includes('**/dev/**'), "server.fs.deny must not use '**/dev/**'")
})

test('resolved dev-server config denies fixture and server-only files but allows the app', async () => {
  const config = await resolveConfig(
    { root: ROOT, configFile: join(ROOT, 'vite.config.js'), logLevel: 'silent' },
    'serve'
  )
  const denied = [
    'dev-fixtures/supplied-october-2026.json',
    'DEV-FIXTURES/supplied-october-2026.json',
    'dev/signal/fixtureAdapter.js',
    'dev/signal/syntheticScenarios.js',
    'api/_lib/signal/handlers.js',
    'api/signal/pay.js',
    'tests/signal/bundle.test.mjs',
    '.env'
  ]
  for (const rel of denied) {
    assert.equal(isFileLoadingAllowed(config, abs(rel)), false, `${rel} must be denied`)
  }
  const allowed = [
    'index.html',
    'src/main.jsx',
    'src/App.jsx',
    'src/preview/PreviewApp.jsx',
    'shared/signal/money.js',
    'node_modules/react/index.js'
  ]
  for (const rel of allowed) {
    assert.equal(isFileLoadingAllowed(config, abs(rel)), true, `${rel} must stay loadable`)
  }
})
