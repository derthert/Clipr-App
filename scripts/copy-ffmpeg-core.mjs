// Copies the ffmpeg.wasm core into public/ so the app works fully offline.
import { copyFile, mkdir, access } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
// Single-threaded core, plus the multi-threaded one used on cross-origin isolated pages.
const cores = [
  { pkg: 'core', target: ['ffmpeg'], files: ['ffmpeg-core.js', 'ffmpeg-core.wasm'] },
  {
    pkg: 'core-mt',
    target: ['ffmpeg', 'mt'],
    files: ['ffmpeg-core.js', 'ffmpeg-core.wasm', 'ffmpeg-core.worker.js'],
  },
]

for (const core of cores) {
  const source = join(root, 'node_modules', '@ffmpeg', core.pkg, 'dist', 'esm')
  const target = join(root, 'public', ...core.target)
  try {
    await access(source)
  } catch {
    console.warn(`[clipr] @ffmpeg/${core.pkg} not installed yet, skipping core copy`)
    continue
  }
  await mkdir(target, { recursive: true })
  for (const file of core.files) {
    await copyFile(join(source, file), join(target, file))
  }
  console.log(`[clipr] @ffmpeg/${core.pkg} copied to public/${core.target.join('/')}`)
}
