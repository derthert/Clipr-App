// Single ffmpeg.wasm engine shared by every export, plus a tiny status store for the UI.

import { FFmpeg, FFFSType } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'
import type { CompositionPiece, ExportSettings, QualityPreset, ScalePreset, TextSegment } from '../types'
import {
  AUDIO_BITRATE,
  DEFAULT_FPS,
  THREAD_COUNT,
  VIDEO_BITRATE,
  buildFfmpegArgs,
  mimeForExtension,
} from './settings'
import { clamp } from './time'
import { extensionOf } from './file'

export type EngineStatus = 'idle' | 'loading' | 'ready' | 'error'

const MOUNT_DIR = '/clipr'
const CDN_CORE_BASE = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm'
const listeners = new Set<(status: EngineStatus) => void>()

const QUALITY_CRF: Record<QualityPreset, string> = {
  high: '24',
  balanced: '28',
  small: '30',
}

const SCALE_HEIGHTS: Record<Exclude<ScalePreset, 'source'>, number> = {
  '1080': 1080,
  '720': 720,
  '480': 480,
}

let engine: FFmpeg | null = null
let loading: Promise<FFmpeg> | null = null
let status: EngineStatus = 'idle'
let chain: Promise<unknown> = Promise.resolve()

function setStatus(next: EngineStatus) {
  status = next
  for (const listener of listeners) listener(next)
}

export function getEngineStatus(): EngineStatus {
  return status
}

export function subscribeEngine(listener: (status: EngineStatus) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function coreUrl(file: string): string {
  return new URL(`${import.meta.env.BASE_URL}ffmpeg/${file}`, document.baseURI).href
}

/**
 * Self-contained @ffmpeg/ffmpeg Web Worker source (inlined as a Blob URL).
 * Serving worker.js from a Blob URL prevents Vite's dev server from injecting
 * `import { injectQuery } from "/@vite/client"` (which crashes inside Web Workers
 * because `HTMLElement` / `document` are undefined) and prevents Vite from
 * appending `?import` to `blob:` or `/public` coreURLs.
 */
function createWorkerBlobUrl(): string {
  const workerSource = `
const CORE_URL = "${CDN_CORE_BASE}/ffmpeg-core.js";
const FFMessageType = {
  LOAD: "LOAD",
  EXEC: "EXEC",
  FFPROBE: "FFPROBE",
  WRITE_FILE: "WRITE_FILE",
  READ_FILE: "READ_FILE",
  DELETE_FILE: "DELETE_FILE",
  RENAME: "RENAME",
  CREATE_DIR: "CREATE_DIR",
  LIST_DIR: "LIST_DIR",
  DELETE_DIR: "DELETE_DIR",
  ERROR: "ERROR",
  DOWNLOAD: "DOWNLOAD",
  PROGRESS: "PROGRESS",
  LOG: "LOG",
  MOUNT: "MOUNT",
  UNMOUNT: "UNMOUNT",
};

let ffmpeg;

const load = async ({ coreURL: _coreURL, wasmURL: _wasmURL, workerURL: _workerURL }) => {
  const first = !ffmpeg;
  try {
    if (!_coreURL) _coreURL = CORE_URL;
    importScripts(_coreURL);
  } catch {
    if (!_coreURL || _coreURL === CORE_URL) {
      _coreURL = CORE_URL.replace("/umd/", "/esm/");
    }
    self.createFFmpegCore = (await import(_coreURL)).default;
    if (!self.createFFmpegCore) {
      throw new Error("failed to import ffmpeg-core.js");
    }
  }
  const coreURL = _coreURL;
  const wasmURL = _wasmURL ? _wasmURL : _coreURL.replace(/.js$/g, ".wasm");
  const workerURL = _workerURL ? _workerURL : _coreURL.replace(/.js$/g, ".worker.js");
  ffmpeg = await self.createFFmpegCore({
    mainScriptUrlOrBlob: \`\${coreURL}#\${btoa(JSON.stringify({ wasmURL, workerURL }))}\`,
  });
  ffmpeg.setLogger((data) => self.postMessage({ type: FFMessageType.LOG, data }));
  ffmpeg.setProgress((data) => self.postMessage({ type: FFMessageType.PROGRESS, data }));
  return first;
};

const exec = ({ args, timeout = -1 }) => {
  ffmpeg.setTimeout(timeout);
  ffmpeg.exec(...args);
  const ret = ffmpeg.ret;
  ffmpeg.reset();
  return ret;
};

const ffprobe = ({ args, timeout = -1 }) => {
  ffmpeg.setTimeout(timeout);
  ffmpeg.ffprobe(...args);
  const ret = ffmpeg.ret;
  ffmpeg.reset();
  return ret;
};

const writeFile = ({ path, data }) => {
  ffmpeg.FS.writeFile(path, data);
  return true;
};

const readFile = ({ path, encoding }) => ffmpeg.FS.readFile(path, { encoding });

const deleteFile = ({ path }) => {
  ffmpeg.FS.unlink(path);
  return true;
};

const rename = ({ oldPath, newPath }) => {
  ffmpeg.FS.rename(oldPath, newPath);
  return true;
};

const createDir = ({ path }) => {
  ffmpeg.FS.mkdir(path);
  return true;
};

const listDir = ({ path }) => {
  const names = ffmpeg.FS.readdir(path);
  const nodes = [];
  for (const name of names) {
    const stat = ffmpeg.FS.stat(\`\${path}/\${name}\`);
    const isDir = ffmpeg.FS.isDir(stat.mode);
    nodes.push({ name, isDir });
  }
  return nodes;
};

const deleteDir = ({ path }) => {
  ffmpeg.FS.rmdir(path);
  return true;
};

const mount = ({ fsType, options, mountPoint }) => {
  const str = fsType;
  const fs = ffmpeg.FS.filesystems[str];
  if (!fs) return false;
  ffmpeg.FS.mount(fs, options, mountPoint);
  return true;
};

const unmount = ({ mountPoint }) => {
  ffmpeg.FS.unmount(mountPoint);
  return true;
};

self.onmessage = async ({ data: { id, type, data: _data } }) => {
  const trans = [];
  let data;
  try {
    if (type !== FFMessageType.LOAD && !ffmpeg) {
      throw new Error("ffmpeg is not loaded");
    }
    switch (type) {
      case FFMessageType.LOAD:
        data = await load(_data);
        break;
      case FFMessageType.EXEC:
        data = exec(_data);
        break;
      case FFMessageType.FFPROBE:
        data = ffprobe(_data);
        break;
      case FFMessageType.WRITE_FILE:
        data = writeFile(_data);
        break;
      case FFMessageType.READ_FILE:
        data = readFile(_data);
        break;
      case FFMessageType.DELETE_FILE:
        data = deleteFile(_data);
        break;
      case FFMessageType.RENAME:
        data = rename(_data);
        break;
      case FFMessageType.CREATE_DIR:
        data = createDir(_data);
        break;
      case FFMessageType.LIST_DIR:
        data = listDir(_data);
        break;
      case FFMessageType.DELETE_DIR:
        data = deleteDir(_data);
        break;
      case FFMessageType.MOUNT:
        data = mount(_data);
        break;
      case FFMessageType.UNMOUNT:
        data = unmount(_data);
        break;
      default:
        throw new Error("unknown message type");
    }
  } catch (e) {
    self.postMessage({
      id,
      type: FFMessageType.ERROR,
      data: e instanceof Error ? e.message : String(e),
    });
    return;
  }
  if (data instanceof Uint8Array) {
    trans.push(data.buffer);
  }
  self.postMessage({ id, type, data }, trans);
};
`
  return URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }))
}

async function resolveAssetBlobUrl(file: string, mimeType: string): Promise<string> {
  const localUrl = coreUrl(file)
  try {
    console.log(`[FFmpeg Init] Yerel dosya yükleniyor: ${localUrl}`)
    const check = await fetch(localUrl, { method: 'HEAD' })
    if (!check.ok) throw new Error(`HTTP ${check.status}`)
    return await toBlobURL(localUrl, mimeType)
  } catch (localErr) {
    const cdnUrl = `${CDN_CORE_BASE}/${file}`
    console.warn(
      `[FFmpeg Init] Yerel dosya bulunamadı (${localUrl}), CDN üzerinden çekiliyor: ${cdnUrl}`,
      localErr,
    )
    return await toBlobURL(cdnUrl, mimeType)
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(message))
    }, ms)
    promise.then(
      (val) => {
        window.clearTimeout(timer)
        resolve(val)
      },
      (err: unknown) => {
        window.clearTimeout(timer)
        reject(err)
      },
    )
  })
}

async function createEngine(): Promise<FFmpeg> {
  const instance = new FFmpeg()

  // Log all FFmpeg internal messages to browser console for debugging
  instance.on('log', ({ type, message }) => {
    console.log(`[FFmpeg Log] (${type})`, message)
  })

  try {
    console.log('[FFmpeg Init] 1/3: WASM ve Core Blob URL yolları hazırlanıyor...')
    const [classWorkerURL, coreBlobUrl, wasmBlobUrl] = await Promise.all([
      Promise.resolve(createWorkerBlobUrl()),
      resolveAssetBlobUrl('ffmpeg-core.js', 'text/javascript'),
      resolveAssetBlobUrl('ffmpeg-core.wasm', 'application/wasm'),
    ])

    console.log('[FFmpeg Init] 2/3: ffmpeg.load() çağrılıyor...', {
      classWorkerURL,
      coreURL: coreBlobUrl,
      wasmURL: wasmBlobUrl,
    })

    await withTimeout(
      instance.load({
        classWorkerURL,
        coreURL: coreBlobUrl,
        wasmURL: wasmBlobUrl,
      }),
      45_000,
      'FFmpeg motoru başlatılırken zaman aşımı oluştu (starting up timeout).',
    )

    console.log('[FFmpeg Init] 3/3: FFmpeg WASM motoru başarıyla başlatıldı!')
    return instance
  } catch (error) {
    console.error('[FFmpeg Engine Load Error]', error)
    try {
      instance.terminate()
    } catch {
      // ignore termination errors
    }
    throw error
  }
}

export function ensureEngine(): Promise<FFmpeg> {
  if (engine) return Promise.resolve(engine)
  if (!loading) {
    setStatus('loading')
    loading = createEngine()
      .then((instance) => {
        engine = instance
        setStatus('ready')
        return instance
      })
      .catch((error: unknown) => {
        console.error('[FFmpeg ensureEngine Hatası]', error)
        engine = null
        loading = null
        setStatus('error')
        throw error
      })
  }
  return loading
}

export function cancelRender(): void {
  if (!engine && !loading) return
  engine?.terminate()
  engine = null
  loading = null
  setStatus('idle')
}

async function mountInput(instance: FFmpeg, file: File) {
  try {
    await instance.createDir(MOUNT_DIR).catch(() => undefined)
    await instance.unmount(MOUNT_DIR).catch(() => undefined)
    await instance.mount(FFFSType.WORKERFS, { files: [file] }, MOUNT_DIR)
    return {
      path: `${MOUNT_DIR}/${file.name}`,
      release: async () => {
        await instance.unmount(MOUNT_DIR).catch(() => undefined)
        await instance.deleteDir(MOUNT_DIR).catch(() => undefined)
      },
    }
  } catch {
    const path = `source.${extensionOf(file.name) || 'bin'}`
    await instance.writeFile(path, await fetchFile(file))
    return { path, release: async () => void instance.deleteFile(path).catch(() => undefined) }
  }
}

function describeFailure(logs: string[]): string {
  const meaningful = logs
    .filter((line) => /error|invalid|unable|failed|not found|no such|cannot/i.test(line))
    .slice(-3)
  return meaningful.join(' · ') || 'FFmpeg video çıktısını oluşturamadı'
}

function formatExportError(error: unknown, logs: string[]): Error {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === 'string' && error.trim()
        ? error
        : describeFailure(logs)
  const msg = raw.startsWith('Dışa Aktarma Başarısız')
    ? raw
    : `Dışa Aktarma Başarısız: ${raw}`
  return new Error(msg)
}

function computeTargetDimensions(
  pieces: CompositionPiece[],
  settings: ExportSettings,
  fallbackW?: number,
  fallbackH?: number,
): { width: number; height: number } {
  let baseW = fallbackW || 0
  let baseH = fallbackH || 0
  for (const p of pieces) {
    if (p.kind === 'clip' && p.width > 0 && p.height > 0) {
      baseW = p.width
      baseH = p.height
      break
    }
  }
  if (baseW <= 0 || baseH <= 0) {
    baseW = 1280
    baseH = 720
  }

  // Always cap output resolution to max 1080p (or 720p/480p preset)
  const maxHeight = settings.scale === 'source' ? 1080 : SCALE_HEIGHTS[settings.scale]
  if (baseH > maxHeight) {
    const ratio = maxHeight / baseH
    baseW = Math.round(baseW * ratio)
    baseH = maxHeight
  }
  if (baseW > 1920) {
    const ratio = 1920 / baseW
    baseW = 1920
    baseH = Math.round(baseH * ratio)
  }

  const evenW = Math.max(2, Math.round(baseW / 2) * 2)
  const evenH = Math.max(2, Math.round(baseH / 2) * 2)
  return { width: evenW, height: evenH }
}

export interface RenderRequest {
  file: File
  start: number
  end: number
  pieces?: CompositionPiece[]
  textSegments?: TextSegment[]
  settings: ExportSettings
  extension: string
  sourceWidth?: number
  sourceHeight?: number
  onProgress?: (ratio: number) => void
}

const PREVIEW_REF_HEIGHT = 360

interface PreparedOverlay {
  fileName: string
  x: number
  y: number
  relStart: number
  relEnd: number
}

/**
 * Rasterizes a TextSegment onto a tight transparent PNG canvas using the user's
 * chosen fontFamily, fontSize, color, and drop shadow, and computes its exact
 * pixel (x, y) coordinates on the target video frame (targetW x targetH).
 */
async function renderTextSegmentToPng(
  seg: TextSegment,
  targetW: number,
  targetH: number,
): Promise<{ bytes: Uint8Array; x: number; y: number } | null> {
  const rawText = seg.text.trim()
  if (!rawText || typeof document === 'undefined') return null

  const scaleFactor = targetH / PREVIEW_REF_HEIGHT
  const fontSizePx = Math.max(12, Math.round(seg.fontSize * scaleFactor))
  const lineHeight = Math.round(fontSizePx * 1.25)
  const pad = Math.ceil(fontSizePx * 0.5)
  const lines = seg.text.split(/\r?\n/)

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const fontSpec = `700 ${fontSizePx}px "${seg.fontFamily}", sans-serif`
  ctx.font = fontSpec

  let maxLineW = 0
  for (const line of lines) {
    const metrics = ctx.measureText(line || ' ')
    maxLineW = Math.max(maxLineW, metrics.width)
  }

  const boxW = Math.max(8, Math.min(targetW, Math.ceil(maxLineW + pad * 2)))
  const boxH = Math.max(8, Math.min(targetH, Math.ceil(lines.length * lineHeight + pad * 2)))
  canvas.width = boxW
  canvas.height = boxH

  ctx.font = fontSpec
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = seg.color || '#ffffff'
  ctx.shadowColor = 'rgba(0, 0, 0, 0.85)'
  ctx.shadowBlur = Math.max(4, Math.round(fontSizePx * 0.22))
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = Math.max(1, Math.round(fontSizePx * 0.06))

  const startY = boxH / 2 - ((lines.length - 1) * lineHeight) / 2
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], boxW / 2, startY + i * lineHeight)
  }

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) return null
  const bytes = new Uint8Array(await blob.arrayBuffer())

  const xPct = Number.isFinite(seg.x) ? seg.x : 50
  const yPct = Number.isFinite(seg.y) ? seg.y : 50
  const centerX = (xPct / 100) * targetW
  const centerY = (yPct / 100) * targetH
  const overlayX = Math.round(clamp(centerX - boxW / 2, 0, Math.max(0, targetW - boxW)))
  const overlayY = Math.round(clamp(centerY - boxH / 2, 0, Math.max(0, targetH - boxH)))

  return { bytes, x: overlayX, y: overlayY }
}

async function prepareWindowOverlays(
  instance: FFmpeg,
  textSegments: TextSegment[] | undefined,
  windowStart: number,
  windowDuration: number,
  targetW: number,
  targetH: number,
  prefix: string,
): Promise<PreparedOverlay[]> {
  if (!textSegments?.length) return []
  const windowEnd = windowStart + windowDuration
  const matching = textSegments.filter(
    (t) =>
      t.text.trim().length > 0 &&
      t.duration >= 0.04 &&
      t.timelineStart < windowEnd - 0.01 &&
      t.timelineStart + t.duration > windowStart + 0.01,
  )
  if (!matching.length) return []

  const prepared: PreparedOverlay[] = []
  for (let k = 0; k < matching.length; k++) {
    const seg = matching[k]
    const rendered = await renderTextSegmentToPng(seg, targetW, targetH)
    if (!rendered) continue
    const fileName = `${prefix}_txt_${k}.png`
    await instance.writeFile(fileName, rendered.bytes)
    prepared.push({
      fileName,
      x: rendered.x,
      y: rendered.y,
      relStart: Math.max(0, seg.timelineStart - windowStart),
      relEnd: Math.min(windowDuration, seg.timelineStart + seg.duration - windowStart),
    })
  }
  return prepared
}

function buildOverlayFilterComplex(
  baseVf: string,
  overlays: PreparedOverlay[],
  firstOverlayInputIdx: number,
): { filterComplex: string; outLabel: string } {
  const parts: string[] = [`[0:v]${baseVf}[v0]`]
  for (let k = 0; k < overlays.length; k++) {
    const ov = overlays[k]
    const inIdx = firstOverlayInputIdx + k
    parts.push(
      `[v${k}][${inIdx}:v]overlay=${ov.x}:${ov.y}:enable='between(t,${ov.relStart.toFixed(3)},${ov.relEnd.toFixed(3)})':format=auto[v${k + 1}]`,
    )
  }
  return {
    filterComplex: parts.join(';'),
    outLabel: `[v${overlays.length}]`,
  }
}

async function executeSingle(request: RenderRequest): Promise<Blob> {
  const instance = await ensureEngine()
  const output = `clip.${request.extension}`
  const duration = Math.max(0.04, request.end - request.start)
  const logs: string[] = []
  const overlayFiles: string[] = []

  const onLog = ({ message }: { message: string }) => {
    logs.push(message)
    if (logs.length > 40) logs.shift()
  }
  const onProgress = ({ time }: { time: number }) => {
    if (!Number.isFinite(time) || !Number.isFinite(duration) || duration <= 0) return
    request.onProgress?.(clamp(time / 1_000_000 / duration, 0, 1))
  }

  instance.on('log', onLog)
  instance.on('progress', onProgress)
  const mounted = await mountInput(instance, request.file)

  try {
    const isAudioOnly = request.settings.format === 'mp3'
    const { width: targetW, height: targetH } = computeTargetDimensions(
      request.pieces ?? [],
      request.settings,
      request.sourceWidth,
      request.sourceHeight,
    )
    const overlays = !isAudioOnly
      ? await prepareWindowOverlays(
          instance,
          request.textSegments,
          0,
          duration,
          targetW,
          targetH,
          'single',
        )
      : []
    for (const ov of overlays) overlayFiles.push(ov.fileName)

    let code = -1

    if (overlays.length > 0) {
      const wantsAudio = !request.settings.muteAudio && request.settings.format !== 'gif'
      const crf = QUALITY_CRF[request.settings.quality]
      const baseVf = `scale=-2:${targetH}:flags=fast_bilinear,format=yuv420p`
      const { filterComplex, outLabel } = buildOverlayFilterComplex(baseVf, overlays, 1)
      const overlayInputs = overlays.flatMap((ov) => ['-i', ov.fileName])

      if (request.settings.format === 'gif') {
        const gifChain = [
          filterComplex,
          `${outLabel}fps=12,split[sample][frames]`,
          '[sample]palettegen=stats_mode=diff[palette]',
          '[frames][palette]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle[gifout]',
        ].join(';')
        code = await instance.exec([
          '-hide_banner',
          '-ss', request.start.toFixed(3),
          '-i', mounted.path,
          '-t', duration.toFixed(3),
          ...overlayInputs,
          '-threads', THREAD_COUNT,
          '-filter_complex', gifChain,
          '-map', '[gifout]',
          '-an',
          '-loop', '0',
          output,
        ])
      } else {
        code = await instance.exec([
          '-hide_banner',
          '-ss', request.start.toFixed(3),
          '-i', mounted.path,
          '-t', duration.toFixed(3),
          ...overlayInputs,
          '-filter_complex', filterComplex,
          '-map', outLabel,
          ...(wantsAudio ? ['-map', '0:a:0?'] : ['-an']),
          '-r', DEFAULT_FPS,
          '-threads', THREAD_COUNT,
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-tune', 'zerolatency',
          '-crf', crf,
          '-b:v', VIDEO_BITRATE,
          '-maxrate', '2.5M',
          '-bufsize', '4M',
          '-pix_fmt', 'yuv420p',
          '-movflags', '+faststart',
          ...(wantsAudio ? ['-c:a', 'aac', '-b:a', AUDIO_BITRATE] : []),
          output,
        ])
      }
    } else {
      code = await instance.exec(
        buildFfmpegArgs({
          input: mounted.path,
          output,
          start: request.start,
          end: request.end,
          settings: { ...request.settings, mode: 'precise' },
          sourceHeight: request.sourceHeight,
        }),
      )
    }

    if (code !== 0) throw new Error(describeFailure(logs))
    const data = await instance.readFile(output)
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
    if (!bytes.length) throw new Error('ffmpeg produced an empty file')
    return new Blob([bytes as unknown as BlobPart], { type: mimeForExtension(request.extension) })
  } catch (error) {
    console.error('[FFmpeg executeSingle Export Hatası]', error, { logs })
    cancelRender()
    throw formatExportError(error, logs)
  } finally {
    instance.off('log', onLog)
    instance.off('progress', onProgress)
    if (engine === instance) {
      await withTimeout(
        (async () => {
          await instance.deleteFile(output).catch(() => undefined)
          for (const f of overlayFiles) {
            await instance.deleteFile(f).catch(() => undefined)
          }
          await mounted.release()
        })(),
        2000,
        'cleanup timeout',
      ).catch(() => undefined)
    }
  }
}

async function executeComposition(
  request: RenderRequest,
  pieces: CompositionPiece[],
): Promise<Blob> {
  const instance = await ensureEngine()
  const output = `composition.${request.extension}`
  const totalDuration = Math.max(
    0.04,
    pieces.reduce((sum, p) => sum + p.duration, 0),
  )
  const logs: string[] = []
  const partFiles: string[] = []
  const tempOverlayFiles: string[] = []
  const concatListFile = 'concat_list.txt'

  let completedDuration = 0
  let currentPieceDuration = 0

  const onLog = ({ message }: { message: string }) => {
    logs.push(message)
    if (logs.length > 60) logs.shift()
  }
  const onProgress = ({ time }: { time: number }) => {
    if (!Number.isFinite(time) || totalDuration <= 0 || currentPieceDuration <= 0) return
    const pieceTime = clamp(time / 1_000_000, 0, currentPieceDuration)
    const overall = clamp(((completedDuration + pieceTime) / totalDuration) * 0.94, 0, 0.94)
    request.onProgress?.(overall)
  }

  instance.on('log', onLog)
  instance.on('progress', onProgress)

  const { width: targetW, height: targetH } = computeTargetDimensions(
    pieces,
    request.settings,
    request.sourceWidth,
    request.sourceHeight,
  )
  const isAudioOnly = request.settings.format === 'mp3'
  const wantsAudio = !request.settings.muteAudio && request.settings.format !== 'gif'
  const crf = QUALITY_CRF[request.settings.quality]

  try {
    for (let i = 0; i < pieces.length; i++) {
      const piece = pieces[i]
      const dur = Math.max(0.04, piece.duration)
      currentPieceDuration = dur
      const partName = isAudioOnly ? `part_${i}.mp3` : `part_${i}.ts`
      partFiles.push(partName)

      if (isAudioOnly) {
        if (piece.kind === 'gap' || request.settings.muteAudio) {
          const code = await instance.exec([
            '-hide_banner',
            '-f', 'lavfi',
            '-t', dur.toFixed(3),
            '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
            '-c:a', 'libmp3lame',
            '-b:a', AUDIO_BITRATE,
            partName,
          ])
          if (code !== 0) throw new Error(describeFailure(logs))
        } else {
          const mounted = await mountInput(instance, piece.file)
          try {
            let code = await instance.exec([
              '-hide_banner',
              '-ss', piece.sourceStart.toFixed(3),
              '-i', mounted.path,
              '-t', dur.toFixed(3),
              '-vn',
              '-ar', '44100',
              '-ac', '2',
              '-c:a', 'libmp3lame',
              '-b:a', AUDIO_BITRATE,
              partName,
            ])
            if (code !== 0) {
              // Fallback to silent audio if source clip has no audio track
              code = await instance.exec([
                '-hide_banner',
                '-f', 'lavfi',
                '-t', dur.toFixed(3),
                '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
                '-c:a', 'libmp3lame',
                '-b:a', AUDIO_BITRATE,
                partName,
              ])
            }
            if (code !== 0) throw new Error(describeFailure(logs))
          } finally {
            await withTimeout(mounted.release(), 1500, 'release').catch(() => undefined)
          }
        }
      } else if (piece.kind === 'gap') {
        const pieceOverlays = await prepareWindowOverlays(
          instance,
          request.textSegments,
          completedDuration,
          dur,
          targetW,
          targetH,
          `gap_${i}`,
        )
        for (const ov of pieceOverlays) tempOverlayFiles.push(ov.fileName)

        const firstOverlayIdx = wantsAudio ? 2 : 1
        const overlayInputs = pieceOverlays.flatMap((ov) => ['-i', ov.fileName])
        const baseVf = 'setsar=1,format=yuv420p'
        const filterArgs =
          pieceOverlays.length > 0
            ? (() => {
                const { filterComplex, outLabel } = buildOverlayFilterComplex(
                  baseVf,
                  pieceOverlays,
                  firstOverlayIdx,
                )
                return [
                  '-filter_complex',
                  filterComplex,
                  '-map',
                  outLabel,
                  ...(wantsAudio ? ['-map', '1:a:0'] : []),
                ]
              })()
            : ['-vf', baseVf]

        // Render black screen (blank frame) for the exact gap duration
        const gapArgs = [
          '-hide_banner',
          '-f', 'lavfi',
          '-t', dur.toFixed(3),
          '-i', `color=c=black:s=${targetW}x${targetH}:r=${DEFAULT_FPS}`,
          ...(wantsAudio
            ? ['-f', 'lavfi', '-t', dur.toFixed(3), '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100']
            : []),
          ...overlayInputs,
          ...filterArgs,
          '-r', DEFAULT_FPS,
          '-threads', THREAD_COUNT,
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-tune', 'zerolatency',
          '-crf', crf,
          '-b:v', VIDEO_BITRATE,
          '-maxrate', '2.5M',
          '-bufsize', '4M',
          '-pix_fmt', 'yuv420p',
          ...(wantsAudio
            ? ['-c:a', 'aac', '-ar', '44100', '-ac', '2', '-b:a', AUDIO_BITRATE, '-shortest']
            : ['-an']),
          '-f', 'mpegts',
          partName,
        ]
        const code = await instance.exec(gapArgs)
        if (code !== 0) throw new Error(describeFailure(logs))
      } else {
        const mounted = await mountInput(instance, piece.file)
        const pieceOverlays = await prepareWindowOverlays(
          instance,
          request.textSegments,
          completedDuration,
          dur,
          targetW,
          targetH,
          `clip_${i}`,
        )
        for (const ov of pieceOverlays) tempOverlayFiles.push(ov.fileName)

        const sameDims =
          Math.abs(piece.width - targetW) <= 2 && Math.abs(piece.height - targetH) <= 2
        const vf = sameDims
          ? 'format=yuv420p'
          : `scale=${targetW}:${targetH}:force_original_aspect_ratio=decrease:flags=fast_bilinear,pad=${targetW}:${targetH}:(ow-iw)/2:(oh-ih)/2:black,setsar=1,format=yuv420p`
        const overlayInputs = pieceOverlays.flatMap((ov) => ['-i', ov.fileName])
        try {
          let code = -1

          // Always re-encode video segments with -c:v libx264 -preset ultrafast so rotation
          // metadata and filters are applied cleanly without -c:v copy conflicts.
          if (wantsAudio) {
            const videoMapAndFilter =
              pieceOverlays.length > 0
                ? (() => {
                    const { filterComplex, outLabel } = buildOverlayFilterComplex(
                      vf,
                      pieceOverlays,
                      1,
                    )
                    return ['-filter_complex', filterComplex, '-map', outLabel, '-map', '0:a:0']
                  })()
                : ['-map', '0:v:0', '-map', '0:a:0', '-vf', vf]

            code = await instance.exec([
              '-hide_banner',
              '-ss', piece.sourceStart.toFixed(3),
              '-i', mounted.path,
              '-t', dur.toFixed(3),
              ...overlayInputs,
              ...videoMapAndFilter,
              '-af', 'aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo',
              '-r', DEFAULT_FPS,
              '-threads', THREAD_COUNT,
              '-c:v', 'libx264',
              '-preset', 'ultrafast',
              '-tune', 'zerolatency',
              '-crf', crf,
              '-b:v', VIDEO_BITRATE,
              '-maxrate', '2.5M',
              '-bufsize', '4M',
              '-pix_fmt', 'yuv420p',
              '-c:a', 'aac',
              '-ar', '44100',
              '-ac', '2',
              '-b:a', AUDIO_BITRATE,
              '-shortest',
              '-f', 'mpegts',
              partName,
            ])
          }

          if (code !== 0) {
            // Either audio is muted, or the input video has no audio stream -> use silent audio / no audio
            const firstOverlayIdx = wantsAudio ? 2 : 1
            const videoMapAndFilter =
              pieceOverlays.length > 0
                ? (() => {
                    const { filterComplex, outLabel } = buildOverlayFilterComplex(
                      vf,
                      pieceOverlays,
                      firstOverlayIdx,
                    )
                    return [
                      '-filter_complex',
                      filterComplex,
                      '-map',
                      outLabel,
                      ...(wantsAudio ? ['-map', '1:a:0'] : []),
                    ]
                  })()
                : ['-map', '0:v:0', ...(wantsAudio ? ['-map', '1:a:0'] : []), '-vf', vf]

            const fallbackArgs = [
              '-hide_banner',
              '-ss', piece.sourceStart.toFixed(3),
              '-i', mounted.path,
              '-t', dur.toFixed(3),
              ...(wantsAudio
                ? ['-f', 'lavfi', '-t', dur.toFixed(3), '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100']
                : []),
              ...overlayInputs,
              ...videoMapAndFilter,
              '-r', DEFAULT_FPS,
              '-threads', THREAD_COUNT,
              '-c:v', 'libx264',
              '-preset', 'ultrafast',
              '-tune', 'zerolatency',
              '-crf', crf,
              '-b:v', VIDEO_BITRATE,
              '-maxrate', '2.5M',
              '-bufsize', '4M',
              '-pix_fmt', 'yuv420p',
              ...(wantsAudio
                ? ['-c:a', 'aac', '-ar', '44100', '-ac', '2', '-b:a', AUDIO_BITRATE, '-shortest']
                : ['-an']),
              '-f', 'mpegts',
              partName,
            ]
            code = await instance.exec(fallbackArgs)
          }

          if (code !== 0) throw new Error(describeFailure(logs))
        } finally {
          await withTimeout(mounted.release(), 1500, 'release').catch(() => undefined)
        }
      }

      completedDuration += dur
      request.onProgress?.(clamp((completedDuration / totalDuration) * 0.94, 0, 0.94))
    }

    // Write concat demuxer list and concatenate all parts into a single output file
    const concatContent = partFiles.map((f) => `file '${f}'`).join('\n')
    await instance.writeFile(concatListFile, new TextEncoder().encode(concatContent))
    currentPieceDuration = 0

    let concatArgs: string[]
    if (isAudioOnly) {
      concatArgs = ['-hide_banner', '-f', 'concat', '-safe', '0', '-i', concatListFile, '-c', 'copy', output]
    } else if (request.settings.format === 'gif') {
      const chain = [
        'fps=12,split[sample][frames]',
        '[sample]palettegen=stats_mode=diff[palette]',
        '[frames][palette]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle',
      ].join(';')
      concatArgs = [
        '-hide_banner',
        '-f', 'concat',
        '-safe', '0',
        '-i', concatListFile,
        '-vf', chain,
        '-an',
        '-loop', '0',
        output,
      ]
    } else {
      // Every .ts part is already encoded with identical libx264/30fps/targetW*targetH parameters,
      // so remuxing them into the final container avoids a redundant second encoding pass.
      concatArgs = [
        '-hide_banner',
        '-fflags', '+genpts',
        '-f', 'concat',
        '-safe', '0',
        '-i', concatListFile,
        '-c', 'copy',
        ...(wantsAudio ? ['-bsf:a', 'aac_adtstoasc'] : []),
        '-movflags', '+faststart',
        output,
      ]
    }

    const concatCode = await instance.exec(concatArgs)
    if (concatCode !== 0) throw new Error(describeFailure(logs))

    request.onProgress?.(1)
    const data = await instance.readFile(output)
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
    if (!bytes.length) throw new Error('ffmpeg produced an empty file')
    return new Blob([bytes as unknown as BlobPart], { type: mimeForExtension(request.extension) })
  } catch (error) {
    console.error('[FFmpeg executeComposition Export Hatası]', error, { logs })
    cancelRender()
    throw formatExportError(error, logs)
  } finally {
    instance.off('log', onLog)
    instance.off('progress', onProgress)
    if (engine === instance) {
      await withTimeout(
        (async () => {
          await instance.deleteFile(output).catch(() => undefined)
          await instance.deleteFile(concatListFile).catch(() => undefined)
          for (const part of partFiles) {
            await instance.deleteFile(part).catch(() => undefined)
          }
          for (const f of tempOverlayFiles) {
            await instance.deleteFile(f).catch(() => undefined)
          }
        })(),
        2000,
        'cleanup timeout',
      ).catch(() => undefined)
    }
  }
}

async function execute(request: RenderRequest): Promise<Blob> {
  const pieces = request.pieces
  if (pieces && (pieces.length > 1 || pieces[0]?.kind === 'gap')) {
    return executeComposition(request, pieces)
  }
  return executeSingle(request)
}

export function renderClip(request: RenderRequest): Promise<Blob> {
  const run = chain.then(
    () => execute(request),
    () => execute(request),
  )
  chain = run.catch(() => undefined)
  return run
}

export function previewCommand(request: Omit<RenderRequest, 'file' | 'onProgress'>): string {
  const args = buildFfmpegArgs({
    input: 'input.mp4',
    output: `clip.${request.extension}`,
    start: request.start,
    end: request.end,
    settings: request.settings,
    sourceHeight: request.sourceHeight,
  })
  return `ffmpeg ${args.map((arg) => (arg.includes(' ') ? `"${arg}"` : arg)).join(' ')}`
}
