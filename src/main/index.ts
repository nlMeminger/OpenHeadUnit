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
// FIXED: Correct import - use Carplay, not CarplayNode
const { Carplay, DEFAULT_CONFIG } = require('node-carplay/node')
import { Socket } from './Socket'
import * as fs from 'fs'

import { ExtraConfig, KeyBindings } from './Globals'

// Define CarplayMessage interface
interface CarplayMessage {
  type: 'audio' | 'frame' | 'media' | 'plugged' | 'unplugged' | string
  message?: any
}

let mainWindow: BrowserWindow
let carplay: any | null = null

// User data directory path
const appPath: string = app.getPath('userData')
const configPath: string = appPath + '/config.json'
console.log('Config path:', configPath)
let config: null | ExtraConfig

// Default keyboard mappings
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

// Extended configuration with proper defaults
const EXTRA_CONFIG: ExtraConfig = {
  ...DEFAULT_CONFIG,
  dongleMode: true,  // CRITICAL: This must be true for Carlinkit dongles
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

// FIXED: Declare saveSettings BEFORE it's used
const saveSettings = (settings: ExtraConfig): void => {
  console.log('Saving settings:', settings)
  fs.writeFileSync(configPath, JSON.stringify(settings, null, 2))
  app.relaunch()
  app.exit()
}

// FIXED: Load config synchronously
function loadConfig(): ExtraConfig {
  try {
    if (fs.existsSync(configPath)) {
      const loadedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      
      // Validate and merge with defaults
      const configKeys = JSON.stringify(Object.keys({ ...loadedConfig }).sort())
      const defaultKeys = JSON.stringify(Object.keys({ ...EXTRA_CONFIG }).sort())
      
      if (configKeys !== defaultKeys) {
        console.log('Config schema mismatch, updating...')
        const mergedConfig = { ...EXTRA_CONFIG, ...loadedConfig }
        fs.writeFileSync(configPath, JSON.stringify(mergedConfig, null, 2))
        return mergedConfig
      }
      
      console.log('Config loaded successfully')
      return loadedConfig
    } else {
      console.log('No config found, creating default config')
      fs.writeFileSync(configPath, JSON.stringify(EXTRA_CONFIG, null, 2))
      return EXTRA_CONFIG
    }
  } catch (error) {
    console.error('Error loading config:', error)
    return EXTRA_CONFIG
  }
}

// Load config immediately at startup
config = loadConfig()
console.log('Loaded config:', JSON.stringify(config, null, 2))

// Initialize Socket after config is loaded AND saveSettings is declared
socket = new Socket(config, saveSettings)

// Handle settings request
const handleSettingsReq = (): void => {
  console.log('Settings request received')
  mainWindow?.webContents.send('settings', config)
}

// Enable autoplay and WebUSB
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
app.commandLine.appendSwitch('enable-experimental-web-platform-features')

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,  // CarPlay typically uses 1280x720 or 800x480
    height: 720,
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

  // Grant all permission requests
  mainWindow.webContents.session.setPermissionCheckHandler(() => true)

  // CRITICAL: Update USB device permissions for Carlinkit dongles
  // Carlinkit vendor ID is 0x1314 (4884 decimal)
  // Product IDs: 0x1520-0x1529 for different Carlinkit models
  mainWindow.webContents.session.setDevicePermissionHandler((details) => {
    console.log('USB device permission request:', details.device)
    
    // Allow Carlinkit dongles (vendor ID 0x1314)
    if (details.device.vendorId === 0x1314) {
      console.log('Carlinkit dongle detected, granting permission')
      return true
    }
    
    // Also allow Apple devices for direct CarPlay (vendor ID 0x05AC = 1452 decimal)
    if (details.device.vendorId === 0x05AC) {
      console.log('Apple device detected, granting permission')
      return true
    }
    
    return false
  })

  // Auto-select USB devices
  mainWindow.webContents.session.on('select-usb-device', (event, details, callback) => {
    event.preventDefault()
    console.log('USB devices available:', details.deviceList)
    
    // First try to find Carlinkit dongle
    let selectedDevice = details.deviceList.find((device) => 
      device.vendorId === 0x1314
    )
    
    // If no Carlinkit, look for Apple device
    if (!selectedDevice) {
      selectedDevice = details.deviceList.find((device) => 
        device.vendorId === 0x05AC && 
        (device.productId === 0x12A8 || device.productId === 0x12A9)
      )
    }
    
    if (selectedDevice) {
      console.log('Auto-selecting USB device:', selectedDevice)
      callback(selectedDevice.deviceId)
    } else {
      console.log('No CarPlay-compatible device found')
      callback()
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Load renderer - use carplay-renderer.html
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'] + '/carplay-renderer.html')
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/carplay-renderer.html'))
  }

  // Request microphone permission on macOS
  if (process.platform === 'darwin') {
    const { systemPreferences } = require('electron')
    systemPreferences.askForMediaAccess('microphone')
  }

  // Set COOP/COEP headers
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    details.responseHeaders!['Cross-Origin-Opener-Policy'] = ['same-origin']
    details.responseHeaders!['Cross-Origin-Embedder-Policy'] = ['require-corp']
    callback({ responseHeaders: details.responseHeaders })
  })
}

// App ready handler
app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.electron')

  // ============= CARPLAY INITIALIZATION =============
  console.log('Initializing CarPlay...')
  console.log('Config dongleMode:', config?.dongleMode)
  
  try {
    // FIXED: Use correct class name 'Carplay'
    carplay = new Carplay(config!)
    console.log('✓ CarPlay instance created successfully')

    // Start CarPlay
    carplay.start()
    console.log('✓ CarPlay started, waiting for device connection...')

    // Handle CarPlay messages
    carplay.onmessage = (message: CarplayMessage) => {
      console.log('CarPlay message:', message.type)

      switch (message.type) {
        case 'audio':
          mainWindow?.webContents.send('audioData', message.message)
          break

        case 'frame':
          mainWindow?.webContents.send('videoFrame', message.message)
          break

        case 'media':
          mainWindow?.webContents.send('mediaEvent', message.message)
          break

        case 'plugged':
          console.log('✓ CarPlay device connected!')
          mainWindow?.webContents.send('carplayStatus', { connected: true })
          break

        case 'unplugged':
          console.log('✗ CarPlay device disconnected')
          mainWindow?.webContents.send('carplayStatus', { connected: false })
          break

        default:
          console.log('Unhandled message type:', message.type)
      }
    }

    // Handle CarPlay errors
    carplay.onerror = (error: any) => {
      console.error('CarPlay error:', error)
      mainWindow?.webContents.send('carplayError', error)
    }
  } catch (error) {
    console.error('✗ Failed to initialize CarPlay:', error)
  }
  // ============= END CARPLAY INITIALIZATION =============

  // Set global COOP/COEP headers
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp'
      }
    })
  })

  // IPC handlers
  ipcMain.on('getSettings', handleSettingsReq)
  ipcMain.on('saveSettings', (_event: IpcMainEvent, settings: ExtraConfig) => {
    saveSettings(settings)
  })
  ipcMain.on('quit', quit)

  // CarPlay IPC handlers
  ipcMain.on('carplay-touch', (_event: IpcMainEvent, touchData: {
    x: number,
    y: number,
    action: 'down' | 'move' | 'up'
  }) => {
    if (carplay) {
      carplay.sendTouch(touchData.action, touchData.x, touchData.y)
    }
  })

  ipcMain.on('carplay-key', (_event: IpcMainEvent, keyData: { action: string }) => {
    if (carplay) {
      carplay.sendKey(keyData.action)
    }
  })

  ipcMain.on('carplay-status', () => {
    mainWindow?.webContents.send('carplayStatus', {
      connected: carplay?.connected || false,
      dongleMode: config?.dongleMode
    })
  })

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

const quit = (): void => {
  if (carplay) {
    console.log('Stopping CarPlay...')
    try {
      carplay.stop()
    } catch (error) {
      console.error('Error stopping CarPlay:', error)
    }
    carplay = null
  }
  app.quit()
}

app.on('window-all-closed', () => {
  if (carplay) {
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