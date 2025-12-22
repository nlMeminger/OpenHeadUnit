import { DongleDriver, DEFAULT_CONFIG, PhoneType, decodeTypeMap } from '../carplay/index.js';
import { EventEmitter } from '../carplay/eventEmitter.js';


class CarPlayManager extends EventEmitter {
  constructor() {
    super();
    this.driver = null;
    this.device = null;
    this.isConnected = false;
    this.videoCanvas = null;
    this.audioContext = null;
    this.videoDecoder = null;
    this.frameCount = 0;
    this.micStream = null;
    this.micProcessor = null;

    // Load settings from config
    let settings = null;
    try {
      const { ipcRenderer } = require('electron');
      settings = ipcRenderer.sendSync('get-settings');
    } catch (error) {
      console.warn('Could not load settings, using defaults:', error);
    }

    // Use window dimensions for CarPlay resolution, with config override if set
    const carplayWidth = settings?.carplay?.width || window.innerWidth;
    const carplayHeight = settings?.carplay?.height || window.innerHeight;

    this.config = {
      ...DEFAULT_CONFIG,
      width: carplayWidth,
      height: carplayHeight,
    };

    this.settings = settings;
  }

  async requestDevice() {
    try {
      console.log('Checking WebUSB support...');

      if (!navigator.usb) {
        throw new Error('WebUSB not supported in this environment');
      }

      console.log('Requesting USB device with filters:', DongleDriver.knownDevices);

      const devices = await navigator.usb.getDevices();
      console.log('Already authorized devices:', devices);

      if (devices.length > 0) {
        const carplayDevice = devices.find(d =>
          (d.vendorId === 0x1314 && (d.productId === 0x1520 || d.productId === 0x1521))
        );

        if (carplayDevice) {
          console.log('Found previously authorized CarPlay device:', carplayDevice);
          this.device = carplayDevice;
          return carplayDevice;
        }
      }

      console.log('Showing device picker dialog...');
      const device = await navigator.usb.requestDevice({
        filters: DongleDriver.knownDevices
      });

      console.log('User selected device:', device);
      this.device = device;
      return device;
    } catch (error) {
      console.error('Failed to request USB device:', error);

      if (error.name === 'NotFoundError') {
        throw new Error('No CarPlay dongle found or selected');
      } else if (error.name === 'SecurityError') {
        throw new Error('USB access denied by security policy');
      } else {
        throw new Error(`Device selection failed: ${error.message}`);
      }
    }
  }

  async connect() {
    console.log('CarPlay connect() called');

    if (!this.device) {
      console.log('No device selected, requesting device...');
      await this.requestDevice();
    }

    try {
      console.log('Opening USB device...');
      await this.device.open();
      console.log('Device opened successfully');

      this.driver = new DongleDriver();
      console.log('Initializing dongle driver...');
      await this.driver.initialise(this.device);
      console.log('Driver initialized');

      // Set up message handlers
      this.driver.on('message', this.handleMessage.bind(this));
      this.driver.on('failure', this.handleFailure.bind(this));

      // Start the driver
      console.log('Starting driver with config:', this.config);
      await this.driver.start(this.config);
      console.log('Driver started');

      this.isConnected = true;
      this.emit('connected');

      // Initialize microphone after a delay to let device settle
      setTimeout(async () => {
        await this.initializeMicrophone();
      }, 1500);

      return true;
    } catch (error) {
      console.error('Failed to connect to CarPlay dongle:', error);
      this.emit('error', error.message);
      return false;
    }
  }

  handleMessage(message) {
    const messageType = message.constructor.name;

    switch (messageType) {
      case 'Plugged':
        this.emit('phone-plugged', message);
        console.log('Phone plugged:', message.phoneType);
        break;

      case 'Unplugged':
        this.emit('phone-unplugged');
        console.log('Phone unplugged');
        break;

      case 'VideoData':
        this.handleVideoFrame(message);
        break;

      case 'AudioData':
        this.handleAudioData(message);
        break;

      case 'MediaData':
        this.emit('media-data', message.payload);
        break;

      case 'Command':
        this.emit('command', message.value);
        break;

      case 'Opened':
        console.log('CarPlay opened:', message);
        this.emit('carplay-opened', message);
        break;

      default:
        console.log('Unhandled message:', messageType);
    }
  }

  async initializeVideoDecoder(width, height) {
    if (this.videoDecoder) return;

    console.log('Initializing VideoDecoder with resolution:', width, 'x', height);

    // Check if VideoDecoder is supported
    if (!window.VideoDecoder) {
      console.error('VideoDecoder API not supported in this browser');
      return;
    }

    const canvas = this.videoCanvas;
    const ctx = canvas.getContext('2d');

    // Set canvas to match video resolution
    canvas.width = width;
    canvas.height = height;

    this.videoDecoder = new VideoDecoder({
      output: (frame) => {
        // Draw the decoded frame to the canvas
        try {
          ctx.drawImage(frame, 0, 0, canvas.width, canvas.height);
          frame.close();
        } catch (error) {
          console.error('Error drawing frame:', error);
        }
      },
      error: (error) => {
        console.error('VideoDecoder error:', error);
      }
    });

    // Configure the decoder for H.264
    const config = {
      codec: 'avc1.64001f', // H.264 Baseline Profile Level 3.1
      codedWidth: width,
      codedHeight: height,
      optimizeForLatency: true
    };

    try {
      await this.videoDecoder.configure(config);
      console.log('VideoDecoder configured successfully');
    } catch (error) {
      console.error('Failed to configure VideoDecoder:', error);
      this.videoDecoder = null;
    }
  }

  handleVideoFrame(videoData) {
    if (!this.videoCanvas) return;

    // Initialize decoder on first frame
    if (!this.videoDecoder) {
      this.initializeVideoDecoder(videoData.width, videoData.height);
      if (!this.videoDecoder) {
        // Fallback: show placeholder if decoder fails
        this.showPlaceholder(videoData);
        return;
      }
    }

    try {
      // Create an EncodedVideoChunk from the H.264 data
      const chunk = new EncodedVideoChunk({
        type: (videoData.flags & 1) ? 'key' : 'delta', // Check if it's a keyframe
        timestamp: performance.now() * 1000, // Convert to microseconds
        data: videoData.data
      });

      // Decode the chunk
      this.videoDecoder.decode(chunk);

      // Track FPS
      this.frameCount++;

    } catch (error) {
      console.error('Error decoding video frame:', error);
      // Show placeholder on error
      this.showPlaceholder(videoData);
    }

    this.emit('video-frame', videoData);
  }

  showPlaceholder(videoData) {
    const ctx = this.videoCanvas.getContext('2d');

    if (!this.lastPlaceholderUpdate || Date.now() - this.lastPlaceholderUpdate > 100) {
      this.lastPlaceholderUpdate = Date.now();

      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, this.videoCanvas.width, this.videoCanvas.height);

      ctx.fillStyle = '#ff8800';
      ctx.font = '24px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('⚠️ Video Decoder Unavailable', this.videoCanvas.width / 2, 100);

      ctx.fillStyle = '#888';
      ctx.font = '16px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillText(`Receiving data: ${videoData.width}x${videoData.height}`, this.videoCanvas.width / 2, 140);
      ctx.fillText('WebCodecs API required for video display', this.videoCanvas.width / 2, 170);
    }
  }

  handleAudioData(audioData) {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }

    if (!this.nextAudioTime) {
      this.nextAudioTime = this.audioContext.currentTime;
    }

    if (audioData.data && audioData.data.length > 0) {
      try {
        // Get the correct format from decodeType
        const format = decodeTypeMap[audioData.decodeType] || decodeTypeMap[1];
        const sampleRate = format.frequency;
        const channels = format.channel;

        // Calculate correct buffer size
        const frameCount = audioData.data.length / channels;

        const audioBuffer = this.audioContext.createBuffer(
          channels,
          frameCount,
          sampleRate
        );

        // De-interleave correctly based on channel count
        if (channels === 1) {
          // Mono
          const channelData = audioBuffer.getChannelData(0);
          for (let i = 0; i < frameCount; i++) {
            channelData[i] = audioData.data[i] / 32768.0;
          }
        } else {
          // Stereo
          for (let channel = 0; channel < 2; channel++) {
            const channelData = audioBuffer.getChannelData(channel);
            for (let i = 0; i < frameCount; i++) {
              channelData[i] = audioData.data[i * 2 + channel] / 32768.0;
            }
          }
        }

        // Schedule audio properly to avoid gaps/overlaps
        const source = this.audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this.audioContext.destination);

        // Schedule at the correct time
        const currentTime = this.audioContext.currentTime;
        if (this.nextAudioTime < currentTime) {
          this.nextAudioTime = currentTime;
        }

        source.start(this.nextAudioTime);
        this.nextAudioTime += audioBuffer.duration;

      } catch (error) {
        console.error('Audio playback error:', error);
      }
    }
  }

  async initializeMicrophone() {
    try {
      console.log('Initializing microphone for CarPlay...');

      // Check if microphone is enabled in settings
      if (this.settings?.audio?.microphoneEnabled === false) {
        console.log('Microphone disabled in settings');
        return;
      }

      // Check if still connected
      if (!this.isConnected || !this.driver) {
        console.warn('Cannot initialize microphone: CarPlay not connected');
        return;
      }

      // Get microphone settings from config or use defaults
      const micSettings = this.settings?.audio?.microphoneSettings || {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 16000,
        channelCount: 1
      };

      // Request microphone access
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: micSettings.echoCancellation,
          noiseSuppression: micSettings.noiseSuppression,
          autoGainControl: micSettings.autoGainControl,
          sampleRate: micSettings.sampleRate,
          channelCount: micSettings.channelCount
        }
      });

      console.log('Microphone access granted');

      // Create audio context if not exists
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }

      console.log('Audio context sample rate:', this.audioContext.sampleRate);

      // Create audio source from microphone stream
      const micSource = this.audioContext.createMediaStreamSource(this.micStream);

      // Create script processor for audio data (smaller buffer for lower latency)
      const bufferSize = 2048;
      this.micProcessor = this.audioContext.createScriptProcessor(bufferSize, 1, 1);

      let packetCount = 0;
      this.micProcessor.onaudioprocess = (audioProcessingEvent) => {
        if (!this.driver || !this.isConnected) return;

        const inputBuffer = audioProcessingEvent.inputBuffer;
        const inputData = inputBuffer.getChannelData(0);

        // Resample to 16kHz if needed
        const targetSampleRate = 16000;
        const sourceSampleRate = this.audioContext.sampleRate;
        let resampledData;

        if (sourceSampleRate !== targetSampleRate) {
          // Simple linear interpolation resampling
          const ratio = sourceSampleRate / targetSampleRate;
          const targetLength = Math.floor(inputData.length / ratio);
          resampledData = new Float32Array(targetLength);

          for (let i = 0; i < targetLength; i++) {
            const sourceIndex = i * ratio;
            const index = Math.floor(sourceIndex);
            const fraction = sourceIndex - index;

            if (index + 1 < inputData.length) {
              resampledData[i] = inputData[index] * (1 - fraction) + inputData[index + 1] * fraction;
            } else {
              resampledData[i] = inputData[index];
            }
          }
        } else {
          resampledData = inputData;
        }

        // Convert float32 audio data to int16 for CarPlay
        const int16Data = new Int16Array(resampledData.length);
        for (let i = 0; i < resampledData.length; i++) {
          // Clamp to [-1, 1] and convert to int16
          const s = Math.max(-1, Math.min(1, resampledData[i]));
          int16Data[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }

        // Log every 50 packets to verify microphone is working
        if (packetCount % 50 === 0) {
          console.log(`Mic packet ${packetCount}: ${int16Data.length} samples, max: ${Math.max(...int16Data)}`);
        }
        packetCount++;

        // Send audio to CarPlay
        this.sendMicrophoneAudio(int16Data);
      };

      // Connect microphone to processor
      // DO NOT connect to destination to avoid feedback loop
      micSource.connect(this.micProcessor);
      // Connect to a dummy destination to keep processing active
      const dummyGain = this.audioContext.createGain();
      dummyGain.gain.value = 0; // Mute it
      this.micProcessor.connect(dummyGain);
      dummyGain.connect(this.audioContext.destination);

      console.log('Microphone initialized and connected to CarPlay');

    } catch (error) {
      console.error('Failed to initialize microphone:', error);
      console.warn('Microphone passthrough disabled');
    }
  }

  async sendMicrophoneAudio(audioData) {
    if (!this.driver) return;

    try {
      const { SendAudio } = await import('./carplay/index.js');
      await this.driver.send(new SendAudio(audioData));
    } catch (error) {
      console.error('Failed to send microphone audio:', error);
    }
  }

  handleFailure() {
    console.error('CarPlay driver failed');
    this.isConnected = false;
    this.emit('disconnected');
  }

  setVideoCanvas(canvas) {
    this.videoCanvas = canvas;
  }

  async sendTouch(x, y, action) {
    if (!this.driver) return;

    const { SendTouch, TouchAction } = await import('./carplay/index.js');
    await this.driver.send(new SendTouch(x, y, action));
  }

  async sendCommand(command) {
    if (!this.driver) return;

    const { SendCommand } = await import('./carplay/index.js');
    await this.driver.send(new SendCommand(command));
  }

  async disconnect() {
    console.log('Disconnecting CarPlay...');

    // Clean up microphone
    if (this.micProcessor) {
      this.micProcessor.disconnect();
      this.micProcessor = null;
    }

    if (this.micStream) {
      this.micStream.getTracks().forEach(track => track.stop());
      this.micStream = null;
    }

    if (this.videoDecoder) {
      try {
        this.videoDecoder.close();
      } catch (error) {
        console.error('Error closing video decoder:', error);
      }
      this.videoDecoder = null;
    }

    if (this.driver) {
      await this.driver.close();
      this.driver = null;
    }

    if (this.device) {
      if (this.device.opened) {
        await this.device.close();
      }
      this.device = null;
    }

    // Don't close audio context - keep it for reuse
    this.nextAudioTime = null;

    this.isConnected = false;
    this.emit('disconnected');
  }
}

export default CarPlayManager;