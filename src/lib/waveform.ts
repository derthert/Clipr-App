// Boils a video's audio track down to a few hundred peaks for the timeline.

const SAMPLE_RATE = 8000
const MAX_BYTES = 500 * 1024 * 1024

interface WaveformOptions {
  file: File
  buckets: number
  signal: AbortSignal
}

// Resolves to null when the file is silent, too large to decode in memory, or aborted.
export async function extractPeaks({ file, buckets, signal }: WaveformOptions): Promise<Float32Array | null> {
  if (file.size > MAX_BYTES) return null

  const bytes = await file.arrayBuffer()
  if (signal.aborted) return null

  let audio: AudioBuffer
  try {
    audio = await new OfflineAudioContext(1, 1, SAMPLE_RATE).decodeAudioData(bytes)
  } catch {
    return null
  }
  if (signal.aborted || audio.length === 0) return null

  const samples = audio.getChannelData(0)
  const peaks = new Float32Array(buckets)
  const step = samples.length / buckets
  let loudest = 0

  for (let bucket = 0; bucket < buckets; bucket += 1) {
    const end = Math.min(samples.length, Math.floor((bucket + 1) * step))
    let peak = 0
    for (let index = Math.floor(bucket * step); index < end; index += 1) {
      const value = Math.abs(samples[index])
      if (value > peak) peak = value
    }
    peaks[bucket] = peak
    if (peak > loudest) loudest = peak
  }

  if (loudest === 0) return null
  for (let bucket = 0; bucket < buckets; bucket += 1) peaks[bucket] /= loudest
  return peaks
}
