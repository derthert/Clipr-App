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

export interface DesktopBridge {
  version: string
  pathForFile: (file: File) => string
  run: (request: DesktopRunRequest, onProgress?: (ratio: number) => void) => Promise<DesktopRunResult>
  cancel: (id: string) => Promise<boolean>
  reveal: (target: string) => Promise<void>
}

declare global {
  interface Window {
    clipr?: DesktopBridge
  }
}

export const desktop: DesktopBridge | undefined =
  typeof window === 'undefined' ? undefined : window.clipr

export const isDesktop = Boolean(desktop)
