const express = require('express');
const serverless = require('serverless-http');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const path = require('path');
const storage = require('./storage');

// Create Express app
const app = express();
const router = express.Router();

// Load configuration
const config = require('../config');

// Bot token from config (supports both env vars and hardcoded)
const BOT_TOKEN = config.TELEGRAM_BOT_TOKEN;
const CHANNEL_ID = config.CHANNEL_ID;

// Global variables for music state
let musicFiles = [];
let currentIndex = 0;
let currentPosition = 0;
let bot = null;

// Initialize bot instance with proper webhook setup
async function initBot() {
    if (!BOT_TOKEN) {
        console.error('❌ TELEGRAM_BOT_TOKEN environment variable is required');
        return null;
    }

    if (!bot) {
        bot = new TelegramBot(BOT_TOKEN, { 
            polling: false // Use webhook mode for serverless
        });
        
        // Setup bot commands
        setupBotCommands();
    }
    return bot;
}

// Setup bot commands and handlers
function setupBotCommands() {
    if (!bot) return;
    
    // Get web player URL from config
    const webPlayerUrl = config.getWebPlayerUrl();
    
    // /start command
    bot.onText(/\/start/, async (msg) => {
        const chatId = msg.chat.id;
        console.log(`📱 /start command received from chat ID: ${chatId}`);
        
        const welcomeMessage = `
🎵 *Welcome to Web Music Player Bot!* 🎶

मैं आपके channel से music play करने वाला bot हूँ।

📱 *Commands*:
/start - Welcome message
/help - Commands list  
/status - Bot status
/music - Current playlist info
/channel - Channel info

✨ नीचे दिए गए button पर click करके continuous music enjoy करें!
        `;
        
        const inlineKeyboard = {
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: "🎵 Play Music 🎶",
                            web_app: {
                                url: webPlayerUrl
                            }
                        }
                    ],
                    [
                        {
                            text: "📱 Get Current Playlist",
                            callback_data: "get_playlist"
                        },
                        {
                            text: "🔄 Refresh Songs",
                            callback_data: "refresh_music"
                        }
                    ]
                ]
            },
            parse_mode: 'Markdown'
        };
        
        try {
            await bot.sendMessage(chatId, welcomeMessage, inlineKeyboard);
            console.log('✅ Welcome message with inline buttons sent successfully');
        } catch (error) {
            console.error('❌ Error sending welcome message:', error.message);
        }
    });

    // Handle callback queries
    bot.on('callback_query', async (callbackQuery) => {
        const msg = callbackQuery.message;
        const chatId = msg.chat.id;
        const data = callbackQuery.data;
        
        console.log(`📱 Callback query received: ${data}`);
        
        try {
            if (data === 'get_playlist') {
                if (musicFiles.length === 0) {
                    await initializeMusic();
                }
                
                let playlistText = `🎵 *Current Playlist* (${musicFiles.length} tracks):\n\n`;
                musicFiles.forEach((track, index) => {
                    const isPlaying = index === currentIndex ? '▶️' : `${index + 1}.`;
                    playlistText += `${isPlaying} ${track.title}\n`;
                });
                
                await bot.sendMessage(chatId, playlistText, { parse_mode: 'Markdown' });
                
            } else if (data === 'refresh_music') {
                await bot.sendMessage(chatId, '🔄 Refreshing playlist...');
                await initializeMusic();
                await bot.sendMessage(chatId, `✅ Playlist refreshed! Total: ${musicFiles.length} tracks`);
            }
            
            // Acknowledge the callback query
            await bot.answerCallbackQuery(callbackQuery.id);
            
        } catch (error) {
            console.error('❌ Error handling callback query:', error.message);
            await bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Error occurred' });
        }
    });

    // Other commands
    bot.onText(/\/help/, async (msg) => {
        const chatId = msg.chat.id;
        const helpMessage = `
🤖 *Bot Commands*:

/start - Welcome message और web player link
/help - Commands की list
/status - Bot की current status
/music - Current playlist info
/channel - Channel information

🎵 Music Player features:
- Web-based music player
- Playlist management
- Real-time controls
- Channel integration
        `;
        
        try {
            await bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
        } catch (error) {
            console.error('❌ Error sending help message:', error.message);
        }
    });

    bot.onText(/\/status/, async (msg) => {
        const chatId = msg.chat.id;
        try {
            if (musicFiles.length === 0) {
                await initializeMusic();
            }
            
            const statusMessage = `
🤖 *Bot Status*:

✅ Bot: Online
🎵 Tracks: ${musicFiles.length}
📱 Channel: ${CHANNEL_ID}
🌐 Web Player: ${webPlayerUrl}
🎯 Current Track: ${currentIndex + 1}/${musicFiles.length}

${musicFiles.length > 0 ? `🎵 Now: ${musicFiles[currentIndex]?.title || 'Unknown'}` : '📭 No tracks loaded'}
            `;
            
            await bot.sendMessage(chatId, statusMessage, { parse_mode: 'Markdown' });
        } catch (error) {
            console.error('❌ Error sending status:', error.message);
        }
    });

    console.log('✅ Bot commands initialized');
}

// Load music data from persistent storage
async function loadMusicData() {
    try {
        const data = await storage.loadPersistedMusic();
        if (data) {
            musicFiles = data.musicFiles;
            currentIndex = data.currentIndex;
            return true;
        }
        return false;
    } catch (error) {
        console.error('Error loading music data:', error);
        return false;
    }
}

// Save music data to persistent storage
async function saveMusicData() {
    try {
        await storage.savePersistedMusic(musicFiles, currentIndex);
        return true;
    } catch (error) {
        console.error('Error saving music data:', error);
        return false;
    }
}

// Try to get real channel music instead of demo playlist
async function loadChannelMusic() {
    console.log('🎵 Attempting to load real music from channel...');
    
    // Return empty array instead of demo songs
    // Real music should be loaded from storage/cache
    musicFiles = [];
    
    console.log('⚠️ No music found. Check if:');
    console.log('   • Bot has admin access to channel');
    console.log('   • Music files are uploaded to channel');
    console.log('   • Storage/cache is properly configured');
    
    return musicFiles;
}

// Initialize music data
async function initializeMusic() {
    console.log('🎵 Initializing music data...');
    
    // First try to load from persistent storage
    const loaded = await loadMusicData();
    
    if (loaded && musicFiles.length > 0) {
        console.log(`✅ Loaded ${musicFiles.length} real music files from storage`);
        return;
    }
    
    // If no cached data, try to load from channel
    console.log('⚠️ No cached music found, attempting to load from channel...');
    await loadChannelMusic();
    
    if (musicFiles.length === 0) {
        console.log('❌ No music available. Please:');
        console.log('   1. Make sure bot is admin in channel');
        console.log('   2. Upload music files to channel');
        console.log('   3. Use /refresh command to sync');
    }
}

// Get playlist endpoint (returns array for frontend compatibility)
router.get('/playlist', async (req, res) => {
    try {
        // Initialize music if not loaded
        if (musicFiles.length === 0) {
            await initializeMusic();
        }

        // Return array directly as frontend expects
        res.json(musicFiles);
    } catch (error) {
        console.error('Error getting playlist:', error);
        res.status(500).json([]);
    }
});

// Get current track endpoint
router.get('/current', async (req, res) => {
    try {
        if (musicFiles.length === 0) {
            await initializeMusic();
        }

        if (musicFiles.length > 0 && currentIndex < musicFiles.length) {
            const track = musicFiles[currentIndex];
            
            // Ensure track has a playable URL
            if (!track.url && track.fileId && bot) {
                try {
                    track.url = await bot.getFileLink(track.fileId);
                    await saveMusicData();
                } catch (error) {
                    console.log(`⚠️ Could not generate URL for ${track.title}: ${error.message}`);
                }
            }
            
            res.json({ 
                success: true, 
                track: track,
                index: currentIndex,
                total: musicFiles.length
            });
        } else {
            res.json({ 
                success: false, 
                error: 'No tracks available',
                total: musicFiles.length
            });
        }
    } catch (error) {
        console.error('Error getting current track:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Next track endpoint
router.post('/next', async (req, res) => {
    try {
        if (musicFiles.length === 0) {
            await initializeMusic();
        }

        if (musicFiles.length > 0) {
            currentIndex = (currentIndex + 1) % musicFiles.length;
            currentPosition = 0;
            await saveMusicData();
            
            const track = musicFiles[currentIndex];
            
            // Ensure track has a playable URL
            if (!track.url && track.fileId && bot) {
                try {
                    track.url = await bot.getFileLink(track.fileId);
                    await saveMusicData();
                } catch (error) {
                    console.log(`⚠️ Could not generate URL for ${track.title}: ${error.message}`);
                }
            }
            
            console.log(`🎵 Next track: ${track.title}`);
            res.json({ 
                success: true, 
                track: track,
                index: currentIndex
            });
        } else {
            res.status(404).json({ success: false, error: 'No tracks available' });
        }
    } catch (error) {
        console.error('Error getting next track:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Previous track endpoint
router.post('/prev', async (req, res) => {
    try {
        if (musicFiles.length === 0) {
            await initializeMusic();
        }

        if (musicFiles.length > 0) {
            currentIndex = currentIndex > 0 ? currentIndex - 1 : musicFiles.length - 1;
            currentPosition = 0;
            await saveMusicData();
            
            const track = musicFiles[currentIndex];
            
            // Ensure track has a playable URL
            if (!track.url && track.fileId && bot) {
                try {
                    track.url = await bot.getFileLink(track.fileId);
                    await saveMusicData();
                } catch (error) {
                    console.log(`⚠️ Could not generate URL for ${track.title}: ${error.message}`);
                }
            }
            
            console.log(`🎵 Previous track: ${track.title}`);
            res.json({ 
                success: true, 
                track: track,
                index: currentIndex
            });
        } else {
            res.status(404).json({ success: false, error: 'No tracks available' });
        }
    } catch (error) {
        console.error('Error getting previous track:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Set track endpoint
router.post('/track/:index', async (req, res) => {
    try {
        const index = parseInt(req.params.index);
        
        if (musicFiles.length === 0) {
            await initializeMusic();
        }
        
        if (index >= 0 && index < musicFiles.length) {
            currentIndex = index;
            currentPosition = 0;
            await saveMusicData();
            
            const track = musicFiles[currentIndex];
            
            // Ensure track has a playable URL
            if (!track.url && track.fileId && bot) {
                try {
                    track.url = await bot.getFileLink(track.fileId);
                    await saveMusicData();
                } catch (error) {
                    console.log(`⚠️ Could not generate URL for ${track.title}: ${error.message}`);
                }
            }
            
            console.log(`🎵 Switching to track ${index + 1}: ${track.title}`);
            res.json({ 
                success: true, 
                index: currentIndex,
                track: track,
                position: currentPosition
            });
        } else {
            res.status(400).json({ 
                success: false, 
                error: 'Invalid track index',
                maxIndex: musicFiles.length - 1
            });
        }
    } catch (error) {
        console.error('Error setting track:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Sync seek position
router.post('/seek', async (req, res) => {
    try {
        const { position } = req.body;
        
        if (typeof position === 'number' && position >= 0) {
            currentPosition = position;
            console.log(`🎯 Position synced: ${Math.floor(position / 60)}:${Math.floor(position % 60).toString().padStart(2, '0')}`);
            res.json({ success: true, position: currentPosition });
        } else {
            res.status(400).json({ 
                success: false, 
                error: 'Invalid position value'
            });
        }
    } catch (error) {
        console.error('Error syncing position:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get current position
router.get('/position', (req, res) => {
    res.json({ position: currentPosition });
});

// Enhanced refresh music endpoint with advanced channel scanning
router.post('/refresh', async (req, res) => {
    try {
        console.log('🔄 Enhanced manual refresh requested - starting deep channel scan...');
        
        // Clear current music cache
        const previousTrackCount = musicFiles.length;
        musicFiles.length = 0;
        currentIndex = 0;
        
        // Clear cached data file
        try {
            const fs = require('fs');
            if (fs.existsSync('music_cache.json')) {
                fs.unlinkSync('music_cache.json');
                console.log('🗑️ Cleared music cache file');
            }
        } catch (clearError) {
            console.log('⚠️ Could not clear cache file:', clearError.message);
        }
        
        // Enhanced channel scanning function for API context
        async function enhancedChannelScan() {
            try {
                console.log('🔍 Starting enhanced channel scan from API...');
                
                if (!bot) {
                    await initBot();
                }
                
                if (!bot) {
                    console.log('❌ Bot not available for scanning');
                    return [];
                }
                
                const channelInfo = await bot.getChat(CHANNEL_ID);
                console.log(`✅ Found channel: ${channelInfo.title}`);
                
                // Check admin access
                const botInfo = await bot.getMe();
                const adminsList = await bot.getChatAdministrators(channelInfo.id);
                const botAdmin = adminsList.find(admin => admin.user.id.toString() === botInfo.id.toString());
                
                if (!botAdmin) {
                    console.log('⚠️ Bot is not admin - cannot scan');
                    return [];
                }
                
                console.log('✅ Bot confirmed as admin - starting message ID scanning...');
                const foundTracks = [];
                
                // Get current message ID
                const testMsg = await bot.sendMessage(channelInfo.id, '🔍 Scanning...', { 
                    disable_notification: true 
                });
                const currentMsgId = testMsg.message_id;
                await bot.deleteMessage(channelInfo.id, testMsg.message_id);
                
                console.log(`📍 Current message ID: ${currentMsgId}, scanning backwards...`);
                
                // Scan backwards through message IDs
                let scannedCount = 0;
                const maxScan = 500; // Scan last 500 messages
                
                for (let msgId = currentMsgId - 1; msgId > Math.max(1, currentMsgId - maxScan); msgId--) {
                    try {
                        // Try to forward message to access its content
                        const forwardedMsg = await bot.forwardMessage(channelInfo.id, channelInfo.id, msgId);
                        scannedCount++;
                        
                        // Check for audio content
                        const audioFile = forwardedMsg.audio || forwardedMsg.voice || forwardedMsg.document;
                        
                        if (audioFile) {
                            const isAudio = audioFile.mime_type?.includes('audio') || 
                                           audioFile.file_name?.match(/\.(mp3|wav|ogg|m4a|flac|aac|mp4)$/i) ||
                                           forwardedMsg.audio;
                            
                            if (isAudio) {
                                try {
                                    const fileUrl = await bot.getFileLink(audioFile.file_id);
                                    const track = {
                                        title: audioFile.title || audioFile.file_name || audioFile.performer || `Music ${foundTracks.length + 1}`,
                                        url: fileUrl,
                                        duration: audioFile.duration ? `${Math.floor(audioFile.duration / 60)}:${(audioFile.duration % 60).toString().padStart(2, '0')}` : 'Unknown',
                                        fileId: audioFile.file_id,
                                        performer: audioFile.performer || 'Unknown Artist',
                                        messageId: msgId,
                                        uploadDate: forwardedMsg.date ? new Date(forwardedMsg.date * 1000).toISOString() : new Date().toISOString()
                                    };
                                    
                                    foundTracks.push(track);
                                    console.log(`🎵 Found: ${track.title} (ID: ${msgId})`);
                                    
                                    // Clean up forwarded message
                                    await bot.deleteMessage(channelInfo.id, forwardedMsg.message_id);
                                    
                                    // Prevent rate limiting
                                    await new Promise(resolve => setTimeout(resolve, 50));
                                    
                                } catch (fileError) {
                                    console.log(`⚠️ Could not get file link for message ${msgId}`);
                                    await bot.deleteMessage(channelInfo.id, forwardedMsg.message_id).catch(() => {});
                                }
                            } else {
                                // Delete non-audio forwarded message
                                await bot.deleteMessage(channelInfo.id, forwardedMsg.message_id).catch(() => {});
                            }
                        } else {
                            // Delete non-audio forwarded message
                            await bot.deleteMessage(channelInfo.id, forwardedMsg.message_id).catch(() => {});
                        }
                        
                        // Stop if we found enough songs
                        if (foundTracks.length >= 50) {
                            console.log('📊 Found maximum songs (50), stopping scan');
                            break;
                        }
                        
                    } catch (forwardError) {
                        // Message doesn't exist or can't be forwarded
                        continue;
                    }
                }
                
                console.log(`📊 Scanned ${scannedCount} messages, found ${foundTracks.length} audio files`);
                
                // Sort by message ID (oldest first)
                foundTracks.sort((a, b) => a.messageId - b.messageId);
                return foundTracks;
                
            } catch (scanError) {
                console.error('❌ Enhanced scan error:', scanError.message);
                return [];
            }
        }
        
        // Perform enhanced scan
        const scannedTracks = await enhancedChannelScan();
        
        if (scannedTracks.length > 0) {
            // Add scanned tracks to music files
            musicFiles.splice(0, musicFiles.length, ...scannedTracks);
            await saveMusicData();
            console.log(`✅ Enhanced refresh found ${musicFiles.length} tracks from channel!`);
        } else {
            // Fallback to regular initialization
            console.log('🔄 Enhanced scan found no tracks, falling back to regular init...');
            await initializeMusic();
        }
        
        const hasRealMusic = musicFiles.length > 0 && !musicFiles[0].title?.includes('Demo Song');
        const newTracks = Math.max(0, musicFiles.length - previousTrackCount);
        
        const result = {
            success: true,
            message: hasRealMusic ? 
                `Enhanced scan found ${musicFiles.length} tracks from channel!` : 
                `No channel music found - loaded ${musicFiles.length} demo tracks`,
            tracks: musicFiles.length,
            newTracks: newTracks,
            removedTracks: 0,
            isReal: hasRealMusic,
            scanMethod: 'enhanced'
        };
        
        console.log(`✅ Enhanced manual refresh completed: ${musicFiles.length} tracks loaded`);
        res.json(result);
        
    } catch (error) {
        console.error('❌ Error during enhanced manual refresh:', error);
        res.json({ 
            success: false, 
            error: error.message,
            tracks: musicFiles.length 
        });
    }
});

// Telegram webhook endpoint (for when bot is setup)
router.post('/telegram-webhook', async (req, res) => {
    try {
        await initBot();
        if (bot) {
            const update = req.body;
            console.log('📨 Received webhook update:', JSON.stringify(update, null, 2));
            
            // Process the update
            bot.processUpdate(update);
            res.sendStatus(200);
        } else {
            console.error('❌ Bot not initialized');
            res.sendStatus(500);
        }
    } catch (error) {
        console.error('❌ Webhook processing error:', error);
        res.sendStatus(500);
    }
});

// Bot webhook setup endpoint (for setting webhook from external calls)
router.post('/setup-webhook', async (req, res) => {
    try {
        await initBot();
        if (!bot) {
            return res.status(500).json({ success: false, error: 'Bot not initialized' });
        }
        
        const webhookUrl = `${process.env.URL || 'https://telegram-music-bot.netlify.app'}/.netlify/functions/api/telegram-webhook`;
        
        console.log(`🔗 Setting webhook to: ${webhookUrl}`);
        
        // Clear existing webhook first
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/deleteWebhook`);
        console.log('🧹 Cleared existing webhook');
        
        // Set new webhook
        const webhookResponse = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`, {
            url: webhookUrl,
            allowed_updates: ['message', 'callback_query', 'channel_post']
        });
        
        if (webhookResponse.data.ok) {
            console.log('✅ Webhook set successfully');
            res.json({ 
                success: true, 
                message: 'Webhook configured successfully',
                url: webhookUrl 
            });
        } else {
            console.log('⚠️ Webhook setup failed:', webhookResponse.data.description);
            res.status(400).json({ 
                success: false, 
                error: webhookResponse.data.description 
            });
        }
        
    } catch (error) {
        console.error('❌ Error setting up webhook:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Health check endpoint
router.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        tracks: musicFiles.length 
    });
});

// Add CORS middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
        return;
    }
    next();
});

// Use JSON middleware
app.use(express.json());

// Auto-initialize bot on first API call
let botInitialized = false;
app.use(async (req, res, next) => {
    if (!botInitialized && BOT_TOKEN) {
        try {
            await initBot();
            botInitialized = true;
            console.log('🤖 Bot auto-initialized');
        } catch (error) {
            console.error('⚠️ Bot auto-initialization failed:', error.message);
        }
    }
    next();
});

// Use router for API routes
app.use('/.netlify/functions/api', router);

// Export the serverless function
module.exports.handler = serverless(app);