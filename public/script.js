class TelegramMusicPlayer {
    constructor() {
        this.audio = document.getElementById('audio-player');
        this.playPauseBtn = document.getElementById('play-pause-btn');
        this.nextBtn = document.getElementById('next-btn');
        this.prevBtn = document.getElementById('prev-btn');
        this.volumeSlider = document.getElementById('volume-slider');
        this.progressBar = document.getElementById('progress');
        this.currentTimeEl = document.getElementById('current-time');
        this.durationEl = document.getElementById('duration');
        this.trackTitle = document.getElementById('track-title');
        this.trackArtist = document.getElementById('track-artist');
        this.playlistContainer = document.getElementById('playlist-container');
        this.refreshBtn = document.getElementById('refresh-btn');
        
        this.playlist = [];
        this.currentTrack = null;
        this.isPlaying = false;
        this.currentIndex = 0;
        
        this.init();
    }
    
    async init() {
        this.setupEventListeners();
        await this.loadPlaylist();
        this.setupAutoPlay();
    }
    
    setupEventListeners() {
        // Play/Pause button
        this.playPauseBtn.addEventListener('click', () => {
            this.togglePlayPause();
        });
        
        // Next/Previous buttons
        this.nextBtn.addEventListener('click', () => {
            this.nextTrack();
        });
        
        this.prevBtn.addEventListener('click', () => {
            this.previousTrack();
        });
        
        // Refresh button
        this.refreshBtn.addEventListener('click', () => {
            this.refreshPlaylist();
        });
        
        // Volume control
        this.volumeSlider.addEventListener('input', (e) => {
            this.audio.volume = e.target.value / 100;
        });
        
        // Audio events
        this.audio.addEventListener('timeupdate', () => {
            this.updateProgress();
        });
        
        this.audio.addEventListener('ended', () => {
            this.nextTrack();
        });
        
        this.audio.addEventListener('loadedmetadata', () => {
            this.updateDuration();
        });
        
        this.audio.addEventListener('canplaythrough', () => {
            if (this.isPlaying) {
                this.audio.play().catch(console.error);
            }
        });
        
        // Add seek functionality to progress bar
        this.setupSeekBar();
    }
    
    async loadPlaylist() {
        try {
            // Use proper API URL for both development and production
            const baseUrl = window.location.hostname.includes('localhost') ? '' : '/.netlify/functions';
            const response = await fetch(`${baseUrl}/api/playlist`);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            this.playlist = await response.json();
            this.renderPlaylist();
            
            if (this.playlist.length > 0) {
                await this.loadCurrentTrack();
            } else {
                this.showMessage('No music found in channel. Please check if the bot has access to the channel.');
            }
        } catch (error) {
            console.error('Error loading playlist:', error);
            this.showMessage('Error connecting to Telegram channel. Please try again.');
        }
    }
    
    async loadCurrentTrack() {
        try {
            const baseUrl = window.location.hostname.includes('localhost') ? '' : '/.netlify/functions';
            const response = await fetch(`${baseUrl}/api/current`);
            const data = await response.json();
            
            if (data.track) {
                this.currentTrack = data.track;
                this.currentIndex = data.index;
                this.updateTrackInfo();
                
                if (this.currentTrack.url) {
                    this.audio.src = this.currentTrack.url;
                }
            }
        } catch (error) {
            console.error('Error loading current track:', error);
        }
    }
    
    updateTrackInfo() {
        if (this.currentTrack) {
            this.trackTitle.textContent = this.currentTrack.title || 'Unknown Track';
            this.trackArtist.textContent = `From Channel`;
        }
    }
    
    renderPlaylist() {
        if (this.playlist.length === 0) {
            this.playlistContainer.innerHTML = `
                <div class="loading">
                    <i class="fas fa-music"></i>
                    No music files found in the channel yet.
                </div>
            `;
            return;
        }
        
        this.playlistContainer.innerHTML = this.playlist.map((track, index) => `
            <div class="playlist-item ${index === this.currentIndex ? 'active' : ''}" 
                 onclick="player.playTrack(${index})">
                <div class="playlist-item-info">
                    <h4>${track.title}</h4>
                    <p>${track.duration || 'Unknown duration'}</p>
                </div>
                <i class="fas fa-play"></i>
            </div>
        `).join('');
    }
    
    async playTrack(index) {
        try {
            // Call backend API to set the specific track
            const baseUrl = window.location.hostname.includes('localhost') ? '' : '/.netlify/functions';
            const response = await fetch(`${baseUrl}/api/track/${index}`, { method: 'POST' });
            const result = await response.json();
            
            if (result.success) {
                // Update local index first
                this.currentIndex = result.index;
                
                // Use loadCurrentTrack to ensure proper sync and URL handling
                await this.loadCurrentTrack();
                
                this.play();
                this.renderPlaylist();
                
                console.log(`🎵 Now playing: ${this.currentTrack ? this.currentTrack.title : 'Unknown'}`);
            } else {
                console.error('Error switching track:', result.error);
                this.showMessage('Error playing selected track');
            }
        } catch (error) {
            console.error('Error playing track:', error);
            this.showMessage('Failed to load selected track');
        }
    }
    
    togglePlayPause() {
        if (this.isPlaying) {
            this.pause();
        } else {
            this.play();
        }
    }
    
    play() {
        if (this.currentTrack && this.currentTrack.url) {
            this.audio.play().then(() => {
                this.isPlaying = true;
                this.playPauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
            }).catch(error => {
                console.error('Error playing audio:', error);
                this.showMessage('Error playing audio. The file might not be supported.');
            });
        } else {
            this.showMessage('No audio file available to play.');
        }
    }
    
    pause() {
        this.audio.pause();
        this.isPlaying = false;
        this.playPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
    }
    
    async nextTrack() {
        try {
            const baseUrl = window.location.hostname.includes('localhost') ? '' : '/.netlify/functions';
            await fetch(`${baseUrl}/api/next`, { method: 'POST' });
            await this.loadCurrentTrack();
            if (this.isPlaying) {
                this.play();
            }
            this.renderPlaylist();
        } catch (error) {
            console.error('Error playing next track:', error);
        }
    }
    
    async previousTrack() {
        try {
            const baseUrl = window.location.hostname.includes('localhost') ? '' : '/.netlify/functions';
            await fetch(`${baseUrl}/api/prev`, { method: 'POST' });
            await this.loadCurrentTrack();
            if (this.isPlaying) {
                this.play();
            }
            this.renderPlaylist();
        } catch (error) {
            console.error('Error playing previous track:', error);
        }
    }
    
    updateProgress() {
        if (this.audio.duration) {
            const progress = (this.audio.currentTime / this.audio.duration) * 100;
            this.progressBar.style.width = progress + '%';
            this.currentTimeEl.textContent = this.formatTime(this.audio.currentTime);
        }
    }
    
    updateDuration() {
        if (this.audio.duration) {
            this.durationEl.textContent = this.formatTime(this.audio.duration);
        }
    }
    
    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
    
    setupSeekBar() {
        // Get the full progress bar container element (not just the filled part)
        const progressBarContainer = document.querySelector('.track-progress');
        
        if (progressBarContainer) {
            // Find the actual progress bar inside the container
            const progressBar = progressBarContainer.querySelector('.progress-bar');
            
            if (progressBar) {
                // Add click event listener for seeking on the full container
                progressBar.addEventListener('click', async (e) => {
                    if (this.audio.duration) {
                        const rect = progressBar.getBoundingClientRect();
                        const clickX = e.clientX - rect.left;
                        const width = rect.width;
                        const seekPercentage = clickX / width;
                        const seekTime = seekPercentage * this.audio.duration;
                        
                        // Ensure seek time is within bounds
                        const boundedSeekTime = Math.max(0, Math.min(seekTime, this.audio.duration));
                        
                        // Seek to the clicked position
                        this.audio.currentTime = boundedSeekTime;
                        
                        // Sync position with backend
                        try {
                            const baseUrl = window.location.hostname.includes('localhost') ? '' : '/.netlify/functions';
                            await fetch(`${baseUrl}/api/seek`, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({ position: boundedSeekTime })
                            });
                            console.log(`🎯 Seeking to ${this.formatTime(boundedSeekTime)} (synced with backend)`);
                        } catch (error) {
                            console.error('Error syncing seek position:', error);
                            console.log(`🎯 Seeking to ${this.formatTime(boundedSeekTime)} (local only)`);
                        }
                    }
                });
                
                // Add visual feedback on hover
                progressBar.style.cursor = 'pointer';
                progressBar.title = 'Click anywhere to seek';
            }
        }
    }

    setupAutoPlay() {
        // Auto-start playing when page loads (with user interaction)
        document.addEventListener('click', () => {
            if (!this.isPlaying && this.playlist.length > 0) {
                this.play();
            }
        }, { once: true });
    }
    
    async refreshPlaylist() {
        try {
            this.refreshBtn.disabled = true;
            this.refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Refreshing...';
            
            this.showMessage('Refreshing playlist from Telegram channel...');
            
            const baseUrl = window.location.hostname.includes('localhost') ? '' : '/.netlify/functions';
            const response = await fetch(`${baseUrl}/api/refresh`, { method: 'POST' });
            const result = await response.json();
            
            if (result.success) {
                this.showMessage(`Found ${result.tracks} tracks from channel!`);
                await this.loadPlaylist();
                
                if (this.playlist.length > 0) {
                    await this.loadCurrentTrack();
                    this.showMessage('Playlist updated successfully!');
                }
            } else {
                this.showMessage('Failed to refresh playlist. Check console for details.');
                console.error('Refresh error:', result.error);
            }
            
        } catch (error) {
            console.error('Error refreshing playlist:', error);
            this.showMessage('Error refreshing playlist. Please try again.');
        } finally {
            this.refreshBtn.disabled = false;
            this.refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Refresh from Channel';
        }
    }
    
    showMessage(message) {
        this.trackTitle.textContent = message;
        this.trackArtist.textContent = 'Telegram Music Player';
    }
}

// Initialize the player when page loads
let player;
document.addEventListener('DOMContentLoaded', () => {
    player = new TelegramMusicPlayer();
    
    // Set initial volume
    document.getElementById('volume-slider').value = 70;
    
    // Show connection status
    console.log('🎵 Telegram Music Player initialized');
    console.log('📱 Connecting to channel...');
});