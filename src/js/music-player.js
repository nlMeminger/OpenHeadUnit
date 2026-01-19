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
    this.musicFolderPath = document.getElementById('musicFolderPath');

    // State
    this.sortBy = 'title';
    this.sidebarVisible = true;
    this.viewMode = 'flat'; // 'flat', 'artist', 'album'
    this.currentArtist = null;
    this.currentAlbum = null;
    this.viewStack = []; // For breadcrumb navigation
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

      // Auto-load first track if playlist not empty
      if (this.playlist.length > 0 && this.currentIndex === -1) {
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
      const files = await window.electronAPI.getMusicFiles(folderPath);
      
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
    // Show all tracks in a flat list
    this.playlist.forEach((track, index) => {
      const item = this.createTrackElement(track, index);
      this.playlistContainer.appendChild(item);
    });
  }

  renderArtistView() {
    if (this.currentArtist && this.currentAlbum) {
      // Show tracks for this album
      this.renderBreadcrumb();
      const tracks = this.playlist.filter(t => 
        (t.metadata?.artist || 'Unknown Artist') === this.currentArtist &&
        (t.metadata?.album || 'Unknown Album') === this.currentAlbum
      );
      tracks.forEach((track, idx) => {
        const actualIndex = this.playlist.indexOf(track);
        const item = this.createTrackElement(track, actualIndex);
        this.playlistContainer.appendChild(item);
      });
    } else if (this.currentArtist) {
      // Show albums for this artist
      this.renderBreadcrumb();
      const albums = this.getAlbumsForArtist(this.currentArtist);
      albums.forEach(album => {
        const item = this.createAlbumElement(album, this.currentArtist);
        this.playlistContainer.appendChild(item);
      });
    } else {
      // Show all artists
      const artists = this.getAllArtists();
      artists.forEach(artist => {
        const item = this.createArtistElement(artist);
        this.playlistContainer.appendChild(item);
      });
    }
  }

  renderAlbumView() {
    if (this.currentAlbum) {
      // Show tracks for this album
      this.renderBreadcrumb();
      const tracks = this.playlist.filter(t => 
        (t.metadata?.album || 'Unknown Album') === this.currentAlbum
      );
      tracks.forEach((track, idx) => {
        const actualIndex = this.playlist.indexOf(track);
        const item = this.createTrackElement(track, actualIndex);
        this.playlistContainer.appendChild(item);
      });
    } else {
      // Show all albums grouped by artist
      const albums = this.getAllAlbums();
      albums.forEach(albumInfo => {
        const item = this.createAlbumGroupElement(albumInfo);
        this.playlistContainer.appendChild(item);
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
  return musicPlayer;
}

// Export for use in main app
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MusicPlayer, initMusicPlayer };
}

// Make it available globally
window.MusicPlayer = MusicPlayer;
window.initMusicPlayer = initMusicPlayer;