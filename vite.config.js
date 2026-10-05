import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
// Development-only /api/signal/* middleware (apply: 'serve'; inactive for builds).
import signalDevPlugin from './dev/signal/vitePlugin.js'

// The dev server must never serve the development fixture or server-only
// source (direct URL, ?raw / ?import / ?url, or /@fs/). Do not use '**/dev/**':
// the repo itself lives under a folder named "dev", so that would block every
// module. Vite's default deny list (.env, .env.*, certificates) is restated
// because setting fs.deny replaces it.
export const DEV_SERVER_DENY = [
  '.env', '.env.*', '*.{crt,pem}', '**/.git/**',
  '**/dev-fixtures/**', '**/dev/signal/**', '**/api/**', '**/tests/**'
]

export default defineConfig({
  plugins: [react(), signalDevPlugin()],
  server: {
    fs: { deny: DEV_SERVER_DENY },
  },
})
