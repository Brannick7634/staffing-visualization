// Runs the Python population regression suite (tests/python, LOCAL FIXTURES
// only) inside `npm test`. Skipped, not failed, where python is not installed
// (e.g. a build container); the export scripts need python anyway.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const python = ['python', 'python3'].find((cmd) => spawnSync(cmd, ['--version'], { encoding: 'utf8' }).status === 0)

test('python population + export regression suite passes', { skip: python ? false : 'python not installed' }, () => {
  const r = spawnSync(python, ['-m', 'unittest', 'discover', '-s', 'tests/python'], { cwd: ROOT, encoding: 'utf8' })
  assert.equal(r.status, 0, (r.stderr || '').slice(-2000))
})
