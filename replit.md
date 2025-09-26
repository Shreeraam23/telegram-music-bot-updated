# replit.md

## Overview

This is a web-based music streaming application that integrates with Telegram to continuously play music from a configured channel. The application features a modern web player interface with real-time music streaming capabilities, playlist management, and standard audio controls. It combines a Node.js/Express backend for Telegram API integration with a responsive frontend music player.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Technology Stack**: Vanilla HTML, CSS, and JavaScript
- **Design Pattern**: Class-based JavaScript architecture with event-driven interactions
- **UI Framework**: Custom CSS with Font Awesome icons for a modern, responsive design
- **Player Features**: Real-time progress tracking, volume control, playlist navigation, and continuous playback

### Backend Architecture
- **Framework**: Express.js server running on port 5000
- **Design Pattern**: RESTful API architecture with static file serving
- **Bot Integration**: Telegram Bot API integration using the `node-telegram-bot-api` library
- **Security**: Environment variable-based token management for secure API access
- **Error Handling**: Comprehensive error handling for bot setup and API interactions

### Data Management
- **Storage**: In-memory caching for music files and playlist data
- **State Management**: Client-side playlist management with automatic track progression
- **Real-time Updates**: Dynamic content loading from Telegram channel

### Authentication & Security
- **Bot Authentication**: Secure token-based authentication with Telegram Bot API
- **Environment Variables**: Sensitive credentials stored in environment variables
- **Webhook Management**: Automatic webhook deletion to prevent conflicts

## External Dependencies

### Core Dependencies
- **Express.js (v5.1.0)**: Web server framework for serving the application and API endpoints
- **node-telegram-bot-api (v0.66.0)**: Official Telegram Bot API wrapper for Node.js
- **Axios (v1.12.2)**: HTTP client for making API requests to Telegram services

### Frontend Libraries
- **Font Awesome (v6.0.0)**: Icon library for user interface elements via CDN

### Telegram Integration
- **Telegram Bot API**: Core service for bot functionality and message handling
- **Telegram Channel**: Configured channel as the primary music source
- **Webhook Management**: API endpoints for managing bot webhook configurations

### Environment Requirements
- **TELEGRAM_BOT_TOKEN**: Required environment variable for bot authentication
- **Node.js Runtime**: Backend execution environment
- **Static File Serving**: Public directory structure for frontend assets

## Recent Changes (September 24, 2025)

✅ **Completed Telegram Music Bot Web Application**
- Implemented secure bot token management using TELEGRAM_BOT_TOKEN environment variable
- Added real-time channel integration with configured channel
- Created intelligent fallback demo playlist for when bot lacks full channel access
- Built responsive web music player with continuous playback functionality
- Successfully connects to Telegram channel and attempts to fetch real audio files
- Provides seamless user experience with automatic track progression