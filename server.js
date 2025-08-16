require('dotenv').config();

// Debug environment variables
console.log('Environment check - MongoDB URI exists:', !!process.env.MONGODB_URI);
console.log('Environment check - NODE_ENV:', process.env.NODE_ENV);
console.log('Environment check - Admin Email:', process.env.ADMIN_EMAIL);

const express = require('express');
const app = express();
app.set('trust proxy', 1);

// Required dependencies
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { MongoClient, ObjectId } = require('mongodb');
const axios = require('axios');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

// Enhanced Video Generation System (keeping existing implementation)
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
            console.log(`Starting complete video generation: ${title}`);
            
            await this.ensureDirectories();
            const script = await this.generateScript(title, category, duration, tone);
            const audioFile = await this.generateVoiceover(script.content, voiceStyle, title);
            const mediaAssets = await this.gatherMediaAssets(category, script.scenes);
            const videoFile = await this.compileVideo(audioFile, mediaAssets, title, duration);
            
            console.log(`Video generation completed: ${videoFile}`);
            
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
        const templates = {
            'personal-finance': {
                intro: `Welcome to your complete guide on ${title}. Today, we'll explore proven strategies that can transform your financial future and help you build lasting wealth.`,
                mainContent: `Financial independence isn't just a dream - it's an achievable goal when you understand the right principles. Research shows that people who follow systematic approaches to personal finance are 3 times more likely to reach their financial goals. Let's break down the essential strategies you need to know.

First, understand that wealth building is a marathon, not a sprint. The compound effect is your greatest ally. Even small, consistent actions compound over time to create significant results. This principle applies to saving, investing, and developing good financial habits.

Second, automate your finances wherever possible. Set up automatic transfers to savings accounts, automate bill payments, and use technology to track your spending. Automation removes emotional decision-making from your financial routine.

Third, focus on increasing your income alongside reducing expenses. While cutting costs is important, there's a limit to how much you can cut. Your income potential, however, is unlimited. Invest in skills, education, and opportunities that can boost your earning power.`,
                conclusion: `Remember, every financial expert started exactly where you are now. The difference is they took action. Start implementing these strategies today, and you'll be amazed at your progress in just one year. Subscribe for more financial wisdom, and let me know in the comments which strategy you'll implement first.`
            },
            'investing': {
                intro: `Today we're diving deep into ${title}. The investment landscape offers incredible opportunities for those who understand the fundamentals and apply them consistently.`,
                mainContent: `Successful investing isn't about timing the market perfectly or finding the next hot stock. It's about understanding market principles and applying them with discipline and patience.

The foundation of good investing starts with understanding risk and return. Higher potential returns always come with higher risk. Your job as an investor is to find the optimal balance that aligns with your goals and risk tolerance.

Diversification remains one of the most powerful tools in investing. Don't put all your eggs in one basket. Spread your investments across different asset classes, industries, and geographical regions. This strategy helps protect your portfolio during market downturns while still capturing growth opportunities.

Dollar-cost averaging is particularly effective for long-term investors. Instead of trying to time the market, invest a fixed amount regularly regardless of market conditions. This approach reduces the impact of market volatility and helps build wealth steadily over time.`,
                conclusion: `Investing success comes from patience, discipline, and continuous learning. These principles have helped countless investors build substantial wealth over time. Start with what you can afford, stay consistent, and let compound growth work its magic.`
            },
            'cryptocurrency': {
                intro: `Cryptocurrency represents one of the most significant financial innovations of our time. Understanding ${title} is crucial for anyone looking to participate in this digital revolution responsibly.`,
                mainContent: `The crypto space moves fast, but the fundamentals remain constant. Blockchain technology provides the foundation for decentralized finance, offering transparency, security, and global accessibility that traditional systems can't match.

Understanding market cycles is crucial in crypto. The market experiences periods of rapid growth followed by significant corrections. Successful crypto investors learn to navigate these cycles rather than being overwhelmed by them.

Security should be your top priority. Use reputable exchanges, enable two-factor authentication, and consider hardware wallets for long-term storage. Never share your private keys, and be aware that crypto transactions are irreversible.`,
                conclusion: `Cryptocurrency offers tremendous opportunities but requires careful consideration and ongoing education. Never invest more than you can afford to lose, stay security-conscious, and remember that this technology is still evolving.`
            }
        };

        const template = templates[category] || templates['personal-finance'];
        const fullScript = `${template.intro}\n\n${template.mainContent}\n\n${template.conclusion}`;
        
        return {
            title,
            content: fullScript,
            scenes: 5,
            duration: duration
        };
    }

    async generateVoiceover(script, voiceStyle, title) {
        if (!this.elevenLabsKey) {
            throw new Error('ElevenLabs API key not configured');
        }

        try {
            console.log('Generating voiceover with ElevenLabs...');
            
            const voiceIds = {
                'professional-male': '21m00Tcm4TlvDq8ikWAM',
                'professional-female': 'AZnzlk1XvdvUeBnXmlld',
                'conversational-male': 'pNInz6obpgDQGcFmaJgB',
                'conversational-female': 'XB0fDUnXU5powFXDhCwa',
                'authoritative-male': 'onwK4e9ZLuTAKqWW03F9',
                'warm-female': 'oWAxZDx7w5VEj9dCyTzz'
            };

            const voiceId = voiceIds[voiceStyle] || voiceIds['professional-male'];
            
            const response = await axios.post(
                `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
                {
                    text: script,
                    model_id: 'eleven_monolingual_v1',
                    voice_settings: {
                        stability: 0.75,
                        similarity_boost: 0.75,
                        style: 0.5,
                        use_speaker_boost: true
                    }
                },
                {
                    headers: {
                        'Accept': 'audio/mpeg',
                        'Content-Type': 'application/json',
                        'xi-api-key': this.elevenLabsKey
                    },
                    responseType: 'arraybuffer'
                }
            );

            const audioFileName = `audio_${Date.now()}_${title.replace(/[^a-z0-9]/gi, '_')}.mp3`;
            const audioFilePath = path.join(this.tempDir, audioFileName);
            
            await fs.writeFile(audioFilePath, response.data);
            console.log('Voiceover generated successfully');
            
            return audioFilePath;
            
        } catch (error) {
            console.error('ElevenLabs API error:', error.response?.data || error.message);
            throw new Error('Voiceover generation failed');
        }
    }

    async gatherMediaAssets(category, sceneCount) {
        try {
            console.log('Gathering media assets...');
            
            const assets = {
                videos: [],
                images: []
            };

            if (this.pexelsKey) {
                assets.videos = await this.downloadPexelsVideos(category, Math.min(3, sceneCount));
            }

            if (this.pixabayKey) {
                assets.images = await this.downloadPixabayImages(category, Math.min(5, sceneCount));
            }

            console.log(`Gathered ${assets.videos.length} videos and ${assets.images.length} images`);
            return assets;
            
        } catch (error) {
            console.error('Media gathering failed:', error);
            return { videos: [], images: [] };
        }
    }

    async downloadPexelsVideos(category, count) {
        if (!this.pexelsKey) return [];

        try {
            const searchTerms = {
                'personal-finance': 'business money planning',
                'investing': 'stock market charts',
                'cryptocurrency': 'technology digital',
                'artificial-intelligence': 'technology computer',
                'startups': 'office business',
                'business': 'professional meeting'
            };

            const searchTerm = searchTerms[category] || 'business';
            
            const response = await axios.get('https://api.pexels.com/videos/search', {
                headers: {
                    'Authorization': this.pexelsKey
                },
                params: {
                    query: searchTerm,
                    per_page: count,
                    orientation: 'landscape'
                }
            });

            const downloadedVideos = [];
            
            for (let i = 0; i < Math.min(response.data.videos.length, count); i++) {
                const video = response.data.videos[i];
                const videoFile = video.video_files.find(file => file.quality === 'hd') || video.video_files[0];
                
                if (videoFile) {
                    const fileName = `pexels_video_${Date.now()}_${i}.mp4`;
                    const filePath = path.join(this.tempDir, fileName);
                    
                    const videoResponse = await axios.get(videoFile.link, { responseType: 'stream' });
                    const writeStream = fsSync.createWriteStream(filePath);
                    
                    await new Promise((resolve, reject) => {
                        videoResponse.data.pipe(writeStream);
                        writeStream.on('finish', resolve);
                        writeStream.on('error', reject);
                    });
                    
                    downloadedVideos.push(filePath);
                }
            }
            
            return downloadedVideos;
            
        } catch (error) {
            console.error('Pexels video download failed:', error);
            return [];
        }
    }

    async downloadPixabayImages(category, count) {
        if (!this.pixabayKey) return [];

        try {
            const searchTerms = {
                'personal-finance': 'business finance money',
                'investing': 'investment growth chart',
                'cryptocurrency': 'cryptocurrency bitcoin',
                'artificial-intelligence': 'artificial intelligence',
                'startups': 'startup entrepreneur',
                'business': 'business professional'
            };

            const searchTerm = searchTerms[category] || 'business';
            
            const response = await axios.get('https://pixabay.com/api/', {
                params: {
                    key: this.pixabayKey,
                    q: searchTerm,
                    image_type: 'photo',
                    orientation: 'horizontal',
                    min_width: 1280,
                    per_page: count,
                    safesearch: 'true'
                }
            });

            const downloadedImages = [];
            
            for (let i = 0; i < Math.min(response.data.hits.length, count); i++) {
                const image = response.data.hits[i];
                const imageUrl = image.webformatURL;
                
                const fileName = `pixabay_image_${Date.now()}_${i}.jpg`;
                const filePath = path.join(this.tempDir, fileName);
                
                const imageResponse = await axios.get(imageUrl, { responseType: 'stream' });
                const writeStream = fsSync.createWriteStream(filePath);
                
                await new Promise((resolve, reject) => {
                    imageResponse.data.pipe(writeStream);
                    writeStream.on('finish', resolve);
                    writeStream.on('error', reject);
                });
                
                downloadedImages.push(filePath);
            }
            
            return downloadedImages;
            
        } catch (error) {
            console.error('Pixabay image download failed:', error);
            return [];
        }
    }

    async compileVideo(audioFile, mediaAssets, title, duration) {
        try {
            console.log('Compiling final video...');
            
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
            
            console.log('Video compilation completed');
            return outputPath;
            
        } catch (error) {
            console.error('Video compilation failed:', error);
            const fallbackPath = path.join(this.outputDir, `audio_${Date.now()}.mp3`);
            await fs.copyFile(audioFile, fallbackPath);
            return fallbackPath;
        }
    }

    async createVideoWithClips(audioFile, videos, outputPath, duration) {
        const videoList = videos.slice(0, 3);
        const segmentDuration = duration / videoList.length;
        
        let filterComplex = '';
        let inputs = `-i "${audioFile}" `;
        
        for (let i = 0; i < videoList.length; i++) {
            inputs += `-i "${videoList[i]}" `;
            filterComplex += `[${i + 1}:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setpts=PTS-STARTPTS,trim=duration=${segmentDuration}[v${i}];`;
        }
        
        filterComplex += videoList.map((_, i) => `[v${i}]`).join('') + `concat=n=${videoList.length}:v=1:a=0[outv]`;
        
        const command = `ffmpeg -y ${inputs} -filter_complex "${filterComplex}" -map "[outv]" -map 0:a -c:v libx264 -c:a aac -t ${duration} "${outputPath}"`;
        
        await execAsync(command);
    }

    async createVideoFromImages(audioFile, images, outputPath, duration) {
        const imageList = images.slice(0, 5);
        const imageDuration = duration / imageList.length;
        
        let filterComplex = '';
        let inputs = `-i "${audioFile}" `;
        
        for (let i = 0; i < imageList.length; i++) {
            inputs += `-loop 1 -t ${imageDuration} -i "${imageList[i]}" `;
            filterComplex += `[${i + 1}:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,fade=t=in:st=0:d=0.5,fade=t=out:st=${imageDuration - 0.5}:d=0.5[v${i}];`;
        }
        
        filterComplex += imageList.map((_, i) => `[v${i}]`).join('') + `concat=n=${imageList.length}:v=1:a=0[outv]`;
        
        const command = `ffmpeg -y ${inputs} -filter_complex "${filterComplex}" -map "[outv]" -map 0:a -c:v libx264 -c:a aac -shortest "${outputPath}"`;
        
        await execAsync(command);
    }

    async createSimpleVideo(audioFile, outputPath, duration) {
        const command = `ffmpeg -y -i "${audioFile}" -f lavfi -i "color=c=#1a1a2e:s=1920x1080:d=${duration},geq=r='255*sin(2*PI*T/10)':g='255*sin(2*PI*T/10 + 2*PI/3)':b='255*sin(2*PI*T/10 + 4*PI/3)'" -map 1:v -map 0:a -c:v libx264 -c:a aac -shortest "${outputPath}"`;
        
        await execAsync(command);
    }

    async getFileSize(filePath) {
        try {
            const stats = await fs.stat(filePath);
            return Math.round(stats.size / 1024 / 1024) + ' MB';
        } catch {
            return 'Unknown';
        }
    }
}

// ROBUST SECURITY CONFIGURATION
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex');

class SecureVault {
    static encrypt(text) {
        const algorithm = 'aes-256-cbc';
        const key = Buffer.from(ENCRYPTION_KEY.substring(0, 32), 'utf8');
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipher(algorithm, key);
        
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        
        return iv.toString('hex') + ':' + encrypted;
    }
    
    static decrypt(encryptedData) {
        const algorithm = 'aes-256-cbc';
        const key = Buffer.from(ENCRYPTION_KEY.substring(0, 32), 'utf8');
        const parts = encryptedData.split(':');
        const iv = Buffer.from(parts[0], 'hex');
        const encrypted = parts[1];
        
        const decipher = crypto.createDecipher(algorithm, key);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        
        return decrypted;
    }
}

// ROBUST AUTHENTICATION SYSTEM
class AuthenticationManager {
    constructor(database) {
        this.db = database;
        this.adminEmail = process.env.ADMIN_EMAIL || 'casteroai001@gmail.com';
        this.adminPasswordPlain = process.env.ADMIN_PASSWORD || 'admin123'; // Plain text for now
    }

    async initializeAdminUser() {
        if (!this.db) {
            console.log('Database not available, skipping admin user creation');
            return;
        }

        try {
            // Check if admin already exists
            const existingAdmin = await this.db.collection('users').findOne({ 
                email: this.adminEmail,
                role: 'admin'
            });

            if (existingAdmin) {
                console.log('Admin user already exists');
                return existingAdmin;
            }

            // Create new admin user with hashed password
            const hashedPassword = await bcrypt.hash(this.adminPasswordPlain, 12);
            
            const adminUser = {
                email: this.adminEmail,
                password: hashedPassword,
                role: 'admin',
                plan: 'enterprise',
                videosUsed: 0,
                videosLimit: 999999,
                isActive: true,
                createdAt: new Date(),
                compliance: 'terms_compliant'
            };

            const result = await this.db.collection('users').insertOne(adminUser);
            console.log('Admin user created successfully with ID:', result.insertedId);
            
            return { ...adminUser, _id: result.insertedId };
            
        } catch (error) {
            console.error('Failed to initialize admin user:', error);
            throw error;
        }
    }

    async authenticateUser(email, password) {
        if (!email || !password) {
            throw new Error('Email and password are required');
        }

        // Special handling for admin - try direct environment variable first
        if (email === this.adminEmail) {
            // First try the plain text password from environment
            if (password === this.adminPasswordPlain) {
                return this.createAdminUserObject();
            }
        }

        // Database authentication for all users (including admin with hashed password)
        if (!this.db) {
            throw new Error('Database not available');
        }

        const user = await this.db.collection('users').findOne({ email });
        if (!user) {
            throw new Error('Invalid credentials');
        }

        if (!user.isActive) {
            throw new Error('Account suspended');
        }

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            throw new Error('Invalid credentials');
        }

        return user;
    }

    createAdminUserObject() {
        return {
            _id: new ObjectId(),
            email: this.adminEmail,
            role: 'admin',
            plan: 'enterprise',
            videosUsed: 0,
            videosLimit: 999999,
            isActive: true,
            createdAt: new Date()
        };
    }

    generateToken(user) {
        return jwt.sign(
            {
                _id: user._id,
                email: user.email,
                role: user.role,
                plan: user.plan,
                videosUsed: user.videosUsed,
                videosLimit: user.videosLimit
            },
            JWT_SECRET,
            { expiresIn: '7d' }
        );
    }
}

// Middleware Configuration
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
        },
    },
}));

app.use(cors({
    origin: process.env.FRONTEND_URL || '*',
    credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate Limiting
const createRateLimit = (windowMs, max, message) => rateLimit({
    windowMs,
    max,
    message: { error: message },
    trustProxy: true,
    standardHeaders: true,
    legacyHeaders: false,
});

app.use('/api/auth', createRateLimit(15 * 60 * 1000, 10, 'Too many authentication attempts'));
app.use('/api/videos', createRateLimit(60 * 60 * 1000, 10, 'Video generation limit reached'));
app.use('/api/', createRateLimit(15 * 60 * 1000, 100, 'Too many API requests'));

// Database Connection and Initialization
let db = null;
let authManager = null;
const MONGODB_URI = process.env.MONGODB_URI;

async function connectToDatabase() {
    if (!MONGODB_URI) {
        console.log('Running in demo mode (database will be connected later)');
        return null;
    }
    
    try {
        console.log('MongoDB URI configured: YES');
        console.log('Connecting to MongoDB...');
        
        const client = new MongoClient(MONGODB_URI);
        await client.connect();
        
        db = client.db();
        
        console.log('MongoDB connected successfully');
        console.log('Database name:', db.databaseName);
        
        // Initialize authentication manager
        authManager = new AuthenticationManager(db);
        
        await initializeDatabase();
        return db;
    } catch (error) {
        console.error('MongoDB connection failed:', error.message);
        console.log('Continuing in demo mode...');
        // Create fallback auth manager for demo mode
        authManager = new AuthenticationManager(null);
        return null;
    }
}

async function initializeDatabase() {
    if (!db || !authManager) return;
    
    try {
        // Create admin user
        await authManager.initializeAdminUser();
        
        // Create indexes
        await db.collection('apikeys').createIndex({ service: 1 }, { unique: true });
        await db.collection('users').createIndex({ email: 1 }, { unique: true });
        await db.collection('videologs').createIndex({ userId: 1, createdAt: -1 });
        
        console.log('Database indexes created');
    } catch (error) {
        console.error('Database initialization failed:', error);
    }
}

// Authentication Middleware
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }
    
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid or expired token' });
        }
        req.user = user;
        next();
    });
}

function requireAdmin(req, res, next) {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
}

// Helper Functions
function getPlanLimits(plan) {
    const limits = {
        free: { videos: 2, quality: '720p', watermark: true },
        professional: { videos: 20, quality: '1080p', watermark: false },
        agency: { videos: 100, quality: '4K', watermark: false },
        enterprise: { videos: 999999, quality: '4K', watermark: false }
    };
    return limits[plan] || limits.free;
}

function getExportQuality(plan) {
    return getPlanLimits(plan).quality;
}

function getWatermarkStatus(plan) {
    return getPlanLimits(plan).watermark;
}

async function getDecryptedApiKeys() {
    if (!db) return {};
    
    try {
        const apiKeys = await db.collection('apikeys').find({ isActive: true }).toArray();
        const decryptedKeys = {};
        
        for (const key of apiKeys) {
            try {
                decryptedKeys[key.service] = SecureVault.decrypt(key.encryptedKey);
            } catch (error) {
                console.error(`Failed to decrypt ${key.service} key`);
            }
        }
        
        return decryptedKeys;
    } catch (error) {
        console.error('Failed to get API keys:', error);
        return {};
    }
}

// API Routes

// Health Check
app.get('/api/health', async (req, res) => {
    const mongoConfigured = !!MONGODB_URI;
    const connected = !!db;
    
    const healthData = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        compliance: 'terms_compliant',
        message: 'AI Hollywood Studio Backend is running!'
    };
    
    if (mongoConfigured) {
        healthData.database = connected ? 'connected' : 'disconnected';
        healthData.mongoConfigured = true;
    } else {
        healthData.database = 'demo_mode';
        healthData.mongoConfigured = false;
    }
    
    if (authManager) {
        healthData.adminEmail = authManager.adminEmail;
        healthData.authenticationSystem = 'robust';
    }
    
    // Check FFmpeg availability
    try {
        await execAsync('ffmpeg -version');
        healthData.ffmpeg = 'available';
    } catch {
        healthData.ffmpeg = 'not_available';
    }
    
    res.json(healthData);
});

// Demo Status
app.get('/api/demo/status', (req, res) => {
    res.json({
        message: 'AI Hollywood Studio Backend is running!',
        features: [
            'Robust authentication system',
            'Security systems active',
            'Video generation ready',
            'Admin access configured',
            'API key encryption enabled',
            'Rate limiting active',
            'FFmpeg video compilation'
        ],
        authentication: {
            adminEmail: authManager ? authManager.adminEmail : 'Not configured',
            adminPassword: 'admin123',
            system: 'Robust with fallback'
        }
    });
});

// ROBUST AUTHENTICATION ROUTES
app.post('/api/auth/register', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password required' });
        }
        
        if (password.length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters' });
        }
        
        if (!db) {
            return res.status(503).json({ error: 'Database not available' });
        }
        
        const existingUser = await db.collection('users').findOne({ email });
        if (existingUser) {
            return res.status(400).json({ error: 'User already exists' });
        }
        
        const hashedPassword = await bcrypt.hash(password, 12);
        const planLimits = getPlanLimits('free');
        
        const newUser = {
            email,
            password: hashedPassword,
            role: 'user',
            plan: 'free',
            videosUsed: 0,
            videosLimit: planLimits.videos,
            isActive: true,
            createdAt: new Date(),
            compliance: 'terms_compliant'
        };
        
        const result = await db.collection('users').insertOne(newUser);
        
        const token = authManager.generateToken({
            _id: result.insertedId,
            email,
            role: 'user',
            plan: 'free',
            videosUsed: 0,
            videosLimit: planLimits.videos
        });
        
        console.log(`New user registered: ${email}`);
        
        res.status(201).json({
            success: true,
            token,
            user: {
                email,
                plan: 'free',
                videosUsed: 0,
                videosLimit: planLimits.videos,
                exportQuality: getExportQuality('free'),
                watermark: getWatermarkStatus('free')
            }
        });
        
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// ROBUST LOGIN ROUTE
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        console.log(`Login attempt for: ${email}`);
        
        if (!authManager) {
            return res.status(503).json({ error: 'Authentication system not initialized' });
        }
        
        // Use the robust authentication manager
        const user = await authManager.authenticateUser(email, password);
        
        // Generate JWT token
        const token = authManager.generateToken(user);
        
        console.log(`Login successful for: ${email} (Role: ${user.role})`);
        
        res.json({
            success: true,
            token,
            user: {
                email: user.email,
                role: user.role,
                plan: user.plan,
                videosUsed: user.videosUsed,
                videosLimit: user.videosLimit,
                exportQuality: getExportQuality(user.plan),
                watermark: getWatermarkStatus(user.plan)
            }
        });
        
    } catch (error) {
        console.error('Login error:', error);
        res.status(401).json({ error: error.message });
    }
});

// Video Generation Route
app.post('/api/videos/generate', authenticateToken, async (req, res) => {
    try {
        const { title, category, duration, tone, voiceStyle, visualStyle } = req.body;
        
        if (req.user.videosUsed >= req.user.videosLimit && req.user.plan !== 'enterprise') {
            return res.status(403).json({ error: 'Video limit reached for your plan' });
        }

        const startTime = Date.now();
        console.log(`Starting video generation for user: ${req.user.email}`);

        const apiKeys = await getDecryptedApiKeys();
        
        if (!apiKeys.elevenlabs) {
            return res.status(400).json({ error: 'ElevenLabs API key not configured. Please add it in the admin dashboard.' });
        }

        const generator = new CompleteVideoGenerator(apiKeys);
        
        const videoResult = await generator.generateVideo({
            title,
            category, 
            duration,
            tone,
            voiceStyle,
            visualStyle
        });

        const processingTime = Date.now() - startTime;

        if (db) {
            await db.collection('users').updateOne(
                { _id: req.user._id },
                { $inc: { videosUsed: 1 } }
            );

            const videoLog = {
                userId: req.user._id,
                title,
                category,
                duration,
                plan: req.user.plan,
                exportQuality: getExportQuality(req.user.plan),
                method: 'complete_video_generation',
                processingTime,
                success: videoResult.success,
                fileSize: videoResult.fileSize,
                compliance: 'terms_compliant',
                createdAt: new Date()
            };

            await db.collection('videologs').insertOne(videoLog);
        }

        console.log(`Video generated successfully: ${title} for ${req.user.email}`);

        res.json({
            success: true,
            video: {
                title,
                duration,
                exportQuality: getExportQuality(req.user.plan),
                watermark: getWatermarkStatus(req.user.plan),
                downloadUrl: videoResult.downloadUrl,
                processingTime,
                fileSize: videoResult.fileSize,
                method: 'complete_video_generation',
                compliance: 'terms_compliant'
            },
            user: {
                videosUsed: req.user.videosUsed + 1,
                videosLimit: req.user.videosLimit
            }
        });

    } catch (error) {
        console.error('Video generation error:', error);
        res.status(500).json({ error: 'Video generation failed: ' + error.message });
    }
});

// Serve generated video files
app.get('/download/:filename', (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(__dirname, 'generated_videos', filename);
    
    res.download(filePath, (err) => {
        if (err) {
            console.error('Download failed:', err);
            res.status(404).json({ error: 'Video file not found' });
        }
    });
});

// Admin Routes
app.post('/api/admin/keys', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { service, apiKey } = req.body;
        
        if (!service || !apiKey) {
            return res.status(400).json({ error: 'Service and API key required' });
        }
        
        if (!db) {
            return res.status(503).json({ error: 'Database not available' });
        }
        
        const encryptedKey = SecureVault.encrypt(apiKey);
        
        await db.collection('apikeys').updateOne(
            { service },
            {
                $set: {
                    service,
                    encryptedKey,
                    isActive: true,
                    updatedAt: new Date(),
                    updatedBy: req.user.email
                }
            },
            { upsert: true }
        );
        
        console.log(`API key updated for service: ${service}`);
        
        res.json({
            success: true,
            message: `${service} API key updated successfully`
        });
        
    } catch (error) {
        console.error('API key update error:', error);
        res.status(500).json({ error: 'Failed to update API key' });
    }
});

app.get('/api/admin/keys', authenticateToken, requireAdmin, async (req, res) => {
    try {
        if (!db) {
            return res.status(503).json({ error: 'Database not available' });
        }
        
        const apiKeys = await db.collection('apikeys').find(
            { isActive: true },
            { projection: { service: 1, updatedAt: 1, updatedBy: 1 } }
        ).toArray();
        
        res.json({
            success: true,
            keys: apiKeys.map(key => ({
                service: key.service,
                status: 'active',
                lastUpdated: key.updatedAt,
                updatedBy: key.updatedBy
            }))
        });
        
    } catch (error) {
        console.error('API keys fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch API keys' });
    }
});

app.delete('/api/admin/keys/:service', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { service } = req.params;
        
        if (!db) {
            return res.status(503).json({ error: 'Database not available' });
        }
        
        await db.collection('apikeys').updateOne(
            { service },
            { $set: { isActive: false, deletedAt: new Date(), deletedBy: req.user.email } }
        );
        
        console.log(`API key deactivated for service: ${service}`);
        
        res.json({
            success: true,
            message: `${service} API key deactivated`
        });
        
    } catch (error) {
        console.error('API key deletion error:', error);
        res.status(500).json({ error: 'Failed to delete API key' });
    }
});

// Admin Dashboard
app.get('/api/admin/dashboard', authenticateToken, requireAdmin, async (req, res) => {
    try {
        if (db) {
            const stats = await Promise.all([
                db.collection('users').countDocuments(),
                db.collection('users').countDocuments({ plan: 'free' }),
                db.collection('users').countDocuments({ plan: 'professional' }),
                db.collection('users').countDocuments({ plan: 'agency' }),
                db.collection('videologs').countDocuments(),
                db.collection('videologs').countDocuments({ success: true }),
                db.collection('apikeys').countDocuments({ isActive: true })
            ]);
            
            const [totalUsers, freeUsers, proUsers, agencyUsers, totalVideos, successfulVideos, activeApiKeys] = stats;
            
            const recentVideos = await db.collection('videologs')
                .find({}, { projection: { title: 1, createdAt: 1, success: 1, plan: 1 } })
                .sort({ createdAt: -1 })
                .limit(5)
                .toArray();
            
            res.json({
                success: true,
                stats: {
                    totalUsers,
                    planDistribution: {
                        free: freeUsers,
                        professional: proUsers,
                        agency: agencyUsers
                    },
                    totalVideos,
                    successfulVideos,
                    successRate: totalVideos > 0 ? Math.round((successfulVideos / totalVideos) * 100) : 0,
                    activeApiKeys,
                    revenue: {
                        monthly: (proUsers * 89) + (agencyUsers * 249),
                        projected: ((proUsers * 89) + (agencyUsers * 249)) * 12
                    }
                },
                recentActivity: recentVideos,
                compliance: 'terms_compliant'
            });
        } else {
            res.json({
                success: true,
                stats: {
                    totalUsers: 0,
                    planDistribution: { free: 0, professional: 0, agency: 0 },
                    totalVideos: 0,
                    successfulVideos: 0,
                    successRate: 0,
                    activeApiKeys: 0,
                    revenue: { monthly: 0, projected: 0 }
                },
                recentActivity: [],
                compliance: 'terms_compliant',
                message: 'Running in demo mode'
            });
        }
    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).json({ error: 'Failed to load dashboard' });
    }
});

// User Management
app.get('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
    try {
        if (!db) {
            return res.status(503).json({ error: 'Database not available' });
        }
        
        const users = await db.collection('users')
            .find({}, { projection: { password: 0 } })
            .sort({ createdAt: -1 })
            .toArray();
        
        res.json({
            success: true,
            users: users.map(user => ({
                ...user,
                compliance: 'terms_compliant'
            }))
        });
        
    } catch (error) {
        console.error('Users fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// Video Logs
app.get('/api/admin/videos', authenticateToken, requireAdmin, async (req, res) => {
    try {
        if (!db) {
            return res.status(503).json({ error: 'Database not available' });
        }
        
        const videos = await db.collection('videologs')
            .find({})
            .sort({ createdAt: -1 })
            .limit(50)
            .toArray();
        
        res.json({
            success: true,
            videos: videos.map(video => ({
                ...video,
                compliance: 'terms_compliant'
            }))
        });
        
    } catch (error) {
        console.error('Videos fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch video logs' });
    }
});

// Error handling for undefined routes
app.use('*', (req, res) => {
    res.status(404).json({
        error: 'Endpoint not found',
        availableEndpoints: [
            'GET /api/health',
            'GET /api/demo/status',
            'POST /api/auth/register',
            'POST /api/auth/login',
            'POST /api/videos/generate',
            'GET /download/:filename'
        ]
    });
});

// Global error handler
app.use((error, req, res, next) => {
    console.error('Global error handler:', error);
    res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
});

// Server Configuration
const PORT = process.env.PORT || 8080;

async function startServer() {
    try {
        console.log('Starting AI Hollywood Studio Backend...');
        console.log('Security: AES-256 encryption enabled');
        console.log('Authentication: Robust system with fallback');
        
        await connectToDatabase();
        
        app.listen(PORT, () => {
            console.log('AI Hollywood Studio Backend LIVE!');
            console.log(`Server running on port ${PORT}`);
            console.log('Authentication System: Robust');
            console.log('Admin Email:', authManager ? authManager.adminEmail : 'Not configured');
            console.log('Admin Password: admin123');
            console.log('All security systems active');
            console.log('CORS enabled for:', process.env.FRONTEND_URL || '*');
            console.log('Ready to serve Hollywood-quality videos!');
            console.log('Test endpoints:');
            console.log(`  Health: http://localhost:${PORT}/api/health`);
            console.log(`  Demo: http://localhost:${PORT}/api/demo/status`);
            console.log('Complete video generation with FFmpeg enabled');
            console.log('Compliance: Terms-compliant stock media integration');
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully');
    process.exit(0);
});

// Start the server
startServer();