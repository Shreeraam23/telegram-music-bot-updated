// Persistent storage utility for serverless environment
// This provides REAL persistent storage using Netlify Blobs

// Import Netlify Blobs for real persistence
let getStore;
try {
    const netlifyBlobs = require('@netlify/blobs');
    getStore = netlifyBlobs.getStore;
    console.log('✅ Netlify Blobs module imported successfully');
} catch (error) {
    console.log('⚠️ Netlify Blobs not available, using fallback storage');
    getStore = null;
}

class PersistentStorage {
    constructor() {
        this.STORAGE_KEY = 'music_cache_data';
        this.STORE_NAME = 'telegram-music-cache';
        // Use in-memory cache as backup
        this.memoryCache = null;
        
        // Initialize Netlify Blobs store if available
        this.blobStore = null;
        if (getStore) {
            try {
                // Netlify Blobs getStore - try simple syntax first (works in Netlify environment)
                this.blobStore = getStore(this.STORE_NAME);
                console.log('✅ Netlify Blobs store initialized:', this.STORE_NAME);
            } catch (error) {
                console.log('⚠️ Failed to initialize Netlify Blobs store:', error.message);
                // For local development without Netlify environment, fallback to null
                this.blobStore = null;
            }
        }
    }

    // Load data from persistent storage
    async loadData() {
        try {
            console.log('📁 Loading cached data from persistent storage...');
            
            // First check memory cache
            if (this.memoryCache) {
                console.log(`✅ Loaded ${this.memoryCache.musicFiles?.length || 0} files from memory cache`);
                return this.memoryCache;
            }
            
            // Try to load from local file system first (works in both environments)
            try {
                const fs = require('fs');
                const path = require('path');
                
                // Try multiple possible paths for music_cache.json
                const possiblePaths = [
                    './music_cache.json',
                    '../music_cache.json',
                    '../../music_cache.json',
                    path.join(process.cwd(), 'music_cache.json'),
                ];
                
                for (const filePath of possiblePaths) {
                    try {
                        if (fs.existsSync(filePath)) {
                            const data = fs.readFileSync(filePath, 'utf8');
                            const parsed = JSON.parse(data);
                            if (parsed.musicFiles && parsed.musicFiles.length > 0) {
                                this.memoryCache = parsed;
                                console.log(`✅ Loaded ${parsed.musicFiles.length} cached music files from ${filePath}`);
                                return parsed;
                            }
                        }
                    } catch (err) {
                        // Continue to next path
                    }
                }
                console.log('📭 No music_cache.json found in expected locations');
            } catch (fsError) {
                console.log('⚠️ File system access failed:', fsError.message);
            }
            
            // Try to load from Netlify Blobs (REAL persistence)
            if (this.blobStore) {
                try {
                    console.log('🔎 Checking Netlify Blobs for cached data...');
                    const blobData = await this.blobStore.get(this.STORAGE_KEY, { type: 'text' });
                    
                    if (blobData) {
                        const parsed = JSON.parse(blobData);
                        this.memoryCache = parsed; // Cache in memory for faster access
                        console.log(`✅ Loaded ${parsed.musicFiles?.length || 0} cached music files from Netlify Blobs`);
                        return parsed;
                    } else {
                        console.log('📭 No data found in Netlify Blobs');
                    }
                } catch (blobError) {
                    console.log(`⚠️ Error reading from Netlify Blobs: ${blobError.message}`);
                }
            }
            
            // Fallback: Try to load from environment variable (for initial setup)
            const cachedData = process.env.MUSIC_CACHE_DATA;
            
            if (cachedData) {
                const parsed = JSON.parse(cachedData);
                this.memoryCache = parsed; // Cache in memory
                console.log(`✅ Loaded ${parsed.musicFiles?.length || 0} cached music files from environment (fallback)`);
                return parsed;
            } else {
                console.log('📭 No cached data found in any storage');
                return null;
            }
        } catch (error) {
            console.error('❌ Error loading cached data:', error.message);
            return null;
        }
    }

    // Save data to persistent storage
    async saveData(data) {
        try {
            const dataToSave = {
                musicFiles: data.musicFiles || [],
                currentIndex: data.currentIndex || 0,
                lastUpdated: new Date().toISOString()
            };
            
            // Save to memory cache for current function execution
            this.memoryCache = dataToSave;
            
            // Save to Netlify Blobs for REAL persistence between invocations
            if (this.blobStore) {
                try {
                    await this.blobStore.set(this.STORAGE_KEY, JSON.stringify(dataToSave), {
                        metadata: {
                            timestamp: new Date().toISOString(),
                            tracks: dataToSave.musicFiles.length
                        }
                    });
                    console.log(`💾 ✅ Saved ${dataToSave.musicFiles.length} tracks to Netlify Blobs (PERSISTENT)`);
                    return true;
                } catch (blobError) {
                    console.error(`❌ Error saving to Netlify Blobs: ${blobError.message}`);
                    console.log('⚠️ Falling back to memory-only storage');
                }
            } else {
                console.log('⚠️ Netlify Blobs not available, data saved to memory only');
            }
            
            console.log(`💾 Saved ${dataToSave.musicFiles.length} tracks to memory cache`);
            return true;
        } catch (error) {
            console.error('❌ Error saving data:', error.message);
            return false;
        }
    }

    // Load music files from persistent storage
    async loadPersistedMusic() {
        try {
            const cached = await this.loadData();
            
            if (cached && cached.musicFiles && cached.musicFiles.length > 0) {
                console.log(`✅ Loaded ${cached.musicFiles.length} cached music files`);
                console.log('🎵 Track list:');
                cached.musicFiles.forEach((track, index) => {
                    console.log(`   ${index + 1}. ${track.title}`);
                });
                return {
                    musicFiles: cached.musicFiles,
                    currentIndex: cached.currentIndex || 0
                };
            }
            return null;
        } catch (error) {
            console.error('Error loading persisted music:', error);
            return null;
        }
    }

    // Save music files to persistent storage
    async savePersistedMusic(musicFiles, currentIndex = 0) {
        try {
            const result = await this.saveData({
                musicFiles,
                currentIndex
            });
            return result;
        } catch (error) {
            console.error('Error saving persisted music:', error);
            return false;
        }
    }

    // Clear cache (useful for testing)
    clearCache() {
        this.memoryCache = null;
        console.log('🧹 Memory cache cleared');
    }
}

// Export singleton instance
const storage = new PersistentStorage();
module.exports = storage;