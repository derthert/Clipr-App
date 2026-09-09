// A thin band under the editor that only shows up once there is something rendering.

import type { ExportJob } from '../types'
import type { EngineStatus } from '../lib/ffmpeg'
import { desktop } from '../lib/desktop'
import { downloadBlobUrl, formatBytes } from '../lib/file'
import { formatDuration } from '../lib/time'
import { IconClose, IconDownload, IconFolder, IconRetry, IconTrash } from './icons'

const STATUS_LABEL: Record<ExportJob['status'], string> = {
  queued: 'Waiting',
  running: 'Rendering',
  done: 'Ready',
  error: 'Failed',
  canceled: 'Canceled',
}

interface QueueStripProps {
  jobs: ExportJob[]
  engine: EngineStatus
  onCancel: (id: string) => void
  onRetry: (id: string) => void
  onRemove: (id: string) => void
  onClearFinished: () => void
}

export function QueueStrip({
  jobs,
  engine,
  onCancel,
  onRetry,
  onRemove,
  onClearFinished,
}: QueueStripProps) {
  if (!jobs.length) return null
  const finished = jobs.filter((job) => job.status !== 'queued' && job.status !== 'running').length

  return (
    <section className="queue">
      <header className="queue__head">
        <h2>Clips</h2>
        {engine === 'loading' ? <span className="queue__note">starting the engine…</span> : null}
        {finished ? (
          <button type="button" className="button button--ghost button--sm" onClick={onClearFinished}>
            Clear finished
          </button>
        ) : null}
      </header>

      <ul className="queue__list">
        {jobs.map((job) => (
          <li key={job.id} className="jobrow" data-status={job.status}>
            <span className="jobrow__dot" aria-hidden="true" />
            <span className="jobrow__name" title={job.fileName}>
              {job.fileName}
            </span>
            <span className="jobrow__meta">
              {formatDuration(job.end - job.start)}
              {job.size ? ` · ${formatBytes(job.size)}` : ''}
            </span>
            <span className="jobrow__status">
              {job.status === 'running' ? `${Math.round(job.progress * 100)}%` : STATUS_LABEL[job.status]}
            </span>

            <span className="jobrow__actions">
              {job.status === 'done' && job.path ? (
                <button
                  type="button"
                  className="iconbutton iconbutton--sm"
                  title={`Show in folder — ${job.path}`}
                  onClick={() => void desktop?.reveal(job.path as string)}
                >
                  <IconFolder size={15} />
                </button>
              ) : null}
              {job.status === 'done' && job.url ? (
                <button
                  type="button"
                  className="iconbutton iconbutton--sm"
                  title="Save again"
                  onClick={() => downloadBlobUrl(job.url as string, job.fileName)}
                >
                  <IconDownload size={15} />
                </button>
              ) : null}
              {job.status === 'error' || job.status === 'canceled' ? (
                <button
                  type="button"
                  className="iconbutton iconbutton--sm"
                  title="Try again"
                  onClick={() => onRetry(job.id)}
                >
                  <IconRetry size={15} />
                </button>
              ) : null}
              {job.status === 'queued' || job.status === 'running' ? (
                <button
                  type="button"
                  className="iconbutton iconbutton--sm"
                  title="Cancel"
                  onClick={() => onCancel(job.id)}
                >
                  <IconClose size={15} />
                </button>
              ) : (
                <button
                  type="button"
                  className="iconbutton iconbutton--sm"
                  title="Remove"
                  onClick={() => onRemove(job.id)}
                >
                  <IconTrash size={15} />
                </button>
              )}
            </span>

            {job.status === 'running' ? (
              <span className="jobrow__progress">
                <span style={{ width: `${Math.max(3, job.progress * 100)}%` }} />
              </span>
            ) : null}
            {job.error ? <span className="jobrow__error">{job.error}</span> : null}
          </li>
        ))}
      </ul>
    </section>
  )
}
