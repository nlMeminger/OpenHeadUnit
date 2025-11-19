"use strict";
const electron = require("electron");
const preload = require("@electron-toolkit/preload");
const api = {
  // Existing APIs
  settings: (callback) => electron.ipcRenderer.on("settings", callback),
  reverse: (callback) => electron.ipcRenderer.on("reverse", callback),
  getSettings: () => electron.ipcRenderer.send("getSettings"),
  saveSettings: (settings) => electron.ipcRenderer.send("saveSettings", settings),
  quit: () => electron.ipcRenderer.send("quit"),
  // Stream API (if you use it for MOST)
  stream: (stream) => electron.ipcRenderer.send("startStream", stream),
  // ============= CARPLAY APIs =============
  // Send touch events to CarPlay
  carplayTouch: (x, y, action) => {
    electron.ipcRenderer.send("carplay-touch", { x, y, action });
  },
  // Send keyboard/control events to CarPlay
  carplayKey: (action) => {
    electron.ipcRenderer.send("carplay-key", { action });
  },
  // Request current CarPlay status
  carplayStatus: () => {
    electron.ipcRenderer.send("carplay-status");
  },
  // Listen for audio data from CarPlay
  onAudioData: (callback) => {
    electron.ipcRenderer.on("audioData", callback);
  },
  // Listen for video frames from CarPlay
  onVideoFrame: (callback) => {
    electron.ipcRenderer.on("videoFrame", callback);
  },
  // Listen for media control events
  onMediaEvent: (callback) => {
    electron.ipcRenderer.on("mediaEvent", callback);
  },
  // Listen for CarPlay connection status changes
  onCarplayStatus: (callback) => {
    electron.ipcRenderer.on("carplayStatus", callback);
  },
  // Listen for CarPlay errors
  onCarplayError: (callback) => {
    electron.ipcRenderer.on("carplayError", callback);
  }
};
try {
  electron.contextBridge.exposeInMainWorld("electron", preload.electronAPI);
  electron.contextBridge.exposeInMainWorld("api", api);
  electron.contextBridge.exposeInMainWorld("electronAPI", {
    // Existing APIs
    settings: (callback) => electron.ipcRenderer.on("settings", callback),
    getSettings: () => electron.ipcRenderer.send("getSettings"),
    saveSettings: (settings) => electron.ipcRenderer.send("saveSettings", settings),
    quit: () => electron.ipcRenderer.send("quit"),
    // CarPlay APIs
    carplayTouch: (x, y, action) => electron.ipcRenderer.send("carplay-touch", { x, y, action }),
    carplayKey: (action) => electron.ipcRenderer.send("carplay-key", { action }),
    carplayStatus: () => electron.ipcRenderer.send("carplay-status"),
    onAudioData: (callback) => electron.ipcRenderer.on("audioData", callback),
    onVideoFrame: (callback) => electron.ipcRenderer.on("videoFrame", callback),
    onMediaEvent: (callback) => electron.ipcRenderer.on("mediaEvent", callback),
    onCarplayStatus: (callback) => electron.ipcRenderer.on("carplayStatus", callback),
    onCarplayError: (callback) => electron.ipcRenderer.on("carplayError", callback)
  });
  console.log("Preload script loaded successfully with CarPlay APIs");
} catch (error) {
  console.error("Error in preload script:", error);
}
