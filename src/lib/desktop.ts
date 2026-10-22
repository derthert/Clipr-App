// Typed view of the bridge the Electron shell injects. Undefined in a plain browser.

export interface DesktopRunRequest {
  id: string
  args: string[]
  sourcePath: string
  fileName: string
  duration: number
}

export interface DesktopRunResult {
  ok: boolean
  path?: string
  size?: number
  error?: string
  canceled?: boolean
}

/** stderr lines and the latest output time (seconds) from a workspace ffmpeg run. */
export interface WorkspaceOutput {
  logs: string[]
  time?: number
}

export interface WorkspaceExecResult {
  code: number
  canceled?: boolean
  error?: string
}

/** A temp folder per export job; ffmpeg runs inside it, so files are referred to by name. */
export interface DesktopWorkspace {
  open: (id: string) => Promise<void>
  write: (id: string, name: string, bytes: Uint8Array) => Promise<void>
  remove: (id: string, name: string) => Promise<void>
  exec: (
    id: string,
    args: string[],
    onOutput?: (output: WorkspaceOutput) => void,
  ) => Promise<WorkspaceExecResult>
  finish: (
    id: string,
    name: string,
    fileName: string,
    sourcePath?: string,
  ) => Promise<{ path: string; size: number }>
  close: (id: string) => Promise<void>
}

export interface DesktopBridge {
  version: string
  pathForFile: (file: File) => string
  run: (request: DesktopRunRequest, onProgress?: (ratio: number) => void) => Promise<DesktopRunResult>
  cancel: (id: string) => Promise<boolean>
  workspace: DesktopWorkspace
  reveal: (target: string) => Promise<void>
  minimize: () => Promise<void>
  close: () => Promise<void>
}

declare global {
  interface Window {
    clipr?: DesktopBridge
  }
}

export const desktop: DesktopBridge | undefined =
  typeof window === 'undefined' ? undefined : window.clipr

export const isDesktop = Boolean(desktop)
