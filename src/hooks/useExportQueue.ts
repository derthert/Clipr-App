// Owns the export queue: one clip renders at a time, the rest wait their turn.

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ExportJob } from '../types'
import { CanceledError, cancelRender, renderClip } from '../lib/engine'
import { downloadBlobUrl } from '../lib/file'

export type JobDraft = Omit<ExportJob, 'id' | 'status' | 'progress'>

const PROGRESS_THROTTLE = 120

function createId(): string {
  return crypto.randomUUID?.() ?? `job-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message
  return typeof error === 'string' ? error : 'Export failed'
}

export function useExportQueue() {
  const [jobs, setJobs] = useState<ExportJob[]>([])
  const jobsRef = useRef<ExportJob[]>([])
  const runningRef = useRef(false)
  const canceledRef = useRef(new Set<string>())

  jobsRef.current = jobs

  const update = useCallback((id: string, changes: Partial<ExportJob>) => {
    setJobs((list) => list.map((job) => (job.id === id ? { ...job, ...changes } : job)))
  }, [])

  useEffect(() => {
    if (runningRef.current) return
    const next = jobs.find((job) => job.status === 'queued')
    if (!next) return

    runningRef.current = true
    let lastTick = 0
    update(next.id, { status: 'running', progress: 0, error: undefined })

    renderClip({
      id: next.id,
      file: next.file,
      sourcePath: next.sourcePath,
      fileName: next.fileName,
      start: next.start,
      end: next.end,
      settings: next.settings,
      extension: next.extension,
      sourceHeight: next.sourceHeight,
      onProgress: (ratio) => {
        const now = performance.now()
        if (now - lastTick < PROGRESS_THROTTLE && ratio < 1) return
        lastTick = now
        update(next.id, { progress: ratio })
      },
    })
      .then((result) => {
        update(next.id, {
          status: 'done',
          progress: 1,
          url: result.url,
          path: result.path,
          size: result.size,
        })
        if (result.url) downloadBlobUrl(result.url, next.fileName)
      })
      .catch((error: unknown) => {
        const canceled = canceledRef.current.delete(next.id) || error instanceof CanceledError
        update(next.id, {
          status: canceled ? 'canceled' : 'error',
          error: canceled ? undefined : messageOf(error),
        })
      })
      .finally(() => {
        runningRef.current = false
      })
  }, [jobs, update])

  useEffect(
    () => () => {
      for (const job of jobsRef.current) if (job.url) URL.revokeObjectURL(job.url)
    },
    [],
  )

  const enqueue = useCallback((draft: JobDraft) => {
    const job: ExportJob = { ...draft, id: createId(), status: 'queued', progress: 0 }
    setJobs((list) => [...list, job])
    return job
  }, [])

  const cancel = useCallback(
    (id: string) => {
      const job = jobsRef.current.find((item) => item.id === id)
      if (!job) return
      if (job.status === 'running') {
        canceledRef.current.add(id)
        cancelRender(id)
      } else if (job.status === 'queued') {
        update(id, { status: 'canceled' })
      }
    },
    [update],
  )

  const retry = useCallback(
    (id: string) => update(id, { status: 'queued', progress: 0, error: undefined }),
    [update],
  )

  const remove = useCallback((id: string) => {
    setJobs((list) => {
      const target = list.find((job) => job.id === id)
      if (target?.url) URL.revokeObjectURL(target.url)
      return list.filter((job) => job.id !== id)
    })
  }, [])

  const clearFinished = useCallback(() => {
    setJobs((list) =>
      list.filter((job) => {
        const finished = job.status === 'done' || job.status === 'canceled' || job.status === 'error'
        if (finished && job.url) URL.revokeObjectURL(job.url)
        return !finished
      }),
    )
  }, [])

  const pending = jobs.filter((job) => job.status === 'queued' || job.status === 'running').length

  return { jobs, pending, enqueue, cancel, retry, remove, clearFinished }
}
