// Desktop shell: hosts the same UI and runs the bundled ffmpeg binary for real speed.

const { app, BrowserWindow, ipcMain, screen, shell } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const { spawn } = require('node:child_process')

const FFMPEG = require('ffmpeg-static').replace('app.asar', 'app.asar.unpacked')
const running = new Map()

// The window does not resize, so the layout is built for exactly one size.
const WINDOW_SIZE = { width: 1180, height: 820 }

// Packaged builds take the icon from the executable; an unpackaged run needs it pointed out.
const ICON = path.join(__dirname, '..', 'build', 'icon.png')

app.setName('Clipr')
app.setAppUserModelId('app.clipr.desktop')

function createWindow() {
  const { workAreaSize } = screen.getPrimaryDisplay()
  const window = new BrowserWindow({
    width: Math.min(WINDOW_SIZE.width, workAreaSize.width - 40),
    height: Math.min(WINDOW_SIZE.height, workAreaSize.height - 40),
    icon: fs.existsSync(ICON) ? ICON : undefined,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0b0b11',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
    },
  })

  window.once('ready-to-show', () => window.show())
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  const devUrl = process.env.CLIPR_DEV_URL
  if (devUrl) void window.loadURL(devUrl)
  else void window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
}

ipcMain.handle('clipr:window', (event, action) => {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (!window) return
  if (action === 'minimize') window.minimize()
  else if (action === 'close') window.close()
})

function writableDirectory(sourcePath) {
  const candidates = [sourcePath ? path.dirname(sourcePath) : null, app.getPath('downloads')]
  for (const candidate of candidates) {
    if (!candidate) continue
    try {
      fs.accessSync(candidate, fs.constants.W_OK)
      return candidate
    } catch {
      continue
    }
  }
  return app.getPath('temp')
}

function uniquePath(directory, fileName) {
  const extension = path.extname(fileName)
  const stem = path.basename(fileName, extension)
  let attempt = path.join(directory, fileName)
  let counter = 2
  while (fs.existsSync(attempt)) {
    attempt = path.join(directory, `${stem} (${counter})${extension}`)
    counter += 1
  }
  return attempt
}

function failureFrom(output) {
  const lines = output
    .split(/\r?\n/)
    .filter((line) => line.trim() && !/^\s*(frame|size|video:|Press)/.test(line))
  return lines[lines.length - 1]?.slice(0, 200) || 'ffmpeg could not produce this clip'
}

ipcMain.handle('clipr:run', async (event, request) => {
  const directory = writableDirectory(request.sourcePath)
  const output = uniquePath(directory, request.fileName)
  const args = ['-y', '-nostdin', ...request.args].map((arg) =>
    arg === '@INPUT@' ? request.sourcePath : arg === '@OUTPUT@' ? output : arg,
  )

  return new Promise((resolve) => {
    let child
    try {
      child = spawn(FFMPEG, args, { windowsHide: true })
    } catch (error) {
      resolve({ ok: false, error: error.message })
      return
    }

    running.set(request.id, child)
    let tail = ''

    child.stderr.on('data', (chunk) => {
      const text = String(chunk)
      tail = (tail + text).slice(-4000)
      const matches = [...text.matchAll(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/g)]
      const last = matches[matches.length - 1]
      if (!last || !request.duration) return
      const seconds = Number(last[1]) * 3600 + Number(last[2]) * 60 + Number(last[3])
      const ratio = Math.min(1, Math.max(0, seconds / request.duration))
      if (!event.sender.isDestroyed()) {
        event.sender.send('clipr:progress', { id: request.id, ratio })
      }
    })

    child.on('error', (error) => {
      running.delete(request.id)
      resolve({ ok: false, error: error.message })
    })

    child.on('close', (code, signal) => {
      running.delete(request.id)
      if (signal) {
        fs.rmSync(output, { force: true })
        resolve({ ok: false, canceled: true })
        return
      }
      if (code !== 0) {
        fs.rmSync(output, { force: true })
        resolve({ ok: false, error: failureFrom(tail) })
        return
      }
      resolve({ ok: true, path: output, size: fs.statSync(output).size })
    })
  })
})

ipcMain.handle('clipr:cancel', (_event, id) => {
  const child = running.get(id)
  if (child) child.kill()
  return Boolean(child)
})

ipcMain.handle('clipr:reveal', (_event, target) => {
  shell.showItemInFolder(target)
})

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  for (const child of running.values()) child.kill()
  if (process.platform !== 'darwin') app.quit()
})
