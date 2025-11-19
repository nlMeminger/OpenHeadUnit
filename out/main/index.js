"use strict";
const electron = require("electron");
const path = require("path");
const utils = require("@electron-toolkit/utils");
const Carplay = require("node-carplay/node");
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
let mainWindow;
let carplay = null;
const appPath = electron.app.getPath("userData");
const configPath = appPath + "/config.json";
console.log(configPath);
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
  ...Carplay.DEFAULT_CONFIG,
  kiosk: false,
  camera: "",
  microphone: "",
  piMost: false,
  canbus: false,
  bindings: DEFAULT_BINDINGS,
  most: {},
  canConfig: {}
};
fs__namespace.exists(configPath, (exists) => {
  if (exists) {
    config = JSON.parse(fs__namespace.readFileSync(configPath).toString());
    const configKeys = JSON.stringify(Object.keys({ ...config }).sort());
    const defaultKeys = JSON.stringify(Object.keys({ ...EXTRA_CONFIG }).sort());
    if (configKeys !== defaultKeys) {
      console.log("config updating");
      config = { ...EXTRA_CONFIG, ...config };
      console.log("new config", config);
      fs__namespace.writeFileSync(configPath, JSON.stringify(config));
    }
    console.log("config read");
  } else {
    fs__namespace.writeFileSync(configPath, JSON.stringify(EXTRA_CONFIG));
    config = JSON.parse(fs__namespace.readFileSync(configPath).toString());
    console.log("config created and read");
  }
  new Socket(config, saveSettings);
});
const handleSettingsReq = () => {
  console.log("settings request");
  mainWindow?.webContents.send("settings", config);
};
electron.app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
electron.app.commandLine.appendSwitch("disable-webusb-security", "true");
console.log(electron.app.commandLine.hasSwitch("disable-webusb-security"));
function createWindow() {
  mainWindow = new electron.BrowserWindow({
    width: 800,
    height: 600,
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
  electron.app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
  mainWindow.webContents.session.setPermissionCheckHandler(() => {
    return true;
  });
  mainWindow.webContents.session.setDevicePermissionHandler((details) => {
    if (details.device.vendorId === 4884) {
      return true;
    } else {
      return false;
    }
  });
  mainWindow.webContents.session.on("select-usb-device", (event, details, callback) => {
    event.preventDefault();
    const selectedDevice = details.deviceList.find((device) => {
      return device.vendorId === 4884 && (device.productId === 5408 || device.productId === 5409);
    });
    callback(selectedDevice?.deviceId);
  });
  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
  });
  mainWindow.webContents.setWindowOpenHandler((details) => {
    electron.shell.openExternal(details.url);
    return { action: "deny" };
  });
  if (utils.is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
  electron.app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
  electron.systemPreferences.askForMediaAccess("microphone");
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    details.responseHeaders["Cross-Origin-Opener-Policy"] = ["same-origin"];
    details.responseHeaders["Cross-Origin-Embedder-Policy"] = ["require-corp"];
    callback({ responseHeaders: details.responseHeaders });
  });
}
electron.app.commandLine.appendSwitch("enable-experimental-web-platform-features");
electron.app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
electron.app.whenReady().then(() => {
  utils.electronApp.setAppUserModelId("com.electron");
  if (config) {
    console.log("Initializing CarPlay with config:", config);
    try {
      carplay = new Carplay(config);
      console.log("CarPlay instance created successfully");
      carplay.start();
      console.log("CarPlay started");
      carplay.onmessage = (message) => {
        console.log("CarPlay message received:", message.type);
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
            console.log("CarPlay device plugged in");
            mainWindow?.webContents.send("carplayStatus", { connected: true });
            break;
          case "unplugged":
            console.log("CarPlay device unplugged");
            mainWindow?.webContents.send("carplayStatus", { connected: false });
            break;
          default:
            console.log("Unhandled CarPlay message type:", message.type);
        }
      };
      carplay.onerror = (error) => {
        console.error("CarPlay error:", error);
        mainWindow?.webContents.send("carplayError", error);
      };
    } catch (error) {
      console.error("Failed to initialize CarPlay:", error);
    }
  } else {
    console.warn("Config not loaded yet, CarPlay not initialized");
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
      console.log("Sending touch to CarPlay:", touchData);
      carplay.sendTouch(touchData.action, touchData.x, touchData.y);
    }
  });
  electron.ipcMain.on("carplay-key", (_event, keyData) => {
    if (carplay) {
      console.log("Sending key to CarPlay:", keyData.action);
      carplay.sendKey(keyData.action);
    }
  });
  electron.ipcMain.on("carplay-status", () => {
    if (carplay) {
      mainWindow?.webContents.send("carplayStatus", {
        connected: carplay.connected,
        dongleMode: config?.dongleMode
      });
    } else {
      mainWindow?.webContents.send("carplayStatus", {
        connected: false,
        dongleMode: config?.dongleMode
      });
    }
  });
  electron.app.on("browser-window-created", (_, window) => {
    utils.optimizer.watchWindowShortcuts(window);
  });
  createWindow();
  electron.app.on("activate", function() {
    if (electron.BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
const saveSettings = (settings) => {
  console.log("saving settings", settings);
  fs__namespace.writeFileSync(configPath, JSON.stringify(settings));
  electron.app.relaunch();
  electron.app.exit();
};
const quit = () => {
  if (carplay) {
    console.log("Stopping CarPlay");
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
    console.log("Stopping CarPlay on window close");
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
