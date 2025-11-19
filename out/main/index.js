"use strict";
const electron = require("electron");
const path = require("path");
const utils = require("@electron-toolkit/utils");
const socket_io = require("socket.io");
const events = require("events");
const fs = require("fs");
function _interopNamespaceDefault(e) {
  const n = Object.create(null, { [Symbol.toStringTag]: { value: "Module" } });
  if (e) {
    for (const k in e) {
      if (k !== "default") {
        const d = Object.getOwnPropertyDescriptor(e, k);
        Object.defineProperty(n, k, d.get ? d : {
          enumerable: true,
          get: () => e[k]
        });
      }
    }
  }
  n.default = e;
  return Object.freeze(n);
}
const fs__namespace = /* @__PURE__ */ _interopNamespaceDefault(fs);
class Socket extends events.EventEmitter {
  constructor(config2, saveSettings2) {
    super();
    this.config = config2;
    this.saveSettings = saveSettings2;
    this.io = new socket_io.Server({
      cors: {
        origin: "*"
      }
    });
    this.io.on("connection", (socket) => {
      this.sendSettings();
      socket.on("getSettings", () => {
        this.sendSettings();
      });
      socket.on("saveSettings", (settings) => {
        this.saveSettings(settings);
      });
      socket.on("stream", (stream) => {
        this.emit("stream", stream);
      });
    });
    this.io.listen(4e3);
  }
  sendSettings() {
    this.io.emit("settings", this.config);
  }
  sendReverse(reverse) {
    this.io.emit("reverse", reverse);
  }
  sendLights(lights) {
    this.io.emit("lights", lights);
  }
}
const { Carplay, DEFAULT_CONFIG } = require("node-carplay/node");
let mainWindow;
let carplay = null;
const appPath = electron.app.getPath("userData");
const configPath = appPath + "/config.json";
console.log("Config path:", configPath);
let config;
const DEFAULT_BINDINGS = {
  left: "ArrowLeft",
  right: "ArrowRight",
  selectDown: "Space",
  back: "Backspace",
  down: "ArrowDown",
  home: "KeyH",
  play: "KeyP",
  pause: "KeyO",
  next: "KeyM",
  prev: "KeyN"
};
const EXTRA_CONFIG = {
  ...DEFAULT_CONFIG,
  dongleMode: true,
  // CRITICAL: This must be true for Carlinkit dongles
  kiosk: false,
  camera: "",
  microphone: "",
  piMost: false,
  canbus: false,
  bindings: DEFAULT_BINDINGS,
  most: {},
  canConfig: {}
};
const saveSettings = (settings) => {
  console.log("Saving settings:", settings);
  fs__namespace.writeFileSync(configPath, JSON.stringify(settings, null, 2));
  electron.app.relaunch();
  electron.app.exit();
};
function loadConfig() {
  try {
    if (fs__namespace.existsSync(configPath)) {
      const loadedConfig = JSON.parse(fs__namespace.readFileSync(configPath, "utf-8"));
      const configKeys = JSON.stringify(Object.keys({ ...loadedConfig }).sort());
      const defaultKeys = JSON.stringify(Object.keys({ ...EXTRA_CONFIG }).sort());
      if (configKeys !== defaultKeys) {
        console.log("Config schema mismatch, updating...");
        const mergedConfig = { ...EXTRA_CONFIG, ...loadedConfig };
        fs__namespace.writeFileSync(configPath, JSON.stringify(mergedConfig, null, 2));
        return mergedConfig;
      }
      console.log("Config loaded successfully");
      return loadedConfig;
    } else {
      console.log("No config found, creating default config");
      fs__namespace.writeFileSync(configPath, JSON.stringify(EXTRA_CONFIG, null, 2));
      return EXTRA_CONFIG;
    }
  } catch (error) {
    console.error("Error loading config:", error);
    return EXTRA_CONFIG;
  }
}
config = loadConfig();
console.log("Loaded config:", JSON.stringify(config, null, 2));
new Socket(config, saveSettings);
const handleSettingsReq = () => {
  console.log("Settings request received");
  mainWindow?.webContents.send("settings", config);
};
electron.app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
electron.app.commandLine.appendSwitch("enable-experimental-web-platform-features");
function createWindow() {
  mainWindow = new electron.BrowserWindow({
    width: 1280,
    // CarPlay typically uses 1280x720 or 800x480
    height: 720,
    kiosk: false,
    show: false,
    frame: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: false,
      nodeIntegration: true,
      nodeIntegrationInWorker: true,
      webSecurity: false
    }
  });
  mainWindow.webContents.session.setPermissionCheckHandler(() => true);
  mainWindow.webContents.session.setDevicePermissionHandler((details) => {
    console.log("USB device permission request:", details.device);
    if (details.device.vendorId === 4884) {
      console.log("Carlinkit dongle detected, granting permission");
      return true;
    }
    if (details.device.vendorId === 1452) {
      console.log("Apple device detected, granting permission");
      return true;
    }
    return false;
  });
  mainWindow.webContents.session.on("select-usb-device", (event, details, callback) => {
    event.preventDefault();
    console.log("USB devices available:", details.deviceList);
    let selectedDevice = details.deviceList.find(
      (device) => device.vendorId === 4884
    );
    if (!selectedDevice) {
      selectedDevice = details.deviceList.find(
        (device) => device.vendorId === 1452 && (device.productId === 4776 || device.productId === 4777)
      );
    }
    if (selectedDevice) {
      console.log("Auto-selecting USB device:", selectedDevice);
      callback(selectedDevice.deviceId);
    } else {
      console.log("No CarPlay-compatible device found");
      callback();
    }
  });
  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
  });
  mainWindow.webContents.setWindowOpenHandler((details) => {
    electron.shell.openExternal(details.url);
    return { action: "deny" };
  });
  if (utils.is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"] + "/carplay-renderer.html");
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/carplay-renderer.html"));
  }
  if (process.platform === "darwin") {
    const { systemPreferences } = require("electron");
    systemPreferences.askForMediaAccess("microphone");
  }
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    details.responseHeaders["Cross-Origin-Opener-Policy"] = ["same-origin"];
    details.responseHeaders["Cross-Origin-Embedder-Policy"] = ["require-corp"];
    callback({ responseHeaders: details.responseHeaders });
  });
}
electron.app.whenReady().then(() => {
  utils.electronApp.setAppUserModelId("com.electron");
  console.log("Initializing CarPlay...");
  console.log("Config dongleMode:", config?.dongleMode);
  try {
    carplay = new Carplay(config);
    console.log("✓ CarPlay instance created successfully");
    carplay.start();
    console.log("✓ CarPlay started, waiting for device connection...");
    carplay.onmessage = (message) => {
      console.log("CarPlay message:", message.type);
      switch (message.type) {
        case "audio":
          mainWindow?.webContents.send("audioData", message.message);
          break;
        case "frame":
          mainWindow?.webContents.send("videoFrame", message.message);
          break;
        case "media":
          mainWindow?.webContents.send("mediaEvent", message.message);
          break;
        case "plugged":
          console.log("✓ CarPlay device connected!");
          mainWindow?.webContents.send("carplayStatus", { connected: true });
          break;
        case "unplugged":
          console.log("✗ CarPlay device disconnected");
          mainWindow?.webContents.send("carplayStatus", { connected: false });
          break;
        default:
          console.log("Unhandled message type:", message.type);
      }
    };
    carplay.onerror = (error) => {
      console.error("CarPlay error:", error);
      mainWindow?.webContents.send("carplayError", error);
    };
  } catch (error) {
    console.error("✗ Failed to initialize CarPlay:", error);
  }
  electron.session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "require-corp"
      }
    });
  });
  electron.ipcMain.on("getSettings", handleSettingsReq);
  electron.ipcMain.on("saveSettings", (_event, settings) => {
    saveSettings(settings);
  });
  electron.ipcMain.on("quit", quit);
  electron.ipcMain.on("carplay-touch", (_event, touchData) => {
    if (carplay) {
      carplay.sendTouch(touchData.action, touchData.x, touchData.y);
    }
  });
  electron.ipcMain.on("carplay-key", (_event, keyData) => {
    if (carplay) {
      carplay.sendKey(keyData.action);
    }
  });
  electron.ipcMain.on("carplay-status", () => {
    mainWindow?.webContents.send("carplayStatus", {
      connected: carplay?.connected || false,
      dongleMode: config?.dongleMode
    });
  });
  electron.app.on("browser-window-created", (_, window) => {
    utils.optimizer.watchWindowShortcuts(window);
  });
  createWindow();
  electron.app.on("activate", function() {
    if (electron.BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
const quit = () => {
  if (carplay) {
    console.log("Stopping CarPlay...");
    try {
      carplay.stop();
    } catch (error) {
      console.error("Error stopping CarPlay:", error);
    }
    carplay = null;
  }
  electron.app.quit();
};
electron.app.on("window-all-closed", () => {
  if (carplay) {
    try {
      carplay.stop();
    } catch (error) {
      console.error("Error stopping CarPlay:", error);
    }
    carplay = null;
  }
  if (process.platform !== "darwin") {
    electron.app.quit();
  }
});
