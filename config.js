// Configuration file for bot settings
// WARNING: Only use this for testing. For production, always use environment variables.

const config = {
    // Bot configuration
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '7594086301:AAEaxT_4lD4QC9A2pD67A-hg-YSpJbXy4L8', // Your bot token
    CHANNEL_ID: -1003112397951,
    
    // Environment detection
    isProduction: process.env.NODE_ENV === 'production',
    isDevelopment: process.env.NODE_ENV === 'development',
    
    // URLs
    getWebhookUrl: () => {
        if (process.env.URL) {
            return `${process.env.URL}/.netlify/functions/api/telegram-webhook`;
        }
        return 'https://telegram-music-bot.netlify.app/.netlify/functions/api/telegram-webhook';
    },
    
    getWebPlayerUrl: () => {
        if (process.env.URL) {
            return process.env.URL;
        }
        return 'https://telegram-music-bot.netlify.app';
    }
};

module.exports = config;