// Launches the desktop shell. With --dev it also starts Vite and points the window at it.
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'

const DEV_PORT = 5174
const DEV_URL = `http://localhost:${DEV_PORT}/`
const useShell = process.platform === 'win32'
const dev = process.argv.includes('--dev')

// Editors such as VS Code export this, which would make Electron behave as plain Node.
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
if (dev) env.CLIPR_DEV_URL = DEV_URL

let vite = null

if (dev) {
  vite = spawn('npx', ['vite', '--port', String(DEV_PORT), '--strictPort'], {
    stdio: 'inherit',
    shell: useShell,
  })
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      if ((await fetch(DEV_URL)).ok) break
    } catch {
      await delay(400)
    }
  }
}

const electron = spawn('npx', ['electron', '.'], { stdio: 'inherit', shell: useShell, env })

const stop = (code = 0) => {
  vite?.kill()
  process.exit(code)
}

electron.on('close', (code) => stop(code ?? 0))
process.on('SIGINT', () => stop(0))
process.on('SIGTERM', () => stop(0))
