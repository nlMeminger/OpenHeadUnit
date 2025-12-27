import CarPlayManager from './carplay-manager.js';

console.log('CarPlay module script loading...');

// Navigation elements
const homeScreen = document.getElementById('homeScreen');
const radioInterface = document.getElementById('radioInterface');
const carplayInterface = document.getElementById('carplayInterface');
const settingsInterface = document.getElementById('settingsInterface');
const appTiles = document.querySelectorAll('.app-tile');
const backBtn = document.getElementById('backBtn');
const settingsBackBtn = document.getElementById('settingsBackBtn');
const navBtns = document.querySelectorAll('.nav-btn');

// Quick Settings Dropdown
const quickSettingsBtn = document.getElementById('quickSettingsBtn');
const carplayQuickSettingsBtn = document.getElementById('carplayQuickSettingsBtn');
const quickSettingsDropdown = document.getElementById('quickSettingsDropdown');
const closeDropdownBtn = document.getElementById('closeDropdownBtn');

quickSettingsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    quickSettingsDropdown.classList.toggle('active');
    quickSettingsBtn.classList.toggle('active');
});

carplayQuickSettingsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    quickSettingsDropdown.classList.toggle('active');
    carplayQuickSettingsBtn.classList.toggle('active');
    // Sync the main button state
    if (quickSettingsDropdown.classList.contains('active')) {
        quickSettingsBtn.classList.add('active');
    } else {
        quickSettingsBtn.classList.remove('active');
    }
});

closeDropdownBtn.addEventListener('click', () => {
    quickSettingsDropdown.classList.remove('active');
    quickSettingsBtn.classList.remove('active');
    carplayQuickSettingsBtn.classList.remove('active');
});

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
    if (!quickSettingsDropdown.contains(e.target) && 
        e.target !== quickSettingsBtn && 
        e.target !== carplayQuickSettingsBtn) {
        quickSettingsDropdown.classList.remove('active');
        quickSettingsBtn.classList.remove('active');
        carplayQuickSettingsBtn.classList.remove('active');
    }
});

// Prevent dropdown from closing when clicking inside it
quickSettingsDropdown.addEventListener('click', (e) => {
    e.stopPropagation();
});

console.log('CarPlay interface element:', carplayInterface);

// CarPlay Manager
const carplayManager = new CarPlayManager();
const carplayCanvas = document.getElementById('carplayCanvas');
const carplayPlaceholder = document.getElementById('carplayPlaceholder');
const connectCarPlayBtn = document.getElementById('connectCarPlayBtn');
const carplayStatusText = document.getElementById('carplayStatusText');
const connectionText = document.getElementById('connectionText');
const statusDot = document.getElementById('statusDot');
const carplayStatus = document.querySelector('.carplay-status');

carplayManager.setVideoCanvas(carplayCanvas);

// Load settings to check debug mode
const appSettings = ipcRenderer.sendSync('get-settings');
const debugMode = appSettings.debug?.enabled || false;

// Hide connection screen if not in debug mode
if (!debugMode) {
    carplayStatus.style.display = 'none';
}

// Check for CarPlay dongle on startup
async function checkForDongle() {
    try {
        if (!navigator.usb) {
            console.log('WebUSB not supported');
            disableCarPlayButton();
            return;
        }

        const devices = await navigator.usb.getDevices();
        const carplayDevice = devices.find(d =>
            (d.vendorId === 0x1314 && (d.productId === 0x1520 || d.productId === 0x1521))
        );

        if (!carplayDevice) {
            console.log('No CarPlay dongle found on startup');
            disableCarPlayButton();
        } else {
            console.log('CarPlay dongle detected:', carplayDevice);
        }
    } catch (error) {
        console.error('Error checking for dongle:', error);
        disableCarPlayButton();
    }
}

function disableCarPlayButton() {
    // Disable the CarPlay tile
    const carplayTile = document.querySelector('.app-tile[data-app="phone"]');
    if (carplayTile) {
        carplayTile.style.opacity = '0.5';
        carplayTile.style.cursor = 'not-allowed';
        carplayTile.style.pointerEvents = 'none';
    }

    // Disable the nav button
    if (navBtns[3]) {
        navBtns[3].style.opacity = '0.5';
        navBtns[3].style.cursor = 'not-allowed';
        navBtns[3].style.pointerEvents = 'none';
    }

    // Update CarPlay status
    carplayStatusText.textContent = 'No CarPlay dongle detected';
    connectCarPlayBtn.disabled = true;
    connectCarPlayBtn.textContent = 'No Dongle Detected';
}

// Run the check on startup
//checkForDongle();

// CarPlay event handlers
carplayManager.on('connected', () => {
    console.log('CarPlay connected event');
    carplayStatusText.textContent = 'Device connected successfully!';
    connectionText.textContent = 'Connected';
    statusDot.classList.add('connected');
    connectCarPlayBtn.disabled = true;
    connectCarPlayBtn.textContent = 'Connected';
});

carplayManager.on('disconnected', () => {
    console.log('CarPlay disconnected event');
    carplayStatusText.textContent = 'Device disconnected';
    connectionText.textContent = 'Not Connected';
    statusDot.classList.remove('connected');
    connectCarPlayBtn.disabled = false;
    connectCarPlayBtn.textContent = 'Connect Device';
    carplayPlaceholder.style.display = 'block';
    carplayCanvas.style.display = 'none';
    carplayInterface.classList.remove('fullscreen');
});

carplayManager.on('phone-plugged', (message) => {
    console.log('Phone plugged event:', message);
    carplayStatusText.textContent = 'iPhone connected!';
    carplayPlaceholder.style.display = 'none';
    carplayCanvas.style.display = 'block';
    // Go fullscreen when phone connects
    carplayInterface.classList.add('fullscreen');
});

carplayManager.on('video-frame', (videoData) => {
    // Show canvas when we start receiving video
    carplayPlaceholder.style.display = 'none';
    carplayCanvas.style.display = 'block';
    // Go fullscreen when video starts
    carplayInterface.classList.add('fullscreen');
});

carplayManager.on('phone-unplugged', () => {
    console.log('Phone unplugged event');
    carplayStatusText.textContent = 'iPhone disconnected';
    carplayPlaceholder.style.display = 'block';
    carplayCanvas.style.display = 'none';
    carplayInterface.classList.remove('fullscreen');
});

carplayManager.on('error', (message) => {
    console.error('CarPlay error:', message);
    carplayStatusText.textContent = `Error: ${message}`;
    connectionText.textContent = 'Error';
    statusDot.classList.remove('connected');
});

carplayManager.on('command', (command) => {
    console.log('Command received:', command);

    // Check if it's the requestHostUI command (value 3)
    if (command === 3) {
        console.log('RequestHostUI command received - switching to main UI');
        switchToMainUI();
    }
});

// Connect CarPlay button (only used in debug mode)
connectCarPlayBtn.addEventListener('click', async () => {
    console.log('Connect CarPlay button clicked');
    connectCarPlayBtn.disabled = true;
    connectCarPlayBtn.textContent = 'Connecting...';
    carplayStatusText.textContent = 'Requesting device access...';

    await connectCarPlay();
    
    if (!carplayManager.isConnected) {
        connectCarPlayBtn.disabled = false;
        connectCarPlayBtn.textContent = 'Connect Device';
    }
});

// Touch events on CarPlay canvas
let isMouseDown = false;
let touchStartX = 0;
let touchStartY = 0;

carplayCanvas.addEventListener('mousedown', async (e) => {
    console.log('Canvas mousedown event fired');
    
    // Close dropdown if open
    if (quickSettingsDropdown.classList.contains('active')) {
        quickSettingsDropdown.classList.remove('active');
        quickSettingsBtn.classList.remove('active');
        carplayQuickSettingsBtn.classList.remove('active');
        return;
    }
    
    if (!carplayManager.isConnected) {
        console.log('CarPlay not connected, ignoring mousedown');
        return;
    }

    isMouseDown = true;
    const rect = carplayCanvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    console.log('Touch down at', x, y);
    touchStartX = x;
    touchStartY = y;

    const { TouchAction } = await import('../carplay/index.js');
    await carplayManager.sendTouch(x, y, TouchAction.Down);
});

carplayCanvas.addEventListener('mousemove', async (e) => {
    if (!carplayManager.isConnected || !isMouseDown) return;

    const rect = carplayCanvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    const { TouchAction } = await import('../carplay/index.js');
    await carplayManager.sendTouch(x, y, TouchAction.Move);
});

carplayCanvas.addEventListener('mouseup', async (e) => {
    if (!carplayManager.isConnected) return;

    isMouseDown = false;
    const rect = carplayCanvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    const { TouchAction } = await import('../carplay/index.js');
    await carplayManager.sendTouch(x, y, TouchAction.Up);
});

carplayCanvas.addEventListener('mouseleave', async (e) => {
    if (!carplayManager.isConnected || !isMouseDown) return;

    // Send touch up if mouse leaves canvas while dragging
    isMouseDown = false;
    const rect = carplayCanvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    const { TouchAction } = await import('../carplay/index.js');
    await carplayManager.sendTouch(x, y, TouchAction.Up);
});

// Touch events for mobile/tablet devices
carplayCanvas.addEventListener('touchstart', async (e) => {
    console.log('Canvas touchstart event fired');
    
    // Close dropdown if open
    if (quickSettingsDropdown.classList.contains('active')) {
        quickSettingsDropdown.classList.remove('active');
        quickSettingsBtn.classList.remove('active');
        carplayQuickSettingsBtn.classList.remove('active');
        e.preventDefault();
        return;
    }
    
    if (!carplayManager.isConnected) {
        console.log('CarPlay not connected, ignoring touchstart');
        return;
    }
    e.preventDefault();

    const touch = e.touches[0];
    const rect = carplayCanvas.getBoundingClientRect();
    const x = (touch.clientX - rect.left) / rect.width;
    const y = (touch.clientY - rect.top) / rect.height;

    console.log('Touch start at', x, y);
    touchStartX = x;
    touchStartY = y;

    const { TouchAction } = await import('../carplay/index.js');
    await carplayManager.sendTouch(x, y, TouchAction.Down);
});

carplayCanvas.addEventListener('touchmove', async (e) => {
    if (!carplayManager.isConnected) return;
    e.preventDefault();

    const touch = e.touches[0];
    const rect = carplayCanvas.getBoundingClientRect();
    const x = (touch.clientX - rect.left) / rect.width;
    const y = (touch.clientY - rect.top) / rect.height;

    const { TouchAction } = await import('../carplay/index.js');
    await carplayManager.sendTouch(x, y, TouchAction.Move);
});

carplayCanvas.addEventListener('touchend', async (e) => {
    if (!carplayManager.isConnected) return;
    e.preventDefault();

    const touch = e.changedTouches[0];
    const rect = carplayCanvas.getBoundingClientRect();
    const x = (touch.clientX - rect.left) / rect.width;
    const y = (touch.clientY - rect.top) / rect.height;

    const { TouchAction } = await import('../carplay/index.js');
    await carplayManager.sendTouch(x, y, TouchAction.Up);
});

carplayCanvas.addEventListener('touchcancel', async (e) => {
    if (!carplayManager.isConnected) return;
    e.preventDefault();

    const touch = e.changedTouches[0];
    const rect = carplayCanvas.getBoundingClientRect();
    const x = (touch.clientX - rect.left) / rect.width;
    const y = (touch.clientY - rect.top) / rect.height;

    const { TouchAction } = await import('../carplay/index.js');
    await carplayManager.sendTouch(x, y, TouchAction.Up);
});

// Function to switch to main UI while keeping CarPlay running
function switchToMainUI() {
    console.log('Switching to main UI');
    carplayInterface.classList.remove('active');
    carplayInterface.classList.remove('fullscreen');
    homeScreen.style.display = 'grid';
    
    // Update nav bar
    navBtns.forEach(b => b.classList.remove('active'));
    navBtns[0].classList.add('active'); // Activate home button
}

// Function to switch back to CarPlay UI
function switchToCarPlayUI() {
    console.log('Switching to CarPlay UI');
    homeScreen.style.display = 'none';
    carplayInterface.classList.add('active');
    
    // Auto-connect if not already connected and not in debug mode
    if (!carplayManager.isConnected && !debugMode) {
        console.log('Auto-connecting to CarPlay...');
        carplayPlaceholder.innerHTML = '<div class="icon">📱</div><p>Connecting to device...</p>';
        connectCarPlay();
    }
    
    // If video is showing, go fullscreen
    if (carplayCanvas.style.display === 'block') {
        carplayInterface.classList.add('fullscreen');
    }
    
    // Update nav bar
    navBtns.forEach(b => b.classList.remove('active'));
    navBtns[3].classList.add('active'); // Activate phone button
}

// Function to connect CarPlay
async function connectCarPlay() {
    try {
        await carplayManager.connect();
    } catch (error) {
        console.error('Connection error:', error);
        carplayPlaceholder.innerHTML = `<div class="icon">⚠️</div><p>Connection failed: ${error.message}</p><p style="font-size: 14px; margin-top: 10px;">Please check your USB connection</p>`;
    }
}

// App tile navigation
appTiles.forEach(tile => {
    tile.addEventListener('click', () => {
        const app = tile.getAttribute('data-app');
        console.log('App tile clicked:', app);
        homeScreen.style.display = 'none';

        if (app === 'radio') {
            console.log('Opening radio interface');
            radioInterface.classList.add('active');
        } else if (app === 'phone') {
            console.log('Opening CarPlay interface');
            switchToCarPlayUI();
        } else if (app === 'settings') {
            console.log('Opening settings interface');
            settingsInterface.classList.add('active');
            loadSettings();
        }
    });
});

// Back buttons
backBtn.addEventListener('click', () => {
    console.log('Radio back button clicked');
    radioInterface.classList.remove('active');
    homeScreen.style.display = 'grid';
    ipcRenderer.send('stop-radio');
    
    // Update nav bar
    navBtns.forEach(b => b.classList.remove('active'));
    navBtns[0].classList.add('active'); // Activate home button
});

settingsBackBtn.addEventListener('click', () => {
    console.log('Settings back button clicked');
    settingsInterface.classList.remove('active');
    homeScreen.style.display = 'grid';
    
    // Update nav bar
    navBtns.forEach(b => b.classList.remove('active'));
    navBtns[0].classList.add('active'); // Activate home button
});

// Bottom navigation bar
navBtns.forEach((btn, index) => {
    btn.addEventListener('click', () => {
        // Remove active class from all nav buttons
        navBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Hide all interfaces
        homeScreen.style.display = 'none';
        radioInterface.classList.remove('active');
        carplayInterface.classList.remove('active');
        carplayInterface.classList.remove('fullscreen');
        settingsInterface.classList.remove('active');

        // Show appropriate screen based on button index
        switch(index) {
            case 0: // Home
                homeScreen.style.display = 'grid';
                break;
            case 1: // Navigation
                homeScreen.style.display = 'grid';
                // Could add navigation interface here
                break;
            case 2: // Media/Radio
                radioInterface.classList.add('active');
                break;
            case 3: // Phone/CarPlay
                switchToCarPlayUI();
                break;
            case 4: // Settings
                settingsInterface.classList.add('active');
                loadSettings();
                break;
        }
    });
});

// Radio functionality
const frequencyDisplay = document.getElementById('frequencyDisplay');
const frequencySlider = document.getElementById('frequencySlider');
const tuneDown = document.getElementById('tuneDown');
const tuneUp = document.getElementById('tuneUp');
const seekDown = document.getElementById('seekDown');
const seekUp = document.getElementById('seekUp');
const presetBtns = document.querySelectorAll('.preset-btn');
const radioStatus = document.getElementById('radioStatus');

// Load radio settings from config
const radioSettings = ipcRenderer.sendSync('get-settings');
let currentFrequency = radioSettings.radio.defaultFrequency || 87.5;
let tuneTimeout = null;

// Initialize radio presets from config
updateRadioPresets();

function tuneRadio(freq) {
    radioStatus.textContent = `📡 Tuning ${freq.toFixed(1)} MHz`;
    ipcRenderer.send('tune-radio', freq);
}

function updateFrequency(freq, tune = true) {
    currentFrequency = Math.max(87.5, Math.min(108.0, freq));
    frequencyDisplay.textContent = currentFrequency.toFixed(1);
    frequencySlider.value = Math.round(currentFrequency * 10);

    if (tune) {
        if (tuneTimeout) clearTimeout(tuneTimeout);
        tuneTimeout = setTimeout(() => {
            tuneRadio(currentFrequency);
        }, 300);
    }
}

frequencySlider.addEventListener('input', (e) => {
    const freq = parseInt(e.target.value) / 10;
    updateFrequency(freq, true);
});

tuneDown.addEventListener('click', () => {
    updateFrequency(currentFrequency - 0.1, true);
});

tuneUp.addEventListener('click', () => {
    updateFrequency(currentFrequency + 0.1, true);
});

seekDown.addEventListener('click', () => {
    updateFrequency(currentFrequency - 0.5, true);
});

seekUp.addEventListener('click', () => {
    updateFrequency(currentFrequency + 0.5, true);
});

presetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const freqText = btn.querySelector('.preset-freq').textContent;
        const freq = parseFloat(freqText);
        updateFrequency(freq, false);
        tuneRadio(freq);

        presetBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    });
});

// Cleanup on window close
window.addEventListener('beforeunload', async () => {
    if (carplayManager.isConnected) {
        await carplayManager.disconnect();
    }
});

// Settings Management
function loadSettings() {
    const settings = ipcRenderer.sendSync('get-settings');
    console.log('Loaded settings:', settings);

    // Window settings
    document.getElementById('windowWidth').value = settings.window.width;
    document.getElementById('windowHeight').value = settings.window.height;
    document.getElementById('windowFullscreen').checked = settings.window.fullscreen;

    // Audio settings
    document.getElementById('micEnabled').checked = settings.audio.microphoneEnabled;
    document.getElementById('echoCancellation').checked = settings.audio.microphoneSettings.echoCancellation;
    document.getElementById('noiseSuppression').checked = settings.audio.microphoneSettings.noiseSuppression;
    document.getElementById('autoGainControl').checked = settings.audio.microphoneSettings.autoGainControl;

    // Display settings
    document.getElementById('defaultBrightness').value = settings.display.brightness;
    document.getElementById('clockFormat').value = settings.display.clockFormat || '24hr';
    document.getElementById('showSeconds').checked = settings.display.showSeconds !== false; // Default to true
    document.getElementById('temperatureUnit').value = settings.display.temperatureUnit || 'fahrenheit';

    // CarPlay settings
    document.getElementById('carplayWidth').value = settings.carplay.width || '';
    document.getElementById('carplayHeight').value = settings.carplay.height || '';
    document.getElementById('carplayFps').value = settings.carplay.fps || 20;
    document.getElementById('carplayDpi').value = settings.carplay.dpi || 160;
    document.getElementById('carplayBoxName').value = settings.carplay.boxName || 'nodePlay';
    document.getElementById('carplayHand').value = settings.carplay.hand !== undefined ? settings.carplay.hand : 0;

    // Load radio presets
    const presetsEditor = document.getElementById('presetsEditor');
    presetsEditor.innerHTML = '';
    settings.radio.presets.forEach((preset, index) => {
        const presetItem = document.createElement('div');
        presetItem.className = 'preset-editor-item';
        presetItem.innerHTML = `
            <label>Preset ${preset.number}</label>
            <input type="number" step="0.1" min="87.5" max="108.0"
                   value="${preset.frequency}"
                   data-preset="${index}">
        `;
        presetsEditor.appendChild(presetItem);
    });
}

function saveSettings() {
    console.log('saveSettings() called');
    const settings = {
        'window.width': parseInt(document.getElementById('windowWidth').value),
        'window.height': parseInt(document.getElementById('windowHeight').value),
        'window.fullscreen': document.getElementById('windowFullscreen').checked,
        'audio.microphoneEnabled': document.getElementById('micEnabled').checked,
        'audio.microphoneSettings.echoCancellation': document.getElementById('echoCancellation').checked,
        'audio.microphoneSettings.noiseSuppression': document.getElementById('noiseSuppression').checked,
        'audio.microphoneSettings.autoGainControl': document.getElementById('autoGainControl').checked,
        'display.brightness': parseInt(document.getElementById('defaultBrightness').value),
        'display.clockFormat': document.getElementById('clockFormat').value,
        'display.showSeconds': document.getElementById('showSeconds').checked,
        'display.temperatureUnit': document.getElementById('temperatureUnit').value
    };

    // CarPlay settings
    const carplayWidth = document.getElementById('carplayWidth').value;
    const carplayHeight = document.getElementById('carplayHeight').value;
    
    settings['carplay.width'] = carplayWidth ? parseInt(carplayWidth) : null;
    settings['carplay.height'] = carplayHeight ? parseInt(carplayHeight) : null;
    settings['carplay.fps'] = parseInt(document.getElementById('carplayFps').value);
    settings['carplay.dpi'] = parseInt(document.getElementById('carplayDpi').value);
    settings['carplay.boxName'] = document.getElementById('carplayBoxName').value || 'nodePlay';
    settings['carplay.hand'] = parseInt(document.getElementById('carplayHand').value);

    // Get radio presets
    const presetInputs = document.querySelectorAll('.preset-editor-item input');
    const presets = [];
    presetInputs.forEach((input, index) => {
        presets.push({
            number: index + 1,
            frequency: parseFloat(input.value)
        });
    });
    settings['radio.presets'] = presets;

    console.log('Settings to save:', settings);
    console.log('Calling ipcRenderer.sendSync update-settings');
    const success = ipcRenderer.sendSync('update-settings', settings);
    console.log('IPC returned:', success);

    const statusDiv = document.getElementById('settingsStatus');
    if (success) {
        statusDiv.textContent = 'Settings saved successfully! Restart CarPlay connection for changes to take effect.';
        statusDiv.className = 'settings-status success';

        // Notify the controls script about settings update
        ipcRenderer.send('notify-settings-updated');

        // Update radio presets in UI
        updateRadioPresets();
    } else {
        statusDiv.textContent = 'Failed to save settings';
        statusDiv.className = 'settings-status error';
    }

    setTimeout(() => {
        statusDiv.textContent = '';
        statusDiv.className = 'settings-status';
    }, 5000);
}

function updateRadioPresets() {
    const settings = ipcRenderer.sendSync('get-settings');
    const presetBtns = document.querySelectorAll('.preset-btn');

    presetBtns.forEach((btn, index) => {
        if (settings.radio.presets[index]) {
            const preset = settings.radio.presets[index];
            btn.querySelector('.preset-freq').textContent = preset.frequency.toFixed(1);
        }
    });
}

document.getElementById('saveSettingsBtn').addEventListener('click', saveSettings);

document.getElementById('resetSettingsBtn').addEventListener('click', () => {
    if (confirm('Are you sure you want to reset all settings to defaults?')) {
        loadSettings();
        const statusDiv = document.getElementById('settingsStatus');
        statusDiv.textContent = 'Settings reset to current saved values. To reset to defaults, manually edit config.json';
        statusDiv.className = 'settings-status';
    }
});