// Reads the shared ffmpeg engine status without pulling it into React state twice.

import { useSyncExternalStore } from 'react'
import { getEngineStatus, subscribeEngine, type EngineStatus } from '../lib/ffmpeg'

export function useEngineStatus(): EngineStatus {
  return useSyncExternalStore(subscribeEngine, getEngineStatus, () => 'idle' as const)
}
