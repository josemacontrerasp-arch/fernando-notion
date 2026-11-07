// Exposes a small, safe API to the app (window.fnApi).
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("fnApi", {
  isElectron: true,
  load: () => ipcRenderer.invoke("ws:load"),
  save: (payload) => ipcRenderer.invoke("ws:save", payload),
  saveSync: (payload) => ipcRenderer.sendSync("ws:saveSync", payload),
  saveAsset: (name, data) => ipcRenderer.invoke("asset:save", { name, data }),
  readAsset: (url) => ipcRenderer.invoke("asset:read", url),
  info: () => ipcRenderer.invoke("app:info"),
  openDataDir: () => ipcRenderer.invoke("dir:open"),
  chooseDataDir: () => ipcRenderer.invoke("dir:choose"),
  exportFile: (opts) => ipcRenderer.invoke("file:export", opts),
  exportPdf: (opts) => ipcRenderer.invoke("file:exportPdf", opts),
  importFile: (opts) => ipcRenderer.invoke("file:import", opts || {}),
  listBackups: () => ipcRenderer.invoke("backup:list"),
  readBackup: (name) => ipcRenderer.invoke("backup:read", name),
  backupNow: () => ipcRenderer.invoke("backup:now"),
  openExternal: (url) => ipcRenderer.invoke("shell:openExternal", url),
  onFlush: (cb) => {
    ipcRenderer.removeAllListeners("app:flush");
    ipcRenderer.on("app:flush", async () => {
      try {
        await cb();
      } finally {
        ipcRenderer.send("app:flushed");
      }
    });
  },
  onMenu: (cb) => {
    ipcRenderer.removeAllListeners("menu");
    ipcRenderer.on("menu", (_e, action) => cb(action));
  },
});
