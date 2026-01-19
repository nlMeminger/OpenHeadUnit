// Music Player Manager
class MusicPlayer {
  constructor() {
    this.audio = new Audio();
    this.playlist = [];
    this.currentIndex = -1;
    this.isPlaying = false;
    this.isShuffle = false;
    this.repeatMode = 0; // 0: off, 1: all, 2: one
    this.musicFolder = null;
    this.folderHandle = null;

    this.initializeElements();
    this.attachEventListeners();
    this.loadSavedFolder();
  }

  initializeElements() {
    // Player controls
    this.playBtn = document.getElementById('playBtn');
    this.prevBtn = document.getElementById('prevBtn');
    this.nextBtn = document.getElementById('nextBtn');
    this.shuffleBtn = document.getElementById('shuffleBtn');
    this.repeatBtn = document.getElementById('repeatBtn');

    // Display elements
    this.albumArt = document.getElementById('albumArt');
    this.trackTitle = document.getElementById('trackTitle');
    this.trackArtist = document.getElementById('trackArtist');
    this.trackAlbum = document.getElementById('trackAlbum');
    this.currentTime = document.getElementById('currentTime');
    this.totalTime = document.getElementById('totalTime');

    // Progress
    this.progressBar = document.getElementById('progressBar');
    this.progressFill = document.getElementById('progressFill');
    this.progressHandle = document.getElementById('progressHandle');

    // Volume
    this.volumeSlider = document.getElementById('volumeSlider');
    this.volumeValue = document.getElementById('volumeValue');

    // Playlist
    this.playlistContainer = document.getElementById('playlistContainer');
    this.playlistStats = document.getElementById('playlistStats');
    this.folderSelectBtn = document.getElementById('folderSelectBtn');
    this.sortSelect = document.getElementById('sortSelect');
    this.toggleSidebarBtn = document.getElementById('toggleSidebarBtn');
    this.musicContent = document.querySelector('.music-content');

    // State
    this.sortBy = 'title';
    this.sidebarVisible = true;
  }

  attachEventListeners() {
    // Playback controls
    this.playBtn.addEventListener('click', () => this.togglePlay());
    this.prevBtn.addEventListener('click', () => this.playPrevious());
    this.nextBtn.addEventListener('click', () => this.playNext());
    this.shuffleBtn.addEventListener('click', () => this.toggleShuffle());
    this.repeatBtn.addEventListener('click', () => this.cycleRepeat());

    // Audio events
    this.audio.addEventListener('timeupdate', () => this.updateProgress());
    this.audio.addEventListener('ended', () => this.onTrackEnded());
    this.audio.addEventListener('loadedmetadata', () => this.onMetadataLoaded());

    // Progress bar
    this.progressBar.addEventListener('click', (e) => this.seekTo(e));

    // Volume
    this.volumeSlider.addEventListener('input', (e) => this.setVolume(e.target.value));

    // Folder selection
    this.folderSelectBtn.addEventListener('click', () => this.selectFolder());

    // Sort control
    this.sortSelect.addEventListener('change', (e) => this.changeSortOrder(e.target.value));

    // Sidebar toggle
    this.toggleSidebarBtn.addEventListener('click', () => this.toggleSidebar());

    // Set initial volume
    this.setVolume(this.volumeSlider.value);
  }

  async selectFolder() {
    try {
      // Check if running in Electron
      if (window.electronAPI && window.electronAPI.selectMusicFolder) {
        // Use Electron's native dialog
        const result = await window.electronAPI.selectMusicFolder();
        if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
          return;
        }

        const folderPath = result.filePaths[0];
        this.musicFolder = folderPath;

        // Update UI
        this.musicFolderPath.textContent = `📁 ${folderPath}`;

        // Save folder path to localStorage
        localStorage.setItem('musicFolderPath', folderPath);

        // Scan for music files using Electron API
        await this.scanMusicFolderElectron(folderPath);
      } else {
        // Fallback to web File System Access API (for browser testing)
        const dirHandle = await window.showDirectoryPicker();
        this.folderHandle = dirHandle;
        this.musicFolder = dirHandle.name;

        // Save folder handle for persistence
        await this.saveFolderHandle(dirHandle);

        // Update UI
        this.musicFolderPath.textContent = `📁 ${dirHandle.name}`;

        // Scan for music files
        await this.scanMusicFolder(dirHandle);
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error('Error selecting folder:', error);
        alert('Error accessing folder. Please try again.');
      }
    }
  }

  async saveFolderHandle(dirHandle) {
    try {
      // Store the directory handle in IndexedDB for persistence
      const db = await this.openDB();
      const tx = db.transaction('folders', 'readwrite');
      const store = tx.objectStore('folders');
      await store.put({ id: 'musicFolder', handle: dirHandle });
    } catch (error) {
      console.error('Error saving folder handle:', error);
    }
  }

  async loadSavedFolder() {
    try {
      // Check if using Electron
      if (window.electronAPI && window.electronAPI.getMusicFiles) {
        // Try to load from localStorage
        const savedPath = localStorage.getItem('musicFolderPath');
        if (savedPath) {
          this.musicFolder = savedPath;
          this.musicFolderPath.textContent = `📁 ${savedPath}`;
          await this.scanMusicFolderElectron(savedPath);
        }
        return;
      }

      // Web File System API path
      const db = await this.openDB();
      const tx = db.transaction('folders', 'readonly');
      const store = tx.objectStore('folders');
      const result = await store.get('musicFolder');

      if (result && result.handle) {
        const permission = await result.handle.queryPermission({ mode: 'read' });
        
        if (permission === 'granted') {
          this.folderHandle = result.handle;
          this.musicFolder = result.handle.name;
          this.musicFolderPath.textContent = `📁 ${result.handle.name}`;
          await this.scanMusicFolder(result.handle);
        } else if (permission === 'prompt') {
          const newPermission = await result.handle.requestPermission({ mode: 'read' });
          if (newPermission === 'granted') {
            this.folderHandle = result.handle;
            this.musicFolder = result.handle.name;
            this.musicFolderPath.textContent = `📁 ${result.handle.name}`;
            await this.scanMusicFolder(result.handle);
          }
        }
      }
    } catch (error) {
      console.error('Error loading saved folder:', error);
    }
  }

  async tryDefaultFolder() {
    // Can't automatically access ~/Music without user permission
    // Show default message
    this.musicFolderPath.textContent = '~/Music (not selected)';
  }

  openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('MusicPlayerDB', 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('folders')) {
          db.createObjectStore('folders', { keyPath: 'id' });
        }
      };
    });
  }

  async scanMusicFolder(dirHandle) {
    this.playlist = [];
    const audioExtensions = ['.mp3', '.m4a', '.wav', '.ogg', '.flac', '.aac'];

    try {
      const entries = await this.getAllFiles(dirHandle, audioExtensions);
      
      // Process each file
      for (const entry of entries) {
        const track = {
          name: entry.file.name,
          path: entry.path,
          fileHandle: entry.fileHandle,
          file: entry.file,
          duration: null,
          metadata: null
        };

        // Extract metadata
        await this.extractMetadata(track);

        this.playlist.push(track);
      }

      // Update UI
      this.renderPlaylist();
      this.updateStats();

      // Auto-play first track if playlist not empty
      if (this.playlist.length > 0 && this.currentIndex === -1) {
        this.loadTrack(0);
      }
    } catch (error) {
      console.error('Error scanning folder:', error);
    }
  }

  async scanMusicFolderElectron(folderPath) {
    this.playlist = [];
    
    try {
      // Get files from Electron API
      const files = await window.electronAPI.getMusicFiles(folderPath);
      
      if (!files || files.length === 0) {
        this.renderPlaylist();
        this.updateStats();
        return;
      }

      // Process each file
      for (const filePath of files) {
        const fileName = filePath.split('/').pop().split('\\').pop();
        const track = {
          name: fileName,
          path: filePath,
          filePath: filePath,
          duration: null,
          metadata: null
        };

        // Extract metadata (will be loaded when played)
        track.metadata = this.getBasicMetadata(fileName);

        this.playlist.push(track);
      }

      // Update UI
      this.renderPlaylist();
      this.updateStats();

      // Auto-load first track
      if (this.playlist.length > 0 && this.currentIndex === -1) {
        this.loadTrack(0);
      }
    } catch (error) {
      console.error('Error scanning folder:', error);
      alert('Error reading music files from folder.');
    }
  }

  async getAllFiles(dirHandle, extensions, path = '', results = []) {
    for await (const entry of dirHandle.values()) {
      const entryPath = path ? `${path}/${entry.name}` : entry.name;

      if (entry.kind === 'file') {
        const ext = entry.name.substring(entry.name.lastIndexOf('.')).toLowerCase();
        if (extensions.includes(ext)) {
          const fileHandle = entry;
          const file = await fileHandle.getFile();
          results.push({ file, path: entryPath, fileHandle });
        }
      } else if (entry.kind === 'directory') {
        await this.getAllFiles(entry, extensions, entryPath, results);
      }
    }
    return results;
  }

  async extractMetadata(track) {
    try {
      // Use jsmediatags library if available, otherwise use basic file info
      if (window.jsmediatags) {
        await new Promise((resolve) => {
          window.jsmediatags.read(track.file, {
            onSuccess: (tag) => {
              track.metadata = {
                title: tag.tags.title || track.name,
                artist: tag.tags.artist || 'Unknown Artist',
                album: tag.tags.album || 'Unknown Album',
                picture: tag.tags.picture
              };
              resolve();
            },
            onError: () => {
              track.metadata = this.getBasicMetadata(track.name);
              resolve();
            }
          });
        });
      } else {
        track.metadata = this.getBasicMetadata(track.name);
      }
    } catch (error) {
      track.metadata = this.getBasicMetadata(track.name);
    }
  }

  getBasicMetadata(filename) {
    // Extract basic info from filename
    const nameWithoutExt = filename.substring(0, filename.lastIndexOf('.'));
    return {
      title: nameWithoutExt,
      artist: 'Unknown Artist',
      album: 'Unknown Album',
      picture: null
    };
  }

  changeSortOrder(sortBy) {
    this.sortBy = sortBy;
    this.sortPlaylist();
    this.renderPlaylist();
  }

  sortPlaylist() {
    this.playlist.sort((a, b) => {
      let aVal, bVal;
      
      switch(this.sortBy) {
        case 'artist':
          aVal = (a.metadata?.artist || 'Unknown Artist').toLowerCase();
          bVal = (b.metadata?.artist || 'Unknown Artist').toLowerCase();
          // Secondary sort by album, then title
          if (aVal === bVal) {
            const aAlbum = (a.metadata?.album || '').toLowerCase();
            const bAlbum = (b.metadata?.album || '').toLowerCase();
            if (aAlbum === bAlbum) {
              const aTitle = (a.metadata?.title || a.name).toLowerCase();
              const bTitle = (b.metadata?.title || b.name).toLowerCase();
              return aTitle.localeCompare(bTitle);
            }
            return aAlbum.localeCompare(bAlbum);
          }
          break;
        case 'album':
          aVal = (a.metadata?.album || 'Unknown Album').toLowerCase();
          bVal = (b.metadata?.album || 'Unknown Album').toLowerCase();
          // Secondary sort by title
          if (aVal === bVal) {
            const aTitle = (a.metadata?.title || a.name).toLowerCase();
            const bTitle = (b.metadata?.title || b.name).toLowerCase();
            return aTitle.localeCompare(bTitle);
          }
          break;
        case 'title':
        default:
          aVal = (a.metadata?.title || a.name).toLowerCase();
          bVal = (b.metadata?.title || b.name).toLowerCase();
          break;
      }
      
      return aVal.localeCompare(bVal);
    });
  }

  toggleSidebar() {
    this.sidebarVisible = !this.sidebarVisible;
    
    if (this.sidebarVisible) {
      this.musicContent.classList.remove('sidebar-collapsed');
      this.toggleSidebarBtn.classList.remove('sidebar-hidden');
    } else {
      this.musicContent.classList.add('sidebar-collapsed');
      this.toggleSidebarBtn.classList.add('sidebar-hidden');
    }
  }

  renderPlaylist() {
    this.playlistContainer.innerHTML = '';

    if (this.playlist.length === 0) {
      this.playlistContainer.innerHTML = `
        <div class="playlist-empty">
          <div class="empty-icon">🎵</div>
          <p>No music files found</p>
          <p class="empty-hint">Select a folder with audio files</p>
        </div>
      `;
      return;
    }

    // Apply current sort order
    this.sortPlaylist();

    this.playlist.forEach((track, index) => {
      const item = document.createElement('div');
      item.className = 'track-item';
      if (index === this.currentIndex) {
        item.classList.add('active');
        if (this.isPlaying) item.classList.add('playing');
      }

      const thumbnail = document.createElement('div');
      thumbnail.className = 'track-thumbnail';
      
      if (track.metadata?.picture) {
        const { data, format } = track.metadata.picture;
        const base64 = this.arrayBufferToBase64(data);
        const img = document.createElement('img');
        img.src = `data:${format};base64,${base64}`;
        thumbnail.appendChild(img);
      } else {
        thumbnail.textContent = '🎵';
      }

      const info = document.createElement('div');
      info.className = 'track-info';
      
      const name = document.createElement('div');
      name.className = 'track-name';
      name.textContent = track.metadata?.title || track.name;

      const details = document.createElement('div');
      details.className = 'track-details';
      details.textContent = track.metadata?.artist || 'Unknown Artist';

      info.appendChild(name);
      info.appendChild(details);

      const duration = document.createElement('div');
      duration.className = 'track-duration';
      duration.textContent = track.duration ? this.formatTime(track.duration) : '';

      item.appendChild(thumbnail);
      item.appendChild(info);
      item.appendChild(duration);

      item.addEventListener('click', () => {
        this.loadTrack(index);
        // Auto-play when clicking a track
        if (!this.isPlaying) {
          setTimeout(() => this.togglePlay(), 100);
        }
      });

      this.playlistContainer.appendChild(item);
    });
  }

  updateStats() {
    const count = this.playlist.length;
    const duration = this.playlist.reduce((sum, t) => sum + (t.duration || 0), 0);
    this.playlistStats.innerHTML = `
      <span>${count} track${count !== 1 ? 's' : ''}</span>
      ${duration > 0 ? ` • ${this.formatTime(duration)}` : ''}
    `;
  }

  async loadTrack(index) {
    if (index < 0 || index >= this.playlist.length) return;

    this.currentIndex = index;
    const track = this.playlist[index];

    try {
      // Revoke previous object URL if exists
      if (this.audio.src && this.audio.src.startsWith('blob:')) {
        URL.revokeObjectURL(this.audio.src);
      }

      // Check if using Electron or web File System API
      if (track.filePath) {
        // Electron: use file:// protocol
        this.audio.src = `file://${track.filePath}`;
      } else if (track.file) {
        // Web: create object URL from file
        const url = URL.createObjectURL(track.file);
        this.audio.src = url;
      }

      // Update UI
      this.updateNowPlaying(track);
      this.renderPlaylist();

      // Load the audio
      await this.audio.load();

      // Auto-play if already playing
      if (this.isPlaying) {
        try {
          await this.audio.play();
        } catch (error) {
          console.error('Playback error:', error);
          this.isPlaying = false;
          this.playBtn.textContent = '▶';
        }
      }
    } catch (error) {
      console.error('Error loading track:', error);
    }
  }

  updateNowPlaying(track) {
    const metadata = track.metadata || {};

    this.trackTitle.textContent = metadata.title || track.name;
    this.trackArtist.textContent = metadata.artist || 'Unknown Artist';
    this.trackAlbum.textContent = metadata.album || 'Unknown Album';

    // Update album art
    if (metadata.picture) {
      const { data, format } = metadata.picture;
      const base64 = this.arrayBufferToBase64(data);
      this.albumArt.src = `data:${format};base64,${base64}`;
      this.albumArt.classList.add('visible');
    } else {
      this.albumArt.classList.remove('visible');
    }
  }

  arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  async togglePlay() {
    if (this.playlist.length === 0) return;

    // Load first track if none selected
    if (this.currentIndex === -1) {
      await this.loadTrack(0);
    }

    if (this.isPlaying) {
      this.audio.pause();
      this.isPlaying = false;
      this.playBtn.textContent = '▶';
    } else {
      try {
        await this.audio.play();
        this.isPlaying = true;
        this.playBtn.textContent = '⏸';
      } catch (error) {
        console.error('Play error:', error);
        // Try to reload the track
        await this.loadTrack(this.currentIndex);
        await this.audio.play();
        this.isPlaying = true;
        this.playBtn.textContent = '⏸';
      }
    }

    this.renderPlaylist();
  }

  playPrevious() {
    if (this.playlist.length === 0) return;

    let newIndex = this.currentIndex - 1;
    if (newIndex < 0) {
      newIndex = this.playlist.length - 1;
    }

    this.loadTrack(newIndex);
  }

  playNext() {
    if (this.playlist.length === 0) return;

    let newIndex;
    if (this.isShuffle) {
      newIndex = Math.floor(Math.random() * this.playlist.length);
    } else {
      newIndex = this.currentIndex + 1;
      if (newIndex >= this.playlist.length) {
        newIndex = 0;
      }
    }

    this.loadTrack(newIndex);
  }

  onTrackEnded() {
    if (this.repeatMode === 2) {
      // Repeat one
      this.audio.currentTime = 0;
      this.audio.play();
    } else if (this.repeatMode === 1 || this.currentIndex < this.playlist.length - 1) {
      // Repeat all or not at end
      this.playNext();
    } else {
      // End of playlist
      this.isPlaying = false;
      this.playBtn.textContent = '▶';
      this.renderPlaylist();
    }
  }

  toggleShuffle() {
    this.isShuffle = !this.isShuffle;
    if (this.isShuffle) {
      this.shuffleBtn.classList.add('active');
    } else {
      this.shuffleBtn.classList.remove('active');
    }
  }

  cycleRepeat() {
    this.repeatMode = (this.repeatMode + 1) % 3;
    
    this.repeatBtn.classList.remove('active');
    if (this.repeatMode === 1) {
      this.repeatBtn.textContent = '🔁';
      this.repeatBtn.classList.add('active');
    } else if (this.repeatMode === 2) {
      this.repeatBtn.textContent = '🔂';
      this.repeatBtn.classList.add('active');
    } else {
      this.repeatBtn.textContent = '🔁';
    }
  }

  updateProgress() {
    if (!this.audio.duration) return;

    const percent = (this.audio.currentTime / this.audio.duration) * 100;
    this.progressFill.style.width = `${percent}%`;
    this.progressHandle.style.left = `${percent}%`;

    this.currentTime.textContent = this.formatTime(this.audio.currentTime);
  }

  onMetadataLoaded() {
    this.totalTime.textContent = this.formatTime(this.audio.duration);
    
    // Update track duration in playlist
    if (this.currentIndex >= 0) {
      this.playlist[this.currentIndex].duration = this.audio.duration;
      this.updateStats();
      this.renderPlaylist();
    }
  }

  seekTo(e) {
    if (!this.audio.duration) return;

    const rect = this.progressBar.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    this.audio.currentTime = percent * this.audio.duration;
  }

  setVolume(value) {
    this.audio.volume = value / 100;
    this.volumeValue.textContent = `${value}%`;
  }

  formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
}

// Initialize music player when music interface is opened
let musicPlayer = null;

function initMusicPlayer() {
  if (!musicPlayer) {
    musicPlayer = new MusicPlayer();
  }
}

// Export for use in main app
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MusicPlayer, initMusicPlayer };
}