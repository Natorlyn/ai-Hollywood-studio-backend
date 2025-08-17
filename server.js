require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { MongoClient } = require('mongodb');
const axios = require('axios');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);
const app = express();
app.set('trust proxy', 1);

// Environment variables
const PORT = process.env.PORT || 8080;
const MONGODB_URI = process.env.MONGODB_URI;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'your-encryption-key';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'casteroai001@gmail.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

let db;
let authManager;

console.log('Starting AI Hollywood Studio Backend...');

// Video Generator Class
class CompleteVideoGenerator {
    constructor(apiKeys) {
        this.elevenLabsKey = apiKeys.elevenlabs;
        this.pexelsKey = apiKeys.pexels;
        this.pixabayKey = apiKeys.pixabay;
        this.outputDir = path.join(__dirname, 'generated_videos');
        this.tempDir = path.join(__dirname, 'temp_assets');
    }

    async generateVideo({ title, category, duration, tone, voiceStyle, visualStyle }) {
        try {
            console.log(`Starting video generation: ${title}`);
            
            await this.ensureDirectories();
            const script = await this.generateScript(title, category, duration, tone);
            const audioFile = await this.generateVoiceover(script.content, voiceStyle, title);
            const mediaAssets = await this.gatherMediaAssets(category, script.scenes);
            const videoFile = await this.compileVideo(audioFile, mediaAssets, title, duration);
            
            return {
                success: true,
                videoFile: videoFile,
                downloadUrl: `/download/${path.basename(videoFile)}`,
                duration: duration,
                quality: '1080p',
                fileSize: await this.getFileSize(videoFile)
            };
            
        } catch (error) {
            console.error('Video generation failed:', error);
            throw error;
        }
    }

    async ensureDirectories() {
        for (const dir of [this.outputDir, this.tempDir]) {
            try {
                await fs.access(dir);
            } catch {
                await fs.mkdir(dir, { recursive: true });
            }
        }
    }

    async generateScript(title, category, duration, tone) {
        const wordsPerMinute = 150;
        const targetWords = duration * wordsPerMinute;
        
        const baseContent = `Welcome to your guide on ${title}. Today we'll explore proven strategies and insights that can help you understand this topic better. This comprehensive overview will provide you with practical knowledge and actionable information. Let's dive into the key concepts and examine what makes this subject important in today's world.`;
        
        let script = baseContent;
        const currentWords = baseContent.split(' ').length;
        
        // Expand script to target length
        const expansionText = 'Research shows that understanding these fundamentals is crucial for success. Industry experts consistently demonstrate that systematic approaches yield better results than random methods. Data analysis reveals patterns that help optimize outcomes and maximize effectiveness.';
        
        while (script.split(' ').length < targetWords) {
            script += ' ' + expansionText;
        }
        
        // Trim to exact length
        const words = script.split(' ');
        if (words.length > targetWords) {
            script = words.slice(0, targetWords).join(' ');
        }
        
        script += ' Thank you for watching. Please subscribe for more valuable content and let me know your thoughts in the comments below.';
        
        console.log(`Generated script: ${script.split(' ').length} words, ${script.length} characters`);
        
        return {
            title,
            content: script,
            scenes: 5,
            duration: duration,
            wordCount: script.split(' ').length,
            characterCount: script.length
        };
    }

    async generateVoiceover(script, voiceStyle, title) {
        if (!this.elevenLabsKey) {
            throw new Error('ElevenLabs API key not configured');
        }

        try {
            console.log(`Generating voiceover - Voice: ${voiceStyle}, Characters: ${script.length}`);
            
            const voiceIds = {
                'professional-male': '29vD33N1CtxCmqQRPOHJ',
                'professional-female': 'AZnzlk1XvdvUeBnXmlld',
                'conversational-male': 'pNInz6obpgDQGcFmaJgB',
                'conversational-female': 'XB0fDUnXU5powFXDhCwa'
            };

            const selectedVoiceId = voiceIds[voiceStyle] || voiceIds['professional-male'];
            
            const response = await axios.post(
                `https://api.elevenlabs.io/v1/text-to-speech/${selectedVoiceId}`,
                {
                    text: script,
                    model_id: 'eleven_monolingual_v1',
                    voice_settings: {
                        stability: 0.85,
                        similarity_boost: 0.85,
                        style: 0.3,
                        use_speaker_boost: true
                    },
                    output_format: "mp3_44100_128"
                },
                {
                    headers: {
                        'Accept': 'audio/mpeg',
                        'Content-Type': 'application/json',
                        'xi-api-key': this.elevenLabsKey
                    },
                    responseType: 'arraybuffer',
                    timeout: 120000
                }
            );

            const audioFileName = `audio_${Date.now()}_${title.replace(/[^a-z0-9]/gi, '_')}.mp3`;
            const audioFilePath = path.join(this.tempDir, audioFileName);
            
            await fs.writeFile(audioFilePath, response.data);
            console.log(`Voiceover generated: ${audioFileName}`);
            
            return audioFilePath;
            
        } catch (error) {
            console.error('ElevenLabs API error:', error.response?.data || error.message);
            throw new Error('Voiceover generation failed: ' + (error.response?.statusText || error.message));
        }
    }

    async gatherMediaAssets(category, sceneCount) {
        const assets = { videos: [], images: [] };

        if (this.pexelsKey) {
            assets.videos = await this.downloadPexelsVideos(category, 5);
        }

        if (this.pixabayKey && assets.videos.length < 3) {
            assets.images = await this.downloadPixabayImages(category, 3);
        }

        return assets;
    }

    async downloadPexelsVideos(category, count) {
        if (!this.pexelsKey) return [];

        try {
            const searchTerm = category === 'cryptocurrency' ? 'technology' : 'business';
            
            const response = await axios.get('https://api.pexels.com/videos/search', {
                headers: { 'Authorization': this.pexelsKey },
                params: {
                    query: searchTerm,
                    per_page: count,
                    orientation: 'landscape'
                },
                timeout: 10000
            });

            const downloadedVideos = [];
            
            if (response.data.videos) {
                for (let i = 0; i < Math.min(response.data.videos.length, count); i++) {
                    const video = response.data.videos[i];
                    const videoFile = video.video_files.find(file => file.quality === 'hd') || video.video_files[0];
                    
                    if (videoFile?.link) {
                        const fileName = `pexels_video_${Date.now()}_${i}.mp4`;
                        const filePath = path.join(this.tempDir, fileName);
                        
                        try {
                            const videoResponse = await axios.get(videoFile.link, { 
                                responseType: 'stream',
                                timeout: 30000
                            });
                            
                            const writeStream = fsSync.createWriteStream(filePath);
                            
                            await new Promise((resolve, reject) => {
                                videoResponse.data.pipe(writeStream);
                                writeStream.on('finish', resolve);
                                writeStream.on('error', reject);
                                setTimeout(reject, 30000);
                            });
                            
                            downloadedVideos.push(filePath);
                        } catch (downloadError) {
                            console.error(`Failed to download video ${fileName}`);
                        }
                    }
                }
            }
            
            return downloadedVideos;
            
        } catch (error) {
            console.error('Pexels download failed:', error);
            return [];
        }
    }

    async downloadPixabayImages(category, count) {
        if (!this.pixabayKey) return [];

        try {
            const searchTerm = category === 'cryptocurrency' ? 'technology' : 'business';
            
            const response = await axios.get('https://pixabay.com/api/', {
                params: {
                    key: this.pixabayKey,
                    q: searchTerm,
                    image_type: 'photo',
                    orientation: 'horizontal',
                    per_page: count
                },
                timeout: 10000
            });

            const downloadedImages = [];
            
            if (response.data.hits) {
                for (let i = 0; i < Math.min(response.data.hits.length, count); i++) {
                    const image = response.data.hits[i];
                    const fileName = `pixabay_image_${Date.now()}_${i}.jpg`;
                    const filePath = path.join(this.tempDir, fileName);
                    
                    try {
                        const imageResponse = await axios.get(image.webformatURL, { 
                            responseType: 'stream',
                            timeout: 15000
                        });
                        
                        const writeStream = fsSync.createWriteStream(filePath);
                        
                        await new Promise((resolve, reject) => {
                            imageResponse.data.pipe(writeStream);
                            writeStream.on('finish', resolve);
                            writeStream.on('error', reject);
                            setTimeout(reject, 15000);
                        });
                        
                        downloadedImages.push(filePath);
                    } catch (downloadError) {
                        console.error(`Failed to download image ${fileName}`);
                    }
                }
            }
            
            return downloadedImages;
            
        } catch (error) {
            console.error('Pixabay download failed:', error);
            return [];
        }
    }

    async compileVideo(audioFile, mediaAssets, title, duration) {
        try {
            const outputFileName = `${title.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.mp4`;
            const outputPath = path.join(this.outputDir, outputFileName);
            const durationSeconds = duration * 60;
            
            if (mediaAssets.videos.length > 0) {
                await this.createVideoWithClips(audioFile, mediaAssets.videos, outputPath, durationSeconds);
            } else if (mediaAssets.images.length > 0) {
                await this.createVideoFromImages(audioFile, mediaAssets.images, outputPath, durationSeconds);
            } else {
                await this.createSimpleVideo(audioFile, outputPath, durationSeconds);
            }
            
            return outputPath;
            
        } catch (error) {
            console.error('Video compilation failed:', error);
            const fallbackPath = path.join(this.outputDir, `audio_${Date.now()}.mp3`);
            await fs.copyFile(audioFile, fallbackPath);
            return fallbackPath;
        }
    }

    async createVideoWithClips(audioFile, videos, outputPath, duration) {
        const videoList = videos.slice(0, 4);
        const segmentDuration = duration / videoList.length;
        
        let filterComplex = '';
        let inputs = `-i "${audioFile}" `;
        
        for (let i = 0; i < videoList.length; i++) {
            inputs += `-i "${videoList[i]}" `;
            filterComplex += `[${i + 1}:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black,trim=duration=${segmentDuration}[v${i}];`;
        }
        
        filterComplex += videoList.map((_, i) => `[v${i}]`).join('') + `concat=n=${videoList.length}:v=1:a=0[outv]`;
        
        const command = `ffmpeg -y ${inputs} -filter_complex "${filterComplex}" -map "[outv]" -map 0:a -c:v libx264 -preset medium -crf 23 -c:a aac -b:a 192k -af "volume=2.0" -t ${duration} "${outputPath}"`;
        
        await execAsync(command, { timeout: 300000 });
    }

    async createVideoFromImages(audioFile, images, outputPath, duration) {
        const imageDuration = duration / images.length;
        let filterComplex = '';
        let inputs = `-i "${audioFile}" `;
        
        for (let i = 0; i < images.length; i++) {
            inputs += `-loop 1 -t ${imageDuration} -i "${images[i]}" `;
            filterComplex += `[${i + 1}:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black[v${i}];`;
        }
        
        filterComplex += images.map((_, i) => `[v${i}]`).join('') + `concat=n=${images.length}:v=1:a=0[outv]`;
        
        const command = `ffmpeg -y ${inputs} -filter_complex "${filterComplex}" -map "[outv]" -map 0:a -c:v libx264 -preset medium -crf 23 -c:a aac -b:a 192k -af "volume=2.0" -t ${duration} "${outputPath}"`;
        
        await execAsync(command, { timeout: 300000 });
    }

    async createSimpleVideo(audioFile, outputPath, duration) {
        const command = `ffmpeg -y -i "${audioFile}" -f lavfi -i "color=blue:1920:1080:d=${duration}" -c:v libx264 -preset medium -crf 23 -c:a aac -b:a 192k -af "volume=2.0" -t ${duration} -shortest "${outputPath}"`;
        await execAsync(command, { timeout: 180000 });
    }

    async getFileSize(filePath) {
        try {
            const stats = await fs.stat(filePath);
            return Math.round(stats.size / 1024 / 1024 * 100) / 100;
        } catch {
            return 0;
        }
    }
}

// Encryption System
class SecureVault {
    static encrypt(text) {
        const algorithm = 'aes-256-cbc';
        const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv(algorithm, key, iv);
        
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        
        return iv.toString('hex') + ':' + encrypted;
    }
    
    static decrypt(encryptedData) {
        try {
            const algorithm = 'aes-256-cbc';
            const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
            const parts = encryptedData.split(':');
            
            if (parts.length !== 2) return null;
            
            const iv = Buffer.from(parts[0], 'hex');
            const encrypted = parts[1];
            
            const decipher = crypto.createDecipheriv(algorithm, key, iv);
            let decrypted = decipher.update(encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            
            return decrypted;
        } catch (error) {
            console.error('Decryption failed:', error);
            return null;
        }
    }
}

// Authentication Manager
class AuthenticationManager {
    constructor() {
        this.adminEmail = ADMIN_EMAIL;
        this.adminPasswordPlain = ADMIN_PASSWORD;
        this.db = null;
    }

    setDatabase(database) {
        this.db = database;
    }

    async authenticateUser(email, password) {
        try {
            if (email === this.adminEmail && password === this.adminPasswordPlain) {
                return {
                    email: this.adminEmail,
                    role: 'admin',
                    plan: 'enterprise',
                    authenticated: true
                };
            }
            
            if (this.db) {
                const user = await this.db.collection('users').findOne({ email });
                if (user && await bcrypt.compare(password, user.password)) {
                    return {
                        email: user.email,
                        role: user.role || 'user',
                        plan: user.plan || 'free',
                        authenticated: true
                    };
                }
            }
            
            throw new Error('Invalid credentials');
        } catch (error) {
            throw error;
        }
    }

    async initializeAdminUser() {
        if (!this.db) return;

        try {
            const existingUser = await this.db.collection('users').findOne({ email: this.adminEmail });
            if (existingUser) {
                console.log('Admin user already exists');
                return;
            }

            const hashedPassword = await bcrypt.hash(this.adminPasswordPlain, 12);
            
            await this.db.collection('users').insertOne({
                email: this.adminEmail,
                password: hashedPassword,
                role: 'admin',
                plan: 'enterprise',
                videosUsed: 0,
                videosLimit: 999999,
                isActive: true,
                createdAt: new Date()
            });
            
            console.log('Admin user created successfully');
        } catch (error) {
            if (error.code === 11000) {
                console.log('Admin user already exists');
            } else {
                console.error('Failed to initialize admin user:', error);
            }
        }
    }
}

// API Key Management
async function getDecryptedApiKeys() {
    if (!db) return {};
    
    try {
        const apiKeys = await db.collection('apikeys').find({ isActive: true }).toArray();
        const decryptedKeys = {};
        
        for (const key of apiKeys) {
            try {
                const decryptedKey = SecureVault.decrypt(key.encryptedKey);
                if (decryptedKey) {
                    decryptedKeys[key.service] = decryptedKey;
                }
            } catch (error) {
                console.error(`Error decrypting ${key.service} key`);
            }
        }
        
        console.log(`Successfully decrypted ${Object.keys(decryptedKeys).length} API keys`);
        return decryptedKeys;
        
    } catch (error) {
        console.error('Failed to get API keys:', error);
        return {};
    }
}

// Middleware
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { error: 'Too many authentication attempts' }
});

app.use('/api/auth', authLimiter);

// Database connection
async function connectToDatabase() {
    try {
        if (!MONGODB_URI) {
            throw new Error('MONGODB_URI not set');
        }

        const client = new MongoClient(MONGODB_URI);
        await client.connect();
        db = client.db('ai_hollywood_studio');
        
        console.log('MongoDB connected');
        
        authManager = new AuthenticationManager();
        authManager.setDatabase(db);
        
        await db.collection('users').createIndex({ email: 1 }, { unique: true });
        await db.collection('apikeys').createIndex({ service: 1 }, { unique: true });
        await authManager.initializeAdminUser();
        
    } catch (error) {
        console.error('Database connection failed:', error);
        throw error;
    }
}

// Middleware functions
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid token' });
        req.user = user;
        next();
    });
}

function requireAdmin(req, res, next) {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
}

// Routes
app.get('/api/health', async (req, res) => {
    try {
        let ffmpegStatus = 'not_available';
        try {
            await execAsync('ffmpeg -version');
            ffmpegStatus = 'available';
        } catch {}

        res.json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            database: db ? 'connected' : 'disconnected',
            adminEmail: ADMIN_EMAIL,
            ffmpeg: ffmpegStatus
        });
    } catch (error) {
        res.status(500).json({ status: 'unhealthy', error: error.message });
    }
});

app.post('/api/auth/register', async (req, res) => {
    try {
        const { email, password, plan = 'free' } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password required' });
        }

        const existingUser = await db.collection('users').findOne({ email });
        if (existingUser) {
            return res.status(400).json({ error: 'User already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 12);
        
        const userData = {
            email,
            password: hashedPassword,
            role: 'user',
            plan,
            videosUsed: 0,
            videosLimit: plan === 'free' ? 3 : 50,
            isActive: true,
            createdAt: new Date()
        };

        const result = await db.collection('users').insertOne(userData);
        
        const token = jwt.sign({ email, role: userData.role, plan }, JWT_SECRET, { expiresIn: '7d' });

        res.status(201).json({
            success: true,
            token,
            user: { email, role: userData.role, plan }
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password required' });
        }

        const user = await authManager.authenticateUser(email, password);
        
        const token = jwt.sign({ email: user.email, role: user.role, plan: user.plan }, JWT_SECRET, { expiresIn: '7d' });

        res.json({
            success: true,
            token,
            user: { email: user.email, role: user.role, plan: user.plan }
        });

    } catch (error) {
        res.status(401).json({ error: 'Invalid credentials' });
    }
});

app.post('/api/videos/generate', authenticateToken, async (req, res) => {
    try {
        const { title, category, duration, tone, voiceStyle, visualStyle } = req.body;

        if (!title || !category || !duration) {
            return res.status(400).json({ error: 'Title, category, and duration required' });
        }

        const apiKeys = await getDecryptedApiKeys();
        
        if (Object.keys(apiKeys).length === 0) {
            return res.status(500).json({ error: 'API keys not configured' });
        }

        const generator = new CompleteVideoGenerator(apiKeys);
        
        const result = await generator.generateVideo({
            title,
            category,
            duration: parseInt(duration),
            tone: tone || 'professional',
            voiceStyle: voiceStyle || 'professional-male',
            visualStyle: visualStyle || 'corporate'
        });

        res.json({
            success: true,
            message: 'Video generated successfully',
            video: result,
            downloadUrl: result.downloadUrl
        });

    } catch (error) {
        console.error('Video generation error:', error);
        res.status(500).json({ error: 'Video generation failed', details: error.message });
    }
});

app.get('/api/admin/apikeys', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const apiKeys = await db.collection('apikeys').find({ isActive: true }).toArray();
        
        const sanitizedKeys = apiKeys.map(key => ({
            _id: key._id,
            service: key.service,
            createdAt: key.createdAt,
            isActive: key.isActive,
            masked: `${key.service}_${'*'.repeat(20)}`
        }));

        res.json({ success: true, apiKeys: sanitizedKeys });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch API keys' });
    }
});

app.post('/api/admin/apikeys', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { service, apiKey } = req.body;

        if (!service || !apiKey) {
            return res.status(400).json({ error: 'Service and API key required' });
        }

        const encryptedKey = SecureVault.encrypt(apiKey);

        await db.collection('apikeys').updateOne(
            { service },
            {
                $set: {
                    service,
                    encryptedKey,
                    isActive: true,
                    updatedAt: new Date()
                },
                $setOnInsert: { createdAt: new Date() }
            },
            { upsert: true }
        );

        res.json({ success: true, message: `API key for ${service} updated` });
    } catch (error) {
        res.status(500).json({ error: 'Failed to save API key' });
    }
});

app.delete('/api/admin/apikeys/:service', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { service } = req.params;

        await db.collection('apikeys').updateOne(
            { service },
            { $set: { isActive: false, deactivatedAt: new Date() } }
        );

        res.json({ success: true, message: `API key for ${service} deactivated` });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete API key' });
    }
});

app.get('/download/:filename', (req, res) => {
    try {
        const filename = req.params.filename;
        const filePath = path.join(__dirname, 'generated_videos', filename);
        
        if (!filename || filename.includes('..')) {
            return res.status(400).json({ error: 'Invalid filename' });
        }
        
        if (!fsSync.existsSync(filePath)) {
            return res.status(404).json({ error: 'File not found' });
        }
        
        const ext = path.extname(filename).toLowerCase();
        const contentType = ext === '.mp4' ? 'video/mp4' : 'audio/mpeg';
        
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        
        const fileStream = fsSync.createReadStream(filePath);
        fileStream.pipe(res);
        
    } catch (error) {
        res.status(500).json({ error: 'Download failed' });
    }
});

app.use('*', (req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// Start server
async function startServer() {
    try {
        await connectToDatabase();
        
        app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
            console.log(`Admin: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
        });
        
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();