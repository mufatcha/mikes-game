// Gives the game page a few desktop-only buttons (Quit, full screen).
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("schoolWarsDesktop", {
  quit: () => ipcRenderer.send("quit"),
  toggleFullscreen: () => ipcRenderer.send("toggle-fullscreen"),
  retry: () => ipcRenderer.send("retry"),
});
