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
    this.shouldAutoPlay = false;
    this.volumeBeforeMute = null;

    this.initializeElements();
    this.attachEventListeners();
    this.renderRecentlyPlayed();
    this.loadSavedFolder();
    this.restorePlaybackState();
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
    this.volumeIcon = document.querySelector('.volume-icon');

    // Playlist
    this.playlistContainer = document.getElementById('playlistContainer');
    this.playlistStats = document.getElementById('playlistStats');
    this.folderSelectBtn = document.getElementById('folderSelectBtn');
    this.sortSelect = document.getElementById('sortSelect');
    this.toggleSidebarBtn = document.getElementById('toggleSidebarBtn');
    this.musicContent = document.querySelector('.music-content');
    this.musicFolderPath = document.getElementById('musicFolderPath');

    // State
    this.sortBy = 'title';
    this.sidebarVisible = true;
    this.viewMode = 'flat'; // 'flat', 'artist', 'album'
    this.currentArtist = null;
    this.currentAlbum = null;
    this.viewStack = []; // For breadcrumb navigation
    this.searchQuery = '';

    // Search elements
    this.searchInput = document.getElementById('playlistSearch');
    this.searchClear = document.getElementById('searchClear');

    // Context menu
    this.contextMenu = document.getElementById('trackContextMenu');
    this.contextMenuTrackIndex = null;

    // Recently played
    this.recentlyPlayedSection = document.getElementById('recentlyPlayedSection');
    this.recentlyPlayedList = document.getElementById('recentlyPlayedList');
    this.clearHistoryBtn = document.getElementById('clearHistoryBtn');
    this.recentlyPlayed = this.loadRecentlyPlayed();

    // On-screen keyboard
    this.onscreenKeyboard = document.getElementById('onscreenKeyboard');
    this.keyboardClose = document.getElementById('keyboardClose');
  }

  attachEventListeners() {
    // Playback controls
    this.playBtn.addEventListener('click', () => this.togglePlay());
    this.prevBtn.addEventListener('click', () => this.playPrevious());
    this.nextBtn.addEventListener('click', () => this.playNext());
    this.shuffleBtn.addEventListener('click', () => this.toggleShuffle());
    this.repeatBtn.addEventListener('click', () => this.cycleRepeat());

    // Audio events
    this.audio.addEventListener('timeupdate', () => {
      this.updateProgress();
      this.savePlaybackState(); // Save state periodically
    });
    this.audio.addEventListener('ended', () => this.onTrackEnded());
    this.audio.addEventListener('loadedmetadata', () => this.onMetadataLoaded());

    // Progress bar
    this.progressBar.addEventListener('click', (e) => this.seekTo(e));
    this.progressBar.addEventListener('mousemove', (e) => this.showProgressPreview(e));
    this.progressBar.addEventListener('mouseleave', () => this.hideProgressPreview());

    // Volume
    this.volumeSlider.addEventListener('input', (e) => this.setVolume(e.target.value));

    // Volume icon click to mute/unmute
    this.volumeIcon.addEventListener('click', () => this.toggleMute());

    // Volume scroll wheel support
    this.volumeIcon.addEventListener('wheel', (e) => this.handleVolumeScroll(e), { passive: false });
    this.volumeSlider.addEventListener('wheel', (e) => this.handleVolumeScroll(e), { passive: false });

    // Folder selection
    this.folderSelectBtn.addEventListener('click', () => this.selectFolder());

    // Sort control
    this.sortSelect.addEventListener('change', (e) => this.changeSortOrder(e.target.value));

    // Sidebar toggle
    this.toggleSidebarBtn.addEventListener('click', () => this.toggleSidebar());

    // Search functionality
    this.searchInput.addEventListener('input', (e) => this.handleSearch(e.target.value));
    this.searchClear.addEventListener('click', () => this.clearSearch());

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => this.handleKeyPress(e));

    // Context menu
    document.addEventListener('click', () => this.hideContextMenu());
    this.contextMenu.addEventListener('click', (e) => this.handleContextMenuClick(e));

    // Recently played
    this.clearHistoryBtn.addEventListener('click', () => this.clearRecentlyPlayed());

    // On-screen keyboard
    this.searchInput.addEventListener('focus', () => this.showKeyboard());
    this.searchInput.addEventListener('click', () => this.showKeyboard());
    this.keyboardClose.addEventListener('click', () => this.hideKeyboard());

    // Keyboard key clicks
    const keyButtons = this.onscreenKeyboard.querySelectorAll('.key-btn');
    keyButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.key;
        if (key === 'backspace') {
          this.handleKeyboardBackspace();
        } else if (key) {
          this.handleKeyboardInput(key);
        }
      });
    });

    // Set initial volume
    this.setVolume(this.volumeSlider.value);
  }

  async selectFolder() {
    try {
      // Check if running in Electron
      if (typeof ipcRenderer !== 'undefined') {
        // Use Electron's native dialog
        const result = await ipcRenderer.invoke('select-music-folder');
        if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
          return;
        }

        const folderPath = result.filePaths[0];
        this.musicFolder = folderPath;

        // Update UI
        this.musicFolderPath.textContent = `📁 ${folderPath}`;

        // Save folder path to localStorage (backup)
        localStorage.setItem('musicFolderPath', folderPath);

        // Save to settings if available
        try {
          if (typeof ipcRenderer !== 'undefined') {
            ipcRenderer.sendSync('update-settings', {
              'music.folderPath': folderPath
            });
          }
        } catch (e) {
          console.log('Could not save to settings:', e);
        }

        // Scan for music files using Electron API
        await this.scanMusicFolderElectron(folderPath);
      } else {
        // Fallback to web File System Access API (for browser testing)
        if (!window.showDirectoryPicker) {
          alert('File System Access API is not supported in this browser. Please use Chrome, Edge, or run in Electron.');
          return;
        }

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
      if (typeof ipcRenderer !== 'undefined') {
        // First try to load from settings
        let savedPath = null;
        try {
          const settings = ipcRenderer.sendSync('get-settings');
          savedPath = settings?.music?.folderPath;
        } catch (e) {
          console.log('Could not load music folder from settings, trying localStorage');
        }

        // Fallback to localStorage if settings not available
        if (!savedPath) {
          savedPath = localStorage.getItem('musicFolderPath');
        }

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
      console.log('Scanning folder for audio files...');
      const entries = await this.getAllFiles(dirHandle, audioExtensions);
      
      console.log(`Found ${entries.length} audio files`);
      
      // Build inventory with basic metadata from path
      for (const entry of entries) {
        const track = {
          name: entry.file.name,
          path: entry.path,
          fileHandle: entry.fileHandle,
          file: entry.file,
          duration: null,
          metadata: null,
          metadataLoaded: false
        };

        // Use basic info from path for initial display
        track.metadata = this.getBasicMetadata(track.name, track.path);

        this.playlist.push(track);
      }

      console.log('Inventory built with', this.playlist.length, 'tracks');

      // Update UI with basic info
      this.renderPlaylist();
      this.updateStats();

      // Now load all metadata in the background
      console.log('Loading metadata for all tracks...');
      await this.loadAllMetadata();
      
      // Update UI with full metadata
      this.renderPlaylist();
      this.updateStats();

      // Check for pending state restore
      if (this.pendingStateRestore) {
        await this.restorePlaybackState();
        this.pendingStateRestore = null;
      } else if (this.playlist.length > 0 && this.currentIndex === -1) {
        // Auto-load first track if playlist not empty and no state to restore
        this.loadTrack(0);
      }
    } catch (error) {
      console.error('Error scanning folder:', error);
    }
  }

  async loadAllMetadata() {
    // Load metadata for all tracks
    let loaded = 0;
    for (const track of this.playlist) {
      if (!track.metadataLoaded && track.file) {
        await this.extractMetadata(track);
        track.metadataLoaded = true;
        loaded++;
        
        // Update UI every 10 tracks to show progress
        if (loaded % 10 === 0) {
          console.log(`Loaded metadata for ${loaded}/${this.playlist.length} tracks`);
          this.updateStats();
        }
      }
    }
    console.log(`Metadata loading complete: ${loaded} tracks`);
  }

  async scanMusicFolderElectron(folderPath) {
    this.playlist = [];

    try {
      console.log('Scanning Electron folder for audio files...');
      // Get files from Electron API
      const files = await ipcRenderer.invoke('get-music-files', folderPath);
      
      if (!files || files.length === 0) {
        this.renderPlaylist();
        this.updateStats();
        return;
      }

      console.log(`Found ${files.length} audio files`);

      // Build quick inventory
      for (const filePath of files) {
        const fileName = filePath.split('/').pop().split('\\').pop();
        const relativePath = filePath.replace(folderPath, '').replace(/^[\/\\]/, '');
        
        const track = {
          name: fileName,
          path: relativePath,
          filePath: filePath,
          duration: null,
          metadata: null,
          metadataLoaded: false
        };

        // Extract basic metadata from path
        track.metadata = this.getBasicMetadata(fileName, relativePath);

        this.playlist.push(track);
      }

      console.log('Inventory built with', this.playlist.length, 'tracks');

      // Update UI with basic info
      this.renderPlaylist();
      this.updateStats();

      // Note: For Electron, we can't pre-load metadata from file paths
      // Metadata will be loaded when each track is played

      // Check for pending state restore
      if (this.pendingStateRestore) {
        await this.restorePlaybackState();
        this.pendingStateRestore = null;
      } else if (this.playlist.length > 0 && this.currentIndex === -1) {
        // Auto-load first track if playlist not empty and no state to restore
        this.loadTrack(0);
      }
    } catch (error) {
      console.error('Error scanning folder:', error);
      alert('Error reading music files from folder.');
    }
  }

  async getAllFiles(dirHandle, extensions, path = '', results = []) {
    for await (const entry of dirHandle.values()) {
      // Skip hidden files and macOS metadata files
      if (entry.name.startsWith('.') || entry.name.startsWith('._')) {
        continue;
      }

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
        console.log('Extracting metadata for:', track.name);
        await new Promise((resolve) => {
          window.jsmediatags.read(track.file, {
            onSuccess: (tag) => {
              console.log('Metadata found:', tag.tags);
              track.metadata = {
                title: tag.tags.title || track.name,
                artist: tag.tags.artist || 'Unknown Artist',
                album: tag.tags.album || 'Unknown Album',
                picture: tag.tags.picture
              };
              console.log('Stored metadata:', track.metadata);
              resolve();
            },
            onError: (error) => {
              console.log('Metadata read error for', track.name, ':', error);
              track.metadata = this.getBasicMetadata(track.name);
              resolve();
            }
          });
        });
      } else {
        console.warn('jsmediatags library not available');
        track.metadata = this.getBasicMetadata(track.name);
      }
    } catch (error) {
      console.error('Error extracting metadata:', error);
      track.metadata = this.getBasicMetadata(track.name);
    }
  }

  getBasicMetadata(filename, path = '') {
    // Extract basic info from filename and path structure
    const nameWithoutExt = filename.substring(0, filename.lastIndexOf('.')) || filename;
    
    // Try to extract from path: Artist/Album/Track.mp3
    let artist = 'Unknown Artist';
    let album = 'Unknown Album';
    let title = nameWithoutExt;
    
    if (path) {
      const pathParts = path.split('/');
      
      // If we have at least Artist/Album/Track structure
      if (pathParts.length >= 3) {
        artist = pathParts[pathParts.length - 3];
        album = pathParts[pathParts.length - 2];
      } else if (pathParts.length === 2) {
        // Just Album/Track
        album = pathParts[pathParts.length - 2];
      }
      
      // Clean up track number from filename if present (e.g., "01 - Song Name.mp3")
      const trackMatch = nameWithoutExt.match(/^\d+\s*[-_.]\s*(.+)$/);
      if (trackMatch) {
        title = trackMatch[1];
      }
    }
    
    return {
      title: title,
      artist: artist,
      album: album,
      picture: null
    };
  }

  changeSortOrder(sortBy) {
    this.sortBy = sortBy;
    
    // Set view mode based on sort
    if (sortBy === 'artist') {
      this.viewMode = 'artist';
      this.currentArtist = null;
      this.currentAlbum = null;
    } else if (sortBy === 'album') {
      this.viewMode = 'album';
      this.currentArtist = null;
      this.currentAlbum = null;
    } else {
      this.viewMode = 'flat';
    }
    
    this.viewStack = [];
    
    // Remember the currently playing track
    let currentTrack = null;
    if (this.currentIndex >= 0 && this.currentIndex < this.playlist.length) {
      currentTrack = this.playlist[this.currentIndex];
    }
    
    // Sort the playlist
    this.sortPlaylist();
    
    // Find the new index of the currently playing track
    if (currentTrack) {
      this.currentIndex = this.playlist.findIndex(track => 
        track.file === currentTrack.file || track.filePath === currentTrack.filePath
      );
    }
    
    // Re-render the playlist with new view mode
    this.renderPlaylist();
  }

  sortPlaylist() {
    this.playlist.sort((a, b) => {
      let aVal, bVal;
      
      switch(this.sortBy) {
        case 'artist':
          // Use the file path to determine artist/album order (folder structure)
          // Extract artist from path: Artist/Album/Track.mp3
          const aPath = a.path || a.name;
          const bPath = b.path || b.name;
          const aPathParts = aPath.split('/');
          const bPathParts = bPath.split('/');
          
          if (aPathParts.length >= 3 && bPathParts.length >= 3) {
            // Compare artist (folder before album folder)
            const aArtist = aPathParts[aPathParts.length - 3].toLowerCase();
            const bArtist = bPathParts[bPathParts.length - 3].toLowerCase();
            
            if (aArtist !== bArtist) {
              return aArtist.localeCompare(bArtist);
            }
            
            // Same artist, compare album
            const aAlbum = aPathParts[aPathParts.length - 2].toLowerCase();
            const bAlbum = bPathParts[bPathParts.length - 2].toLowerCase();
            
            if (aAlbum !== bAlbum) {
              return aAlbum.localeCompare(bAlbum);
            }
            
            // Same album, compare filename
            const aFile = aPathParts[aPathParts.length - 1].toLowerCase();
            const bFile = bPathParts[bPathParts.length - 1].toLowerCase();
            return aFile.localeCompare(bFile);
          }
          
          // Fallback to full path comparison
          return aPath.toLowerCase().localeCompare(bPath.toLowerCase());
          
        case 'album':
          // Use the file path to determine album order (folder structure)
          const aAlbumPath = a.path || a.name;
          const bAlbumPath = b.path || b.name;
          const aAlbumParts = aAlbumPath.split('/');
          const bAlbumParts = bAlbumPath.split('/');
          
          if (aAlbumParts.length >= 2 && bAlbumParts.length >= 2) {
            // Compare album (parent folder)
            const aAlbumFolder = aAlbumParts[aAlbumParts.length - 2].toLowerCase();
            const bAlbumFolder = bAlbumParts[bAlbumParts.length - 2].toLowerCase();
            
            if (aAlbumFolder !== bAlbumFolder) {
              return aAlbumFolder.localeCompare(bAlbumFolder);
            }
            
            // Same album, compare filename
            const aFileName = aAlbumParts[aAlbumParts.length - 1].toLowerCase();
            const bFileName = bAlbumParts[bAlbumParts.length - 1].toLowerCase();
            return aFileName.localeCompare(bFileName);
          }
          
          // Fallback to full path comparison
          return aAlbumPath.toLowerCase().localeCompare(bAlbumPath.toLowerCase());
          
        case 'title':
          // Sort by filename only
          aVal = (a.name || a.path.split('/').pop()).toLowerCase();
          bVal = (b.name || b.path.split('/').pop()).toLowerCase();
          break;
          
        default:
          return 0;
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

    // Render based on view mode
    if (this.viewMode === 'artist') {
      this.renderArtistView();
    } else if (this.viewMode === 'album') {
      this.renderAlbumView();
    } else {
      this.renderFlatView();
    }
  }

  renderFlatView() {
    // Show all tracks in a flat list (filtered by search query)
    this.playlist.forEach((track, index) => {
      if (this.filterTrack(track)) {
        const item = this.createTrackElement(track, index);
        this.playlistContainer.appendChild(item);
      }
    });
  }

  renderArtistView() {
    if (this.currentArtist && this.currentAlbum) {
      // Show tracks for this album (filtered by search)
      this.renderBreadcrumb();
      const tracks = this.playlist.filter(t =>
        (t.metadata?.artist || 'Unknown Artist') === this.currentArtist &&
        (t.metadata?.album || 'Unknown Album') === this.currentAlbum &&
        this.filterTrack(t)
      );
      tracks.forEach((track, idx) => {
        const actualIndex = this.playlist.indexOf(track);
        const item = this.createTrackElement(track, actualIndex);
        this.playlistContainer.appendChild(item);
      });
    } else if (this.currentArtist) {
      // Show albums for this artist (filtered by search)
      this.renderBreadcrumb();
      const albums = this.getAlbumsForArtist(this.currentArtist);
      albums.forEach(album => {
        // Only show album if it has matching tracks
        if (this.hasMatchingTracksInAlbum(this.currentArtist, album.name)) {
          const item = this.createAlbumElement(album, this.currentArtist);
          this.playlistContainer.appendChild(item);
        }
      });
    } else {
      // Show all artists (filtered by search)
      const artists = this.getAllArtists();
      artists.forEach(artist => {
        // Only show artist if they have matching tracks
        if (this.hasMatchingTracksForArtist(artist.name)) {
          const item = this.createArtistElement(artist);
          this.playlistContainer.appendChild(item);
        }
      });
    }
  }

  renderAlbumView() {
    if (this.currentAlbum) {
      // Show tracks for this album (filtered by search)
      this.renderBreadcrumb();
      const tracks = this.playlist.filter(t =>
        (t.metadata?.album || 'Unknown Album') === this.currentAlbum &&
        this.filterTrack(t)
      );
      tracks.forEach((track, idx) => {
        const actualIndex = this.playlist.indexOf(track);
        const item = this.createTrackElement(track, actualIndex);
        this.playlistContainer.appendChild(item);
      });
    } else {
      // Show all albums grouped by artist (filtered by search)
      const albums = this.getAllAlbums();
      albums.forEach(albumInfo => {
        // Only show album if it has matching tracks
        if (this.hasMatchingTracksInAlbumAny(albumInfo.album)) {
          const item = this.createAlbumGroupElement(albumInfo);
          this.playlistContainer.appendChild(item);
        }
      });
    }
  }

  renderBreadcrumb() {
    const breadcrumb = document.createElement('div');
    breadcrumb.className = 'playlist-breadcrumb';
    
    const backBtn = document.createElement('button');
    backBtn.className = 'breadcrumb-back';
    backBtn.textContent = '← Back';
    backBtn.addEventListener('click', () => this.navigateBack());
    
    let path = '';
    if (this.viewMode === 'artist') {
      path = this.currentArtist;
      if (this.currentAlbum) {
        path += ` / ${this.currentAlbum}`;
      }
    } else if (this.viewMode === 'album') {
      path = this.currentAlbum;
    }
    
    const pathText = document.createElement('span');
    pathText.className = 'breadcrumb-path';
    pathText.textContent = path;
    
    breadcrumb.appendChild(backBtn);
    breadcrumb.appendChild(pathText);
    this.playlistContainer.appendChild(breadcrumb);
  }

  navigateBack() {
    if (this.currentAlbum) {
      this.currentAlbum = null;
    } else if (this.currentArtist) {
      this.currentArtist = null;
    }
    this.renderPlaylist();
  }

  getAllArtists() {
    const artistMap = new Map();
    this.playlist.forEach(track => {
      const artist = track.metadata?.artist || 'Unknown Artist';
      if (!artistMap.has(artist)) {
        artistMap.set(artist, { name: artist, trackCount: 0 });
      }
      artistMap.get(artist).trackCount++;
    });
    return Array.from(artistMap.values()).sort((a, b) => 
      a.name.toLowerCase().localeCompare(b.name.toLowerCase())
    );
  }

  getAlbumsForArtist(artist) {
    const albumMap = new Map();
    this.playlist.forEach(track => {
      if ((track.metadata?.artist || 'Unknown Artist') === artist) {
        const album = track.metadata?.album || 'Unknown Album';
        if (!albumMap.has(album)) {
          albumMap.set(album, { name: album, trackCount: 0 });
        }
        albumMap.get(album).trackCount++;
      }
    });
    return Array.from(albumMap.values()).sort((a, b) => 
      a.name.toLowerCase().localeCompare(b.name.toLowerCase())
    );
  }

  getAllAlbums() {
    const albumMap = new Map();
    this.playlist.forEach(track => {
      const album = track.metadata?.album || 'Unknown Album';
      const artist = track.metadata?.artist || 'Unknown Artist';
      const key = `${artist}|||${album}`;
      if (!albumMap.has(key)) {
        albumMap.set(key, { album, artist, trackCount: 0 });
      }
      albumMap.get(key).trackCount++;
    });
    return Array.from(albumMap.values()).sort((a, b) => {
      const albumCompare = a.album.toLowerCase().localeCompare(b.album.toLowerCase());
      if (albumCompare !== 0) return albumCompare;
      return a.artist.toLowerCase().localeCompare(b.artist.toLowerCase());
    });
  }

  createArtistElement(artistInfo) {
    const item = document.createElement('div');
    item.className = 'group-item artist-item';
    
    const icon = document.createElement('div');
    icon.className = 'group-icon';
    icon.textContent = '👤';
    
    const info = document.createElement('div');
    info.className = 'group-info';
    
    const name = document.createElement('div');
    name.className = 'group-name';
    name.textContent = artistInfo.name;
    
    const count = document.createElement('div');
    count.className = 'group-count';
    count.textContent = `${artistInfo.trackCount} track${artistInfo.trackCount !== 1 ? 's' : ''}`;
    
    info.appendChild(name);
    info.appendChild(count);
    
    const arrow = document.createElement('div');
    arrow.className = 'group-arrow';
    arrow.textContent = '›';
    
    item.appendChild(icon);
    item.appendChild(info);
    item.appendChild(arrow);
    
    item.addEventListener('click', () => {
      this.currentArtist = artistInfo.name;
      this.renderPlaylist();
    });
    
    return item;
  }

  createAlbumElement(albumInfo, artist) {
    const item = document.createElement('div');
    item.className = 'group-item album-item';
    
    const icon = document.createElement('div');
    icon.className = 'group-icon';
    icon.textContent = '💿';
    
    const info = document.createElement('div');
    info.className = 'group-info';
    
    const name = document.createElement('div');
    name.className = 'group-name';
    name.textContent = albumInfo.name;
    
    const count = document.createElement('div');
    count.className = 'group-count';
    count.textContent = `${albumInfo.trackCount} track${albumInfo.trackCount !== 1 ? 's' : ''}`;
    
    info.appendChild(name);
    info.appendChild(count);
    
    const arrow = document.createElement('div');
    arrow.className = 'group-arrow';
    arrow.textContent = '›';
    
    item.appendChild(icon);
    item.appendChild(info);
    item.appendChild(arrow);
    
    item.addEventListener('click', () => {
      this.currentAlbum = albumInfo.name;
      this.renderPlaylist();
    });
    
    return item;
  }

  createAlbumGroupElement(albumInfo) {
    const item = document.createElement('div');
    item.className = 'group-item album-group-item';
    
    const icon = document.createElement('div');
    icon.className = 'group-icon';
    icon.textContent = '💿';
    
    const info = document.createElement('div');
    info.className = 'group-info';
    
    const name = document.createElement('div');
    name.className = 'group-name';
    name.textContent = albumInfo.album;
    
    const artist = document.createElement('div');
    artist.className = 'group-subtext';
    artist.textContent = albumInfo.artist;
    
    const count = document.createElement('div');
    count.className = 'group-count';
    count.textContent = `${albumInfo.trackCount} track${albumInfo.trackCount !== 1 ? 's' : ''}`;
    
    info.appendChild(name);
    info.appendChild(artist);
    info.appendChild(count);
    
    const arrow = document.createElement('div');
    arrow.className = 'group-arrow';
    arrow.textContent = '›';
    
    item.appendChild(icon);
    item.appendChild(info);
    item.appendChild(arrow);
    
    item.addEventListener('click', () => {
      this.currentAlbum = albumInfo.album;
      this.renderPlaylist();
    });
    
    return item;
  }

  createTrackElement(track, index) {
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

    // Add now playing indicator if this is the current track
    if (index === this.currentIndex) {
      const nowPlayingIndicator = document.createElement('div');
      nowPlayingIndicator.className = 'now-playing-indicator';
      for (let i = 0; i < 3; i++) {
        const bar = document.createElement('div');
        bar.className = 'eq-bar';
        nowPlayingIndicator.appendChild(bar);
      }
      thumbnail.appendChild(nowPlayingIndicator);
    }

    const info = document.createElement('div');
    info.className = 'track-info';

    const name = document.createElement('div');
    name.className = 'track-name';
    name.textContent = track.metadata?.title || track.name;

    const details = document.createElement('div');
    details.className = 'track-details';
    if (this.viewMode === 'flat' || this.viewMode === 'album') {
      details.textContent = track.metadata?.artist || 'Unknown Artist';
    } else {
      details.textContent = track.metadata?.album || 'Unknown Album';
    }

    info.appendChild(name);
    info.appendChild(details);

    const duration = document.createElement('div');
    duration.className = 'track-duration';
    duration.textContent = track.duration ? this.formatTime(track.duration) : '';

    item.appendChild(thumbnail);
    item.appendChild(info);
    item.appendChild(duration);

    item.addEventListener('click', async () => {
      // Set flag to auto-play when track loads
      this.shouldAutoPlay = true;
      await this.loadTrack(index);
    });

    // Context menu support
    item.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.showContextMenu(e, index);
    });

    return item;
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

    const wasPlaying = this.isPlaying;
    this.currentIndex = index;
    const track = this.playlist[index];

    // Add to recently played
    this.addToRecentlyPlayed(track);

    console.log('Loading track:', track.name);
    console.log('Was playing:', wasPlaying);
    console.log('Should auto-play:', this.shouldAutoPlay);

    try {
      // Load full metadata if not already loaded
      if (!track.metadataLoaded && track.file) {
        console.log('Loading full metadata for:', track.name);
        await this.extractMetadata(track);
        track.metadataLoaded = true;
        
        // Update the playlist display with the new metadata
        this.renderPlaylist();
      }

      // Revoke previous object URL if exists
      if (this.audio.src && this.audio.src.startsWith('blob:')) {
        URL.revokeObjectURL(this.audio.src);
      }

      // Check if using Electron or web File System API
      if (track.filePath) {
        // Electron: use file:// protocol
        this.audio.src = `file://${track.filePath}`;
        console.log('Using Electron file path:', this.audio.src);
      } else if (track.file) {
        // Web: create object URL from file
        const url = URL.createObjectURL(track.file);
        this.audio.src = url;
        console.log('Using blob URL:', this.audio.src);
      }

      // Update UI immediately
      this.updateNowPlaying(track);
      this.renderPlaylist();

      // Wait for the audio to be ready
      return new Promise((resolve, reject) => {
        const onCanPlay = async () => {
          this.audio.removeEventListener('canplay', onCanPlay);
          this.audio.removeEventListener('error', onError);
          
          console.log('Audio can play, duration:', this.audio.duration);
          
          // Auto-play if we were already playing or if clicked from playlist
          if (wasPlaying || this.shouldAutoPlay) {
            try {
              console.log('Attempting to play...');
              await this.audio.play();
              this.isPlaying = true;
              this.playBtn.textContent = '⏸';
              this.shouldAutoPlay = false;
              console.log('Playing successfully');
            } catch (error) {
              console.error('Playback error:', error);
              this.isPlaying = false;
              this.playBtn.textContent = '▶';
            }
          }
          this.renderPlaylist();
          resolve();
        };

        const onError = (error) => {
          this.audio.removeEventListener('canplay', onCanPlay);
          this.audio.removeEventListener('error', onError);
          console.error('Error loading track:', error);
          console.error('Audio error details:', this.audio.error);
          reject(error);
        };

        this.audio.addEventListener('canplay', onCanPlay, { once: true });
        this.audio.addEventListener('error', onError, { once: true });
        this.audio.load();
      });
    } catch (error) {
      console.error('Error in loadTrack:', error);
    }
  }

  updateNowPlaying(track) {
    const metadata = track.metadata || {};
    
    console.log('Updating now playing with track:', track);
    console.log('Track metadata:', metadata);

    this.trackTitle.textContent = metadata.title || track.name;
    this.trackArtist.textContent = metadata.artist || 'Unknown Artist';
    this.trackAlbum.textContent = metadata.album || 'Unknown Album';

    // Update album art
    if (metadata.picture) {
      console.log('Album art found');
      const { data, format } = metadata.picture;
      const base64 = this.arrayBufferToBase64(data);
      this.albumArt.src = `data:${format};base64,${base64}`;
      this.albumArt.classList.add('visible');
    } else {
      console.log('No album art found');
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
    if (this.playlist.length === 0) {
      console.log('No tracks in playlist');
      return;
    }

    // Load first track if none selected
    if (this.currentIndex === -1) {
      this.shouldAutoPlay = true;
      await this.loadTrack(0);
      return;
    }

    if (this.isPlaying) {
      this.audio.pause();
      this.isPlaying = false;
      this.playBtn.textContent = '▶';
    } else {
      try {
        const playPromise = this.audio.play();
        
        if (playPromise !== undefined) {
          await playPromise;
          this.isPlaying = true;
          this.playBtn.textContent = '⏸';
        }
      } catch (error) {
        console.error('Play error:', error);
        
        // If play failed, try reloading the track
        if (error.name === 'NotAllowedError' || error.name === 'NotSupportedError') {
          console.log('Reloading track due to playback error...');
          this.shouldAutoPlay = true;
          await this.loadTrack(this.currentIndex);
        } else {
          this.isPlaying = false;
          this.playBtn.textContent = '▶';
          alert('Unable to play audio. Please check the file format.');
        }
      }
    }

    this.renderPlaylist();
  }

  playPrevious() {
    if (this.playlist.length === 0) return;

    // Smart previous: if more than 3 seconds into track, restart current track
    if (this.audio.currentTime > 3) {
      this.audio.currentTime = 0;
      return;
    }

    // Otherwise go to previous track
    let newIndex = this.currentIndex - 1;
    if (newIndex < 0) {
      newIndex = this.playlist.length - 1;
    }

    // Maintain playing state
    if (this.isPlaying) {
      this.shouldAutoPlay = true;
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

    // Maintain playing state
    if (this.isPlaying) {
      this.shouldAutoPlay = true;
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

  showProgressPreview(e) {
    if (!this.audio.duration) return;

    // Create tooltip if it doesn't exist
    if (!this.progressTooltip) {
      this.progressTooltip = document.createElement('div');
      this.progressTooltip.className = 'progress-tooltip';
      this.progressBar.appendChild(this.progressTooltip);
    }

    const rect = this.progressBar.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const time = percent * this.audio.duration;

    this.progressTooltip.textContent = this.formatTime(time);
    this.progressTooltip.style.left = `${percent * 100}%`;
    this.progressTooltip.style.display = 'block';
  }

  hideProgressPreview() {
    if (this.progressTooltip) {
      this.progressTooltip.style.display = 'none';
    }
  }

  setVolume(value) {
    this.audio.volume = value / 100;
    this.volumeValue.textContent = `${value}%`;
    this.updateVolumeIcon(value);
  }

  updateVolumeIcon(value) {
    if (value == 0) {
      this.volumeIcon.textContent = '🔇';
    } else if (value < 50) {
      this.volumeIcon.textContent = '🔉';
    } else {
      this.volumeIcon.textContent = '🔊';
    }
  }

  formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';

    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  handleKeyPress(e) {
    // Don't interfere with typing in input fields
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
      return;
    }

    // Check if music interface is active
    const musicInterface = document.getElementById('musicInterface');
    if (!musicInterface || !musicInterface.classList.contains('active')) {
      return;
    }

    switch(e.key.toLowerCase()) {
      case ' ':
        // Space bar: Play/Pause
        e.preventDefault();
        this.togglePlay();
        break;

      case 'arrowright':
        // Right arrow: Seek forward 5 seconds
        e.preventDefault();
        if (this.audio.duration) {
          this.audio.currentTime = Math.min(this.audio.currentTime + 5, this.audio.duration);
        }
        break;

      case 'arrowleft':
        // Left arrow: Seek backward 5 seconds
        e.preventDefault();
        if (this.audio.duration) {
          this.audio.currentTime = Math.max(this.audio.currentTime - 5, 0);
        }
        break;

      case 'n':
        // N key: Next track
        e.preventDefault();
        this.playNext();
        break;

      case 'p':
        // P key: Previous track
        e.preventDefault();
        this.playPrevious();
        break;

      case 'm':
        // M key: Mute/unmute
        e.preventDefault();
        this.toggleMute();
        break;

      case 's':
        // S key: Toggle shuffle
        e.preventDefault();
        this.toggleShuffle();
        break;

      case 'r':
        // R key: Cycle repeat modes
        e.preventDefault();
        this.cycleRepeat();
        break;

      case 'l':
        // L key: Toggle sidebar
        e.preventDefault();
        this.toggleSidebar();
        break;
    }
  }

  toggleMute() {
    if (this.audio.volume > 0) {
      // Save current volume and mute
      this.volumeBeforeMute = this.audio.volume * 100;
      this.setVolume(0);
      this.volumeSlider.value = 0;
    } else {
      // Restore previous volume or set to 70%
      const restoreVolume = this.volumeBeforeMute || 70;
      this.setVolume(restoreVolume);
      this.volumeSlider.value = restoreVolume;
    }
  }

  handleVolumeScroll(e) {
    e.preventDefault();
    const currentVolume = parseInt(this.volumeSlider.value);
    const delta = e.deltaY < 0 ? 5 : -5; // Scroll up = increase, scroll down = decrease
    const newVolume = Math.max(0, Math.min(100, currentVolume + delta));

    this.volumeSlider.value = newVolume;
    this.setVolume(newVolume);
  }

  handleSearch(query) {
    this.searchQuery = query.toLowerCase().trim();

    // Show/hide clear button
    if (this.searchQuery) {
      this.searchClear.style.display = 'block';
    } else {
      this.searchClear.style.display = 'none';
    }

    this.renderPlaylist();
  }

  clearSearch() {
    this.searchQuery = '';
    this.searchInput.value = '';
    this.searchClear.style.display = 'none';
    this.renderPlaylist();
  }

  filterTrack(track) {
    if (!this.searchQuery) return true;

    const metadata = track.metadata || {};
    const title = (metadata.title || track.name || '').toLowerCase();
    const artist = (metadata.artist || '').toLowerCase();
    const album = (metadata.album || '').toLowerCase();

    return title.includes(this.searchQuery) ||
           artist.includes(this.searchQuery) ||
           album.includes(this.searchQuery);
  }

  hasMatchingTracksForArtist(artistName) {
    if (!this.searchQuery) return true;
    return this.playlist.some(t =>
      (t.metadata?.artist || 'Unknown Artist') === artistName &&
      this.filterTrack(t)
    );
  }

  hasMatchingTracksInAlbum(artistName, albumName) {
    if (!this.searchQuery) return true;
    return this.playlist.some(t =>
      (t.metadata?.artist || 'Unknown Artist') === artistName &&
      (t.metadata?.album || 'Unknown Album') === albumName &&
      this.filterTrack(t)
    );
  }

  hasMatchingTracksInAlbumAny(albumName) {
    if (!this.searchQuery) return true;
    return this.playlist.some(t =>
      (t.metadata?.album || 'Unknown Album') === albumName &&
      this.filterTrack(t)
    );
  }

  savePlaybackState() {
    // Throttle saves to avoid excessive localStorage writes
    if (this.saveStateTimeout) return;

    this.saveStateTimeout = setTimeout(() => {
      if (this.currentIndex >= 0 && this.playlist.length > 0) {
        const state = {
          currentIndex: this.currentIndex,
          currentTime: this.audio.currentTime,
          isPlaying: this.isPlaying,
          volume: this.audio.volume * 100,
          isShuffle: this.isShuffle,
          repeatMode: this.repeatMode,
          timestamp: Date.now()
        };
        localStorage.setItem('musicPlayerState', JSON.stringify(state));
      }
      this.saveStateTimeout = null;
    }, 2000); // Save every 2 seconds max
  }

  async restorePlaybackState() {
    try {
      const savedState = localStorage.getItem('musicPlayerState');
      if (!savedState) return;

      const state = JSON.parse(savedState);

      // Only restore if state is from within the last 7 days
      const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
      if (state.timestamp < sevenDaysAgo) {
        localStorage.removeItem('musicPlayerState');
        return;
      }

      // Wait for playlist to load
      if (this.playlist.length === 0) {
        // Will try again after folder loads
        this.pendingStateRestore = state;
        return;
      }

      // Restore state
      if (state.currentIndex < this.playlist.length) {
        await this.loadTrack(state.currentIndex);

        // Restore playback position
        if (state.currentTime) {
          this.audio.currentTime = state.currentTime;
        }

        // Restore other settings
        if (state.volume !== undefined) {
          this.volumeSlider.value = state.volume;
          this.setVolume(state.volume);
        }

        if (state.isShuffle !== undefined) {
          this.isShuffle = state.isShuffle;
          if (this.isShuffle) {
            this.shuffleBtn.classList.add('active');
          }
        }

        if (state.repeatMode !== undefined) {
          this.repeatMode = state.repeatMode;
          this.updateRepeatButton();
        }

        // Don't auto-play unless it was playing before
        if (!state.isPlaying) {
          this.audio.pause();
          this.isPlaying = false;
          this.playBtn.textContent = '▶';
        }
      }
    } catch (error) {
      console.error('Error restoring playback state:', error);
    }
  }

  updateRepeatButton() {
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

  showContextMenu(e, trackIndex) {
    e.preventDefault();
    e.stopPropagation();

    this.contextMenuTrackIndex = trackIndex;
    const track = this.playlist[trackIndex];

    // Position the context menu
    this.contextMenu.style.display = 'block';
    this.contextMenu.style.left = `${e.pageX}px`;
    this.contextMenu.style.top = `${e.pageY}px`;

    // Adjust position if menu goes off screen
    setTimeout(() => {
      const rect = this.contextMenu.getBoundingClientRect();
      if (rect.right > window.innerWidth) {
        this.contextMenu.style.left = `${window.innerWidth - rect.width - 10}px`;
      }
      if (rect.bottom > window.innerHeight) {
        this.contextMenu.style.top = `${window.innerHeight - rect.height - 10}px`;
      }
    }, 0);
  }

  hideContextMenu() {
    if (this.contextMenu) {
      this.contextMenu.style.display = 'none';
    }
  }

  handleContextMenuClick(e) {
    e.stopPropagation();
    const action = e.target.dataset.action;
    if (!action || this.contextMenuTrackIndex === null) return;

    const track = this.playlist[this.contextMenuTrackIndex];
    if (!track) return;

    switch(action) {
      case 'play-next':
        this.playTrackNext(this.contextMenuTrackIndex);
        break;

      case 'go-to-artist':
        this.goToArtist(track.metadata?.artist || 'Unknown Artist');
        break;

      case 'go-to-album':
        this.goToAlbum(track.metadata?.album || 'Unknown Album');
        break;
    }

    this.hideContextMenu();
  }

  playTrackNext(trackIndex) {
    // Insert track after current playing track
    if (this.currentIndex >= 0) {
      const track = this.playlist[trackIndex];
      // Remove from current position
      this.playlist.splice(trackIndex, 1);

      // Adjust current index if needed
      let insertIndex = this.currentIndex;
      if (trackIndex <= this.currentIndex) {
        insertIndex = this.currentIndex;
      } else {
        insertIndex = this.currentIndex + 1;
      }

      // Insert after current track
      this.playlist.splice(insertIndex, 0, track);

      // Update current index
      this.currentIndex = this.playlist.findIndex(t => t === this.playlist[this.currentIndex]);

      this.renderPlaylist();
    }
  }

  goToArtist(artistName) {
    this.sortBy = 'artist';
    this.sortSelect.value = 'artist';
    this.viewMode = 'artist';
    this.currentArtist = artistName;
    this.currentAlbum = null;
    this.searchQuery = '';
    this.searchInput.value = '';
    this.searchClear.style.display = 'none';
    this.renderPlaylist();
  }

  goToAlbum(albumName) {
    this.sortBy = 'album';
    this.sortSelect.value = 'album';
    this.viewMode = 'album';
    this.currentAlbum = albumName;
    this.currentArtist = null;
    this.searchQuery = '';
    this.searchInput.value = '';
    this.searchClear.style.display = 'none';
    this.renderPlaylist();
  }

  loadRecentlyPlayed() {
    try {
      const saved = localStorage.getItem('recentlyPlayed');
      return saved ? JSON.parse(saved) : [];
    } catch (error) {
      console.error('Error loading recently played:', error);
      return [];
    }
  }

  saveRecentlyPlayed() {
    try {
      localStorage.setItem('recentlyPlayed', JSON.stringify(this.recentlyPlayed));
    } catch (error) {
      console.error('Error saving recently played:', error);
    }
  }

  addToRecentlyPlayed(track) {
    const recentTrack = {
      name: track.name,
      path: track.path,
      filePath: track.filePath,
      metadata: track.metadata,
      timestamp: Date.now()
    };

    // Remove if already exists
    this.recentlyPlayed = this.recentlyPlayed.filter(t =>
      (t.path !== track.path && t.filePath !== track.filePath)
    );

    // Add to beginning
    this.recentlyPlayed.unshift(recentTrack);

    // Keep only last 10
    this.recentlyPlayed = this.recentlyPlayed.slice(0, 10);

    this.saveRecentlyPlayed();
    this.renderRecentlyPlayed();
  }

  renderRecentlyPlayed() {
    if (this.recentlyPlayed.length === 0) {
      this.recentlyPlayedSection.style.display = 'none';
      return;
    }

    this.recentlyPlayedSection.style.display = 'block';
    this.recentlyPlayedList.innerHTML = '';

    this.recentlyPlayed.forEach(recentTrack => {
      const item = document.createElement('div');
      item.className = 'recent-track-item';

      const thumb = document.createElement('div');
      thumb.className = 'recent-track-thumb';

      if (recentTrack.metadata?.picture) {
        const { data, format } = recentTrack.metadata.picture;
        const base64 = this.arrayBufferToBase64(data);
        const img = document.createElement('img');
        img.src = `data:${format};base64,${base64}`;
        thumb.appendChild(img);
      } else {
        thumb.textContent = '🎵';
      }

      const info = document.createElement('div');
      info.className = 'recent-track-info';

      const name = document.createElement('div');
      name.className = 'recent-track-name';
      name.textContent = recentTrack.metadata?.title || recentTrack.name;

      const artist = document.createElement('div');
      artist.className = 'recent-track-artist';
      artist.textContent = recentTrack.metadata?.artist || 'Unknown Artist';

      info.appendChild(name);
      info.appendChild(artist);

      const time = document.createElement('div');
      time.className = 'recent-track-time';
      time.textContent = this.formatTimeAgo(recentTrack.timestamp);

      item.appendChild(thumb);
      item.appendChild(info);
      item.appendChild(time);

      // Click to play
      item.addEventListener('click', () => {
        const trackIndex = this.playlist.findIndex(t =>
          t.path === recentTrack.path || t.filePath === recentTrack.filePath
        );
        if (trackIndex >= 0) {
          this.shouldAutoPlay = true;
          this.loadTrack(trackIndex);
        }
      });

      this.recentlyPlayedList.appendChild(item);
    });
  }

  clearRecentlyPlayed() {
    this.recentlyPlayed = [];
    this.saveRecentlyPlayed();
    this.renderRecentlyPlayed();
  }

  formatTimeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);

    if (seconds < 60) return 'Just now';

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;

    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;

    return 'Over a week ago';
  }

  showKeyboard() {
    this.onscreenKeyboard.style.display = 'block';
    this.searchInput.removeAttribute('readonly');
    this.searchInput.focus();
  }

  hideKeyboard() {
    this.onscreenKeyboard.style.display = 'none';
    this.searchInput.setAttribute('readonly', 'true');
    this.searchInput.blur();
  }

  handleKeyboardInput(key) {
    const currentValue = this.searchInput.value;
    this.searchInput.value = currentValue + key;
    this.handleSearch(this.searchInput.value);
  }

  handleKeyboardBackspace() {
    const currentValue = this.searchInput.value;
    this.searchInput.value = currentValue.slice(0, -1);
    this.handleSearch(this.searchInput.value);
  }
}

// Initialize music player when music interface is opened
let musicPlayer = null;

function initMusicPlayer() {
  if (!musicPlayer) {
    musicPlayer = new MusicPlayer();
  }
  return musicPlayer;
}

// Export for use in main app
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MusicPlayer, initMusicPlayer };
}

// Make it available globally
window.MusicPlayer = MusicPlayer;
window.initMusicPlayer = initMusicPlayer;