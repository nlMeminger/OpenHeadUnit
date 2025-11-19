// Example: src/preload/index.ts with CarPlay APIs
import { IpcRendererEvent, contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { ExtraConfig } from '../main/Globals'
import { Stream } from 'socketmost/dist/modules/Messages'

type ApiCallback = (event: IpcRendererEvent, ...args: unknown[]) => void

export interface Api {
  // Existing APIs
  settings: (callback: ApiCallback) => void
  reverse: (callback: ApiCallback) => void
  getSettings: () => void
  saveSettings: (settings: ExtraConfig) => void
  stream: (stream: Stream) => void
  quit: () => void
  
  // CarPlay Control APIs
  carplayTouch: (x: number, y: number, action: 'down' | 'move' | 'up') => void
  carplayKey: (action: string) => void
  carplayStatus: () => void
  
  // CarPlay Event Listeners
  onAudioData: (callback: ApiCallback) => void
  onVideoFrame: (callback: ApiCallback) => void
  onMediaEvent: (callback: ApiCallback) => void
  onCarplayStatus: (callback: ApiCallback) => void
  onCarplayError: (callback: ApiCallback) => void
}

// Custom APIs for renderer
const api: Api = {
  // Existing APIs
  settings: (callback: ApiCallback) => ipcRenderer.on('settings', callback),
  reverse: (callback: ApiCallback) => ipcRenderer.on('reverse', callback),
  getSettings: () => ipcRenderer.send('getSettings'),
  saveSettings: (settings: ExtraConfig) => ipcRenderer.send('saveSettings', settings),
  quit: () => ipcRenderer.send('quit'),
  
  // Stream API (if you use it for MOST)
  stream: (stream: Stream) => ipcRenderer.send('startStream', stream),
  
  // ============= CARPLAY APIs =============
  
  // Send touch events to CarPlay
  carplayTouch: (x: number, y: number, action: 'down' | 'move' | 'up') => {
    ipcRenderer.send('carplay-touch', { x, y, action })
  },
  
  // Send keyboard/control events to CarPlay
  carplayKey: (action: string) => {
    ipcRenderer.send('carplay-key', { action })
  },
  
  // Request current CarPlay status
  carplayStatus: () => {
    ipcRenderer.send('carplay-status')
  },
  
  // Listen for audio data from CarPlay
  onAudioData: (callback: ApiCallback) => {
    ipcRenderer.on('audioData', callback)
  },
  
  // Listen for video frames from CarPlay
  onVideoFrame: (callback: ApiCallback) => {
    ipcRenderer.on('videoFrame', callback)
  },
  
  // Listen for media control events
  onMediaEvent: (callback: ApiCallback) => {
    ipcRenderer.on('mediaEvent', callback)
  },
  
  // Listen for CarPlay connection status changes
  onCarplayStatus: (callback: ApiCallback) => {
    ipcRenderer.on('carplayStatus', callback)
  },
  
  // Listen for CarPlay errors
  onCarplayError: (callback: ApiCallback) => {
    ipcRenderer.on('carplayError', callback)
  }
}

try {
  // Expose Electron APIs
  contextBridge.exposeInMainWorld('electron', electronAPI)
  
  // Expose custom APIs
  contextBridge.exposeInMainWorld('api', api)
  
  // Also expose as electronAPI for compatibility
  contextBridge.exposeInMainWorld('electronAPI', {
    // Existing APIs
    settings: (callback: ApiCallback) => ipcRenderer.on('settings', callback),
    getSettings: () => ipcRenderer.send('getSettings'),
    saveSettings: (settings: ExtraConfig) => ipcRenderer.send('saveSettings', settings),
    quit: () => ipcRenderer.send('quit'),
    
    // CarPlay APIs
    carplayTouch: (x: number, y: number, action: 'down' | 'move' | 'up') =>
      ipcRenderer.send('carplay-touch', { x, y, action }),
    carplayKey: (action: string) =>
      ipcRenderer.send('carplay-key', { action }),
    carplayStatus: () =>
      ipcRenderer.send('carplay-status'),
    onAudioData: (callback: ApiCallback) =>
      ipcRenderer.on('audioData', callback),
    onVideoFrame: (callback: ApiCallback) =>
      ipcRenderer.on('videoFrame', callback),
    onMediaEvent: (callback: ApiCallback) =>
      ipcRenderer.on('mediaEvent', callback),
    onCarplayStatus: (callback: ApiCallback) =>
      ipcRenderer.on('carplayStatus', callback),
    onCarplayError: (callback: ApiCallback) =>
      ipcRenderer.on('carplayError', callback)
  })
  
  console.log('Preload script loaded successfully with CarPlay APIs')
} catch (error) {
  console.error('Error in preload script:', error)
}