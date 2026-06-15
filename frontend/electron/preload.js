const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  getVersion:   ()        => ipcRenderer.invoke('get-version'),
  getPlatform:  ()        => ipcRenderer.invoke('get-platform'),
  openExternal: (url)     => ipcRenderer.invoke('open-external', url),
  setupStatus:  ()        => ipcRenderer.invoke('setup-status'),
  installDeps:  (python)  => ipcRenderer.invoke('install-deps', python),
  setupComplete:()        => ipcRenderer.invoke('setup-complete'),
  setupAbort:   ()        => ipcRenderer.invoke('setup-abort'),
})
