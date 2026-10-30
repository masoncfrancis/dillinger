const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("dillingerDesktop", {
  isDesktop: true,
  platform: process.platform,
  openFile: () => ipcRenderer.invoke("file:open"),
  saveFile: (request) => ipcRenderer.invoke("file:save", request),
});
