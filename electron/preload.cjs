const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("dillingerDesktop", {
  isDesktop: true,
  platform: process.platform,
  openFile: () => ipcRenderer.invoke("file:open"),
  saveFile: (request) => ipcRenderer.invoke("file:save", request),
  writeFile: (request) => ipcRenderer.invoke("file:write", request),
  confirmUnsavedChanges: () => ipcRenderer.invoke("app:confirm-unsaved-changes"),
  confirmClose: (shouldClose) => ipcRenderer.invoke("app:confirm-close", shouldClose),
  quit: () => ipcRenderer.invoke("app:quit"),
  onMenuAction: (callback) => {
    const listener = (_event, action) => callback(action);
    ipcRenderer.on("app:menu-action", listener);
    return () => ipcRenderer.removeListener("app:menu-action", listener);
  },
  onRequestClose: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("app:request-close", listener);
    return () => ipcRenderer.removeListener("app:request-close", listener);
  },
});
