// Auto-initialize webhook for Telegram bot on Netlify deployment
const axios = require('axios');

exports.handler = async (event, context) => {
    // Only allow POST requests
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'POST, OPTIONS'
            },
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    // Handle CORS preflight
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'POST, OPTIONS'
            },
            body: ''
        };
    }

    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    
    if (!BOT_TOKEN) {
        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                success: false, 
                error: 'TELEGRAM_BOT_TOKEN not configured' 
            })
        };
    }

    try {
        // Get the deployment URL
        const deployUrl = process.env.URL || `https://${event.headers.host}`;
        const webhookUrl = `${deployUrl}/.netlify/functions/api/telegram-webhook`;
        
        console.log(`🔗 Initializing webhook: ${webhookUrl}`);
        
        // Clear existing webhook first
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/deleteWebhook`);
        console.log('🧹 Cleared existing webhook');
        
        // Set new webhook
        const webhookResponse = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`, {
            url: webhookUrl,
            allowed_updates: ['message', 'callback_query', 'channel_post'],
            drop_pending_updates: true
        });
        
        if (webhookResponse.data.ok) {
            console.log('✅ Webhook initialized successfully');
            
            return {
                statusCode: 200,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    success: true, 
                    message: 'Webhook initialized successfully',
                    webhookUrl: webhookUrl
                })
            };
        } else {
            console.log('⚠️ Webhook initialization failed:', webhookResponse.data.description);
            
            return {
                statusCode: 400,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    success: false, 
                    error: webhookResponse.data.description 
                })
            };
        }
        
    } catch (error) {
        console.error('❌ Error initializing webhook:', error.message);
        
        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                success: false, 
                error: error.message 
            })
        };
    }
};