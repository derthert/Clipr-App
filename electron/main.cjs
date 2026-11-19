// Desktop shell: hosts the same UI and runs the bundled ffmpeg binary for real speed.

const { app, BrowserWindow, ipcMain, screen, shell } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const { execFile, spawn } = require('node:child_process')

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

// Failed exports are appended to %APPDATA%\Clipr\logs\export.log with ffmpeg's own output,
// so a failure on someone's machine can be diagnosed after the fact.
function exportLogPath() {
  return path.join(app.getPath('userData'), 'logs', 'export.log')
}

function logExport(title, details) {
  try {
    const file = exportLogPath()
    fs.mkdirSync(path.dirname(file), { recursive: true })
    // Keep the log small: start over once it passes 2 MB.
    if (fs.existsSync(file) && fs.statSync(file).size > 2_000_000) fs.rmSync(file)
    fs.appendFileSync(file, `[${new Date().toISOString()}] ${title}\n${details}\n\n`)
  } catch {
    // Logging must never break an export.
  }
}

function failureFrom(output) {
  const lines = output
    .split(/\r?\n/)
    .filter((line) => line.trim() && !/^\s*(frame|size|video:|Press)/.test(line))
  return lines[lines.length - 1]?.slice(0, 200) || 'ffmpeg could not produce this clip'
}

/** Spawns ffmpeg and resolves when it exits. `onStderr` sees every chunk, for progress. */
function runFfmpeg(id, args, { cwd, onStderr } = {}) {
  return new Promise((resolve) => {
    let child
    try {
      child = spawn(FFMPEG, args, { cwd, windowsHide: true })
    } catch (error) {
      resolve({ code: -1, error, tail: '' })
      return
    }
    running.set(id, child)
    let tail = ''
    child.stderr.on('data', (chunk) => {
      const text = String(chunk)
      tail = (tail + text).slice(-6000)
      onStderr?.(text)
    })
    child.on('error', (error) => {
      running.delete(id)
      resolve({ code: -1, error, tail })
    })
    child.on('close', (code, signal) => {
      running.delete(id)
      resolve({ code: code ?? -1, signal, tail })
    })
  })
}

// AV1 input: the bundled ffmpeg's only software AV1 decoder (libaom) rejects the AV1 files
// that GPU recorders such as NVIDIA's write ("No sequence header"). ffmpeg's own av1 decoder
// handles them, but only on the GPU, so AV1 inputs are decoded through d3d11va. A run that
// still fails is retried once without it, so the user sees ffmpeg's own error.
const HW_AV1_DECODE = ['-hwaccel', 'd3d11va', '-c:v', 'av1']
const codecCache = new Map()

function videoCodec(file) {
  let key
  try {
    const stat = fs.statSync(file)
    key = `${file}|${stat.size}|${stat.mtimeMs}`
  } catch {
    // Not a file: a lavfi source such as color=... or anullsrc.
    return Promise.resolve(null)
  }
  if (!codecCache.has(key)) {
    codecCache.set(
      key,
      new Promise((resolve) => {
        execFile(FFMPEG, ['-hide_banner', '-i', file], { windowsHide: true, timeout: 15000 }, (_error, _stdout, stderr) => {
          resolve(/Stream #\d+:\d+[^:]*: Video: (\w+)/.exec(String(stderr))?.[1] ?? null)
        })
      }),
    )
  }
  return codecCache.get(key)
}

/** The same arguments with GPU decoding in front of every AV1 input, or null if there are none. */
async function withAv1Decoding(args, cwd) {
  const result = []
  let changed = false
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-i' && i + 1 < args.length) {
      const input = path.resolve(cwd ?? process.cwd(), args[i + 1])
      if ((await videoCodec(input)) === 'av1') {
        result.push(...HW_AV1_DECODE)
        changed = true
      }
    }
    result.push(args[i])
  }
  return changed ? result : null
}

async function runWithAv1Fallback(id, args, options) {
  const gpuArgs = await withAv1Decoding(args, options?.cwd)
  if (!gpuArgs) return { ...(await runFfmpeg(id, args, options)), args }
  const first = await runFfmpeg(id, gpuArgs, options)
  if (first.code === 0 || first.signal || first.error) return { ...first, args: gpuArgs }
  logExport('AV1 GPU decoding failed, retrying without it', `args: ${JSON.stringify(gpuArgs)}\n${first.tail}`)
  return { ...(await runFfmpeg(id, args, options)), args }
}

ipcMain.handle('clipr:run', async (event, request) => {
  const directory = writableDirectory(request.sourcePath)
  const output = uniquePath(directory, request.fileName)
  const args = ['-y', '-nostdin', '-progress', 'pipe:2', '-nostats', ...request.args].map((arg) =>
    arg === '@INPUT@' ? request.sourcePath : arg === '@OUTPUT@' ? output : arg,
  )

  let progressBuffer = ''
  const onStderr = (text) => {
    progressBuffer += text
    const lines = progressBuffer.split(/\r?\n/)
    progressBuffer = lines.pop() ?? ''
    let outputTime
    let ended = false
    for (const line of lines) {
      if (line.startsWith('out_time_us=')) {
        const value = Number(line.slice('out_time_us='.length))
        if (Number.isFinite(value)) outputTime = value / 1_000_000
      } else if (line === 'progress=end') {
        ended = true
      }
    }
    if (!request.duration || (outputTime === undefined && !ended)) return
    const ratio = ended ? 1 : Math.min(1, Math.max(0, outputTime / request.duration))
    if (!event.sender.isDestroyed()) {
      event.sender.send('clipr:progress', { id: request.id, ratio })
    }
  }

  const result = await runWithAv1Fallback(request.id, args, { onStderr })
  if (result.error) {
    logExport('clipr:run could not start ffmpeg', `${FFMPEG}\n${result.error.stack ?? result.error.message}`)
    return { ok: false, error: result.error.message }
  }
  if (result.signal) {
    fs.rmSync(output, { force: true })
    return { ok: false, canceled: true }
  }
  if (result.code !== 0) {
    logExport(`clipr:run ffmpeg exited with ${result.code}`, `args: ${JSON.stringify(result.args)}\n${result.tail}`)
    fs.rmSync(output, { force: true })
    return { ok: false, error: failureFrom(result.tail) }
  }
  if (!event.sender.isDestroyed()) {
    event.sender.send('clipr:progress', { id: request.id, ratio: 1 })
  }
  try {
    const size = fs.statSync(output).size
    if (size <= 0) {
      fs.rmSync(output, { force: true })
      return { ok: false, error: 'ffmpeg exited successfully but produced an empty file' }
    }
    return { ok: true, path: output, size }
  } catch (error) {
    fs.rmSync(output, { force: true })
    return {
      ok: false,
      error: `ffmpeg exited successfully but the output file could not be read: ${error.message}`,
    }
  }
})

// Workspaces: a temp folder per export job, used by the multi-clip and text pipeline.
// ffmpeg runs with the folder as its working directory, so the renderer refers to
// intermediate files (parts, overlays, concat list, output) by bare names.
const workspaces = new Map()

function workspaceFile(id, name) {
  const directory = workspaces.get(id)
  if (!directory) throw new Error('Unknown export workspace')
  if (path.basename(name) !== name) throw new Error(`Invalid workspace file name: ${name}`)
  return path.join(directory, name)
}

ipcMain.handle('clipr:workspace-open', (_event, id) => {
  workspaces.set(id, fs.mkdtempSync(path.join(app.getPath('temp'), 'clipr-')))
})

ipcMain.handle('clipr:workspace-write', (_event, id, name, bytes) => {
  fs.writeFileSync(workspaceFile(id, name), bytes)
})

ipcMain.handle('clipr:workspace-delete', (_event, id, name) => {
  fs.rmSync(workspaceFile(id, name), { force: true })
})

ipcMain.handle('clipr:workspace-exec', async (event, id, args) => {
  const cwd = workspaces.get(id)
  if (!cwd) return { code: -1, error: 'Unknown export workspace' }

  let buffer = ''
  const onStderr = (text) => {
    buffer += text
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() ?? ''
    const logs = []
    let time
    for (const line of lines) {
      if (line.startsWith('out_time_us=')) {
        const value = Number(line.slice('out_time_us='.length))
        if (Number.isFinite(value)) time = value / 1_000_000
      } else if (line.trim() && !/^[a-z_]+=/.test(line)) {
        logs.push(line)
      }
    }
    if (!event.sender.isDestroyed() && (logs.length || time !== undefined)) {
      event.sender.send('clipr:workspace-output', { id, logs, time })
    }
  }

  const fullArgs = ['-y', '-nostdin', '-progress', 'pipe:2', '-nostats', ...args]
  const result = await runWithAv1Fallback(id, fullArgs, { cwd, onStderr })
  if (result.error) {
    logExport('workspace-exec could not start ffmpeg', `${FFMPEG}\n${result.error.stack ?? result.error.message}`)
    return { code: -1, error: result.error.message }
  }
  if (result.signal) return { code: -1, canceled: true }
  if (result.code !== 0) {
    // Some steps fail on purpose and retry (a clip without audio), so not every entry is the cause.
    logExport(
      `workspace-exec ffmpeg exited with ${result.code}`,
      `cwd: ${cwd}\nargs: ${JSON.stringify(result.args)}\n${result.tail}`,
    )
  }
  return { code: result.code }
})

// Moves the finished file next to the source video (or into Downloads).
ipcMain.handle('clipr:workspace-finish', (_event, id, name, fileName, sourcePath) => {
  const from = workspaceFile(id, name)
  const size = fs.statSync(from).size
  if (size <= 0) throw new Error('ffmpeg produced an empty file')
  const to = uniquePath(writableDirectory(sourcePath), fileName)
  try {
    fs.renameSync(from, to)
  } catch {
    // Different drive than the temp folder.
    fs.copyFileSync(from, to)
  }
  return { path: to, size }
})

ipcMain.handle('clipr:workspace-close', (_event, id) => {
  const directory = workspaces.get(id)
  workspaces.delete(id)
  if (directory) fs.rmSync(directory, { recursive: true, force: true })
})

ipcMain.handle('clipr:cancel', (_event, id) => {
  const child = running.get(id)
  if (child) child.kill()
  return Boolean(child)
})

ipcMain.handle('clipr:log-export-error', (_event, message) => {
  logExport('export failed (renderer)', String(message).slice(0, 8000))
  return exportLogPath()
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
  for (const directory of workspaces.values()) fs.rmSync(directory, { recursive: true, force: true })
  if (process.platform !== 'darwin') app.quit()
})
