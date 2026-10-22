// The only bridge between the page and the desktop shell.

const { contextBridge, ipcRenderer, webUtils } = require('electron')

const progress = new Map()

ipcRenderer.on('clipr:progress', (_event, message) => {
  progress.get(message.id)?.(message.ratio)
})

const output = new Map()

ipcRenderer.on('clipr:workspace-output', (_event, message) => {
  output.get(message.id)?.(message)
})

contextBridge.exposeInMainWorld('clipr', {
  version: process.versions.electron,

  pathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file)
    } catch {
      return ''
    }
  },

  run: (request, onProgress) => {
    if (onProgress) progress.set(request.id, onProgress)
    return ipcRenderer.invoke('clipr:run', request).finally(() => progress.delete(request.id))
  },

  cancel: (id) => ipcRenderer.invoke('clipr:cancel', id),

  workspace: {
    open: (id) => ipcRenderer.invoke('clipr:workspace-open', id),
    write: (id, name, bytes) => ipcRenderer.invoke('clipr:workspace-write', id, name, bytes),
    remove: (id, name) => ipcRenderer.invoke('clipr:workspace-delete', id, name),
    exec: (id, args, onOutput) => {
      if (onOutput) output.set(id, onOutput)
      return ipcRenderer.invoke('clipr:workspace-exec', id, args).finally(() => output.delete(id))
    },
    finish: (id, name, fileName, sourcePath) =>
      ipcRenderer.invoke('clipr:workspace-finish', id, name, fileName, sourcePath),
    close: (id) => ipcRenderer.invoke('clipr:workspace-close', id),
  },
  reveal: (target) => ipcRenderer.invoke('clipr:reveal', target),

  minimize: () => ipcRenderer.invoke('clipr:window', 'minimize'),
  close: () => ipcRenderer.invoke('clipr:window', 'close'),
})
