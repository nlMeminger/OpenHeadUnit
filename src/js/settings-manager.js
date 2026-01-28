import fs from 'fs';
import path from 'path';
import os from 'os';
import yaml from 'js-yaml';

// Linux-specific config path: ~/.openheadunit/config/config.yaml
const CONFIG_DIR = path.join(os.homedir(), '.openheadunit', 'config');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.yaml');

class SettingsManager {
  constructor() {
    this.ensureConfigDirectory();
    this.config = this.loadConfig();
  }

  ensureConfigDirectory() {
    try {
      if (!fs.existsSync(CONFIG_DIR)) {
        fs.mkdirSync(CONFIG_DIR, { recursive: true });
        console.log('Created config directory:', CONFIG_DIR);
      }
    } catch (error) {
      console.error('Failed to create config directory:', error);
    }
  }

  loadConfig() {
    try {
      if (fs.existsSync(CONFIG_PATH)) {
        const fileContents = fs.readFileSync(CONFIG_PATH, 'utf8');
        const config = yaml.load(fileContents);
        console.log('Config loaded from:', CONFIG_PATH);
        return config;
      } else {
        console.log('No existing config found, using defaults');
        const defaultConfig = this.getDefaultConfig();
        this.saveConfigInternal(defaultConfig);
        return defaultConfig;
      }
    } catch (error) {
      console.error('Failed to load config:', error);
      return this.getDefaultConfig();
    }
  }

  getDefaultConfig() {
    return {
      window: {
        width: 1200,
        height: 720,
        fullscreen: false
      },
      audio: {
        outputVolume: 50,
        inputVolume: 50,
        microphoneEnabled: true,
        microphoneSettings: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000,
          channelCount: 1
        }
      },
      display: {
        brightness: 80
      },
      radio: {
        presets: [
          { number: 1, frequency: 88.5 },
          { number: 2, frequency: 95.7 },
          { number: 3, frequency: 101.1 },
          { number: 4, frequency: 104.3 },
          { number: 5, frequency: 106.7 },
          { number: 6, frequency: 107.9 }
        ],
        defaultFrequency: 87.5
      },
      carplay: {
        width: null,
        height: null
      },
      music: {
        folderPath: null
      },
      navigation: {
        gpsSource: 'mock',           // mock | gpsd | serial
        serialPort: '/dev/ttyUSB0',
        serialBaudRate: 9600,
        osrmMode: 'online',          // local | online
        osrmServerUrl: 'http://localhost:5000',
        voiceEnabled: true,
        voiceVolume: 80,
        voiceLang: 'en-US',
        mapStyle: 'dark',            // dark | light
        orientation: 'heading',      // heading | north
        autoFollow: true,
        tilesPath: null              // Path to offline tiles
      }
    };
  }

  saveConfigInternal(config) {
    try {
      this.ensureConfigDirectory();
      const yamlStr = yaml.dump(config, {
        indent: 2,
        lineWidth: -1,
        noRefs: true
      });
      fs.writeFileSync(CONFIG_PATH, yamlStr, 'utf8');
      return true;
    } catch (error) {
      console.error('Failed to save config:', error);
      return false;
    }
  }

  saveConfig() {
    try {
      console.log('Saving config to:', CONFIG_PATH);
      const result = this.saveConfigInternal(this.config);
      
      if (result) {
        console.log('Config saved successfully');
        
        // Verify the save
        const readBack = yaml.load(fs.readFileSync(CONFIG_PATH, 'utf8'));
        console.log('Verified saved config');
      }
      
      return result;
    } catch (error) {
      console.error('Failed to save config:', error);
      console.error('Error details:', error.message);
      console.error('Config path:', CONFIG_PATH);
      return false;
    }
  }

  get(key) {
    const keys = key.split('.');
    let value = this.config;
    for (const k of keys) {
      value = value[k];
      if (value === undefined) return undefined;
    }
    return value;
  }

  set(key, value) {
    const keys = key.split('.');
    let target = this.config;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!target[keys[i]]) {
        target[keys[i]] = {};
      }
      target = target[keys[i]];
    }
    target[keys[keys.length - 1]] = value;
    return this.saveConfig();
  }

  getAll() {
    return { ...this.config };
  }

  updateMultiple(updates) {
    console.log('Updating multiple settings:', updates);
    for (const [key, value] of Object.entries(updates)) {
      const keys = key.split('.');
      let target = this.config;
      for (let i = 0; i < keys.length - 1; i++) {
        if (!target[keys[i]]) {
          target[keys[i]] = {};
        }
        target = target[keys[i]];
      }
      target[keys[keys.length - 1]] = value;
    }
    const result = this.saveConfig();
    console.log('Save result:', result);
    return result;
  }

  getConfigPath() {
    return CONFIG_PATH;
  }
}

export default new SettingsManager();