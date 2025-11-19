// Update time
function updateTime() {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    const displayMinutes = minutes < 10 ? '0' + minutes : minutes;
    document.getElementById('currentTime').textContent = `${displayHours}:${displayMinutes} ${ampm}`;
}
updateTime();
setInterval(updateTime, 1000);

// Main volume control
const volumeSliderMain = document.getElementById('volumeSliderMain');
const volumeFillMain = volumeSliderMain.querySelector('.slider-fill-main');
const volumeThumbMain = volumeSliderMain.querySelector('.slider-thumb-main');
const volumeValueMain = document.querySelector('.volume-value-main');

let isDraggingMainVolume = false;

function updateMainVolume(e) {
    const rect = volumeSliderMain.getBoundingClientRect();
    let percent = ((e.clientX - rect.left) / rect.width) * 100;
    percent = Math.max(0, Math.min(100, percent));
    
    volumeFillMain.style.width = percent + '%';
    volumeThumbMain.style.left = percent + '%';
    volumeValueMain.textContent = Math.round(percent);
    
    // Also update the settings volume slider if it exists
    const settingsVolumeSlider = document.querySelector('[data-slider="volume"]');
    if (settingsVolumeSlider) {
        const settingsFill = settingsVolumeSlider.querySelector('.slider-fill');
        const settingsThumb = settingsVolumeSlider.querySelector('.slider-thumb');
        const settingsValue = settingsVolumeSlider.closest('.slider-container').querySelector('.setting-value');
        
        settingsFill.style.width = percent + '%';
        settingsThumb.style.left = percent + '%';
        settingsValue.textContent = Math.round(percent);
    }
}

volumeSliderMain.addEventListener('mousedown', (e) => {
    isDraggingMainVolume = true;
    updateMainVolume(e);
});

document.addEventListener('mousemove', (e) => {
    if (isDraggingMainVolume) {
        updateMainVolume(e);
    }
});

document.addEventListener('mouseup', () => {
    isDraggingMainVolume = false;
});

// Screen navigation
function showScreen(screenId, navElement) {
    // Hide all screens
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    
    // Remove active from all nav items
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    
    // Show selected screen
    document.getElementById(screenId).classList.add('active');
    
    // Set active nav item
    if (navElement) {
        navElement.classList.add('active');
    }
}

// Music player
let isPlaying = false;
let progress = 45;

document.getElementById('playBtn').addEventListener('click', function() {
    isPlaying = !isPlaying;
    this.textContent = isPlaying ? '⏸️' : '▶️';
});

setInterval(() => {
    if (isPlaying) {
        progress += 0.5;
        if (progress > 100) progress = 0;
        document.getElementById('progressFill').style.width = progress + '%';
    }
}, 1000);

// Sliders
document.querySelectorAll('.slider').forEach(slider => {
    const fill = slider.querySelector('.slider-fill');
    const thumb = slider.querySelector('.slider-thumb');
    const valueDisplay = slider.closest('.slider-container').querySelector('.setting-value');
    
    let isDragging = false;
    
    function updateSlider(e) {
        const rect = slider.getBoundingClientRect();
        let percent = ((e.clientX - rect.left) / rect.width) * 100;
        percent = Math.max(0, Math.min(100, percent));
        
        fill.style.width = percent + '%';
        thumb.style.left = percent + '%';
        valueDisplay.textContent = Math.round(percent);
        
        // Apply brightness
        if (slider.dataset.slider === 'brightness') {
            document.querySelector('.container').style.opacity = (percent / 100) * 0.5 + 0.5;
        }
        
        // Sync with main volume control if this is the volume slider
        if (slider.dataset.slider === 'volume') {
            volumeFillMain.style.width = percent + '%';
            volumeThumbMain.style.left = percent + '%';
            volumeValueMain.textContent = Math.round(percent);
        }
    }
    
    slider.addEventListener('mousedown', (e) => {
        isDragging = true;
        updateSlider(e);
    });
    
    document.addEventListener('mousemove', (e) => {
        if (isDragging) {
            updateSlider(e);
        }
    });
    
    document.addEventListener('mouseup', () => {
        isDragging = false;
    });
});

// Temperature control
let tempLeft = 72;
let tempRight = 72;

function adjustTemp(side, change) {
    if (side === 'left') {
        tempLeft += change;
        tempLeft = Math.max(60, Math.min(85, tempLeft));
        document.getElementById('tempLeft').textContent = tempLeft + '°F';
    } else {
        tempRight += change;
        tempRight = Math.max(60, Math.min(85, tempRight));
        document.getElementById('tempRight').textContent = tempRight + '°F';
    }
}