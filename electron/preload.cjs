const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("dillingerDesktop", {
  isDesktop: true,
  platform: process.platform,
});
