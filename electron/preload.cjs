const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('desktop', {
  platform: process.platform,
  onMenuAction: (handler) => {
    const listener = (_event, payload) => handler(payload)
    ipcRenderer.on('menu-action', listener)
    return () => ipcRenderer.removeListener('menu-action', listener)
  },
  openFolderDialog: () => ipcRenderer.invoke('dialog:openFolder'),
  openImageFilesDialog: () => ipcRenderer.invoke('dialog:openImages'),
  saveTextFileDialog: (payload) => ipcRenderer.invoke('dialog:saveMarkdown', payload),
  listTree: (rootPath) => ipcRenderer.invoke('fs:listTree', { rootPath }),
  readTextFile: (payload) => ipcRenderer.invoke('fs:readTextFile', payload),
  writeTextFile: (payload) => ipcRenderer.invoke('fs:writeTextFile', payload),
  mkdir: (payload) => ipcRenderer.invoke('fs:mkdir', payload),
  importFiles: (payload) => ipcRenderer.invoke('fs:importFiles', payload),
  deleteEntry: (payload) => ipcRenderer.invoke('fs:deleteEntry', payload),
  readFileAsDataUrl: (payload) => ipcRenderer.invoke('fs:readFileAsDataUrl', payload),
  writeBase64FileUnique: (payload) => ipcRenderer.invoke('fs:writeBase64FileUnique', payload),
  rename: (payload) => ipcRenderer.invoke('fs:rename', payload),
})
