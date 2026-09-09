// Copies the ffmpeg.wasm core into public/ so the app works fully offline.
import { copyFile, mkdir, access } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const source = join(root, 'node_modules', '@ffmpeg', 'core', 'dist', 'esm')
const target = join(root, 'public', 'ffmpeg')
const files = ['ffmpeg-core.js', 'ffmpeg-core.wasm']

try {
  await access(source)
} catch {
  console.warn('[clipr] @ffmpeg/core not installed yet, skipping core copy')
  process.exit(0)
}

await mkdir(target, { recursive: true })
for (const file of files) {
  await copyFile(join(source, file), join(target, file))
}
console.log(`[clipr] ffmpeg core copied to public/ffmpeg`)
