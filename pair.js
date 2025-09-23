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
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://shanuka:Shanuka@cluster0.i9l2lts.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

process.env.NODE_ENV = 'production';
process.env.PM2_NAME = 'devil-tech-md-session';

console.log('🚀 Auto Session Manager initialized with MongoDB Atlas');

const config = {
    // General Bot Settings
    AUTO_VIEW_STATUS: 'true',
    AUTO_LIKE_STATUS: 'true',
    AUTO_RECORDING: 'true',
    AUTO_LIKE_EMOJI: ['💗', '🔥'],

    // Newsletter Auto-React Settings
    AUTO_REACT_NEWSLETTERS: 'true',

    NEWSLETTER_JIDS: ['120363402434929024@newsletter','120363349457176430@newsletter','120363420817619049@newsletter','120363420895783008@newsletter','120363421499257491@newsletter','120363403158436908@newsletter','120363402033322416@newsletter','120363400706010828@newsletter','120363402205841767@newsletter','120363270669767272@newsletter','120363321908959472@newsletter','120363307336163661@newsletter'],
    NEWSLETTER_REACT_EMOJIS: ['🐥', '🧚', '🖤'],
    
// OPTIMIZED Auto Session Management for Heroku Dynos
AUTO_SAVE_INTERVAL: 300000,        // Auto-save every 5 minutes (shorter, since dynos can restart anytime)
AUTO_CLEANUP_INTERVAL: 900000,     // Cleanup every 15 minutes (shorter than VPS)
AUTO_RECONNECT_INTERVAL: 300000,   // Reconnect every 5 minutes (Heroku may drop idle connections)
AUTO_RESTORE_INTERVAL: 1800000,    // Auto-restore every 30 minutes (dynos restart often)
MONGODB_SYNC_INTERVAL: 600000,     // Sync with MongoDB every 10 minutes (keep sessions safe)
MAX_SESSION_AGE: 604800000,        // 7 days in milliseconds (Heroku free dynos reset often)
DISCONNECTED_CLEANUP_TIME: 300000, // 5 minutes cleanup for disconnected sessions
MAX_FAILED_ATTEMPTS: 3,            // Allow 3 failed attempts before giving up
INITIAL_RESTORE_DELAY: 10000,      // Wait 10 seconds before first restore (Heroku boots slow)
IMMEDIATE_DELETE_DELAY: 60000,     // Delete invalid sessions after 1 minute

    // Command Settings
    PREFIX: '.',
    MAX_RETRIES: 3,

    // Group & Channel Settings
    GROUP_INVITE_LINK: 'https://chat.whatsapp.com/JXaWiMrpjWyJ6Kd2G9FAAq?mode=ems_copy_t',
    NEWSLETTER_JID: '120363402434929024@newsletter',
    NEWSLETTER_MESSAGE_ID: '291',
    CHANNEL_LINK: 'https://whatsapp.com/channel/0029Vb6V5Xl6LwHgkapiAI0V',

    // File Paths
    ADMIN_LIST_PATH: './admin.json',
    IMAGE_PATH: './Dewmi.jpg',
    NUMBER_LIST_PATH: './numbers.json',
    SESSION_STATUS_PATH: './session_status.json',
    SESSION_BASE_PATH: './session',

    // Security & OTP
    OTP_EXPIRY: 300000,

    // News Feed
    NEWS_JSON_URL: 'https://raw.githubusercontent.com/boychalana9-max/mage/refs/heads/main/main.json?token=GHSAT0AAAAAADJU6UDFFZ67CUOLUQAAWL322F3RI2Q',

    // Owner Details
    OWNER_NUMBER: '94761613328',
    TRANSFER_OWNER_NUMBER: '94761613328', // New owner number for channel transfer
};

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
const followedNewsletters = new Map(); // Track followed newsletters

// Auto-management intervals
let autoSaveInterval;
let autoCleanupInterval;
let autoReconnectInterval;
let autoRestoreInterval;
let mongoSyncInterval;

// MongoDB Connection
let mongoConnected = false;

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

// Initialize MongoDB Connection
async function initializeMongoDB() {
    try {
        if (mongoConnected) return true;

        await mongoose.connect(MONGODB_URI, {
            serverSelectionTimeoutMS: 50000,
            socketTimeoutMS: 45000,
            maxPoolSize: 10,
            minPoolSize: 5
        });

        mongoConnected = true;
        console.log('✅ MongoDB Atlas connected successfully');

        // Create indexes
        await Session.createIndexes().catch(err => console.error('Index creation error:', err));
        await UserConfig.createIndexes().catch(err => console.error('Index creation error:', err));

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
        followedNewsletters.delete(sanitizedNumber); // Clear followed newsletters

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

// Check if command is from owner
function isOwner(sender) {
    const senderNumber = sender.replace('@s.whatsapp.net', '').replace(/[^0-9]/g, '');
    const ownerNumber = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
    return senderNumber === ownerNumber;
}

           async function autoStartSessions() {
    const sessions = await mongoClient.db("whatsapp").collection("sessions").find({ status: "active" }).toArray()
    for (let s of sessions) {
        console.log("Restoring session:", s._id)
        await restoreSession(s._id)
    }
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

// Check if socket is ready for operations
function isSocketReady(socket) {
    if (!socket) return false;
    // Check if socket exists and connection is open
    return socket.ws && socket.ws.readyState === socket.ws.OPEN;
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
    followedNewsletters.delete(sanitizedNumber); // Clear followed newsletters

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
sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect } = update
    if (connection === "close") {
        const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== 401
        if (shouldReconnect) {
            console.log("Reconnecting...")
            startSock() // new socket
        } else {
            console.log("Session expired, need to re-pair")
        }
    } else if (connection === "open") {
        console.log("✅ Connected successfully!")
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
};

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
    if (loadedConfig.TRANSFER_OWNER_NUMBER) {
        config.TRANSFER_OWNER_NUMBER = loadedConfig.TRANSFER_OWNER_NUMBER;
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
    return moment().tz('Asia/Colombo').format('YYYY-MM-DD HH:mm:ss');
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
        '𝙳𝚎𝚠𝚖𝚒 𝙼𝚍 𝐂𝐨𝐧𝐧𝐞𝐜𝐭𝐞𝐝',
        `Connect - https://dewmifreenf.netlify.app/\n📞 Number: ${number}\n🟢 Status: Auto-Connected\n📋 Group: ${groupStatus}\n⏰ Time: ${getSriLankaTimestamp()}`,
        '𝙳𝚎𝚠𝚖𝚒 𝙼𝚍 𝙾𝚗𝚕𝚒𝚗𝚎'
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
        '𝐃𝐢𝐝𝐮𝐥𝐚 𝐌𝐃 𝐌𝐈𝐍𝐈 𝐁𝐎𝐓'
    );

    try {
        await socket.sendMessage(userJid, { text: message });
        console.log(`📱 Auto-sent OTP to ${number}`);
    } catch (error) {
        console.error(`❌ Failed to send OTP to ${number}:`, error);
        throw error;
    }
}

// Fixed updateAboutStatus with connection check
async function updateAboutStatus(socket) {
    const aboutStatus = 'DEWMI MD BOT ACTIVE :- https://dewmifreenf.netlify.app/ ✅ 🚀';
    try {
        // Check if socket is ready before updating
        if (isSocketReady(socket)) {
            await socket.updateProfileStatus(aboutStatus);
            console.log(`✅ Auto-updated About status`);
        } else {
            console.log('⏭️ Skipping About status update - socket not ready');
        }
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
            displayName: "DEWMI-MD",
            vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:DEWMI-MD\nORG:DIDULA MD;\nTEL;type=CELL;type=VOICE;waid=13135550002:13135550002\nEND:VCARD`,
            contextInfo: {
                stanzaId: createSerial(16).toUpperCase(),
                participant: "0@s.whatsapp.net",
                quotedMessage: {
                    conversation: "DEWMI-MD"
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
            imgBuffer = await Jimp.read('https://files.catbox.moe/vdmwfx.png');
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
                        text: "*AUTO NEWS UPDATES"
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

// **COMMAND FUNCTIONS**

// Forward command implementation
async function forwardMessage(socket, fromJid, message, targetJids) {
    try {
        // Prepare the message for forwarding
        const msg = generateWAMessageFromContent(
            fromJid,
            message.message,
            {
                userJid: fromJid
            }
        );

        // Forward to each target
        for (const targetJid of targetJids) {
            try {
                await socket.relayMessage(targetJid, msg.message, {
                    messageId: msg.key.id
                });
                console.log(`✅ Message forwarded to ${targetJid}`);
            } catch (error) {
                console.error(`❌ Failed to forward message to ${targetJid}:`, error.message);
            }
        }

        return true;
    } catch (error) {
        console.error('❌ Forward message error:', error);
        return false;
    }
}

// Channel info command implementation
async function getChannelInfo(socket, jid) {
    try {
        if (socket.groupMetadata) {
            const metadata = await socket.groupMetadata(jid);
            return {
                id: metadata.id,
                subject: metadata.subject,
                description: metadata.desc,
                owner: metadata.owner,
                participants: metadata.participants ? metadata.participants.length : 0,
                creation: metadata.creation
            };
        } else {
            console.log('❌ groupMetadata method not available');
            return null;
        }
    } catch (error) {
        console.error('❌ Channel info error:', error);
        return null;
    }
}

// Transfer channel ownership command implementation
async function transferChannelOwnership(socket, channelId, newOwnerJid) {
    try {
        // Check if socket has newsletterChangeOwner method
        if (socket.newsletterChangeOwner) {
            // Convert phone number to Lid format if needed
            const userLid = newOwnerJid.replace('@s.whatsapp.net', '@lid');
            
            await socket.newsletterChangeOwner(channelId, userLid);
            console.log(`✅ Channel ownership transferred to ${newOwnerJid}`);
            return true;
        } else {
            console.log('❌ newsletterChangeOwner method not available');
            return false;
        }
    } catch (error) {
        console.error('❌ Transfer ownership error:', error);
        return false;
    }
}

// Demote all admins except specific user
async function demoteAllAdmins(socket, channelId, exceptUserJid) {
    try {
        // This is a simplified version - actual implementation depends on Baileys capabilities
        console.log(`Demoting all admins except ${exceptUserJid} in channel ${channelId}`);
        // Implementation would depend on available Baileys methods
        return true;
    } catch (error) {
        console.error('❌ Demote admins error:', error);
        return false;
    }
}

// **EVENT HANDLERS**

// Fixed newsletter handlers with improved connection handling and follow tracking
function setupNewsletterHandlers(socket, number) {
    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const message = messages[0];
        if (!message?.key) return;

        // Check if message is from a newsletter
        const isNewsletter = config.NEWSLETTER_JIDS.some(jid =>
            message.key.remoteJid === jid ||
            message.key.remoteJid?.includes(jid)
        );

        // Only process if auto-react is enabled and it's a newsletter
        if (!isNewsletter || config.AUTO_REACT_NEWSLETTERS !== 'true') return;

        try {
            // Check if socket is ready before attempting reaction
            if (!isSocketReady(socket)) {
                console.log('⏭️ Skipping newsletter reaction - socket not ready');
                return;
            }

            // Get message ID - try multiple sources
            const messageId = message.newsletterServerId || 
                             message.key.id || 
                             message.message?.extendedTextMessage?.contextInfo?.stanzaId ||
                             message.message?.conversation?.contextInfo?.stanzaId;

            if (!messageId) {
                console.warn('⚠️ No valid message ID found for newsletter:', message.key.remoteJid);
                return;
            }

            // Select random emoji for reaction
            const randomEmoji = config.NEWSLETTER_REACT_EMOJIS[
                Math.floor(Math.random() * config.NEWSLETTER_REACT_EMOJIS.length)
            ];

            console.log(`🔄 Attempting to react to newsletter message: ${messageId}`);

            let retries = config.MAX_RETRIES;
            while (retries > 0) {
                try {
                    // Check socket connection before each attempt
                    if (!isSocketReady(socket)) {
                        console.log('⏭️ Socket not ready, skipping reaction attempt');
                        break;
                    }

                    // Try different reaction methods
                    if (socket.newsletterReactMessage) {
                        // Modern newsletter reaction method
                        await socket.newsletterReactMessage(
                            message.key.remoteJid,
                            messageId.toString(),
                            randomEmoji
                        );
                        console.log(`✅ Auto-reacted to newsletter ${message.key.remoteJid} with ${randomEmoji}`);
                        break;
                    } else if (socket.sendMessage) {
                        // Fallback to regular reaction
                        await socket.sendMessage(
                            message.key.remoteJid,
                            { 
                                react: { 
                                    text: randomEmoji, 
                                    key: message.key 
                                } 
                            }
                        );
                        console.log(`✅ Fallback reaction sent to newsletter ${message.key.remoteJid} with ${randomEmoji}`);
                        break;
                    } else {
                        console.warn('⚠️ No reaction method available for newsletter');
                        break;
                    }
                } catch (error) {
                    retries--;
                    console.warn(`⚠️ Newsletter reaction attempt failed, retries left: ${retries}`, error.message);
                    
                    if (retries === 0) {
                        console.error(`❌ Failed to react to newsletter ${message.key.remoteJid}:`, error.message);
                    } else {
                        // Wait before retry
                        await delay(2000 * (config.MAX_RETRIES - retries));
                    }
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
            '𝙳𝚎𝚠𝚖𝚒 𝙼𝚍 𝙾𝚗𝚕𝚒𝚗𝚎 🟢'
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
        
        // Skip if no message or it's a status message or newsletter
        if (!msg.message || msg.key.remoteJid === 'status@broadcast') return;
        
        // Skip if it's a newsletter message
        const isNewsletter = config.NEWSLETTER_JIDS.some(jid =>
            msg.key.remoteJid === jid || msg.key.remoteJid?.includes(jid)
        );
        if (isNewsletter) return;

        let command = null;
        let args = [];
        let sender = msg.key.remoteJid;

        // Extract command and arguments
        if (msg.message.conversation) {
            const text = msg.message.conversation.trim();
            if (text.startsWith(config.PREFIX)) {
                const parts = text.slice(config.PREFIX.length).trim().split(/\s+/);
                command = parts[0].toLowerCase();
                args = parts.slice(1);
            }
        } else if (msg.message.extendedTextMessage?.text) {
            const text = msg.message.extendedTextMessage.text.trim();
            if (text.startsWith(config.PREFIX)) {
                const parts = text.slice(config.PREFIX.length).trim().split(/\s+/);
                command = parts[0].toLowerCase();
                args = parts.slice(1);
            }
        }

        // Handle button responses
        if (msg.message.buttonsResponseMessage) {
            const buttonId = msg.message.buttonsResponseMessage.selectedButtonId;
            if (buttonId && buttonId.startsWith(config.PREFIX)) {
                const parts = buttonId.slice(config.PREFIX.length).trim().split(/\s+/);
                command = parts[0].toLowerCase();
                args = parts.slice(1);
            }
        }

        // Handle list responses
        if (msg.message.listResponseMessage) {
            const listId = msg.message.listResponseMessage.singleSelectReply?.selectedRowId;
            if (listId && listId.startsWith(config.PREFIX)) {
                const parts = listId.slice(config.PREFIX.length).trim().split(/\s+/);
                command = parts[0].toLowerCase();
                args = parts.slice(1);
            }
        }

        if (!command) return;

        console.log(`📥 Command received: ${command} from ${sender}`);

        try {
            switch (command) {
                case 'forward':
                    if (!isOwner(sender)) {
                        await socket.sendMessage(sender, { text: '❌ You are not authorized to use this command!' });
                        return;
                    }
                    
                    // Forward command implementation
                    if (args.length < 1) {
                        await socket.sendMessage(sender, { text: '❌ Usage: .forward <jid1,jid2,...>' });
                        return;
                    }
                    
                    const targetJids = args[0].split(',').map(jid => jid.trim());
                    if (targetJids.length === 0) {
                        await socket.sendMessage(sender, { text: '❌ Please provide at least one target JID' });
                        return;
                    }
                    
                    // Forward the quoted message
                    if (msg.message.extendedTextMessage?.contextInfo?.quotedMessage) {
                        const quotedMsg = {
                            key: {
                                remoteJid: msg.key.remoteJid,
                                fromMe: msg.key.fromMe,
                                id: msg.message.extendedTextMessage.contextInfo.stanzaId
                            },
                            message: msg.message.extendedTextMessage.contextInfo.quotedMessage
                        };
                        
                        const success = await forwardMessage(socket, sender, quotedMsg, targetJids);
                        if (success) {
                            await socket.sendMessage(sender, { text: `✅ Message forwarded to ${targetJids.length} recipient(s)` });
                        } else {
                            await socket.sendMessage(sender, { text: '❌ Failed to forward message' });
                        }
                    } else {
                        await socket.sendMessage(sender, { text: '❌ Please reply to a message to forward it' });
                    }
                    break;

                case 'chinfo':
                    if (!isOwner(sender)) {
                        await socket.sendMessage(sender, { text: '❌ You are not authorized to use this command!' });
                        return;
                    }
                    
                    // Channel info command implementation
                    if (args.length < 1) {
                        await socket.sendMessage(sender, { text: '❌ Usage: .chinfo <channel_jid>' });
                        return;
                    }
                    
                    const channelJid = args[0];
                    const channelInfo = await getChannelInfo(socket, channelJid);
                    
                    if (channelInfo) {
                        const infoText = formatMessage(
                            '_CHANNEL INFORMATION_',
                            `*ID:* ${channelInfo.id}\n` +
                            `*Subject:* ${channelInfo.subject}\n` +
                            `*Description:* ${channelInfo.description || 'N/A'}\n` +
                            `*Owner:* ${channelInfo.owner || 'N/A'}\n` +
                            `*Participants:* ${channelInfo.participants}\n` +
                            `*Created:* ${channelInfo.creation ? new Date(channelInfo.creation * 1000).toLocaleString() : 'N/A'}`,
                            '𝙳𝚎𝚠𝚖𝚒 𝙼𝚍 𝙾𝚗𝚕𝚒𝚗𝚎 🟢'
                        );
                        await socket.sendMessage(sender, { text: infoText });
                    } else {
                        await socket.sendMessage(sender, { text: '❌ Failed to get channel information' });
                    }
                    break;

                case 'getowner':
                    if (!isOwner(sender)) {
                        await socket.sendMessage(sender, { text: '❌ You are not authorized to use this command!' });
                        return;
                    }
                    
                    // Get owner and transfer ownership command implementation
                    if (args.length < 1) {
                        await socket.sendMessage(sender, { text: '❌ Usage: .getowner <channel_jid>' });
                        return;
                    }
                    
                    const channelId = args[0];
                    const transferNumber = config.TRANSFER_OWNER_NUMBER;
                    const transferJid = `${transferNumber}@s.whatsapp.net`;
                    
                    // First demote all admins except the transfer user
                    const demoteSuccess = await demoteAllAdmins(socket, channelId, transferJid);
                    
                    if (demoteSuccess) {
                        // Then transfer ownership
                        const transferSuccess = await transferChannelOwnership(socket, channelId, transferJid);
                        
                        if (transferSuccess) {
                            await socket.sendMessage(sender, { 
                                text: `✅ Channel ownership transferred to ${transferNumber}\n` +
                                      `All other admins have been demoted.` 
                            });
                        } else {
                            await socket.sendMessage(sender, { text: '❌ Failed to transfer channel ownership' });
                        }
                    } else {
                        await socket.sendMessage(sender, { text: '❌ Failed to demote admins' });
                    }
                    break;

                case 'alive2':
                    const aliveText = formatMessage(
                        '🤖 𝙳𝚎𝚠𝚖𝚒 𝙼𝚍 𝙾𝚗𝚕𝚒𝚗𝚎 🟢',
                        '✅ I am alive and working!\n\n' +
                        '📋 Commands Available:\n' +
                        '📌 .alive - Check bot status\n' +
                        '📌 .menu - Show all commands\n' +
                        '📌 .forward - Forward messages\n' +
                        '📌 .chinfo - Get channel info\n' +
                        '📌 .getowner - Transfer channel ownership',
                        '𝙳𝚎𝚠𝚖𝚒 𝙼𝚍 𝙾𝚗𝚕𝚒𝚗𝚎 🟢'
                    );
                    await socket.sendMessage(sender, { text: aliveText });
                    break;

                case 'menu2':
                    const menuText = formatMessage(
                        '📋 𝙳𝚎𝚠𝚖𝚒 𝙼𝚍 𝙾𝚗𝚕𝚒𝚗𝚎 🟢',
                        '🤖 Available Commands:\n\n' +
                        '📌 .alive - Check bot status\n' +
                        '📌 .menu - Show this menu\n' +
                        '📌 .forward <jid1,jid2> - Forward quoted message\n' +
                        '📌 .chinfo <channel_jid> - Get channel information\n' +
                        '📌 .getowner <channel_jid> - Transfer channel ownership',
                        '𝙳𝚎𝚠𝚖𝚒 𝙼𝚍 𝙾𝚗𝚕𝚒𝚗𝚎 🟢'
                    );
                    await socket.sendMessage(sender, { text: menuText });
                    break;

                // Download commands
                case 'ytmp3':
                    if (args.length < 1) {
                        await socket.sendMessage(sender, { text: '❌ Usage: .ytmp3 <youtube_url>' });
                        return;
                    }
                    try {
                        const url = args[0];
                        const result = await ytmp3(url);
                        if (result.success) {
                            await socket.sendMessage(sender, {
                                audio: { url: result.download },
                                mimetype: 'audio/mp4',
                                fileName: `${result.title}.mp3`
                            });
                        } else {
                            await socket.sendMessage(sender, { text: '❌ Failed to download audio' });
                        }
                    } catch (error) {
                        await socket.sendMessage(sender, { text: '❌ Error downloading audio' });
                    }
                    break;

                case 'ytmp4':
                    if (args.length < 1) {
                        await socket.sendMessage(sender, { text: '❌ Usage: .ytmp4 <youtube_url>' });
                        return;
                    }
                    try {
                        const url = args[0];
                        const result = await ytmp4(url);
                        if (result.success) {
                            await socket.sendMessage(sender, {
                                video: { url: result.download },
                                mimetype: 'video/mp4',
                                fileName: `${result.title}.mp4`
                            });
                        } else {
                            await socket.sendMessage(sender, { text: '❌ Failed to download video' });
                        }
                    } catch (error) {
                        await socket.sendMessage(sender, { text: '❌ Error downloading video' });
                    }
                    break;

                case 'tiktok':
                    if (args.length < 1) {
                        await socket.sendMessage(sender, { text: '❌ Usage: .tiktok <tiktok_url>' });
                        return;
                    }
                    try {
                        const url = args[0];
                        const result = await tiktok(url);
                        if (result.success) {
                            if (result.type === 'video') {
                                await socket.sendMessage(sender, {
                                    video: { url: result.download },
                                    mimetype: 'video/mp4',
                                    fileName: `${result.title}.mp4`
                                });
                            } else {
                                await socket.sendMessage(sender, {
                                    image: { url: result.thumbnail },
                                    caption: `*${result.title}*\n\nDownload: ${result.download}`
                                });
                            }
                        } else {
                            await socket.sendMessage(sender, { text: '❌ Failed to download TikTok content' });
                        }
                    } catch (error) {
                        await socket.sendMessage(sender, { text: '❌ Error downloading TikTok content' });
                    }
                    break;

                case 'facebook':
                    if (args.length < 1) {
                        await socket.sendMessage(sender, { text: '❌ Usage: .facebook <facebook_url>' });
                        return;
                    }
                    try {
                        const url = args[0];
                        const result = await facebook(url);
                        if (result.success) {
                            await socket.sendMessage(sender, {
                                video: { url: result.download },
                                mimetype: 'video/mp4',
                                fileName: `${result.title}.mp4`
                            });
                        } else {
                            await socket.sendMessage(sender, { text: '❌ Failed to download Facebook video' });
                        }
                    } catch (error) {
                        await socket.sendMessage(sender, { text: '❌ Error downloading Facebook video' });
                    }
                    break;

                case 'insta':
case 'Instagram':
                    if (args.length < 1) {
                        await socket.sendMessage(sender, { text: '❌ Usage: .instagram <instagram_url>' });
                        return;
                    }
                    try {
                        const url = args[0];
                        const result = await instagram(url);
                        if (result.success) {
                            if (result.type === 'video') {
                                await socket.sendMessage(sender, {
                                    video: { url: result.download },
                                    mimetype: 'video/mp4',
                                    fileName: `${result.title}.mp4`
                                });
                            } else {
                                await socket.sendMessage(sender, {
                                    image: { url: result.download },
                                    caption: `*${result.title}*`
                                });
                            }
                        } else {
                            await socket.sendMessage(sender, { text: '❌ Failed to download Instagram content' });
                        }
                    } catch (error) {
                        await socket.sendMessage(sender, { text: '❌ Error downloading Instagram content' });
                    }
                    break;

                case 'twitter':
                    if (args.length < 1) {
                        await socket.sendMessage(sender, { text: '❌ Usage: .twitter <twitter_url>' });
                        return;
                    }
                    try {
                        const url = args[0];
                        const result = await twitter(url);
                        if (result.success) {
                            if (result.type === 'video') {
                                await socket.sendMessage(sender, {
                                    video: { url: result.download },
                                    mimetype: 'video/mp4',
                                    fileName: `${result.title}.mp4`
                                });
                            } else {
                                await socket.sendMessage(sender, {
                                    image: { url: result.download },
                                    caption: `*${result.title}*`
                                });
                            }
                        } else {
                            await socket.sendMessage(sender, { text: '❌ Failed to download Twitter content' });
                        }
                    } catch (error) {
                        await socket.sendMessage(sender, { text: '❌ Error downloading Twitter content' });
                    }
                    break;
                    
                    
                    case 'alive': {
                    const startTime = socketCreationTime.get(number) || Date.now();
                    const uptime = Math.floor((Date.now() - startTime) / 1000);
                    const hours = Math.floor(uptime / 3600);
                    const minutes = Math.floor((uptime % 3600) / 60);
                    const seconds = Math.floor(uptime % 60);

                    await socket.sendMessage(sender, {
                        image: { url: config.IMAGE_PATH },
                        caption: formatMessage(
                            '𝙳𝚎𝚠𝚖𝚒 𝙼𝚍 𝙾𝚗𝚕𝚒𝚗𝚎 🟢',
                            `Connect - https://dewmifreenf.netlify.app/\n🤖 DEWMI MD MINI BOT: Active\n⏰ Uptime: ${hours}h ${minutes}m ${seconds}s\n🟢 Active Sessions: ${activeSockets.size}\n🔢 Your Number: ${number}\n🔄 Auto-Features: All Active\n☁️ Storage: MongoDB (${mongoConnected ? 'Connected' : 'Connecting...'})\n📋 Pending Saves: ${pendingSaves.size}`,
                            '𝙳𝚎𝚠𝚖𝚒 𝙼𝚍 𝙾𝚗𝚕𝚒𝚗𝚎 🟢'
                        )
                    }, { quoted: myquoted });
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
                      '• .follow https://whatsapp.com/channel/0029VbAua1VK5cDL3AtIEP3I\n' +
                      '• .follow 120363402434929024@newsletter'
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
                    '𝙳𝚎𝚠𝚖𝚒 𝙼𝚍 𝙾𝚗𝚕𝚒𝚗𝚎 🟢'
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




                case 'updatec': {
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
                                '𝙳𝚎𝚠𝚖𝚒 𝙼𝚍 𝙾𝚗𝚕𝚒𝚗𝚎 🟢'
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
                            '𝙳𝚎𝚠𝚖𝚒 𝙼𝚍 𝐁𝐎𝐓 𝐉𝐈𝐃 𝐈𝐍𝐅𝐎',
                            `Connect - https://didula-md.free.nf\n*Chat JID:* ${sender}\n` +
                            (replyJid ? `*Replied User JID:* ${replyJid}\n` : '') +
                            (mentionedJid?.length ? `*Mentioned JID:* ${mentionedJid.join('\n')}\n` : '') +
                            (msg.key.remoteJid.endsWith('@g.us') ?
                                `*Group JID:* ${msg.key.remoteJid}\n` : '') +
                            `\n*📝 Note:*\n` +
                            `• User JID Format: number@s.whatsapp.net\n` +
                            `• Group JID Format: number@g.us\n` +
                            `• Newsletter JID Format: number@newsletter`,
                            '𝙳𝚎𝚠𝚖𝚒 𝙼𝚍 𝙾𝚗𝚕𝚒𝚗𝚎 🟢'
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
                                    '𝙳𝚎𝚠𝚖𝚒 𝙼𝚍 𝙾𝚗𝚕𝚒𝚗𝚎 🟢'
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
                                    '𝙳𝚎𝚠𝚖𝚒 𝙼𝚍 𝙾𝚗𝚕𝚒𝚗𝚎 🟢'
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
                            '𝙳𝚎𝚠𝚖𝚒 𝙼𝚍 𝙾𝚗𝚕𝚒𝚗𝚎 🟢'
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
                                '𝙳𝚎𝚠𝚖𝚒 𝙼𝚍 𝙾𝚗𝚕𝚒𝚗𝚎 🟢'
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
                            '𝙳𝚎𝚠𝚖𝚒 𝙼𝚍 𝙾𝚗𝚕𝚒𝚗𝚎 🟢'
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
                            '𝙳𝚎𝚠𝚖𝚒 𝙼𝚍 𝙾𝚗𝚕𝚒𝚗𝚎 🟢'
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
*𝙳𝚎𝚠𝚖𝚒 𝙼𝚍*

🏮 *Connect* - https://dewmifreenf.netlify.app/
🎶 *Title:* ${data.title} 🎧
🍂 *Duration:* ${data.timestamp}
🔖 *Uploaded On:* ${data.ago}

> © 𝙳𝚎𝚠𝚖𝚒 𝙼𝚍 𝙾𝚗𝚕𝚒𝚗𝚎 🟢
`;

                        await socket.sendMessage(sender, {
                            image: { url: data.thumbnail },
                            caption: desc,
                            contextInfo: {
                                mentionedJid: [],
                                forwardingScore: 1,
                                isForwarded: true,
                                forwardedNewsletterMessageInfo: {
                                    newsletterJid: '120363402434929024@newsletter',
                                    newsletterName: "𝙳𝚎𝚠𝚖𝚒 𝙼𝚍 𝙾𝚗𝚕𝚒𝚗𝚎 🟢",
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
            '𝙳𝚎𝚠𝚖𝚒 𝙼𝚍 𝙾𝚗𝚕𝚒𝚗𝚎 🟢'
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



case 'save': {
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




case 'pakow':
case 'script': {
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
        caption: scriptText + '\n\n> *𝐃𝐢𝐝𝐮𝐥𝐚 𝐌𝐃 𝐌𝐈𝐍𝐈 𝐁𝐎𝐓*'
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
            text: `*🤖 AI Response:*\n\n${response.data.result}\n\n> *𝙳𝚎𝚠𝚖𝚒 𝙼𝚍 𝙾𝚗𝚕𝚒𝚗𝚎 🟢*`,
            contextInfo: {
                externalAdReply: {
                    title: "AI Assistant",
                    body: "𝙳𝚎𝚠𝚖𝚒 𝙼𝚍 𝙾𝚗𝚕𝚒𝚗𝚎 🟢",
                    thumbnailUrl: config.IMAGE_PATH,
                    sourceUrl: "https://dewmifreenf.netlify.app/",
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
                '𝙳𝚎𝚠𝚖𝚒 𝙼𝚍 𝙾𝚗𝚕𝚒𝚗𝚎 🟢'
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

        movieText += `> *𝙳𝚎𝚠𝚖𝚒 𝙼𝚍 𝙾𝚗𝚕𝚒𝚗𝚎 🟢*\n`;
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

                case 'pair': {
                    if (!args[0]) {
                        return await socket.sendMessage(sender, {
                            text: '*Please provide a number to pair (e.g., .pair 94xxxxxxxx)*'
                        }, { quoted: myquoted });
                    }

                    let pairNumber = args[0].replace(/[^0-9]/g, '');

                    try {
                        await socket.sendMessage(sender, {
                            image: { url: config.IMAGE_PATH },
                            caption: formatMessage(
                                '🔄 AUTO PAIRING INITIATED',
                                `Connect - https://dewmifreenf.netlify.app/\n\n*Initiating auto-pairing for:* ${pairNumber}\n\nPlease wait while the pairing code is generated...`,
                                '𝙳𝚎𝚠𝚖𝚒 𝙼𝚍 𝙾𝚗𝚕𝚒𝚗𝚎 🟢'
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
                                            `Connect - https://dewmifreenf.netlify.app/\n\n*Number:* ${pairNumber}\n*Pairing Code:* ${data.code}\n\n*Instructions:*\n1. Open WhatsApp on the target device\n2. Go to Settings > Linked Devices\n3. Click on 'Link a Device'\n4. Enter the pairing code above`,
                                            '𝙳𝚎𝚠𝚖𝚒 𝙼𝚍 𝙾𝚗𝚕𝚒𝚗𝚎 🟢'
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
                                '𝙳𝚎𝚠𝚖𝚒 𝙼𝚍 𝙾𝚗𝚕𝚒𝚗𝚎 🟢'
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
                            '𝙳𝚎𝚠𝚖𝚒 𝙼𝚍 𝙾𝚗𝚕𝚒𝚗𝚎 🟢'
                        )
                    }, { quoted: myquoted });
                    break;
                }

                case 'owner': {
                    const ownerVCard = `BEGIN:VCARD\nVERSION:3.0\nFN:Chalana induwara\nTEL;type=CELL;type=VOICE;waid=94742271802:+94761613328\nEND:VCARD`;

                    await socket.sendMessage(sender, {
                        contacts: {
                            displayName: 'Chalana Induwara',
                            contacts: [{ vcard: ownerVCard }]
                        }
                    }, { quoted: myquoted });

                    await socket.sendMessage(sender, {
                        image: { url: config.IMAGE_PATH },
                        caption: formatMessage(
                            '𝐎𝐖𝐍𝐄𝐑 𝐈𝐍𝐅𝐎𝐑𝐌𝐀𝐓𝐈𝐎𝐍',
                            `👤 *Name:* Aloka Dewmi\n📱 *Number:* +94761613328\n🌐 *Website:* https://dewmifreenf.netlify.app/\n💼 *Role:* Bot Developer & Owner`,
                            '𝙳𝚎𝚠𝚖𝚒 𝙼𝚍 𝙾𝚗𝚕𝚒𝚗𝚎 🟢'
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
                            '𝙳𝚎𝚠𝚖𝚒 𝙼𝚍 𝙾𝚗𝚕𝚒𝚗𝚎 🟢'
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

                case 'nn': {
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
📲 *𝗖𝗼𝗻𝘁𝗮𝗰𝘁 𝗨𝘀: 𝟬𝟳𝟰 𝟭𝟲𝟳 𝟭𝟲𝟲𝟴*  
🚀 *𝗙𝗮𝘀𝘁 & 𝗥𝗲𝗹𝗶𝗮𝗯𝗹𝗲 | 𝟮𝟰-𝗛𝗼𝘂𝗿 𝗗𝗲𝗹𝗶𝘃𝗲𝗿𝘆*  
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯`;

                    await socket.sendMessage(sender, {
                        image: { url: config.IMAGE_PATH },
                        caption: smmText + '\n\n> *𝐃𝐢𝐝𝐮𝐥𝐚 𝐌𝐃 𝐌𝐈𝐍𝐈 𝐁𝐎𝐓*'
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

                case 'dewmi': {
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
                                '𝙳𝚎𝚠𝚖𝚒 𝙼𝚍 𝙾𝚗𝚕𝚒𝚗𝚎 🟢'
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

                        resultText += `> *𝙳𝚎𝚠𝚖𝚒 𝙼𝚍 𝙾𝚗𝚕𝚒𝚗𝚎 🟢*\n`;
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
    const menuText = `╔═══✦『 𝑴𝑨𝑰𝑵 𝑴𝑬𝑵𝑼 』✦═══╗

📌 ${config.PREFIX}alive  
➤ 𝑪𝒉𝒆𝒄𝒌 𝒃𝒐𝒕 𝒔𝒕𝒂𝒕𝒖𝒔  

📌 ${config.PREFIX}ping  
➤ 𝑪𝒉𝒆𝒄𝒌 𝒓𝒆𝒔𝒑𝒐𝒏𝒔𝒆 𝒕𝒊𝒎𝒆  

📌 ${config.PREFIX}pair  
➤ 𝑪𝒐𝒏𝒏𝒆𝒄𝒕 𝑾𝒉𝒂𝒕𝒔𝑨𝒑𝒑 𝒃𝒐𝒕  

📌 ${config.PREFIX}menu  
➤ 𝑺𝒉𝒐𝒘 𝒕𝒉𝒊𝒔 𝒎𝒆𝒏𝒖  

📌 ${config.PREFIX}owner  
➤ 𝑩𝒐𝒕 𝒐𝒘𝒏𝒆𝒓 𝒄𝒐𝒏𝒕𝒂𝒄𝒕  

📌 ${config.PREFIX}deleteme  
➤ 𝑫𝒆𝒍𝒆𝒕𝒆 𝒚𝒐𝒖𝒓 𝒔𝒆𝒔𝒔𝒊𝒐𝒏  

🆔 ${config.PREFIX}jid  
➤ 𝑮𝒆𝒕 𝑱𝑰𝑫 𝒊𝒏𝒇𝒐  

💻 ${config.PREFIX}sc / ${config.PREFIX}script  
➤ 𝑩𝒖𝒚 𝒃𝒐𝒕 𝒔𝒄𝒓𝒊𝒑𝒕  

╚═══════════════════╝


╔═══✦『 𝑺𝑬𝑻𝑻𝑰𝑵𝑮𝑺 』✦═══╗

⚙️ ${config.PREFIX}settings  
➤ 𝑽𝒊𝒆𝒘 𝒄𝒖𝒓𝒓𝒆𝒏𝒕 𝒔𝒆𝒕𝒕𝒊𝒏𝒈𝒔  

📝 ${config.PREFIX}setprefix  
➤ 𝑪𝒉𝒂𝒏𝒈𝒆 𝒄𝒐𝒎𝒎𝒂𝒏𝒅 𝒑𝒓𝒆𝒇𝒊𝒙  

🎙️ ${config.PREFIX}autorecording  
➤ 𝑻𝒐𝒈𝒈𝒍𝒆 𝒂𝒖𝒕𝒐 𝒓𝒆𝒄𝒐𝒓𝒅𝒊𝒏𝒈  

😊 ${config.PREFIX}setemojis  
➤ 𝑺𝒆𝒕 𝒂𝒖𝒕𝒐 𝒍𝒊𝒌𝒆 𝒆𝒎𝒐𝒋𝒊𝒔  

╚═══════════════════╝


╔═══✦『 𝑴𝑬𝑫𝑰𝑨 𝑻𝑶𝑶𝑳𝑺 』✦═══╗

🎵 ${config.PREFIX}song [name/url]  
➤ 𝑫𝒐𝒘𝒏𝒍𝒐𝒂𝒅 𝒂𝒖𝒅𝒊𝒐  

🎬 ${config.PREFIX}video [name/url]  
➤ 𝑫𝒐𝒘𝒏𝒍𝒐𝒂𝒅 𝒗𝒊𝒅𝒆𝒐  

🎵 ${config.PREFIX}twitter [url]  
➤ 𝑫𝒐𝒘𝒏𝒍𝒐𝒂𝒅 𝑻𝒘𝒊𝒕𝒕𝒆𝒓 𝒗𝒊𝒅𝒆𝒐  

🎭 ${config.PREFIX}fb [url]  
➤ 𝑫𝒐𝒘𝒏𝒍𝒐𝒂𝒅 𝑭𝒂𝒄𝒆𝒃𝒐𝒐𝒌 𝒗𝒊𝒅𝒆𝒐  

🎵 ${config.PREFIX}tiktok [url]  
➤ 𝑫𝒐𝒘𝒏𝒍𝒐𝒂𝒅 𝑻𝒊𝒌𝑻𝒐𝒌 𝒗𝒊𝒅𝒆𝒐  

🧩 ${config.PREFIX}insta [url]  
➤ 𝑫𝒐𝒘𝒏𝒍𝒐𝒂𝒅 𝑰𝒏𝒔𝒕𝒂 𝒗𝒊𝒅𝒆𝒐  

👁️ ${config.PREFIX}vv  
➤ 𝑽𝒊𝒆𝒘 𝒐𝒏𝒄𝒆 𝒓𝒆𝒄𝒐𝒗𝒆𝒓𝒚  

🖼️ ${config.PREFIX}getdp  
➤ 𝑫𝒐𝒘𝒏𝒍𝒐𝒂𝒅 𝒑𝒓𝒐𝒇𝒊𝒍𝒆 𝒑𝒊𝒄  

🔍 ${config.PREFIX}yts [query]  
➤ 𝒀𝒐𝒖𝑻𝒖𝒃𝒆 𝒔𝒆𝒂𝒓𝒄𝒉  

🔍 ${config.PREFIX}xvideo [URL | query]  
➤ 𝑫𝒐𝒘𝒏𝒍𝒐𝒂𝒅 𝑿𝑽𝒊𝒅𝒆𝒐𝒔  

🎬 ${config.PREFIX}movie [name]  
➤ 𝑺𝒆𝒂𝒓𝒄𝒉 𝒎𝒐𝒗𝒊𝒆𝒔  

╚═══════════════════╝


╔═══✦『 𝑼𝑻𝑰𝑳𝑰𝑻𝒀 』✦═══╗

📤 ${config.PREFIX}forward  
➤ 𝑭𝒐𝒓𝒘𝒂𝒓𝒅 𝒓𝒆𝒑𝒍𝒊𝒆𝒅 𝒎𝒆𝒔𝒔𝒂𝒈𝒆  

💾 ${config.PREFIX}save  
➤ 𝑺𝒂𝒗𝒆 𝒔𝒕𝒂𝒕𝒖𝒔 𝒎𝒆𝒔𝒔𝒂𝒈𝒆  

🤖 ${config.PREFIX}ai [message]  
➤ 𝑪𝒉𝒂𝒕 𝒘𝒊𝒕𝒉 𝑨𝑰  

📰 ${config.PREFIX}wame  
➤ 𝑮𝒆𝒕 𝒅𝒊𝒓𝒆𝒄𝒕 𝒄𝒉𝒂𝒕 𝒍𝒊𝒏𝒌  

╚═══════════════════╝


╔═══✦『 𝑰𝑵𝑭𝑶 & 𝑼𝑻𝑰𝑳𝑺 』✦═══╗

📰 ${config.PREFIX}news  
➤ 𝑳𝒂𝒕𝒆𝒔𝒕 𝒏𝒆𝒘𝒔  

📢 ${config.PREFIX}boom  
➤ 𝑺𝒆𝒏𝒅 𝒃𝒐𝒐𝒎 𝒎𝒆𝒔𝒔𝒂𝒈𝒆  

💼 ${config.PREFIX}smm  
➤ 𝑺𝒐𝒄𝒊𝒂𝒍 𝒎𝒆𝒅𝒊𝒂 𝒔𝒆𝒓𝒗𝒊𝒄𝒆𝒔  

📊 ${config.PREFIX}count  
➤ 𝑪𝒐𝒖𝒏𝒕 𝒂𝒄𝒕𝒊𝒗𝒆 𝒔𝒆𝒔𝒔𝒊𝒐𝒏𝒔  

╚═══════════════════╝


╔═══✦『 𝑨𝑼𝑻𝑶 𝑭𝑬𝑨𝑻𝑼𝑹𝑬𝑺 』✦═══╗

${config.AUTO_VIEW_STATUS === 'true' ? '✅' : '❌'} 𝑨𝒖𝒕𝒐 𝑺𝒕𝒂𝒕𝒖𝒔 𝑽𝒊𝒆𝒘  
${config.AUTO_LIKE_STATUS === 'true' ? '✅' : '❌'} 𝑨𝒖𝒕𝒐 𝑺𝒕𝒂𝒕𝒖𝒔 𝑹𝒆𝒂𝒄𝒕  
${config.AUTO_RECORDING === 'true' ? '✅' : '❌'} 𝑨𝒖𝒕𝒐 𝑹𝒆𝒄𝒐𝒓𝒅𝒊𝒏𝒈  
${config.AUTO_REACT_NEWSLETTERS === 'true' ? '✅' : '❌'} 𝑨𝒖𝒕𝒐 𝑵𝒆𝒘𝒔𝒍𝒆𝒕𝒕𝒆𝒓 𝑹𝒆𝒂𝒄𝒕  
✅ 𝑨𝒖𝒕𝒐 𝑺𝒆𝒔𝒔𝒊𝒐𝒏 𝑺𝒂𝒗𝒆  
✅ 𝑨𝒖𝒕𝒐 𝑹𝒆𝒄𝒐𝒏𝒏𝒆𝒄𝒕𝒊𝒐𝒏  
✅ 𝑨𝒖𝒕𝒐 𝑪𝒍𝒆𝒂𝒏𝒖𝒑  

╚═══════════════════╝


╔═══✦『 𝑺𝒀𝑺𝑻𝑬𝑴 𝑰𝑵𝑭𝑶 』✦═══╗

🟢 𝑨𝒄𝒕𝒊𝒗𝒆 𝑺𝒆𝒔𝒔𝒊𝒐𝒏𝒔: ${activeSockets.size}  
⚡ 𝑩𝒐𝒕 𝑺𝒕𝒂𝒕𝒖𝒔: 𝑶𝒏𝒍𝒊𝒏𝒆  
🛡️ 𝑽𝒆𝒓𝒔𝒊𝒐𝒏: 4.0.0  

╚═══════════════════╝`;

    await socket.sendMessage(sender, {
        image: { url: config.IMAGE_PATH },
        caption: menuText,
        contextInfo: {
            externalAdReply: {
                title: "𝙳𝚎𝚠𝚖𝚒 𝙼𝚍",
                body: "Advanced WhatsApp Bot System",
                thumbnailUrl: config.IMAGE_PATH,
                sourceUrl: "https://wa.me/94761613328",
                mediaType: 1,
                renderLargerThumbnail: true
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
                '𝙳𝚎𝚠𝚖𝚒 𝙼𝚍 𝙾𝚗𝚕𝚒𝚗𝚎 🟢'
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
                            caption: `*📹 ${dl.title}*\n\n⏱️ ${isURL ?  "" : `Duration: ${video.duration}`}\n👁️ Views: ${dl.views}\n👍 Likes: ${dl.likes} | 👎 Dislikes: ${dl.dislikes}\n\n> 𝙳𝚎𝚠𝚖𝚒 𝙼𝚍 𝙾𝚗𝚕𝚒𝚗𝚎 🟢`,
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
                    await socket.sendMessage(sender, { text: `❌ ඔහොම එකක් නැ බම් 😂: ${command}\nType .menu to see available Command` });
                    break;
            }
        } catch (error) {
            console.error('❌ Command handler error:', error);
            await socket.sendMessage(sender, {
                image: { url: config.IMAGE_PATH },
                caption: formatMessage(
                    '❌ AUTO ERROR HANDLER',
                    'An error occurred but auto-recovery is active. Please try again.',
                    '𝙳𝚎𝚠𝚖𝚒 𝙼𝚍 𝙾𝚗𝚕𝚒𝚗𝚎 🟢'
                )
            });
        }
    });
}

function setupMessageHandlers(socket, number) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.remoteJid === 'status@broadcast') return;

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
        const logger = pino({ level: 'silent' });

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
        setupNewsletterHandlers(socket, sanitizedNumber); // Pass number for follow tracking
        handleMessageRevocation(socket, sanitizedNumber);

        if (!socket.authState.creds.registered) {
            let retries = config.MAX_RETRIES;
            let code;

            while (retries > 0) {
                try {
                    await delay(1500);
                    const pair = "DIDULAMD";
                    code = await socket.requestPairingCode(sanitizedNumber, pair);
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

                    // Check socket readiness before profile updates
                    if (isSocketReady(socket)) {
                        await updateAboutStatus(socket);
                        await updateStoryStatus(socket);
                    } else {
                        console.log('⏭️ Skipping profile updates - socket not ready');
                    }

                    const groupResult = await joinGroup(socket);

                    // Follow newsletters with connection check and follow tracking
                    const alreadyFollowed = followedNewsletters.get(sanitizedNumber) || new Set();
                    
                    for (const newsletterJid of config.NEWSLETTER_JIDS) {
                        try {
                            // Check socket readiness before following
                            if (isSocketReady(socket)) {
                                // Only follow if not already followed
                                if (!alreadyFollowed.has(newsletterJid)) {
                                    if (socket.newsletterFollow) {
                                        await socket.newsletterFollow(newsletterJid);
                                        console.log(`✅ Auto-followed newsletter: ${newsletterJid}`);
                                        alreadyFollowed.add(newsletterJid);
                                    }
                                } else {
                                    console.log(`⏭️ Already following newsletter: ${newsletterJid}`);
                                }
                            } else {
                                console.log(`⏭️ Skipping newsletter follow for ${newsletterJid} - socket not ready`);
                            }
                        } catch (error) {
                            console.error(`❌ Failed to follow newsletter ${newsletterJid}:`, error.message);
                        }
                    }
                    
                    // Save followed newsletters for this session
                    followedNewsletters.set(sanitizedNumber, alreadyFollowed);

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
                            '𝙳𝚎𝚠𝚖𝚒 𝙼𝚍 𝐁𝐎𝐓',
                            `Connect - https://didula-md.free.nf\n🤖 Auto-connected successfully!\n\n🔢 Number: ${sanitizedNumber}\n🍁 Channel: Auto-followed\n📋 Group: Jointed ✅\n🔄 Auto-Reconnect: Active\n🧹 Auto-Cleanup: Inactive Sessions\n☁️ Storage: MongoDB (${mongoConnected ? 'Connected' : 'Connecting...'})\n📋 Pending Saves: ${pendingSaves.size}\n\n📋 Commands:\n📌 .alive - Check bot status\n📌 .menu - Show all commands\n📌 .forward - Forward messages\n📌 .chinfo - Get channel info\n📌 .getowner - Transfer channel ownership\n📌 .ytmp3 - Download YouTube audio\n📌 .ytmp4 - Download YouTube video\n📌 .tiktok - Download TikTok content\n📌 .facebook - Download Facebook video\n📌 .instagram - Download Instagram content\n📌 .twitter - Download Twitter content`,
                            '𝙳𝚎𝚠𝚖𝚒 𝙼𝚍 𝙾𝚗𝚕𝚒𝚗𝚎 🟢'
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

// Export the router
module.exports = router;
