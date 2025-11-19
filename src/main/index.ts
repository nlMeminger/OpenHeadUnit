import {
  app,
  shell,
  BrowserWindow,
  session,
  IpcMainEvent,
  ipcMain
} from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
// FIX: Use require for node-carplay module
const { CarplayNode, DEFAULT_CONFIG } = require('node-carplay/node')
import { Socket } from './Socket'
import * as fs from 'fs'

import { ExtraConfig, KeyBindings } from './Globals'

import { ExtraConfig, KeyBindings } from './Globals'

// Define CarplayMessage interface since it might not be exported
interface CarplayMessage {
  type: 'audio' | 'frame' | 'media' | 'plugged' | 'unplugged' | string
  message?: any
}

let mainWindow: BrowserWindow
// FIX: Use 'any' type since we don't have proper type definitions
let carplay: any | null = null

// User data directory path for storing persistent configuration
const appPath: string = app.getPath('userData')
const configPath: string = appPath + '/config.json'
console.log(configPath)
let config: null | ExtraConfig

// Default keyboard mappings for CarPlay controls
const DEFAULT_BINDINGS: KeyBindings = {
  left: 'ArrowLeft',
  right: 'ArrowRight',
  selectDown: 'Space',
  back: 'Backspace',
  down: 'ArrowDown',
  home: 'KeyH',
  play: 'KeyP',
  pause: 'KeyO',
  next: 'KeyM',
  prev: 'KeyN'
}

// Extended configuration merging CarPlay defaults with app-specific settings
const EXTRA_CONFIG: ExtraConfig = {
  ...DEFAULT_CONFIG,
  kiosk: false,
  camera: '',
  microphone: '',
  piMost: false,
  canbus: false,
  bindings: DEFAULT_BINDINGS,
  most: {},
  canConfig: {}
}

let socket: null | Socket

// Load or create configuration file on startup
fs.exists(configPath, (exists) => {
  if (exists) {
    // Read existing configuration
    config = JSON.parse(fs.readFileSync(configPath).toString())

    // Validate config structure matches current schema
    const configKeys = JSON.stringify(Object.keys({ ...config }).sort())
    const defaultKeys = JSON.stringify(Object.keys({ ...EXTRA_CONFIG }).sort())

    // Merge missing keys from default config if schema has changed
    if (configKeys !== defaultKeys) {
      console.log('config updating')
      config = { ...EXTRA_CONFIG, ...config }
      console.log('new config', config)
      fs.writeFileSync(configPath, JSON.stringify(config))
    }
    console.log('config read')
  } else {
    // Create default configuration file if none exists
    fs.writeFileSync(configPath, JSON.stringify(EXTRA_CONFIG))
    config = JSON.parse(fs.readFileSync(configPath).toString())
    console.log('config created and read')
  }

  // Initialize WebSocket server with loaded configuration
  socket = new Socket(config!, saveSettings)
})

// Handle settings request from renderer process
const handleSettingsReq = (): void => {
  console.log('settings request')
  mainWindow?.webContents.send('settings', config)
}

// Enable autoplay for audio/video without user gesture requirement
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
// Disable WebUSB security for CarPlay device access
app.commandLine.appendSwitch('disable-webusb-security', 'true')
console.log(app.commandLine.hasSwitch('disable-webusb-security'))

function createWindow(): void {
  // Create main application window
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    kiosk: false,
    show: false,
    frame: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      nodeIntegration: true,
      nodeIntegrationInWorker: true,
      webSecurity: false
    }
  })

  app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

  // Grant all permission requests (for media devices)
  mainWindow.webContents.session.setPermissionCheckHandler(() => {
    return true
  })

  // Filter USB device access to Apple devices only (CarPlay)
  // Vendor ID 4884 = Apple Inc.
  mainWindow.webContents.session.setDevicePermissionHandler((details) => {
    if (details.device.vendorId === 4884) {
      return true
    } else {
      return false
    }
  })

  // Auto-select CarPlay USB device when detected
  // Product IDs 5408/5409 are CarPlay-capable iOS devices
  mainWindow.webContents.session.on('select-usb-device', (event, details, callback) => {
    event.preventDefault()
    const selectedDevice = details.deviceList.find((device) => {
      return device.vendorId === 4884 && (device.productId === 5408 || device.productId === 5409)
    })

    callback(selectedDevice?.deviceId)
  })

  // Display window once content is loaded
  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // Open external links in system browser instead of app
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

  // Request microphone permission on startup (macOS only)
if (process.platform === 'darwin') {
  const { systemPreferences } = require('electron')
  systemPreferences.askForMediaAccess('microphone')
}

  // Set COOP/COEP headers for SharedArrayBuffer support
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    details.responseHeaders!['Cross-Origin-Opener-Policy'] = ['same-origin']
    details.responseHeaders!['Cross-Origin-Embedder-Policy'] = ['require-corp']
    callback({ responseHeaders: details.responseHeaders })
  })
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.commandLine.appendSwitch('enable-experimental-web-platform-features')
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // ============= CARPLAY INITIALIZATION =============
  if (config) {
    console.log('Initializing CarPlay with config:', config)
    
    try {
      // FIX: Use Carplay (default import) instead of CarplayNode
carplay = new CarplayNode(config)
      console.log('CarPlay instance created successfully')

      // Start CarPlay connection
      carplay.start()
      console.log('CarPlay started')

      // Handle CarPlay messages
      carplay.onmessage = (message: CarplayMessage) => {
        console.log('CarPlay message received:', message.type)

        switch (message.type) {
          case 'audio':
            // Send audio data to renderer process
            mainWindow?.webContents.send('audioData', message.message)
            break

          case 'frame':
            // Send video frame data to renderer
            mainWindow?.webContents.send('videoFrame', message.message)
            break

          case 'media':
            // Handle media control events
            mainWindow?.webContents.send('mediaEvent', message.message)
            break

          case 'plugged':
            // Device connected
            console.log('CarPlay device plugged in')
            mainWindow?.webContents.send('carplayStatus', { connected: true })
            break

          case 'unplugged':
            // Device disconnected
            console.log('CarPlay device unplugged')
            mainWindow?.webContents.send('carplayStatus', { connected: false })
            break

          default:
            console.log('Unhandled CarPlay message type:', message.type)
        }
      }

      // Handle CarPlay errors
      carplay.onerror = (error: any) => {
        console.error('CarPlay error:', error)
        mainWindow?.webContents.send('carplayError', error)
      }
    } catch (error) {
      console.error('Failed to initialize CarPlay:', error)
    }
  } else {
    console.warn('Config not loaded yet, CarPlay not initialized')
  }
  // ============= END CARPLAY INITIALIZATION =============

  // Set COOP/COEP headers globally for all requests
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp'
      }
    })
  })

  ipcMain.on('getSettings', handleSettingsReq)

  ipcMain.on('saveSettings', (_event: IpcMainEvent, settings: ExtraConfig) => {
    saveSettings(settings)
  })

  ipcMain.on('quit', quit)

  // ============= CARPLAY IPC HANDLERS =============
  // Send touch events to CarPlay
  ipcMain.on('carplay-touch', (_event: IpcMainEvent, touchData: {
    x: number,
    y: number,
    action: 'down' | 'move' | 'up'
  }) => {
    if (carplay) {
      console.log('Sending touch to CarPlay:', touchData)
      carplay.sendTouch(touchData.action, touchData.x, touchData.y)
    }
  })

  // Send keyboard events to CarPlay
  ipcMain.on('carplay-key', (_event: IpcMainEvent, keyData: {
    action: string
  }) => {
    if (carplay) {
      console.log('Sending key to CarPlay:', keyData.action)
      carplay.sendKey(keyData.action)
    }
  })

  // Request CarPlay status
  ipcMain.on('carplay-status', () => {
    if (carplay) {
      mainWindow?.webContents.send('carplayStatus', {
        connected: carplay.connected,
        dongleMode: config?.dongleMode
      })
    } else {
      mainWindow?.webContents.send('carplayStatus', {
        connected: false,
        dongleMode: config?.dongleMode
      })
    }
  })
  // ============= END CARPLAY IPC HANDLERS =============

  // Default open or close DevTools by F12 in development
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Save settings to disk and restart application to apply changes
const saveSettings = (settings: ExtraConfig): void => {
  console.log('saving settings', settings)
  fs.writeFileSync(configPath, JSON.stringify(settings))
  app.relaunch()
  app.exit()
}

// Handle quit request from renderer process
const quit = (): void => {
  if (carplay) {
    console.log('Stopping CarPlay')
    try {
      carplay.stop()
    } catch (error) {
      console.error('Error stopping CarPlay:', error)
    }
    carplay = null
  }
  app.quit()
}

// Quit when all windows are closed, except on macOS.
app.on('window-all-closed', () => {
  if (carplay) {
    console.log('Stopping CarPlay on window close')
    try {
      carplay.stop()
    } catch (error) {
      console.error('Error stopping CarPlay:', error)
    }
    carplay = null
  }
  if (process.platform !== 'darwin') {
    app.quit()
  }
})