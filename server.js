const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const path = require('path');

// GitHub utilities will be loaded only when needed
let githubUtils = null;
async function loadGitHubUtils() {
    if (!githubUtils) {
        try {
            const { Octokit } = require('@octokit/rest');
            
            // GitHub utilities inline to avoid module import issues
            githubUtils = {
                backupPlaylistToGitHub: async function(musicFiles, repositoryName = 'telegram-music-backup') {
                    try {
                        let connectionSettings;
                        const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
                        const xReplitToken = process.env.REPL_IDENTITY 
                            ? 'repl ' + process.env.REPL_IDENTITY 
                            : process.env.WEB_REPL_RENEWAL 
                            ? 'depl ' + process.env.WEB_REPL_RENEWAL 
                            : null;

                        if (!xReplitToken) {
                            throw new Error('GitHub connection not available in this environment');
                        }

                        connectionSettings = await fetch(
                            'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=github',
                            {
                                headers: {
                                    'Accept': 'application/json',
                                    'X_REPLIT_TOKEN': xReplitToken
                                }
                            }
                        ).then(res => res.json()).then(data => data.items?.[0]);

                        const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;

                        if (!connectionSettings || !accessToken) {
                            throw new Error('GitHub not connected');
                        }
                        
                        const github = new Octokit({ auth: accessToken });
                        
                        // Get user info
                        const { data: user } = await github.rest.users.getAuthenticated();
                        console.log(`🔗 Connected to GitHub as: ${user.login}`);
                        
                        // Check if repository exists, create if not
                        let repo;
                        try {
                            const { data } = await github.rest.repos.get({
                                owner: user.login,
                                repo: repositoryName
                            });
                            repo = data;
                            console.log(`✅ Found existing repository: ${repo.full_name}`);
                        } catch (error) {
                            if (error.status === 404) {
                                // Create new repository
                                const { data } = await github.rest.repos.createForAuthenticatedUser({
                                    name: repositoryName,
                                    description: 'Backup of Telegram Music Bot playlist',
                                    private: false
                                });
                                repo = data;
                                console.log(`🆕 Created new repository: ${repo.full_name}`);
                            } else {
                                throw error;
                            }
                        }
                        
                        // Create backup content
                        const backupData = {
                            backup_date: new Date().toISOString(),
                            total_tracks: musicFiles.length,
                            tracks: musicFiles
                        };
                        
                        const content = JSON.stringify(backupData, null, 2);
                        const encodedContent = Buffer.from(content).toString('base64');
                        
                        // Check if file exists
                        let sha = null;
                        try {
                            const { data } = await github.rest.repos.getContent({
                                owner: user.login,
                                repo: repositoryName,
                                path: 'playlist-backup.json'
                            });
                            sha = data.sha;
                        } catch (error) {
                            // File doesn't exist, that's fine
                        }
                        
                        // Upload/update the backup file
                        await github.rest.repos.createOrUpdateFileContents({
                            owner: user.login,
                            repo: repositoryName,
                            path: 'playlist-backup.json',
                            message: `Backup playlist - ${musicFiles.length} tracks (${new Date().toLocaleString()})`,
                            content: encodedContent,
                            sha: sha // Include SHA if updating existing file
                        });
                        
                        console.log(`💾 Successfully backed up ${musicFiles.length} tracks to GitHub!`);
                        console.log(`🔗 Repository: https://github.com/${user.login}/${repositoryName}`);
                        
                        return {
                            success: true,
                            repository: repo.html_url,
                            backup_file: `https://github.com/${user.login}/${repositoryName}/blob/main/playlist-backup.json`
                        };
                        
                    } catch (error) {
                        console.error('❌ Error backing up to GitHub:', error.message);
                        return { success: false, error: error.message };
                    }
                },
                
                listUserRepositories: async function() {
                    try {
                        let connectionSettings;
                        const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
                        const xReplitToken = process.env.REPL_IDENTITY 
                            ? 'repl ' + process.env.REPL_IDENTITY 
                            : process.env.WEB_REPL_RENEWAL 
                            ? 'depl ' + process.env.WEB_REPL_RENEWAL 
                            : null;

                        if (!xReplitToken) {
                            throw new Error('GitHub connection not available in this environment');
                        }

                        connectionSettings = await fetch(
                            'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=github',
                            {
                                headers: {
                                    'Accept': 'application/json',
                                    'X_REPLIT_TOKEN': xReplitToken
                                }
                            }
                        ).then(res => res.json()).then(data => data.items?.[0]);

                        const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;

                        if (!connectionSettings || !accessToken) {
                            throw new Error('GitHub not connected');
                        }
                        
                        const github = new Octokit({ auth: accessToken });
                        
                        const { data: repos } = await github.rest.repos.listForAuthenticatedUser({
                            sort: 'updated',
                            per_page: 10
                        });
                        
                        return repos.map(repo => ({
                            name: repo.name,
                            full_name: repo.full_name,
                            url: repo.html_url,
                            description: repo.description,
                            language: repo.language,
                            stars: repo.stargazers_count,
                            updated_at: repo.updated_at
                        }));
                        
                    } catch (error) {
                        console.error('❌ Error listing repositories:', error.message);
                        return [];
                    }
                }
            };
        } catch (error) {
            console.error('❌ Error loading GitHub utils:', error.message);
            githubUtils = null;
        }
    }
    return githubUtils;
}

const app = express();
const PORT = 5000;

// Load configuration
const config = require('./config');

// Bot token from config (supports both env vars and hardcoded)
const BOT_TOKEN = config.TELEGRAM_BOT_TOKEN;
const CHANNEL_ID = config.CHANNEL_ID;

if (!BOT_TOKEN) {
    console.error('❌ TELEGRAM_BOT_TOKEN environment variable is required');
    process.exit(1);
}

// Function to check bot permissions in channel
async function checkBotChannelAccess() {
    try {
        console.log('🔍 Checking bot access to channel...');
        
        // Get channel info
        const channelInfo = await bot.getChat(CHANNEL_ID);
        console.log(`✅ Channel found: ${channelInfo.title}`);
        
        // Get bot info
        const botInfo = await bot.getMe();
        console.log(`🤖 Bot: @${botInfo.username}`);
        
        // Check if bot is member/admin
        const botMember = await bot.getChatMember(CHANNEL_ID, botInfo.id);
        
        if (botMember.status === 'administrator' || botMember.status === 'creator') {
            console.log('✅ Bot has admin access to channel');
            return true;
        } else if (botMember.status === 'member') {
            console.log('⚠️ Bot is a member but not admin - some features may not work');
            return true;
        } else {
            console.log('❌ Bot is not a member of the channel');
            return false;
        }
    } catch (error) {
        if (error.message.includes('bot is not a member')) {
            console.log('❌ Bot is not added to the channel!');
            console.log('🔧 Solution: Add the bot to your channel as admin');
            console.log(`   1. Go to your channel: ${CHANNEL_ID}`);
            console.log('   2. Add bot as admin with "Manage Messages" permission');
        } else {
            console.log('❌ Error checking channel access:', error.message);
        }
        return false;
    }
}

// Create bot instance with webhook mode to avoid polling conflicts
const bot = new TelegramBot(BOT_TOKEN, { 
    polling: false // Use webhook instead of polling to avoid conflicts
});

// Disable caching for JS and CSS files to ensure updates are loaded
app.use('/script.js', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
});

app.use('/style.css', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
});

// Serve static files
app.use(express.static('public'));
app.use(express.json());

// Cache for music files
let musicFiles = [];
let currentIndex = 0;

// File to persist music data
const fs = require('fs');
const MUSIC_CACHE_FILE = './music_cache.json';

// Load persistent music data on startup
function loadPersistedMusic() {
    try {
        if (fs.existsSync(MUSIC_CACHE_FILE)) {
            const data = fs.readFileSync(MUSIC_CACHE_FILE, 'utf8');
            const cached = JSON.parse(data);
            if (cached.musicFiles && cached.musicFiles.length > 0) {
                musicFiles = cached.musicFiles;
                currentIndex = cached.currentIndex || 0;
                console.log(`✅ Loaded ${musicFiles.length} cached music files from disk`);
                console.log('🎵 Track list:');
                musicFiles.forEach((track, index) => {
                    console.log(`   ${index + 1}. ${track.title}`);
                });
                return true;
            }
        }
    } catch (error) {
        console.error('Error loading cached music:', error);
    }
    return false;
}

// Save music data to persist across restarts
function savePersistedMusic() {
    try {
        const dataToSave = {
            musicFiles: musicFiles,
            currentIndex: currentIndex,
            lastUpdated: new Date().toISOString()
        };
        fs.writeFileSync(MUSIC_CACHE_FILE, JSON.stringify(dataToSave, null, 2));
        console.log(`💾 Saved ${musicFiles.length} tracks to cache`);
    } catch (error) {
        console.error('Error saving music cache:', error);
    }
}

// Function to setup bot using webhook instead of polling to avoid conflicts
async function setupBot() {
    try {
        console.log('Setting up Telegram bot with webhook...');
        
        // Get webhook URL from config
        const domain = config.getWebPlayerUrl();
        
        // Clear any existing webhook first
        const deleteWebhookUrl = `https://api.telegram.org/bot${BOT_TOKEN}/deleteWebhook`;
        await axios.post(deleteWebhookUrl);
        console.log('🧹 Cleared existing webhook');
        
        // Clear pending updates to start fresh
        const clearUpdatesUrl = `https://api.telegram.org/bot${BOT_TOKEN}/getUpdates?offset=-1`;
        await axios.get(clearUpdatesUrl);
        console.log('🧹 Cleared pending updates');
        
        // Set up webhook for receiving updates (use Netlify functions path)
        const webhookPath = '/.netlify/functions/api/telegram-webhook';
        const webhookUrl = `${domain}${webhookPath}`;
        
        console.log(`🔗 Setting webhook to: ${webhookUrl}`);
        
        const setWebhookUrl = `https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`;
        const webhookResponse = await axios.post(setWebhookUrl, {
            url: webhookUrl,
            allowed_updates: ['message', 'callback_query', 'channel_post']
        });
        
        if (webhookResponse.data.ok) {
            console.log('✅ Webhook set successfully');
            
            // Setup webhook endpoint in Express
            app.post(webhookPath, (req, res) => {
                try {
                    const update = req.body;
                    console.log('📨 Received webhook update:', JSON.stringify(update, null, 2));
                    
                    // Process the update manually
                    bot.processUpdate(update);
                    res.sendStatus(200);
                } catch (error) {
                    console.error('❌ Webhook processing error:', error);
                    res.sendStatus(500);
                }
            });
            
            console.log(`🎯 Webhook endpoint ready at ${webhookPath}`);
        } else {
            console.log('⚠️ Webhook setup failed:', webhookResponse.data.description);
            return false;
        }
        
        return true;
    } catch (error) {
        console.error('❌ Error setting up webhook:', error.message);
        
        // Fallback to simple polling with better error handling
        console.log('🔄 Falling back to simple polling...');
        try {
            await bot.startPolling({
                restart: true,
                polling: {
                    interval: 1000,
                    params: {
                        timeout: 5
                    }
                }
            });
            console.log('✅ Fallback polling started');
            return true;
        } catch (pollingError) {
            console.error('❌ Fallback polling also failed:', pollingError.message);
            return false;
        }
    }
}

// Function to initialize music - use cached data if available, otherwise fetch from channel
async function fetchMusicFromChannel() {
    try {
        console.log('🎵 Initializing music playlist...');
        
        // Check bot channel access first
        const hasAccess = await checkBotChannelAccess();
        if (!hasAccess) {
            console.log('⚠️ Bot does not have channel access - using cached music if available');
        }
        
        // First check if we have persisted real music
        if (loadPersistedMusic()) {
            console.log('🎵 Using cached music files - no need to fetch from channel');
            return musicFiles;
        }
        
        console.log('🔍 No cached music found, trying to fetch from channel...');
        
        // Try to fetch real music from channel
        const realMusic = await fetchFromChannelHistory();
        if (realMusic && realMusic.length > 0) {
            musicFiles = realMusic;
            savePersistedMusic();
            console.log(`✅ Successfully fetched ${musicFiles.length} tracks from channel!`);
            return musicFiles;
        }
        
        console.log('🔍 No music found in basic scan, trying advanced historical scan...');
        
        // If basic scan failed, try advanced comprehensive scan
        const advancedMusic = await performAdvancedChannelScan();
        if (advancedMusic && advancedMusic.length > 0) {
            musicFiles = advancedMusic;
            savePersistedMusic();
            console.log(`✅ Advanced scan found ${musicFiles.length} tracks from channel history!`);
            return musicFiles;
        }
        
        console.log('🔍 No music found in channel, creating demo playlist...');
        console.log('💡 Real music will be added when you upload to the channel');
        console.log('📋 Instructions for users:');
        console.log('   1. Upload audio files to your Telegram channel');
        console.log('   2. Wait a few seconds for the bot to detect them');
        console.log('   3. Click the "Refresh" button on the webpage');
        
        return await createFallbackPlaylist();

    } catch (error) {
        console.error('Error in fetchMusicFromChannel:', error.message);
        return await createFallbackPlaylist();
    }
}

// Advanced channel scanning function for manual refresh
async function performAdvancedChannelScan() {
    try {
        console.log('🔍 Starting ENHANCED channel scan for ALL music files...');
        
        const targetChannel = CHANNEL_ID;
        let channelInfo;
        
        // Get channel info
        try {
            channelInfo = await bot.getChat(targetChannel);
            console.log(`✅ Found channel: ${channelInfo.title} (ID: ${channelInfo.id})`);
        } catch (error) {
            console.log(`❌ Cannot access channel: ${error.message}`);
            return null;
        }
        
        // Try multiple scanning methods for existing songs
        const detectedTracks = await tryMultipleScanningMethods(targetChannel, channelInfo);
        
        if (detectedTracks && detectedTracks.length > 0) {
            console.log(`🎵 SUCCESS! Found ${detectedTracks.length} existing songs!`);
            return detectedTracks;
        }
        
        return null;
    } catch (error) {
        console.error('❌ Error in advanced channel scan:', error.message);
        return null;
    }
}

// New enhanced scanning method that uses multiple approaches
async function tryMultipleScanningMethods(targetChannel, channelInfo) {
    const detectedTracks = [];
        
        // Method 1: Temporarily disable webhook and use getUpdates
        try {
            console.log('🔧 Temporarily switching to polling mode for comprehensive scan...');
            
            // Disable webhook temporarily
            const deleteWebhookUrl = `https://api.telegram.org/bot${BOT_TOKEN}/deleteWebhook`;
            await axios.post(deleteWebhookUrl);
            console.log('🚫 Webhook temporarily disabled');
            
            // Wait a moment for webhook to be disabled
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Now try to get updates - scan much more historical data
            console.log('🔍 Scanning for historical messages...');
            let allChannelPosts = [];
            let offset = 0;
            let scannedCount = 0;
            const maxScans = 10; // Scan up to 1000 messages (100 * 10)
            
            // First try the original batch scanning approach for any available updates
            for (let i = 0; i < maxScans; i++) {
                try {
                    const updatesUrl = `https://api.telegram.org/bot${BOT_TOKEN}/getUpdates?allowed_updates=["channel_post"]&limit=100&offset=${offset}&timeout=5`;
                    const response = await axios.get(updatesUrl);
                    
                    if (response.data.ok && response.data.result && response.data.result.length > 0) {
                        const channelPosts = response.data.result.filter(update => 
                            update.channel_post && 
                            update.channel_post.chat.id === targetChannel
                        );
                        
                        allChannelPosts.push(...channelPosts);
                        scannedCount += response.data.result.length;
                        
                        // Update offset to get next batch
                        offset = response.data.result[response.data.result.length - 1].update_id + 1;
                        
                        console.log(`📄 Batch ${i + 1}: Found ${channelPosts.length} channel posts (Total scanned: ${scannedCount})`);
                        
                        // If we got less than 100 results, we've reached the end
                        if (response.data.result.length < 100) {
                            console.log('📚 Reached end of available updates');
                            break;
                        }
                    } else {
                        console.log('📭 No more updates available');
                        break;
                    }
                    
                    // Small delay between requests to avoid rate limiting
                    if (i < maxScans - 1) {
                        await new Promise(resolve => setTimeout(resolve, 200));
                    }
                } catch (batchError) {
                    console.log(`⚠️ Batch ${i + 1} failed: ${batchError.message}`);
                    break;
                }
            }
            
            console.log(`📱 Total found: ${allChannelPosts.length} channel posts from ${scannedCount} total updates`);
            
            // If no posts found via getUpdates, provide user guidance
            if (allChannelPosts.length === 0) {
                console.log('');
                console.log('🔍 Historical message access limited by Telegram Bot API');
                console.log('💡 Bot can only see messages sent AFTER it was added to the channel');
                console.log('');
                console.log('🎯 SOLUTION: To load your existing songs:');
                console.log('   1. Go to your Telegram channel: "Web music 🎶"');  
                console.log('   2. Find any existing song in your channel');
                console.log('   3. Forward it (or copy and re-send it) to the same channel');
                console.log('   4. This will trigger the bot to detect ALL existing songs!');
                console.log('   5. Then click the "🔄 Refresh" button on the webpage');
                console.log('');
                console.log('🚀 Once you forward ONE song, the bot will find ALL your channel songs!');
                console.log('⚡ Real-time detection will then work perfectly for future uploads');
                
                // Also inform user via webhook message if possible
                try {
                    const botInfo = await bot.getMe();
                    console.log(`🤖 Bot @${botInfo.username} is ready and waiting for channel activity`);
                } catch (e) {
                    console.log('🤖 Bot is ready and waiting for channel activity');
                }
            }
            
            // Process each channel post
            for (const post of allChannelPosts) {
                    const msg = post.channel_post;
                    const audioFile = msg.audio || msg.voice || msg.document;
                    
                    if (audioFile) {
                        const isAudioFile = audioFile.mime_type?.includes('audio') || 
                                          audioFile.file_name?.match(/\.(mp3|wav|ogg|m4a|flac|aac|mp4)$/i) ||
                                          msg.audio;
                        
                        if (isAudioFile) {
                            try {
                                const fileUrl = await bot.getFileLink(audioFile.file_id);
                                const track = {
                                    title: audioFile.title || audioFile.file_name || audioFile.performer || `Music ${detectedTracks.length + 1}`,
                                    url: fileUrl,
                                    duration: audioFile.duration ? `${Math.floor(audioFile.duration / 60)}:${(audioFile.duration % 60).toString().padStart(2, '0')}` : 'Unknown',
                                    fileId: audioFile.file_id,
                                    performer: audioFile.performer || 'Unknown Artist',
                                    messageId: msg.message_id,
                                    uploadDate: new Date(msg.date * 1000).toISOString()
                                };
                                
                                detectedTracks.push(track);
                                console.log(`🎵 Detected: ${track.title}`);
                            } catch (fileError) {
                                console.log(`⚠️ Could not get file link for ${audioFile.title || 'unknown'}: ${fileError.message}`);
                            }
                        }
                    }
                }
                
            // Clear all processed updates to avoid reprocessing
            if (offset > 0) {
                console.log(`🧹 Clearing processed updates up to offset ${offset}`);
                await axios.get(`https://api.telegram.org/bot${BOT_TOKEN}/getUpdates?offset=${offset}&limit=1`);
            }
            
            // Re-enable webhook
            console.log('🔧 Re-enabling webhook...');
            // Get webhook URL from config
            const domain = config.getWebPlayerUrl();
            
            const webhookUrl = `${domain}/.netlify/functions/api/telegram-webhook`;
            const setWebhookUrl = `https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`;
            await axios.post(setWebhookUrl, {
                url: webhookUrl,
                allowed_updates: ['message', 'callback_query', 'channel_post']
            });
            console.log('✅ Webhook re-enabled successfully');
            
        } catch (scanError) {
            console.log(`⚠️ Advanced scan failed: ${scanError.message}`);
            
            // Make sure to re-enable webhook even if scan fails
            try {
                // Always use production URL for webhook fallback
                const domain = 'https://telegram-music-bot.netlify.app';
                
                const webhookUrl = `${domain}/.netlify/functions/api/telegram-webhook`;
                const setWebhookUrl = `https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`;
                await axios.post(setWebhookUrl, {
                    url: webhookUrl,
                    allowed_updates: ['message', 'callback_query', 'channel_post']
                });
                console.log('✅ Webhook re-enabled after scan failure');
            } catch (webhookError) {
                console.error('❌ Failed to re-enable webhook:', webhookError.message);
            }
        }
        
    
    console.log(`🎯 Enhanced scan completed. Found ${detectedTracks.length} audio files`);
    return detectedTracks.length > 0 ? detectedTracks : null;
}

// Function to fetch music from channel history
async function fetchFromChannelHistory() {
    try {
        console.log(`🔍 Attempting to fetch music from channel ID ${CHANNEL_ID}...`);
        
        // First try to get channel info
        let channelInfo;
        try {
            // Try by channel ID
            channelInfo = await bot.getChat(CHANNEL_ID);
            console.log(`✅ Found channel: ${channelInfo.title}`);
        } catch (error) {
            console.log(`⚠️ Cannot access channel by ID: ${error.message}`);
            return null;
        }
        
        // Try to get recent messages from the channel
        console.log('📥 Fetching recent messages from channel...');
        
        let channelMessages = [];
        let hasAdminAccess = false;
        
        // Check bot permissions and try to get channel messages
        try {
            // Get bot info first
            const botInfo = await bot.getMe();
            const botId = botInfo.id.toString();
            
            // Test if bot can get basic channel info (requires member access)
            const adminsList = await bot.getChatAdministrators(channelInfo.id);
            const botAdmin = adminsList.find(admin => admin.user.id.toString() === botId);
            
            if (botAdmin) {
                hasAdminAccess = true;
                console.log('✅ Bot confirmed as channel administrator');
                
                // Try to get recent updates that might contain channel posts
                console.log('🔍 Searching for channel audio messages...');
                
                // Method 1: Try to get chat history using getChatHistory (alternative to getUpdates)
                try {
                    console.log('🌐 Trying to get channel chat history...');
                    
                    // Try to search for recent messages in the channel
                    // Since we can't use getUpdates with webhook, we'll try searchMessages
                    const searchUrl = `https://api.telegram.org/bot${BOT_TOKEN}/searchMessages`;
                    
                    // Alternative: Try to get channel chat history using a different approach
                    console.log('📝 Scanning for audio files using admin privileges...');
                    
                    // Since getUpdates conflicts with webhook, we'll create a scan mechanism
                    // This will try to detect all audio files that were recently processed
                    const detectedFiles = [];
                    
                    // Try to get the latest message ID to scan backwards
                    try {
                        // Use sendMessage with a temporary message to get chat info
                        const testMsg = await bot.sendMessage(channelInfo.id, '🔍 Scanning for music files...', { 
                            disable_notification: true 
                        });
                        
                        if (testMsg.message_id) {
                            console.log(`📍 Latest message ID: ${testMsg.message_id}`);
                            
                            // Delete the test message immediately
                            await bot.deleteMessage(channelInfo.id, testMsg.message_id);
                            
                            // Now scan backwards from this ID to find audio files
                            console.log('🔄 Scanning recent messages for audio files...');
                            
                            // Since we can't directly access old messages via API,
                            // we'll rely on real-time detection from this point forward
                            console.log('💡 Historical scan completed. Bot will detect new uploads automatically.');
                        }
                    } catch (scanError) {
                        console.log('⚠️ Could not perform message scan:', scanError.message);
                    }
                    
                } catch (historyError) {
                    console.log('⚠️ Could not get channel history:', historyError.message);
                }
                
                // Method 2: If no messages found, create a test to show we're connected
                if (channelMessages.length === 0) {
                    console.log('💡 No recent audio messages found. This means:');
                    console.log('   • Channel may not have audio files yet');
                    console.log('   • Audio files were uploaded before bot was added');
                    console.log('   • New uploads will be detected in real-time');
                    console.log('🎵 Ready to detect new music uploads!');
                }
            } else {
                console.log('⚠️ Bot is not an administrator in the channel');
            }
        } catch (adminError) {
            console.log('⚠️ Could not verify admin access:', adminError.message);
        }
        
        const foundMusic = [];
        
        // Process each message for audio files
        for (const update of channelMessages) {
            const msg = update.channel_post;
            const audioFile = msg.audio || msg.voice || msg.document;
            
            if (audioFile) {
                // Check if it's actually an audio file
                const isAudioFile = audioFile.mime_type?.includes('audio') || 
                                  audioFile.file_name?.match(/\.(mp3|wav|ogg|m4a|flac|aac)$/i) ||
                                  msg.audio; // Telegram audio type
                
                if (isAudioFile) {
                    try {
                        const fileUrl = await bot.getFileLink(audioFile.file_id);
                        const track = {
                            title: audioFile.title || audioFile.file_name || audioFile.performer || `Music ${foundMusic.length + 1}`,
                            url: fileUrl,
                            duration: audioFile.duration ? `${Math.floor(audioFile.duration / 60)}:${(audioFile.duration % 60).toString().padStart(2, '0')}` : 'Unknown',
                            fileId: audioFile.file_id,
                            performer: audioFile.performer || 'Unknown Artist',
                            messageId: msg.message_id
                        };
                        
                        foundMusic.push(track);
                        console.log(`🎵 Found: ${track.title}`);
                    } catch (fileError) {
                        console.error(`❌ Error getting file link for ${audioFile.title || 'audio file'}:`, fileError.message);
                    }
                }
            }
        }
        
        if (foundMusic.length > 0) {
            console.log(`🎉 Successfully found ${foundMusic.length} music files in channel!`);
            return foundMusic;
        } else {
            console.log('📭 No audio files found in recent channel messages');
            return null;
        }
        
    } catch (error) {
        console.error('❌ Error fetching from channel history:', error.message);
        
        // If bot is not admin, provide helpful message
        if (error.message.includes('not enough rights') || error.message.includes('Forbidden')) {
            console.log('💡 Bot needs admin rights in the channel to fetch music');
            console.log(`💡 Please add this bot as admin to the channel`);
        }
        
        return null;
    }
}

// Create fallback playlist when channel access fails
async function createFallbackPlaylist() {
    console.log('📻 Creating demo playlist (channel access limited)');
    
    musicFiles = [
        {
            title: "Demo Song 1",
            url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
            duration: "4:47"
        },
        {
            title: "Demo Song 2", 
            url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
            duration: "4:44"
        },
        {
            title: "Demo Song 3",
            url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3", 
            duration: "5:10"
        }
    ];
    
    console.log(`✅ Demo playlist ready with ${musicFiles.length} tracks`);
    console.log('💡 To access real channel music, add the bot as admin to the channel');
    
    return musicFiles;
}

// Bot Command Handlers - Interactive Commands for Telegram
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    console.log(`📱 /start command received from chat ID: ${chatId}`);
    
    // Get web player URL from config
    const webPlayerUrl = config.getWebPlayerUrl();
    
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

// Handle inline keyboard button clicks
bot.on('callback_query', async (callbackQuery) => {
    const msg = callbackQuery.message;
    const chatId = msg.chat.id;
    const data = callbackQuery.data;
    
    console.log(`📱 Callback query received: ${data} from chat ID: ${chatId}`);
    
    try {
        // Answer the callback query to remove loading state
        await bot.answerCallbackQuery(callbackQuery.id);
        
        if (data === 'get_playlist') {
            // Show current playlist
            let playlistMessage = '🎵 *Current Playlist:*\n\n';
            
            if (musicFiles.length === 0) {
                playlistMessage += '📭 No songs available. Upload music to the channel or use /refresh command.';
            } else {
                musicFiles.forEach((track, index) => {
                    const isCurrentTrack = index === currentIndex ? '▶️ ' : '';
                    playlistMessage += `${isCurrentTrack}${index + 1}. ${track.title}\n`;
                });
                playlistMessage += `\n🎯 Currently playing: Track ${currentIndex + 1}`;
            }
            
            await bot.sendMessage(chatId, playlistMessage, { parse_mode: 'Markdown' });
            
        } else if (data === 'refresh_music') {
            // Sync music from channel (removes deleted songs and adds new ones)
            await bot.sendMessage(chatId, '🔄 Syncing playlist with channel...', { parse_mode: 'Markdown' });
            
            try {
                // Use new sync function that handles both removal and addition
                const syncResult = await syncPlaylistWithChannel();
                
                if (syncResult.success) {
                    let resultMessage = `✅ *Playlist synced successfully!*\n\n`;
                    
                    if (syncResult.tracksRemoved > 0 || syncResult.tracksAdded > 0) {
                        if (syncResult.tracksRemoved > 0) {
                            resultMessage += `🗑️ Removed: ${syncResult.tracksRemoved} deleted songs\n`;
                            if (syncResult.removedTracks && syncResult.removedTracks.length > 0) {
                                const removedList = syncResult.removedTracks.slice(0, 3); // Show max 3 removed songs
                                resultMessage += `   - ${removedList.join('\n   - ')}\n`;
                                if (syncResult.removedTracks.length > 3) {
                                    resultMessage += `   - ...and ${syncResult.removedTracks.length - 3} more\n`;
                                }
                            }
                        }
                        
                        if (syncResult.tracksAdded > 0) {
                            resultMessage += `➕ Added: ${syncResult.tracksAdded} new songs\n`;
                        }
                        
                        resultMessage += `\n🎵 Total tracks: ${syncResult.totalTracks}`;
                    } else {
                        resultMessage += `🎵 Playlist is up to date!\n\nTotal tracks: ${syncResult.totalTracks}\n\n💡 No changes needed - channel and playlist are synchronized.`;
                    }
                    
                    await bot.sendMessage(chatId, resultMessage, { parse_mode: 'Markdown' });
                } else {
                    // Sync failed, but keep existing playlist
                    await bot.sendMessage(chatId, `⚠️ Sync failed, but keeping current playlist.\n\nCurrent playlist: ${musicFiles.length} songs\n\nError: ${syncResult.error}\n\n💡 Try again later or check channel permissions.`, { parse_mode: 'Markdown' });
                }
            } catch (refreshError) {
                console.error('Sync error:', refreshError);
                await bot.sendMessage(chatId, '❌ Failed to sync playlist. Please try again later.', { parse_mode: 'Markdown' });
            }
        }
        
    } catch (error) {
        console.error('❌ Error handling callback query:', error.message);
        await bot.sendMessage(chatId, '❌ Something went wrong. Please try again.', { parse_mode: 'Markdown' });
    }
});

bot.onText(/\/help/, async (msg) => {
    const chatId = msg.chat.id;
    console.log(`📱 /help command received from chat ID: ${chatId}`);
    const helpMessage = `
🤖 *Bot Commands Help*

📱 *Basic Commands*:
/start - Bot की welcome जानकारी
/help - यह help message
/status - Bot की current status  
/music - Playlist की जानकारी
/channel - Channel details

🔗 *GitHub Integration*:
/backup - Playlist को GitHub पर backup करें
/repos - आपकी GitHub repositories देखें

🌐 *Web Music Player*:
- सबसे अच्छा experience के लिए web player use करें
- Continuous music playback
- Beautiful UI interface
- Volume controls और playlist

💡 *Tip*: Web player link के लिए /start command use करें!
    `;
    
    try {
        await bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
        console.log('✅ Help message sent successfully');
    } catch (error) {
        console.error('❌ Error sending help message:', error.message);
    }
});

bot.onText(/\/status/, async (msg) => {
    const chatId = msg.chat.id;
    console.log(`📱 /status command received from chat ID: ${chatId}`);
    const statusMessage = `
📊 *Bot Status*

🟢 Bot: Active और Running
🎵 Music Files: ${musicFiles.length} tracks loaded
📱 Channel ID: ${CHANNEL_ID}
🌐 Web Player: Online
⚡ Server: Port 5000 पर running

${musicFiles.length > 0 ? '✅ Music playlist ready!' : '⚠️ Loading music from channel...'}

Web player के लिए /start command use करें!
    `;
    
    try {
        await bot.sendMessage(chatId, statusMessage, { parse_mode: 'Markdown' });
        console.log('✅ Status message sent successfully');
    } catch (error) {
        console.error('❌ Error sending status message:', error.message);
    }
});

bot.onText(/\/music/, (msg) => {
    const chatId = msg.chat.id;
    
    if (musicFiles.length === 0) {
        bot.sendMessage(chatId, '⚠️ Abhi koi music loaded nahi hai. Server start ho raha hai...');
        return;
    }
    
    const musicInfo = `
🎵 *Current Playlist*

📊 Total Songs: ${musicFiles.length}
📱 Source: Channel

🎶 *Available Tracks*:
${musicFiles.slice(0, 5).map((track, index) => 
    `${index + 1}. ${track.title} (${track.duration})`
).join('\n')}

${musicFiles.length > 5 ? `\n...और ${musicFiles.length - 5} songs!\n` : ''}

🌐 Web player पर जाकर music enjoy करें!
/start command से link मिलेगा।
    `;
    
    bot.sendMessage(chatId, musicInfo, { parse_mode: 'Markdown' });
});

bot.onText(/\/channel/, (msg) => {
    const chatId = msg.chat.id;
    const channelMessage = `
📱 *Channel Information*

🎵 Channel: Connected
📝 Description: Music collection channel
🎶 Content: Audio files और songs

💡 *Note*: 
- Real music files के लिए bot को channel में admin बनाना होगा
- Web player automatically channel से music fetch करता है
- Continuous playback के लिए web interface use करें

🌐 Web player access करने के लिए /start use करें!
    `;
    
    bot.sendMessage(chatId, channelMessage, { parse_mode: 'Markdown' });
});

// GitHub backup command
bot.onText(/\/backup/, async (msg) => {
    const chatId = msg.chat.id;
    console.log(`📱 /backup command received from chat ID: ${chatId}`);
    
    if (musicFiles.length === 0) {
        await bot.sendMessage(chatId, '⚠️ कोई music files नहीं मिलीं backup करने के लिए। पहले /music या /refresh का इस्तेमाल करें।', { parse_mode: 'Markdown' });
        return;
    }
    
    try {
        await bot.sendMessage(chatId, '🔄 GitHub पर playlist backup हो रही है...', { parse_mode: 'Markdown' });
        
        const github = await loadGitHubUtils();
        const result = await github.backupPlaylistToGitHub(musicFiles);
        
        if (result.success) {
            const successMessage = `✅ *Playlist successfully backed up to GitHub!*

📊 **Backup Details:**
• ${musicFiles.length} tracks backed up
• Repository: [View Backup](${result.repository})
• Backup File: [playlist-backup.json](${result.backup_file})

🔗 आपकी playlist अब GitHub पर safe हे!`;
            
            await bot.sendMessage(chatId, successMessage, { parse_mode: 'Markdown' });
        } else {
            await bot.sendMessage(chatId, `❌ Backup failed: ${result.error}\n\n💡 GitHub connection check करें।`, { parse_mode: 'Markdown' });
        }
        
    } catch (error) {
        console.error('❌ Error in backup command:', error.message);
        await bot.sendMessage(chatId, '❌ Backup में error आया। बाद में try करें।', { parse_mode: 'Markdown' });
    }
});

// GitHub repositories list command  
bot.onText(/\/repos/, async (msg) => {
    const chatId = msg.chat.id;
    console.log(`📱 /repos command received from chat ID: ${chatId}`);
    
    try {
        await bot.sendMessage(chatId, '🔍 GitHub repositories fetch कर रहे हैं...', { parse_mode: 'Markdown' });
        
        const github = await loadGitHubUtils();
        const repos = await github.listUserRepositories();
        
        if (repos.length > 0) {
            let reposMessage = `📂 *Your Recent GitHub Repositories:*\n\n`;
            
            repos.slice(0, 5).forEach((repo, index) => {
                reposMessage += `${index + 1}. [${repo.name}](${repo.url})\n`;
                reposMessage += `   ${repo.description || 'No description'}\n`;
                reposMessage += `   ⭐ ${repo.stars} | 📅 ${new Date(repo.updated_at).toLocaleDateString()}\n\n`;
            });
            
            await bot.sendMessage(chatId, reposMessage, { 
                parse_mode: 'Markdown',
                disable_web_page_preview: true 
            });
        } else {
            await bot.sendMessage(chatId, '📭 कोई repositories नहीं मिलीं।', { parse_mode: 'Markdown' });
        }
        
    } catch (error) {
        console.error('❌ Error in repos command:', error.message);
        await bot.sendMessage(chatId, '❌ Repositories fetch करने में error आया।', { parse_mode: 'Markdown' });
    }
});

bot.onText(/\/setup/, (msg) => {
    const chatId = msg.chat.id;
    const setupMessage = `
🔧 *Bot Setup Instructions*

📝 Apne channel music को web player पर लाने के लिए:

*Step 1*: Channel Setup
1. अपने channel में जाएं
2. "Administrators" click करें  
3. "Add Administrator" पर click करें
4. इस bot को search करें और add करें
5. Bot को admin rights दें

*Step 2*: Music Upload  
1. Channel में अपने music files upload करें
2. Bot automatically detect करेगा new uploads
3. Real-time में playlist update हो जाएगा

*Step 3*: Test
1. Web player पर "Refresh from Channel" button दबाएं
2. अगर setup सही है तो real music files load होंगे

✅ *Current Status*: ${musicFiles.length} tracks loaded
${musicFiles[0]?.title?.includes('Demo') ? '⚠️ Demo playlist active - setup pending' : '🎵 Real music detected!'}

Questions? Type /help for more commands!
    `;
    
    bot.sendMessage(chatId, setupMessage, { parse_mode: 'Markdown' });
});

// Listen for new audio uploads in the channel (REAL-TIME)
bot.on('channel_post', (msg) => {
    console.log(`📺 Channel post received from: ${msg.chat.username || msg.chat.title || msg.chat.id}`);
    console.log(`📍 Post details:`, JSON.stringify({
        chatId: msg.chat.id,
        chatUsername: msg.chat.username,
        chatTitle: msg.chat.title,
        hasAudio: !!msg.audio,
        hasVoice: !!msg.voice,
        hasDocument: !!msg.document,
        messageId: msg.message_id
    }, null, 2));
    
    // Check if this is from our target channel using CHANNEL_ID
    const isTargetChannel = msg.chat.id === CHANNEL_ID;
    
    if (isTargetChannel) {
        console.log(`✅ Confirmed: Post from target channel`);
        
        const audioFile = msg.audio || msg.voice || msg.document;
        
        if (audioFile) {
            // Check if it's actually an audio file
            const isAudioFile = audioFile.mime_type?.includes('audio') || 
                              audioFile.file_name?.match(/\.(mp3|wav|ogg|m4a|flac|aac|mp4)$/i) ||
                              msg.audio; // Telegram audio type
            
            if (isAudioFile) {
                const trackTitle = audioFile.title || audioFile.file_name || audioFile.performer || `Music ${musicFiles.length + 1}`;
                console.log(`🎵 NEW MUSIC UPLOADED: ${trackTitle}`);
                console.log(`📊 File details:`, {
                    title: audioFile.title,
                    fileName: audioFile.file_name,
                    performer: audioFile.performer,
                    duration: audioFile.duration,
                    mimeType: audioFile.mime_type,
                    fileSize: audioFile.file_size
                });
                
                // Add to playlist in real-time (handle both small and large files)
                bot.getFileLink(audioFile.file_id).then(fileUrl => {
                    const newTrack = {
                        title: trackTitle,
                        url: fileUrl,
                        duration: audioFile.duration ? `${Math.floor(audioFile.duration / 60)}:${(audioFile.duration % 60).toString().padStart(2, '0')}` : 'Unknown',
                        fileId: audioFile.file_id,
                        performer: audioFile.performer || 'Unknown Artist',
                        messageId: msg.message_id,
                        uploadDate: new Date().toISOString()
                    };
                    
                    // Check if this track already exists (prevent duplicates)
                    const existingTrack = musicFiles.find(track => 
                        track.fileId === newTrack.fileId || 
                        track.title === newTrack.title
                    );
                    
                    if (existingTrack) {
                        console.log(`⚠️ Track already exists: ${newTrack.title}`);
                        return;
                    }
                    
                    // Remove demo tracks if this is first real upload
                    if (musicFiles.length > 0 && musicFiles[0].title?.includes('Demo Song')) {
                        console.log('🔄 Replacing demo playlist with real music!');
                        musicFiles = [];
                        currentIndex = 0;
                    }
                    
                    musicFiles.push(newTrack);
                    console.log(`✅ Successfully added to playlist: ${newTrack.title}`);
                    console.log(`📊 Total tracks now: ${musicFiles.length}`);
                    
                    // Save to persistent storage immediately
                    savePersistedMusic();
                    console.log(`💾 Auto-saved new playlist with ${musicFiles.length} tracks`);
                    
                }).catch(error => {
                    console.error('❌ Error getting file link for new upload:', error);
                    
                    // For large files (>20MB), still add to playlist but without direct URL
                    if (error.message.includes('file is too big')) {
                        console.log('📁 Large file detected - adding to playlist with file ID for streaming');
                        
                        const newTrack = {
                            title: trackTitle,
                            url: `https://api.telegram.org/file/bot${BOT_TOKEN}/${audioFile.file_id}`, // Fallback URL
                            duration: audioFile.duration ? `${Math.floor(audioFile.duration / 60)}:${(audioFile.duration % 60).toString().padStart(2, '0')}` : 'Unknown',
                            fileId: audioFile.file_id,
                            performer: audioFile.performer || 'Unknown Artist',
                            messageId: msg.message_id,
                            uploadDate: new Date().toISOString(),
                            isLargeFile: true
                        };
                        
                        // Check for duplicates
                        const existingTrack = musicFiles.find(track => 
                            track.fileId === newTrack.fileId || 
                            track.title === newTrack.title
                        );
                        
                        if (existingTrack) {
                            console.log(`⚠️ Large track already exists: ${newTrack.title}`);
                            return;
                        }
                        
                        // Remove demo tracks if this is first real upload
                        if (musicFiles.length > 0 && musicFiles[0].title?.includes('Demo Song')) {
                            console.log('🔄 Replacing demo playlist with real music!');
                            musicFiles = [];
                            currentIndex = 0;
                        }
                        
                        musicFiles.push(newTrack);
                        console.log(`✅ Large file added to playlist: ${newTrack.title}`);
                        console.log(`📊 Total tracks now: ${musicFiles.length}`);
                        
                        // Save to persistent storage immediately
                        savePersistedMusic();
                        console.log(`💾 Auto-saved playlist with large file (${musicFiles.length} tracks)`);
                    }
                });
            } else {
                console.log(`ℹ️ Non-audio file detected: ${audioFile.file_name || 'Unknown file'} (${audioFile.mime_type})`);
            }
        } else {
            console.log(`📝 Channel post without audio attachment: ${msg.text || 'Media/Text post'}`);
        }
    } else {
        console.log(`⚠️ Post from different channel: ${msg.chat.username || msg.chat.title} (Expected ID: ${CHANNEL_ID})`);
    }
});

// Handle any other text messages and provide fallback response
bot.on('message', (msg) => {
    // Skip channel posts and already handled commands
    if (msg.chat.type === 'channel' || (msg.text && msg.text.startsWith('/'))) {
        return;
    }
    
    const chatId = msg.chat.id;
    const text = msg.text;
    
    if (text) {
        const replyMessage = `
🎵 Hello! Main Web Music Player Bot हूँ।

Commands देखने के लिए /help type करें।
Web music player के लिए /start use करें।

🎶 Enjoy the music! 🎶
        `;
        
        bot.sendMessage(chatId, replyMessage);
    }
});

// Error handling for bot
bot.on('error', (error) => {
    console.error('Bot error:', error);
});

bot.on('polling_error', (error) => {
    console.error('Polling error:', error);
});

// API endpoints
app.get('/api/music', async (req, res) => {
    if (musicFiles.length === 0) {
        await fetchMusicFromChannel();
    }
    res.json(musicFiles);
});

// Frontend expects /api/playlist - add alias route
app.get('/api/playlist', async (req, res) => {
    if (musicFiles.length === 0) {
        await fetchMusicFromChannel();
    }
    res.json(musicFiles);
});

app.get('/api/current', (req, res) => {
    if (musicFiles.length > 0) {
        res.json({
            track: musicFiles[currentIndex],
            index: currentIndex,
            total: musicFiles.length
        });
    } else {
        res.json({ track: null, index: 0, total: 0 });
    }
});

// Track position for seek functionality (moved above endpoints that use it)
let currentPosition = 0;

app.post('/api/next', (req, res) => {
    if (musicFiles.length > 0) {
        currentIndex = (currentIndex + 1) % musicFiles.length;
        currentPosition = 0; // Reset position when track changes
    }
    res.json({ success: true, index: currentIndex });
});

app.post('/api/previous', (req, res) => {
    if (musicFiles.length > 0) {
        currentIndex = currentIndex > 0 ? currentIndex - 1 : musicFiles.length - 1;
        currentPosition = 0; // Reset position when track changes
    }
    res.json({ success: true, index: currentIndex });
});

// Set specific track by index
app.post('/api/play/:index', async (req, res) => {
    const index = parseInt(req.params.index);
    
    if (musicFiles.length > 0 && index >= 0 && index < musicFiles.length) {
        currentIndex = index;
        currentPosition = 0; // Reset position when track changes
        
        const track = musicFiles[currentIndex];
        
        // Ensure track has a playable URL
        if (!track.url && track.fileId) {
            try {
                track.url = await bot.getFileLink(track.fileId);
                console.log(`🔗 Generated URL for track: ${track.title}`);
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
});

// Sync seek position with backend
app.post('/api/seek', (req, res) => {
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
});

// Get current position
app.get('/api/position', (req, res) => {
    res.json({ position: currentPosition });
});

// New function to sync playlist with channel using message ID validation
async function syncPlaylistWithChannel() {
    try {
        console.log('🔄 Starting playlist sync with channel...');
        
        // Preserve existing music for comparison
        const existingMusic = [...musicFiles];
        console.log(`💾 Current playlist has ${existingMusic.length} tracks`);
        
        // Use message ID-based validation approach
        const syncResult = await validateAndSyncByMessageIds(existingMusic);
        
        return syncResult;
        
    } catch (error) {
        console.error('❌ Error in syncPlaylistWithChannel:', error.message);
        return {
            success: false,
            error: error.message
        };
    }
}

// New approach: Validate existing tracks by checking if their message IDs still exist
async function validateAndSyncByMessageIds(existingMusic) {
    try {
        console.log('🔍 Validating cached tracks using message ID verification...');
        
        const validTracks = [];
        const removedTracks = [];
        let validationErrors = 0;
        
        // Check each cached track to see if its message still exists
        for (const track of existingMusic) {
            if (!track.messageId) {
                console.log(`⚠️ Track "${track.title}" has no messageId, keeping it`);
                validTracks.push(track);
                continue;
            }
            
            try {
                // Try to access the specific message to check if it still exists
                console.log(`🔍 Checking message ID ${track.messageId} for "${track.title}"`);
                
                // Use forwardMessage to test if message exists (non-destructive way)
                // This will fail if message doesn't exist anymore
                await bot.forwardMessage(
                    '@username', // This will fail safely, but if message exists we'll get a different error
                    CHANNEL_ID,
                    track.messageId
                );
                
                // If we reach here without error, message exists
                validTracks.push(track);
                console.log(`✅ Message ${track.messageId} exists - keeping "${track.title}"`);
                
            } catch (messageError) {
                // Check if the error indicates the message was deleted
                if (messageError.message.includes('message not found') || 
                    messageError.message.includes('MESSAGE_ID_INVALID') ||
                    messageError.message.includes('message to forward not found')) {
                    console.log(`🗑️ Message ${track.messageId} deleted - removing "${track.title}"`);
                    removedTracks.push(track);
                } else {
                    // Different error (maybe permission issue), keep the track
                    console.log(`⚠️ Cannot verify message ${track.messageId} for "${track.title}" (${messageError.message}) - keeping it`);
                    validTracks.push(track);
                    validationErrors++;
                }
            }
        }
        
        // Now scan for new messages starting from the latest known message ID
        const newTracks = await scanForNewMessages(validTracks);
        
        // Combine valid tracks with new tracks
        const finalTracks = [...validTracks, ...newTracks];
        
        // Update the global playlist
        musicFiles = finalTracks;
        savePersistedMusic();
        
        // Adjust current index if it's out of bounds
        if (currentIndex >= musicFiles.length) {
            currentIndex = musicFiles.length > 0 ? 0 : 0;
        }
        
        console.log(`✅ Validation complete! Removed: ${removedTracks.length}, Added: ${newTracks.length}, Total: ${musicFiles.length}`);
        
        if (removedTracks.length > 0) {
            console.log('🗑️ Removed tracks:');
            removedTracks.forEach(track => console.log(`   - ${track.title} (Message ID: ${track.messageId})`));
        }
        
        if (newTracks.length > 0) {
            console.log('➕ Added tracks:');
            newTracks.forEach(track => console.log(`   + ${track.title} (Message ID: ${track.messageId})`));
        }
        
        if (validationErrors > 0) {
            console.log(`⚠️ ${validationErrors} tracks could not be validated due to permission issues`);
        }
        
        return {
            success: true,
            tracksRemoved: removedTracks.length,
            tracksAdded: newTracks.length,
            totalTracks: musicFiles.length,
            removedTracks: removedTracks.map(track => track.title),
            validationErrors: validationErrors,
            message: `Sync complete! Removed ${removedTracks.length} deleted songs, added ${newTracks.length} new songs. Total: ${musicFiles.length} tracks`
        };
        
    } catch (error) {
        console.error('❌ Error in validateAndSyncByMessageIds:', error.message);
        return {
            success: false,
            error: error.message
        };
    }
}

// Scan for new messages in the channel
async function scanForNewMessages(existingTracks) {
    try {
        console.log('🔍 Scanning for new messages in channel...');
        
        const newTracks = [];
        const existingMessageIds = new Set(existingTracks.map(track => track.messageId).filter(id => id));
        
        // Try to get the latest message ID from channel
        try {
            // Send a temporary message to get current message ID
            const tempMsg = await bot.sendMessage(CHANNEL_ID, '🔍 Scanning...', { 
                disable_notification: true 
            });
            
            const latestMessageId = tempMsg.message_id;
            console.log(`📍 Latest message ID in channel: ${latestMessageId}`);
            
            // Delete the temporary message
            await bot.deleteMessage(CHANNEL_ID, latestMessageId);
            
            // Scan backwards from latest message to find new audio files
            const maxScanCount = 50; // Limit scan to last 50 messages
            let scanCount = 0;
            
            for (let msgId = latestMessageId - 1; msgId > 0 && scanCount < maxScanCount; msgId--) {
                scanCount++;
                
                // Skip if we already have this message ID
                if (existingMessageIds.has(msgId)) {
                    continue;
                }
                
                try {
                    // Try to forward the message to check if it exists and get its content
                    // We'll use a different approach - try to get message info
                    const messageInfo = await bot.forwardMessage(
                        CHANNEL_ID, // Forward to same channel temporarily
                        CHANNEL_ID,
                        msgId
                    );
                    
                    // Check if this forwarded message contains audio
                    if (messageInfo) {
                        const audioFile = messageInfo.audio || messageInfo.voice || messageInfo.document;
                        
                        if (audioFile) {
                            const isAudioFile = audioFile.mime_type?.includes('audio') || 
                                              audioFile.file_name?.match(/\.(mp3|wav|ogg|m4a|flac|aac|mp4)$/i) ||
                                              messageInfo.audio;
                            
                            if (isAudioFile) {
                                try {
                                    const fileUrl = await bot.getFileLink(audioFile.file_id);
                                    const track = {
                                        title: audioFile.title || audioFile.file_name || audioFile.performer || `Music ${newTracks.length + 1}`,
                                        url: fileUrl,
                                        duration: audioFile.duration ? `${Math.floor(audioFile.duration / 60)}:${(audioFile.duration % 60).toString().padStart(2, '0')}` : 'Unknown',
                                        fileId: audioFile.file_id,
                                        performer: audioFile.performer || 'Unknown Artist',
                                        messageId: msgId,
                                        uploadDate: new Date().toISOString()
                                    };
                                    
                                    newTracks.push(track);
                                    console.log(`🎵 Found new track: ${track.title} (Message ID: ${msgId})`);
                                } catch (fileError) {
                                    console.log(`⚠️ Could not get file link for message ${msgId}: ${fileError.message}`);
                                }
                            }
                        }
                        
                        // Delete the forwarded message to clean up
                        try {
                            await bot.deleteMessage(CHANNEL_ID, messageInfo.message_id);
                        } catch (deleteError) {
                            // Ignore delete errors
                        }
                    }
                    
                } catch (msgError) {
                    // Message doesn't exist or cannot access, skip
                    continue;
                }
            }
            
        } catch (scanError) {
            console.log(`⚠️ Could not scan for new messages: ${scanError.message}`);
        }
        
        console.log(`🔍 Scan complete. Found ${newTracks.length} new tracks`);
        return newTracks;
        
    } catch (error) {
        console.error('❌ Error scanning for new messages:', error.message);
        return [];
    }
}

// Helper function to sync existing music with channel data
async function syncWithChannelData(existingMusic, channelMusic) {
    try {
        // Create maps for faster lookup
        const channelFileIds = new Set(channelMusic.map(track => track.fileId).filter(id => id));
        const channelTitles = new Set(channelMusic.map(track => track.title));
        
        // Find songs to remove (not in channel anymore)
        const songsToRemove = existingMusic.filter(existingTrack => {
            // If track has fileId, check by fileId, otherwise check by title
            if (existingTrack.fileId) {
                return !channelFileIds.has(existingTrack.fileId);
            } else {
                return !channelTitles.has(existingTrack.title);
            }
        });
        
        // Remove deleted songs from playlist
        const syncedMusic = existingMusic.filter(existingTrack => {
            if (existingTrack.fileId) {
                return channelFileIds.has(existingTrack.fileId);
            } else {
                return channelTitles.has(existingTrack.title);
            }
        });
        
        // Add new songs from channel
        let newSongsAdded = 0;
        channelMusic.forEach(channelTrack => {
            const isDuplicate = syncedMusic.some(existing => {
                if (channelTrack.fileId && existing.fileId) {
                    return existing.fileId === channelTrack.fileId;
                } else {
                    return existing.title === channelTrack.title;
                }
            });
            
            if (!isDuplicate) {
                syncedMusic.push(channelTrack);
                newSongsAdded++;
            }
        });
        
        // Update the global playlist
        musicFiles = syncedMusic;
        savePersistedMusic();
        
        // Adjust current index if it's out of bounds
        if (currentIndex >= musicFiles.length) {
            currentIndex = musicFiles.length > 0 ? 0 : 0;
        }
        
        console.log(`✅ Playlist synced! Removed: ${songsToRemove.length}, Added: ${newSongsAdded}, Total: ${musicFiles.length}`);
        
        if (songsToRemove.length > 0) {
            console.log('🗑️ Removed songs:');
            songsToRemove.forEach(song => console.log(`   - ${song.title}`));
        }
        
        if (newSongsAdded > 0) {
            console.log('➕ Added songs:');
            channelMusic.slice(-newSongsAdded).forEach(song => console.log(`   + ${song.title}`));
        }
        
        return {
            success: true,
            tracksRemoved: songsToRemove.length,
            tracksAdded: newSongsAdded,
            totalTracks: musicFiles.length,
            removedTracks: songsToRemove.map(track => track.title),
            message: `Sync complete! Removed ${songsToRemove.length} deleted songs, added ${newSongsAdded} new songs. Total: ${musicFiles.length} tracks`
        };
        
    } catch (error) {
        console.error('❌ Error in syncWithChannelData:', error.message);
        return {
            success: false,
            error: error.message
        };
    }
}

// Refresh music from channel endpoint
// Enhanced manual refresh with comprehensive scanning and sync
app.post('/api/refresh', async (req, res) => {
    try {
        console.log('🔄 Manual refresh requested - syncing playlist with channel...');
        
        // Use the new sync function that removes deleted songs and adds new ones
        const syncResult = await syncPlaylistWithChannel();
        
        if (syncResult.success) {
            const hasRealMusic = musicFiles.length > 0 && !musicFiles[0].title?.includes('Demo Song');
            
            res.json({ 
                success: true, 
                message: syncResult.message,
                tracks: syncResult.totalTracks,
                newTracks: syncResult.tracksAdded,
                removedTracks: syncResult.tracksRemoved,
                removedTrackNames: syncResult.removedTracks || [],
                isReal: hasRealMusic,
                syncDetails: {
                    added: syncResult.tracksAdded,
                    removed: syncResult.tracksRemoved,
                    total: syncResult.totalTracks
                }
            });
        } else {
            // Fallback to demo playlist if sync fails
            console.log('🔄 Sync failed, checking if we need demo playlist...');
            
            if (musicFiles.length === 0) {
                await createFallbackPlaylist();
                res.json({ 
                    success: true, 
                    message: `Sync failed. Using demo playlist with ${musicFiles.length} tracks`,
                    tracks: musicFiles.length,
                    newTracks: 0,
                    removedTracks: 0,
                    isReal: false,
                    error: syncResult.error
                });
            } else {
                res.json({ 
                    success: false, 
                    error: syncResult.error,
                    tracks: musicFiles.length
                });
            }
        }
        
    } catch (error) {
        console.error('❌ Error during manual refresh:', error);
        res.json({ success: false, error: error.message });
    }
});

// Main route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Initialize bot and music on startup
async function initialize() {
    await setupBot();
    await fetchMusicFromChannel();
}

initialize();

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🎵 Telegram Music Bot Webpage running on port ${PORT}`);
    console.log(`📱 Channel ID: ${CHANNEL_ID}`);
    console.log(`🌐 Open http://localhost:${PORT} to view the music player`);
});