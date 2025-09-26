# 🎵 Telegram Music Bot

A powerful Telegram bot that streams music from a Telegram channel to a beautiful web player interface.

## ✨ Features

- 🎵 Stream music directly from Telegram channel
- 🌐 Beautiful web-based music player
- ⏯️ Full playback controls (play, pause, next, previous)
- 🔄 Automatic playlist management
- 💾 Music caching for better performance
- 📱 Responsive design for all devices
- 🤖 Interactive Telegram bot commands

## 🚀 Quick Start

### Prerequisites

- Node.js 16 or higher
- Telegram Bot Token
- Telegram Channel ID

### Installation

1. Clone the repository
```bash
git clone <repository-url>
cd telegram-music-bot
```

2. Install dependencies
```bash
npm install
```

3. Set up environment variables
Create a `.env` file or set these environment variables:
```
TELEGRAM_BOT_TOKEN=your_bot_token_here
URL=your_deployment_domain
```

4. Run the bot
```bash
npm start
```

## 🌐 Deployment on Netlify

This bot is configured for Netlify deployment:

1. Connect your GitHub repository to Netlify
2. Set environment variables in Netlify dashboard:
   - `TELEGRAM_BOT_TOKEN`: Your Telegram bot token
3. Deploy!

The bot will automatically use Netlify's URL environment variable.

## 📱 Bot Commands

- `/start` - Get welcome message and music player link
- `/help` - Show available commands
- `/status` - Check bot status
- `/music` - Show current playlist
- `/channel` - Channel information

## 🎯 How It Works

1. Bot connects to your Telegram channel
2. Automatically detects audio files uploaded to the channel
3. Creates a web player interface accessible via browser
4. Users can control playback through both web interface and Telegram bot

## 🔧 Configuration

- **Channel ID**: Set in `server.js` (line 11)
- **Port**: Default 5000, configured for Netlify
- **Caching**: Music files are cached locally for better performance

## 📂 Project Structure

```
├── server.js          # Main bot server
├── public/            # Web player frontend
│   ├── index.html     # Main page
│   ├── script.js      # Player logic
│   └── style.css      # Styling
├── functions/         # Netlify functions
├── netlify.toml       # Netlify configuration
└── package.json       # Dependencies
```

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## 📄 License

This project is open source and available under the MIT License.