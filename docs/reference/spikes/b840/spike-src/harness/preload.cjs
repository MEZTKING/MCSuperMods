// B840 harness preload (sandboxed): S10's change notices and metrics.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('spikeBridge', {
  onPluginChanged(cb) { ipcRenderer.on('spike:plugin-changed', (_e, m) => cb(m)); },
  metrics() { return ipcRenderer.invoke('spike:metrics'); },
});
