import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CONFIG_PATH = path.join(__dirname, 'config.json');

class SettingsManager {
  constructor() {
    this.config = this.loadConfig();
  }

  loadConfig() {
    try {
      const configData = fs.readFileSync(CONFIG_PATH, 'utf8');
      return JSON.parse(configData);
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
      }
    };
  }

  saveConfig() {
    try {
      console.log('Saving config to:', CONFIG_PATH);
      const jsonString = JSON.stringify(this.config, null, 2);
      fs.writeFileSync(CONFIG_PATH, jsonString, 'utf8');
      console.log('Config saved successfully');
      return true;
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
    console.log('Config after save:', this.config);
    return result;
  }
}

export default new SettingsManager();
