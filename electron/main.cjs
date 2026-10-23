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

const ALLOWED_WORKSPACE_FLAGS = new Set([
  '-ac', '-af', '-an', '-ar', '-b:a', '-bsf:a', '-c', '-c:a', '-c:v',
  '-crf', '-f', '-fflags', '-filter_complex', '-filter_complex_threads',
  '-filter_threads', '-hide_banner', '-i', '-loop', '-map', '-movflags',
  '-pix_fmt', '-preset', '-r', '-safe', '-shortest', '-ss', '-t',
  '-threads', '-vf', '-vn', '-y', '-nostdin', '-progress', '-nostats'
])

function isSafeWorkspaceArg(arg) {
  if (typeof arg !== 'string') return false
  if (arg.startsWith('-')) return ALLOWED_WORKSPACE_FLAGS.has(arg)
  if (arg.includes('..')) return false
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(arg)) return false
  if (path.posix.isAbsolute(arg) || path.win32.isAbsolute(arg)) return false
  return true
}

const SCALE_HEIGHTS = { '1080': 1080, '720': 720, '480': 480 }

function buildFfmpegArgs({ input, output, start, end, settings, sourceHeight, preset }) {
  const duration = Math.max(0.05, end - start)
  const args = ['-hide_banner', '-ss', start.toFixed(3), '-i', input, '-t', duration.toFixed(3)]

  const wantsAudio = !settings.muteAudio && settings.format !== 'gif'
  const filters = []

  if (settings.format === 'gif') filters.push('fps=12')

  const maxTarget = settings.scale === 'source' ? undefined : SCALE_HEIGHTS[settings.scale]
  if (maxTarget === undefined) {
    filters.push('scale=trunc(iw/2)*2:trunc(ih/2)*2')
  } else {
    const height = sourceHeight ? Math.min(sourceHeight, maxTarget) : maxTarget
    const evenHeight = Math.max(2, Math.round(height / 2) * 2)
    const scaleFlags = preset === 'veryfast' ? 'bicubic' : 'fast_bilinear'
    filters.push(`scale=-2:${evenHeight}:flags=${scaleFlags}`)
  }

  if (settings.format === 'mp3') {
    args.push('-vn', '-c:a', 'libmp3lame', '-b:a', '128k', output)
    return args
  }

  if (settings.format === 'gif') {
    const prepared = [...filters, 'split[sample][frames]'].join(',')
    const chain = [
      prepared,
      '[sample]palettegen=stats_mode=diff[palette]',
      '[frames][palette]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle',
    ].join(';')
    args.push('-vf', chain, '-an', '-loop', '0', output)
    return args
  }

  const QUALITY_CRF = {
    veryfast: { high: '20', balanced: '23', small: '28' },
    ultrafast: { high: '24', balanced: '28', small: '30' },
  }

  args.push('-map', '0:v:0?')
  if (wantsAudio) args.push('-map', '0:a:0?')
  if (filters.length) args.push('-vf', filters.join(','))

  // Note: we let ffmpeg use its default thread count by omitting -threads,
  // since the desktop app has full access to resources and the multi-thread
  // constraints are only for the WASM build.
  args.push(
    '-c:v', 'libx264',
    '-preset', preset,
    '-crf', QUALITY_CRF[preset][settings.quality],
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart'
  )

  if (wantsAudio) args.push('-c:a', 'aac', '-b:a', '128k')
  else args.push('-an')

  args.push(output)
  return args
}

ipcMain.handle('clipr:run', async (event, request) => {
  const directory = writableDirectory(request.sourcePath)
  const output = uniquePath(directory, request.fileName)

  return new Promise((resolve) => {
    let rawArgs = []
    if (request.commandInput) {
      const { start, end, settings, sourceHeight, preset } = request.commandInput
      rawArgs = buildFfmpegArgs({
        input: request.sourcePath,
        output,
        start,
        end,
        settings,
        sourceHeight,
        preset
      })
    } else {
      resolve({ ok: false, error: 'Invalid command input' })
      return
    }

    const args = ['-y', '-nostdin', '-progress', 'pipe:2', '-nostats', ...rawArgs]
    let child
    try {
      child = spawn(FFMPEG, args, { windowsHide: true })
    } catch (error) {
      resolve({ ok: false, error: error.message })
      return
    }

    running.set(request.id, child)
    let tail = ''
    let progressBuffer = ''

    child.stderr.on('data', (chunk) => {
      const text = String(chunk)
      tail = (tail + text).slice(-4000)
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
      const ratio = ended
        ? 1
        : Math.min(1, Math.max(0, outputTime / request.duration))
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
      if (code === 0 && !signal && !event.sender.isDestroyed()) {
        event.sender.send('clipr:progress', { id: request.id, ratio: 1 })
      }
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
      try {
        const size = fs.statSync(output).size
        if (size <= 0) {
          fs.rmSync(output, { force: true })
          resolve({ ok: false, error: 'ffmpeg exited successfully but produced an empty file' })
          return
        }
        resolve({ ok: true, path: output, size })
      } catch (error) {
        fs.rmSync(output, { force: true })
        resolve({
          ok: false,
          error: `ffmpeg exited successfully but the output file could not be read: ${error.message}`,
        })
      }
    })
  })
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

ipcMain.handle('clipr:workspace-exec', (event, id, args) => {
  if (!Array.isArray(args) || !args.every(isSafeWorkspaceArg)) {
    return { code: -1, error: 'Invalid or unauthorized ffmpeg arguments provided' }
  }

  const cwd = workspaces.get(id)
  if (!cwd) return { code: -1, error: 'Unknown export workspace' }

  return new Promise((resolve) => {
    let child
    try {
      child = spawn(FFMPEG, ['-y', '-nostdin', '-progress', 'pipe:2', '-nostats', ...args], {
        cwd,
        windowsHide: true,
      })
    } catch (error) {
      resolve({ code: -1, error: error.message })
      return
    }

    running.set(id, child)
    let buffer = ''
    child.stderr.on('data', (chunk) => {
      buffer += String(chunk)
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
    })
    child.on('error', (error) => {
      running.delete(id)
      resolve({ code: -1, error: error.message })
    })
    child.on('close', (code, signal) => {
      running.delete(id)
      resolve(signal ? { code: -1, canceled: true } : { code: code ?? -1 })
    })
  })
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
