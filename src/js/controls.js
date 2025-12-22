// Use require for Electron IPC (non-module script)
const { ipcRenderer } = require('electron');

// Load settings and apply defaults
const settings = ipcRenderer.sendSync('get-settings');

// Clock
function updateClock() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    document.getElementById('clock').textContent = `${hours}:${minutes}:${seconds}`;
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

console.log('Basic controls loaded');
