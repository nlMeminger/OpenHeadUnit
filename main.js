import { app, BrowserWindow, ipcMain, session } from 'electron';
import { exec, spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import settingsManager from './src/js/settings-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let mainWindow;
let rtlProcess = null;
let audioProcess = null;

app.whenReady().then(() => {
  const windowSettings = settingsManager.get('window');

  mainWindow = new BrowserWindow({
    width: windowSettings.width,
    height: windowSettings.height,
    fullscreen: windowSettings.fullscreen,
    titleBarStyle: 'hvisibleidden',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
    }
  });

  // Handle WebUSB device selection
  mainWindow.webContents.session.on('select-usb-device', (event, details, callback) => {
    event.preventDefault();
    
    console.log('USB device selection requested');
    console.log('Available devices:', details.deviceList);
    
    if (details.deviceList && details.deviceList.length > 0) {
      // Find CarPlay dongle
      const carplayDongle = details.deviceList.find(device => 
        (device.vendorId === 0x1314 && (device.productId === 0x1520 || device.productId === 0x1521))
      );
      
      if (carplayDongle) {
        console.log('Found CarPlay dongle:', carplayDongle);
        callback(carplayDongle.deviceId);
      } else {
        console.log('CarPlay dongle not found, showing first device');
        callback(details.deviceList[0].deviceId);
      }
    } else {
      console.log('No USB devices found');
      callback('');
    }
  });

  // Handle USB device permission check
  mainWindow.webContents.session.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
    if (permission === 'usb') {
      console.log('USB permission check requested');
      return true;
    }
    if (permission === 'media') {
      console.log('Media permission check requested');
      return true;
    }
    return false;
  });

  // Handle USB device permission requests
  mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback, details) => {
    if (permission === 'usb') {
      console.log('USB permission request granted');
      callback(true);
    } else if (permission === 'media') {
      console.log('Media (microphone/camera) permission request granted');
      callback(true);
    } else {
      console.log('Permission request denied:', permission);
      callback(false);
    }
  });

  // Handle device added/removed events
  mainWindow.webContents.session.on('usb-device-added', (event, device) => {
    console.log('USB device added:', device);
  });

  mainWindow.webContents.session.on('usb-device-removed', (event, device) => {
    console.log('USB device removed:', device);
  });

  mainWindow.loadFile('index.html');

});

// Output volume (speakers/headphones)
ipcMain.on('set-output-volume', (event, volume) => {
  exec(`pactl set-sink-volume @DEFAULT_SINK@ ${volume}%`, (err) => {
    if (err) console.error('Output volume error:', err);
  });
});

// Input volume (microphone)
ipcMain.on('set-input-volume', (event, volume) => {
  exec(`pactl set-source-volume @DEFAULT_SOURCE@ ${volume}%`, (err) => {
    if (err) console.error('Input volume error:', err);
  });
});

// Mute controls
ipcMain.on('toggle-output-mute', (event) => {
  exec(`pactl set-sink-mute @DEFAULT_SINK@ toggle`, (err) => {
    if (err) console.error('Output mute error:', err);
  });
});

ipcMain.on('toggle-input-mute', (event) => {
  exec(`pactl set-source-mute @DEFAULT_SOURCE@ toggle`, (err) => {
    if (err) console.error('Input mute error:', err);
  });
});

// Brightness control
ipcMain.on('set-brightness', (event, brightness) => {
  exec(`brightnessctl set ${brightness}%`, (err) => {
    if (err) console.error('Brightness error:', err);
  });
});

// RTL-SDR Radio Control
function stopRadio() {
  if (rtlProcess) {
    console.log('Stopping RTL-FM process...');
    rtlProcess.kill('SIGTERM');
    rtlProcess = null;
  }
  if (audioProcess) {
    console.log('Stopping audio process...');
    audioProcess.kill('SIGTERM');
    audioProcess = null;
  }
}

ipcMain.on('tune-radio', (event, frequency) => {
  console.log(`Tuning to ${frequency} MHz`);
  
  stopRadio();
  
  const frequencyHz = Math.round(frequency * 1000000);
  
  rtlProcess = spawn('rtl_fm', [
    '-f', frequencyHz.toString(),
    '-M', 'wbfm',
    '-s', '200000',
    '-r', '48000',
    '-g', '40',
    '-E', 'deemp',
    '-'
  ], {
    stdio: ['ignore', 'pipe', 'pipe']
  });

  audioProcess = spawn('play', [
    '-t', 'raw',
    '-r', '48000',
    '-e', 'signed-integer',
    '-b', '16',
    '-c', '1',
    '-V1',
    '-q',
    '-'
  ], {
    stdio: ['pipe', 'inherit', 'pipe']
  });

  if (rtlProcess.stdout && audioProcess.stdin) {
    rtlProcess.stdout.pipe(audioProcess.stdin);
    
    rtlProcess.stdout.on('error', (err) => {
      console.error('RTL-FM stdout error:', err);
    });
    
    audioProcess.stdin.on('error', (err) => {
      console.error('Audio stdin error:', err);
    });
  }

  rtlProcess.stderr.on('data', (data) => {
    console.log(`RTL-FM: ${data.toString().trim()}`);
  });

  audioProcess.stderr.on('data', (data) => {
    console.log(`Play: ${data.toString().trim()}`);
  });

  rtlProcess.on('error', (err) => {
    console.error('RTL-FM process error:', err);
    event.reply('radio-error', 'Failed to start RTL-SDR. Is it connected?');
    stopRadio();
  });

  audioProcess.on('error', (err) => {
    console.error('Audio process error:', err);
    event.reply('radio-error', 'Failed to start audio playback');
    stopRadio();
  });

  rtlProcess.on('exit', (code, signal) => {
    console.log(`RTL-FM exited with code ${code}, signal ${signal}`);
    if (code !== 0 && code !== null) {
      event.reply('radio-error', 'RTL-FM stopped unexpectedly');
    }
  });

  audioProcess.on('exit', (code, signal) => {
    console.log(`Play exited with code ${signal}`);
  });

  console.log('RTL-FM and Play processes started');
});

ipcMain.on('stop-radio', () => {
  stopRadio();
});

ipcMain.on('test-rtlsdr', (event) => {
  exec('rtl_test -t', { timeout: 3000 }, (err, stdout, stderr) => {
    if (err) {
      event.reply('rtlsdr-status', { connected: false, error: err.message });
    } else {
      const connected = !stdout.includes('No supported devices found');
      event.reply('rtlsdr-status', { connected, output: stdout });
    }
  });
});

app.on('window-all-closed', () => {
  stopRadio();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  stopRadio();
});

// Settings IPC handlers
ipcMain.on('get-settings', (event) => {
  event.returnValue = settingsManager.getAll();
});

ipcMain.on('get-setting', (event, key) => {
  event.returnValue = settingsManager.get(key);
});

ipcMain.on('set-setting', (event, key, value) => {
  const success = settingsManager.set(key, value);
  event.returnValue = success;
});

ipcMain.on('update-settings', (event, updates) => {
  settingsManager.updateMultiple(updates);
  event.returnValue = true;
});

// Exit app handler
ipcMain.on('exit-app', () => {
  stopRadio();
  app.quit();
});

// Notify renderer about settings updates
ipcMain.on('notify-settings-updated', (event) => {
  const settings = settingsManager.getAll();
  mainWindow.webContents.send('settings-updated', settings);
});