// Add these to your existing preload.js file

const { contextBridge, ipcRenderer } = require('electron');

// Add to your existing contextBridge.exposeInMainWorld or create new one
contextBridge.exposeInMainWorld('electronAPI', {
  // ... your existing APIs ...
  
  // Music folder selection
  selectMusicFolder: () => ipcRenderer.invoke('select-music-folder'),
  getMusicFiles: (folderPath) => ipcRenderer.invoke('get-music-files', folderPath)
});