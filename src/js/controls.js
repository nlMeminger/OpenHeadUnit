// Use require for Electron IPC (non-module script)
const { ipcRenderer } = require('electron');

// Load settings and apply defaults
const settings = ipcRenderer.sendSync('get-settings');

// Clock
function updateClock() {
    const now = new Date();
    const clockFormat = settings.display.clockFormat || '24hr';
    const showSeconds = settings.display.showSeconds !== false; // Default to true
    
    let hours = now.getHours();
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    
    let timeString;
    if (clockFormat === '12hr') {
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        hours = hours ? hours : 12; // 0 should be 12
        if (showSeconds) {
            timeString = `${hours}:${minutes}:${seconds} ${ampm}`;
        } else {
            timeString = `${hours}:${minutes} ${ampm}`;
        }
    } else {
        hours = String(hours).padStart(2, '0');
        if (showSeconds) {
            timeString = `${hours}:${minutes}:${seconds}`;
        } else {
            timeString = `${hours}:${minutes}`;
        }
    }
    
    document.getElementById('clock').textContent = timeString;
}
updateClock();
setInterval(updateClock, 1000);

// Apply default volume from config
const outputVolume = settings.audio.outputVolume || 50;
document.getElementById('output').value = outputVolume;
ipcRenderer.send('set-output-volume', outputVolume);

// Volume control
document.getElementById('output').addEventListener('input', (e) => {
    ipcRenderer.send('set-output-volume', parseInt(e.target.value));
});

// Apply default brightness from config
const brightness = settings.display.brightness || 80;
document.getElementById('brightnessSlider').value = brightness;
ipcRenderer.send('set-brightness', brightness);

// Brightness control
document.getElementById('brightnessSlider').addEventListener('input', (e) => {
    ipcRenderer.send('set-brightness', parseInt(e.target.value));
});

// Mute button
let isMuted = false;
document.getElementById('muteBtn').addEventListener('click', () => {
    isMuted = !isMuted;
    document.getElementById('muteBtn').textContent = isMuted ? '🔇' : '🔊';
    document.getElementById('muteBtn').classList.toggle('muted', isMuted);
    ipcRenderer.send('toggle-output-mute');
});

// Exit button
document.getElementById('exitBtn').addEventListener('click', () => {
    ipcRenderer.send('exit-app');
});

// Temperature display
const tempElement = document.querySelector('.status-icons .temp');

// Listen for temperature updates from backend
ipcRenderer.on('temperature-update', (event, tempData) => {
    if (tempData && tempElement) {
        const temperatureUnit = settings.display.temperatureUnit || 'fahrenheit';
        
        // Display temperature based on user preference
        if (temperatureUnit === 'celsius') {
            tempElement.textContent = `${tempData.celsius}°C`;
            
            // Color coding for Celsius
            if (tempData.celsius < 15) {
                tempElement.style.color = '#4da6ff'; // Blue for cold
            } else if (tempData.celsius > 29) {
                tempElement.style.color = '#ff6b6b'; // Red for hot
            } else {
                tempElement.style.color = '#00ff88'; // Green for normal
            }
        } else {
            tempElement.textContent = `${tempData.fahrenheit}°F`;
            
            // Color coding for Fahrenheit
            if (tempData.fahrenheit < 60) {
                tempElement.style.color = '#4da6ff'; // Blue for cold
            } else if (tempData.fahrenheit > 85) {
                tempElement.style.color = '#ff6b6b'; // Red for hot
            } else {
                tempElement.style.color = '#00ff88'; // Green for normal
            }
        }
    }
});

// Listen for settings updates to refresh clock and temperature formats
ipcRenderer.on('settings-updated', (event, newSettings) => {
    // Update local settings reference
    Object.assign(settings, newSettings);
    
    // Refresh clock immediately
    updateClock();
    
    // Request temperature update to refresh display
    ipcRenderer.send('get-temperature');
});

// Request initial temperature
ipcRenderer.send('get-temperature');

console.log('Basic controls loaded');