// The only bridge between the page and the desktop shell.

const { contextBridge, ipcRenderer, webUtils } = require('electron')

const progress = new Map()

ipcRenderer.on('clipr:progress', (_event, message) => {
  progress.get(message.id)?.(message.ratio)
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
  reveal: (target) => ipcRenderer.invoke('clipr:reveal', target),

  minimize: () => ipcRenderer.invoke('clipr:window', 'minimize'),
  close: () => ipcRenderer.invoke('clipr:window', 'close'),
})
